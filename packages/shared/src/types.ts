export interface PeerInfo {
  peerId: string;
  displayName: string;
  isHost: boolean;
}

export interface RoomInfo {
  code: string;
  hostPeerId: string;
  peers: PeerInfo[];
}

export interface StreamInfo {
  streamId: string;
  peerId: string;
  label: string;
  monitorName: string;
}

export interface GameToolMeta {
  id: string;
  name: string;
  games: string[];
}
