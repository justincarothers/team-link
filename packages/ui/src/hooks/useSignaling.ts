import { useRef, useCallback, useEffect } from 'react';
import { create } from 'zustand';
import type { ClientMessage, ServerMessage } from '@team-link/shared';
import { WS_SIGNAL_PATH } from '@team-link/shared';

interface SignalingState {
  connected: boolean;
  setConnected: (v: boolean) => void;
}

export const useSignalingStore = create<SignalingState>((set) => ({
  connected: false,
  setConnected: (v) => set({ connected: v }),
}));

export type MessageHandler = (msg: ServerMessage) => void;

export function useSignaling(serverUrl: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const intentionalCloseRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) return;

    intentionalCloseRef.current = false;
    const wsUrl = serverUrl.replace(/^http/, 'ws') + WS_SIGNAL_PATH;
    console.log(`[Signaling] Connecting to ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Signaling] Connected');
      useSignalingStore.getState().setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      console.log('[Signaling] Disconnected');
      useSignalingStore.getState().setConnected(false);
      wsRef.current = null;

      // If the close was unexpected, notify handlers so the UI can react
      if (!intentionalCloseRef.current) {
        const disconnectMsg: ServerMessage = {
          type: 'error',
          message: 'Connection to server lost',
        };
        for (const handler of handlersRef.current) {
          handler(disconnectMsg);
        }
      }
    };

    ws.onerror = (err) => {
      console.error('[Signaling] WebSocket error', err);
      ws.close();
    };

    wsRef.current = ws;
  }, [serverUrl]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[Signaling] Cannot send — WebSocket not open', msg.type);
    }
  }, []);

  const addHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, sendMessage, addHandler, wsRef };
}
