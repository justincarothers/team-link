import { create } from 'zustand';
import type { PeerInfo, StreamInfo } from '@team-link/shared';

export interface RoomState {
  roomCode: string | null;
  peerId: string | null;
  isHost: boolean;
  peers: Map<string, PeerInfo>;
  streams: Map<string, StreamInfo>;
  mediaStreams: Map<string, MediaStream>;

  setRoom: (code: string, peerId: string, isHost: boolean) => void;
  clearRoom: () => void;
  addPeer: (peer: PeerInfo) => void;
  removePeer: (peerId: string) => void;
  setPeers: (peers: PeerInfo[]) => void;
  addStream: (info: StreamInfo) => void;
  removeStream: (streamId: string) => void;
  setMediaStream: (streamId: string, stream: MediaStream) => void;
  removeMediaStream: (streamId: string) => void;
}

export const useRoom = create<RoomState>((set, get) => ({
  roomCode: null,
  peerId: null,
  isHost: false,
  peers: new Map(),
  streams: new Map(),
  mediaStreams: new Map(),

  setRoom: (code, peerId, isHost) =>
    set({ roomCode: code, peerId, isHost, peers: new Map(), streams: new Map(), mediaStreams: new Map() }),

  clearRoom: () => {
    // Stop all media streams
    for (const stream of get().mediaStreams.values()) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    set({ roomCode: null, peerId: null, isHost: false, peers: new Map(), streams: new Map(), mediaStreams: new Map() });
  },

  addPeer: (peer) =>
    set((state) => {
      const peers = new Map(state.peers);
      peers.set(peer.peerId, peer);
      return { peers };
    }),

  removePeer: (peerId) =>
    set((state) => {
      const peers = new Map(state.peers);
      peers.delete(peerId);
      // Also remove streams from that peer
      const streams = new Map(state.streams);
      const mediaStreams = new Map(state.mediaStreams);
      for (const [sid, info] of streams) {
        if (info.peerId === peerId) {
          streams.delete(sid);
          const ms = mediaStreams.get(sid);
          if (ms) {
            for (const track of ms.getTracks()) track.stop();
            mediaStreams.delete(sid);
          }
        }
      }
      return { peers, streams, mediaStreams };
    }),

  setPeers: (peers) =>
    set(() => {
      const map = new Map<string, PeerInfo>();
      for (const p of peers) map.set(p.peerId, p);
      return { peers: map };
    }),

  addStream: (info) =>
    set((state) => {
      const streams = new Map(state.streams);
      streams.set(info.streamId, info);
      return { streams };
    }),

  removeStream: (streamId) =>
    set((state) => {
      const streams = new Map(state.streams);
      streams.delete(streamId);
      const mediaStreams = new Map(state.mediaStreams);
      const ms = mediaStreams.get(streamId);
      if (ms) {
        for (const track of ms.getTracks()) track.stop();
        mediaStreams.delete(streamId);
      }
      return { streams, mediaStreams };
    }),

  setMediaStream: (streamId, stream) =>
    set((state) => {
      const mediaStreams = new Map(state.mediaStreams);
      mediaStreams.set(streamId, stream);
      return { mediaStreams };
    }),

  removeMediaStream: (streamId) =>
    set((state) => {
      const mediaStreams = new Map(state.mediaStreams);
      const ms = mediaStreams.get(streamId);
      if (ms) {
        for (const track of ms.getTracks()) track.stop();
      }
      mediaStreams.delete(streamId);
      return { mediaStreams };
    }),
}));
