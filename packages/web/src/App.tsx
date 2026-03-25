import { useCallback, useEffect, useState } from 'react';
import {
  useSignaling,
  useWebRTC,
  useRoom,
  RoomBar,
  StreamView,
  TilingLayout,
  GameToolPanel,
} from '@team-link/ui';
import type { ServerMessage } from '@team-link/shared';
import { FlightsDashboard } from './FlightsDashboard';

const SERVER_URL = window.location.origin;

type Mode = 'lobby' | 'room';

export default function App() {
  if (window.location.pathname.startsWith('/flights')) {
    return <FlightsDashboard />;
  }

  const [mode, setMode] = useState<Mode>('lobby');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);

  const signaling = useSignaling(SERVER_URL);
  const { connect, disconnect, sendMessage, addHandler } = signaling;
  const { addLocalStream, closeAll } = useWebRTC(sendMessage, addHandler);
  const { roomCode, peerId, isHost, peers, streams, mediaStreams } = useRoom();

  // Handle peer events and disconnection globally
  useEffect(() => {
    const cleanup = addHandler((msg: ServerMessage) => {
      const state = useRoom.getState();
      switch (msg.type) {
        case 'peer-joined':
          state.addPeer(msg.peer);
          break;
        case 'peer-left':
          state.removePeer(msg.peerId);
          break;
        case 'error':
          setError(msg.message);
          // If connection lost while in a room, clean up and go to lobby
          if (msg.message === 'Connection to server lost' && useRoom.getState().roomCode) {
            closeAll();
            state.clearRoom();
            setMode('lobby');
          }
          break;
      }
    });
    return cleanup;
  }, [addHandler, closeAll]);

  const waitForConnection = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (signaling.wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(check);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('Connection timeout'));
      }, 5000);
    });
  }, [signaling.wsRef]);

  // --- Create Room ---
  const handleCreate = useCallback(async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    setError('');
    connect();

    try {
      await waitForConnection();
    } catch {
      setError('Could not connect to server. Is it running?');
      return;
    }

    const created = await new Promise<boolean>((resolve) => {
      const cleanup = addHandler((msg: ServerMessage) => {
        if (msg.type === 'room-created') {
          useRoom.getState().setRoom(msg.code, msg.peerId, true);
          cleanup();
          resolve(true);
        } else if (msg.type === 'error') {
          setError(msg.message);
          cleanup();
          resolve(false);
        }
      });
      sendMessage({ type: 'create-room', displayName: name });
      setTimeout(() => { cleanup(); resolve(false); }, 5000);
    });

    if (!created) {
      setError((prev) => prev || 'Failed to create room. Is the server running?');
      return;
    }

    setMode('room');
  }, [name, connect, waitForConnection, sendMessage, addHandler]);

  // --- Join Room ---
  const handleJoin = useCallback(async () => {
    if (!code.trim() || !name.trim()) {
      setError('Please enter a room code and your name');
      return;
    }
    setError('');
    connect();

    try {
      await waitForConnection();
    } catch {
      setError('Could not connect to server. Is it running?');
      return;
    }

    const cleanup = addHandler((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room-joined': {
          const state = useRoom.getState();
          state.setRoom(msg.code, msg.peerId, false);
          state.setPeers(msg.peers);
          cleanup();
          setMode('room');
          break;
        }
        case 'error':
          setError(msg.message);
          cleanup();
          break;
      }
    });
    sendMessage({ type: 'join-room', code: code.toUpperCase(), displayName: name });
    setTimeout(() => cleanup(), 5000);
  }, [code, name, connect, waitForConnection, sendMessage, addHandler]);

  // --- Share Screen (available to any participant) ---
  const handleShareScreen = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      const count = localStreamCount() + 1;
      const label = `Screen ${count}`;
      addLocalStream(stream, label, label);
      useRoom.getState().setMediaStream(stream.id, stream);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        useRoom.getState().removeMediaStream(stream.id);
      });
    } catch {
      // user cancelled the picker
    }
  }, [addLocalStream]);

  // Count local streams (ones we're sharing)
  function localStreamCount() {
    const allStreams = useRoom.getState().streams;
    const allMedia = useRoom.getState().mediaStreams;
    let count = 0;
    for (const [id] of allMedia) {
      const info = allStreams.get(id);
      if (!info || info.peerId === useRoom.getState().peerId) {
        count++;
      }
    }
    return count;
  }

  // --- Leave ---
  const handleLeave = useCallback(() => {
    sendMessage({ type: 'leave-room' });
    closeAll();
    disconnect();
    useRoom.getState().clearRoom();
    setMode('lobby');
    setError('');
  }, [sendMessage, closeAll, disconnect]);

  // --- Lobby ---
  if (mode === 'lobby') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 shadow-2xl">
          <h1 className="mb-2 text-center text-3xl font-bold text-white">team-link</h1>
          <p className="mb-8 text-center text-sm text-gray-400">
            Share your screen or join a friend's room
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-400">Your Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <p className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              Create Room
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-700" />
              <span className="text-xs text-gray-500">or join an existing room</span>
              <div className="h-px flex-1 bg-gray-700" />
            </div>

            <div>
              <label className="mb-1 block text-sm text-gray-400">Room Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCDEF"
                maxLength={6}
                className="w-full rounded-lg bg-gray-800 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
            </div>

            <button
              onClick={handleJoin}
              disabled={!name.trim() || !code.trim()}
              className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Room View ---
  // mediaStreams keys now match streams keys thanks to the remapping in useWebRTC
  const displayIds = Array.from(mediaStreams.keys());

  return (
    <div className="flex h-screen flex-col bg-gray-950">
      <RoomBar
        roomCode={roomCode}
        peerId={peerId}
        isHost={isHost}
        peers={peers}
        onLeave={handleLeave}
      />

      <div className="relative flex-1 overflow-hidden p-2">
        {displayIds.length > 0 ? (
          <TilingLayout
            streamIds={displayIds}
            renderStream={(streamId) => {
              const ms = mediaStreams.get(streamId);
              const info = streams.get(streamId)
                ?? Array.from(streams.values()).find((s) => s.streamId === streamId);
              return (
                <StreamView
                  stream={ms ?? null}
                  label={info?.label}
                  monitorName={info?.monitorName}
                />
              );
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            No streams yet. Share your screen or wait for others.
          </div>
        )}
      </div>

      {/* Any participant can share their screen */}
      <div className="flex justify-center bg-gray-900 py-2">
        <button
          onClick={handleShareScreen}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-600"
        >
          + Share Screen
        </button>
      </div>

      {roomCode && (
        <GameToolPanel
          serverUrl={SERVER_URL}
          roomCode={roomCode}
          isOpen={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
        />
      )}
    </div>
  );
}
