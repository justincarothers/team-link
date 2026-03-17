import { type FC, useState, useCallback } from 'react';
import type { PeerInfo } from '@team-link/shared';

interface RoomBarProps {
  roomCode: string | null;
  peerId: string | null;
  isHost: boolean;
  peers: Map<string, PeerInfo>;
  onLeave: () => void;
}

export const RoomBar: FC<RoomBarProps> = ({ roomCode, peerId, isHost, peers, onLeave }) => {
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(() => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [roomCode]);

  if (!roomCode) return null;

  const peerList = Array.from(peers.values());

  return (
    <div className="flex items-center gap-4 bg-gray-800 px-4 py-2 text-white">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Room:</span>
        <button
          onClick={copyCode}
          className="rounded bg-gray-700 px-3 py-1 font-mono text-lg font-bold tracking-widest hover:bg-gray-600"
          title="Click to copy"
        >
          {roomCode}
        </button>
        {copied && <span className="text-xs text-green-400">Copied!</span>}
      </div>

      <div className="mx-2 h-6 w-px bg-gray-600" />

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">
          {peerList.length + 1} {peerList.length === 0 ? 'person' : 'people'}
        </span>
        <div className="flex gap-1">
          {/* Self indicator */}
          <span
            className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs"
            title={`You (${peerId})`}
          >
            You{isHost ? ' (Host)' : ''}
          </span>
          {peerList.map((p) => (
            <span
              key={p.peerId}
              className="inline-flex items-center rounded-full bg-gray-600 px-2 py-0.5 text-xs"
              title={p.peerId}
            >
              {p.displayName}
              {p.isHost ? ' (Host)' : ''}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <button
        onClick={onLeave}
        className="rounded bg-red-600 px-3 py-1 text-sm hover:bg-red-500"
      >
        Leave
      </button>
    </div>
  );
};
