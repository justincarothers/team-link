import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WS_YJS_PATH } from '@team-link/shared';

interface UseYjsOptions {
  serverUrl: string;
  roomCode: string;
  toolId: string;
  enabled?: boolean;
}

export function useYjs({ serverUrl, roomCode, toolId, enabled = true }: UseYjsOptions) {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!enabled || !roomCode || !toolId) return;

    const ydoc = new Y.Doc();
    const wsUrl = serverUrl.replace(/^http/, 'ws');
    // y-websocket expects a room name and constructs the URL
    const provider = new WebsocketProvider(
      `${wsUrl}${WS_YJS_PATH}/${roomCode}`,
      toolId,
      ydoc,
    );

    provider.on('sync', (isSynced: boolean) => {
      setSynced(isSynced);
    });

    docRef.current = ydoc;
    providerRef.current = provider;
    setDoc(ydoc);

    return () => {
      provider.destroy();
      ydoc.destroy();
      docRef.current = null;
      providerRef.current = null;
      setDoc(null);
      setSynced(false);
    };
  }, [serverUrl, roomCode, toolId, enabled]);

  return { doc, synced, provider: providerRef.current };
}
