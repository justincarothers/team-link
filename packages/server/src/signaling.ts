import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@team-link/shared';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomByPeer,
  findPeerByWs,
  type Peer,
} from './rooms.js';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastToRoom(peerId: string, msg: ServerMessage): void {
  const room = getRoomByPeer(peerId);
  if (!room) return;
  for (const [id, peer] of room.peers) {
    if (id !== peerId) {
      send(peer.ws, msg);
    }
  }
}

function relayToPeer(targetPeerId: string, msg: ServerMessage): void {
  const room = getRoomByPeer(targetPeerId);
  if (!room) return;
  const target = room.peers.get(targetPeerId);
  if (target) {
    send(target.ws, msg);
  }
}

export function handleSignalingMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON' });
    return;
  }

  switch (msg.type) {
    case 'create-room': {
      // If already in a room, leave it first
      const existingPeer = findPeerByWs(ws);
      if (existingPeer) {
        handleDisconnect(ws);
      }
      const { code, peerId } = createRoom(ws, msg.displayName);
      send(ws, { type: 'room-created', code, peerId });
      break;
    }

    case 'join-room': {
      // If already in a room, leave it first
      const existingPeerJ = findPeerByWs(ws);
      if (existingPeerJ) {
        handleDisconnect(ws);
      }
      const result = joinRoom(ws, msg.code, msg.displayName);
      if ('error' in result) {
        send(ws, { type: 'error', message: result.error });
        return;
      }

      const { peerId, peers } = result;
      send(ws, { type: 'room-joined', code: msg.code.toUpperCase(), peerId, peers });

      // Notify existing peers
      broadcastToRoom(peerId, {
        type: 'peer-joined',
        peer: { peerId, displayName: msg.displayName, isHost: false },
      });

      // Send existing stream announcements to the new peer
      const room = getRoomByPeer(peerId);
      if (room) {
        for (const [, existingPeer] of room.peers) {
          if (existingPeer.peerId !== peerId) {
            for (const [, stream] of existingPeer.streams) {
              send(ws, {
                type: 'stream-announced',
                peerId: existingPeer.peerId,
                streamId: stream.streamId,
                label: stream.label,
                monitorName: stream.monitorName,
              });
            }
          }
        }
      }
      break;
    }

    case 'leave-room': {
      handleDisconnect(ws);
      break;
    }

    case 'offer': {
      const peer = findPeerByWs(ws);
      if (!peer) return;
      relayToPeer(msg.targetPeerId, {
        type: 'offer',
        fromPeerId: peer.peerId,
        sdp: msg.sdp,
      });
      break;
    }

    case 'answer': {
      const peer = findPeerByWs(ws);
      if (!peer) return;
      relayToPeer(msg.targetPeerId, {
        type: 'answer',
        fromPeerId: peer.peerId,
        sdp: msg.sdp,
      });
      break;
    }

    case 'ice-candidate': {
      const peer = findPeerByWs(ws);
      if (!peer) return;
      relayToPeer(msg.targetPeerId, {
        type: 'ice-candidate',
        fromPeerId: peer.peerId,
        candidate: msg.candidate,
      });
      break;
    }

    case 'stream-announce': {
      const peer = findPeerByWs(ws);
      if (!peer) return;
      peer.streams.set(msg.streamId, {
        streamId: msg.streamId,
        peerId: peer.peerId,
        label: msg.label,
        monitorName: msg.monitorName,
      });
      broadcastToRoom(peer.peerId, {
        type: 'stream-announced',
        peerId: peer.peerId,
        streamId: msg.streamId,
        label: msg.label,
        monitorName: msg.monitorName,
      });
      break;
    }

    case 'stream-remove': {
      const peer = findPeerByWs(ws);
      if (!peer) return;
      peer.streams.delete(msg.streamId);
      broadcastToRoom(peer.peerId, {
        type: 'stream-removed',
        peerId: peer.peerId,
        streamId: msg.streamId,
      });
      break;
    }

    default:
      send(ws, { type: 'error', message: `Unknown message type` });
  }
}

export function handleDisconnect(ws: WebSocket): void {
  const peer = findPeerByWs(ws);
  if (!peer) return;

  const result = leaveRoom(peer.peerId);
  if (result) {
    // Notify remaining peers
    for (const [, remainingPeer] of result.room.peers) {
      send(remainingPeer.ws, { type: 'peer-left', peerId: peer.peerId });
    }
  }
}
