import type { WebSocket } from 'ws';
import type { PeerInfo, StreamInfo } from '@team-link/shared';
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_CHARS,
  MAX_PEERS_PER_ROOM,
  ROOM_CLEANUP_GRACE_MS,
} from '@team-link/shared';

export interface Peer {
  peerId: string;
  displayName: string;
  isHost: boolean;
  ws: WebSocket;
  streams: Map<string, StreamInfo>;
}

export interface Room {
  code: string;
  hostPeerId: string;
  peers: Map<string, Peer>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();
const peerToRoom = new Map<string, string>();
const wsToPeer = new Map<WebSocket, Peer>();

let peerCounter = 0;

function generatePeerId(): string {
  return `peer-${++peerCounter}-${Date.now().toString(36)}`;
}

function generateRoomCode(): string {
  let code: string;
  do {
    code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(ws: WebSocket, displayName: string): { code: string; peerId: string } {
  const code = generateRoomCode();
  const peerId = generatePeerId();

  const peer: Peer = { peerId, displayName, isHost: true, ws, streams: new Map() };
  const room: Room = {
    code,
    hostPeerId: peerId,
    peers: new Map([[peerId, peer]]),
    cleanupTimer: null,
  };

  rooms.set(code, room);
  peerToRoom.set(peerId, code);
  wsToPeer.set(ws, peer);

  console.log(`[Room] Created room ${code} by peer ${peerId} (${displayName})`);
  return { code, peerId };
}

export function joinRoom(
  ws: WebSocket,
  code: string,
  displayName: string,
): { peerId: string; peers: PeerInfo[] } | { error: string } {
  const room = rooms.get(code.toUpperCase());
  if (!room) {
    return { error: `Room ${code} not found` };
  }

  if (room.peers.size >= MAX_PEERS_PER_ROOM) {
    return { error: `Room ${code} is full (max ${MAX_PEERS_PER_ROOM} peers)` };
  }

  // Cancel cleanup timer if pending
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  const peerId = generatePeerId();
  const peer: Peer = { peerId, displayName, isHost: false, ws, streams: new Map() };
  room.peers.set(peerId, peer);
  peerToRoom.set(peerId, code);
  wsToPeer.set(ws, peer);

  console.log(`[Room] Peer ${peerId} (${displayName}) joined room ${code} (${room.peers.size} peers)`);

  const peers: PeerInfo[] = [];
  for (const [id, p] of room.peers) {
    if (id !== peerId) {
      peers.push({ peerId: id, displayName: p.displayName, isHost: p.isHost });
    }
  }

  return { peerId, peers };
}

export function leaveRoom(peerId: string): { room: Room; peer: Peer } | null {
  const code = peerToRoom.get(peerId);
  if (!code) return null;

  const room = rooms.get(code);
  if (!room) return null;

  const peer = room.peers.get(peerId);
  if (!peer) return null;

  room.peers.delete(peerId);
  peerToRoom.delete(peerId);
  wsToPeer.delete(peer.ws);

  console.log(`[Room] Peer ${peerId} left room ${code} (${room.peers.size} remaining)`);

  if (room.peers.size === 0) {
    // Schedule cleanup
    room.cleanupTimer = setTimeout(() => {
      rooms.delete(code);
    }, ROOM_CLEANUP_GRACE_MS);
  }

  return { room, peer };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getRoomByPeer(peerId: string): Room | undefined {
  const code = peerToRoom.get(peerId);
  if (!code) return undefined;
  return rooms.get(code);
}

export function getPeer(peerId: string): Peer | undefined {
  const room = getRoomByPeer(peerId);
  if (!room) return undefined;
  return room.peers.get(peerId);
}

export function findPeerByWs(ws: WebSocket): Peer | undefined {
  return wsToPeer.get(ws);
}
