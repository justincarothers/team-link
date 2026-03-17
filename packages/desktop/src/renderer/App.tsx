import { useCallback, useEffect, useRef, useState } from 'react';
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

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id: string;
}

type Stage = 'setup' | 'select-sources' | 'hosting';

export default function App() {
  const [stage, setStage] = useState<Stage>('setup');
  const [serverUrl, setServerUrl] = useState('http://localhost:3777');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);

  // Single signaling connection shared across entire app
  const signaling = useSignaling(serverUrl);
  const { connect, disconnect, sendMessage, addHandler } = signaling;

  // Single WebRTC instance
  const webrtc = useWebRTC(sendMessage, addHandler);
  const { addLocalStream, closeAll } = webrtc;

  // Room state from Zustand store
  const { roomCode, peerId, isHost, peers, streams, mediaStreams } = useRoom();

  // Handle peer events globally
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
          console.error('Server error:', msg.message);
          setError(msg.message);
          if (msg.message === 'Connection to server lost' && state.roomCode) {
            closeAll();
            state.clearRoom();
            setStage('setup');
          }
          break;
      }
    });
    return cleanup;
  }, [addHandler, closeAll]);

  // --- Stage: setup ---
  const handleSetup = useCallback(
    (url: string, name: string) => {
      setServerUrl(url);
      setDisplayName(name);
      setError('');
      setStage('select-sources');
    },
    [],
  );

  // --- Stage: select-sources -> hosting ---
  const handleSourcesSelected = useCallback(
    async (sources: DesktopSource[]) => {
      setError('');
      connect();

      // Wait for WebSocket connection to be established
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (signaling.wsRef.current?.readyState === WebSocket.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 100);
        // Timeout after 5s
        setTimeout(() => { clearInterval(check); resolve(); }, 5000);
      });

      // Create room and wait for confirmation
      const roomCreated = await new Promise<boolean>((resolve) => {
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
        sendMessage({ type: 'create-room', displayName });
        setTimeout(() => { cleanup(); resolve(false); }, 5000);
      });

      if (!roomCreated) {
        setError('Failed to create room. Check that the server is running.');
        return;
      }

      // Capture each selected source
      let capturedAny = false;
      for (const source of sources) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxFrameRate: 30,
              },
            } as any,
          });

          addLocalStream(stream, source.name, source.name);
          useRoom.getState().setMediaStream(stream.id, stream);
          capturedAny = true;
        } catch (err) {
          console.error(`Failed to capture ${source.name}:`, err);
        }
      }

      if (!capturedAny) {
        setError('Failed to capture any screens.');
        return;
      }

      setStage('hosting');
    },
    [connect, sendMessage, addHandler, addLocalStream, displayName, signaling.wsRef],
  );

  const handleLeave = useCallback(() => {
    sendMessage({ type: 'leave-room' });
    closeAll();
    disconnect();
    useRoom.getState().clearRoom();
    setStage('setup');
    setError('');
  }, [sendMessage, closeAll, disconnect]);

  // --- Render based on stage ---
  if (stage === 'setup') {
    return <SetupPage serverUrl={serverUrl} onNext={handleSetup} />;
  }

  if (stage === 'select-sources') {
    return <SourceSelector error={error} onSelect={handleSourcesSelected} />;
  }

  // stage === 'hosting'
  // Use mediaStreams as the source of truth (same approach as web app)
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
                  label={info?.label ?? 'Local'}
                  monitorName={info?.monitorName}
                />
              );
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            Sharing active -- waiting for viewers
          </div>
        )}
      </div>

      {roomCode && (
        <GameToolPanel
          serverUrl={serverUrl}
          roomCode={roomCode}
          isOpen={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
        />
      )}
    </div>
  );
}

// --- Setup Page ---
function SetupPage({
  serverUrl: initialUrl,
  onNext,
}: {
  serverUrl: string;
  onNext: (serverUrl: string, displayName: string) => void;
}) {
  const [serverUrl, setServerUrl] = useState(initialUrl);
  const [displayName, setDisplayName] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 shadow-2xl">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">team-link</h1>
        <p className="mb-8 text-center text-sm text-gray-400">Host -- Share your screen</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Server URL</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Your Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg bg-gray-800 px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) =>
                e.key === 'Enter' && displayName.trim() && onNext(serverUrl, displayName)
              }
            />
          </div>
          <button
            onClick={() => displayName.trim() && onNext(serverUrl, displayName)}
            disabled={!displayName.trim()}
            className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Source Selector ---
function SourceSelector({
  error,
  onSelect,
}: {
  error: string;
  onSelect: (sources: DesktopSource[]) => void;
}) {
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getSources().then((srcs) => {
      setSources(srcs);
      setLoading(false);
    });
  }, []);

  const toggleSource = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    const selectedSources = sources.filter((s) => selected.has(s.id));
    if (selectedSources.length > 0) {
      onSelect(selectedSources);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-400">
        Loading sources...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 p-8">
      <h2 className="mb-6 text-xl font-bold text-white">Select screens to share</h2>

      <div className="grid grid-cols-3 gap-4">
        {sources.map((source) => (
          <button
            key={source.id}
            onClick={() => toggleSource(source.id)}
            className={`overflow-hidden rounded-lg border-2 transition-colors ${
              selected.has(source.id)
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-700 bg-gray-800 hover:border-gray-500'
            }`}
          >
            <img
              src={source.thumbnail}
              alt={source.name}
              className="aspect-video w-full object-cover"
            />
            <div className="px-3 py-2 text-left text-sm text-white">{source.name}</div>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleStart}
          disabled={selected.size === 0}
          className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
        >
          Start Sharing ({selected.size} source{selected.size !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}
