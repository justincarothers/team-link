import type { PeerInfo } from './types.js';

// Client -> Server messages
export type ClientMessage =
  | { type: 'create-room'; displayName: string }
  | { type: 'join-room'; code: string; displayName: string }
  | { type: 'leave-room' }
  | { type: 'offer'; targetPeerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; targetPeerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; targetPeerId: string; candidate: RTCIceCandidateInit }
  | { type: 'stream-announce'; streamId: string; label: string; monitorName: string }
  | { type: 'stream-remove'; streamId: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'room-created'; code: string; peerId: string }
  | { type: 'room-joined'; code: string; peerId: string; peers: PeerInfo[] }
  | { type: 'peer-joined'; peer: PeerInfo }
  | { type: 'peer-left'; peerId: string }
  | { type: 'offer'; fromPeerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; fromPeerId: string; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; fromPeerId: string; candidate: RTCIceCandidateInit }
  | { type: 'stream-announced'; peerId: string; streamId: string; label: string; monitorName: string }
  | { type: 'stream-removed'; peerId: string; streamId: string }
  | { type: 'error'; message: string };

export type SignalingMessage = ClientMessage | ServerMessage;
