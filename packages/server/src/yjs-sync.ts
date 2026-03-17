import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

interface YjsRoom {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<WebSocket>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const yjsRooms = new Map<string, YjsRoom>();

function getOrCreateYjsRoom(roomKey: string): YjsRoom {
  let room = yjsRooms.get(roomKey);
  if (room) {
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
    return room;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);

  room = { doc, awareness, connections: new Set(), cleanupTimer: null };
  yjsRooms.set(roomKey, room);

  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
    const changedClients = added.concat(updated, removed);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients),
    );
    const msg = encoding.toUint8Array(encoder);
    for (const conn of room!.connections) {
      if (conn.readyState === conn.OPEN) {
        conn.send(msg);
      }
    }
  });

  return room;
}

function sendSync(ws: WebSocket, doc: Y.Doc): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
}

function sendAwareness(ws: WebSocket, awareness: awarenessProtocol.Awareness): void {
  const clients = Array.from(awareness.getStates().keys());
  if (clients.length > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
    );
    ws.send(encoding.toUint8Array(encoder));
  }
}

export function handleYjsConnection(ws: WebSocket, req: IncomingMessage): void {
  // Extract room key from URL: /ws/yjs/:roomCode/:toolId
  const url = req.url ?? '';
  const parts = url.split('/').filter(Boolean);
  // Expected: ['ws', 'yjs', roomCode, toolId]
  if (parts.length < 4) {
    ws.close(1008, 'Invalid Yjs path');
    return;
  }

  const roomCode = parts[2];
  const toolId = parts[3];
  const roomKey = `${roomCode}:${toolId}`;

  const room = getOrCreateYjsRoom(roomKey);
  room.connections.add(ws);

  // Send initial sync
  sendSync(ws, room.doc);
  sendAwareness(ws, room.awareness);

  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : data instanceof Buffer
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(Buffer.concat(data as Buffer[]));

    const decoder = decoding.createDecoder(buf);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, null);
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
        // Broadcast to other connections
        const syncMsg = buf;
        for (const conn of room.connections) {
          if (conn !== ws && conn.readyState === conn.OPEN) {
            conn.send(syncMsg);
          }
        }
        break;
      }
      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    room.connections.delete(ws);

    if (room.connections.size === 0) {
      // Schedule cleanup after 60s
      room.cleanupTimer = setTimeout(() => {
        room.doc.destroy();
        yjsRooms.delete(roomKey);
      }, 60_000);
    }
  });
}
