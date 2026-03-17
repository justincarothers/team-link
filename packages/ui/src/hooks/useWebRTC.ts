import { useRef, useCallback, useEffect } from 'react';
import type { ServerMessage, ClientMessage } from '@team-link/shared';
import type { MessageHandler } from './useSignaling.js';
import { useRoom } from './useRoom.js';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnection {
  pc: RTCPeerConnection;
  peerId: string;
  makingOffer: boolean;
  /** Maps received remote stream IDs to announced stream metadata */
  remoteStreamIds: Set<string>;
}

export function useWebRTC(
  sendMessage: (msg: ClientMessage) => void,
  addHandler: (handler: MessageHandler) => () => void,
) {
  const connectionsRef = useRef<Map<string, PeerConnection>>(new Map());
  const localStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  // Maps a remote stream (by its received ID) to the announced streamId
  const remoteStreamMapRef = useRef<Map<string, string>>(new Map());

  const createPeerConnection = useCallback(
    (remotePeerId: string): PeerConnection => {
      // Close existing connection to this peer if any
      const existing = connectionsRef.current.get(remotePeerId);
      if (existing) {
        existing.pc.close();
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      const conn: PeerConnection = { pc, peerId: remotePeerId, makingOffer: false, remoteStreamIds: new Set() };

      // Add all local streams' tracks
      for (const stream of localStreamsRef.current.values()) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      }

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          const receivedId = remoteStream.id;
          console.log(`[WebRTC] ontrack from ${remotePeerId}, stream=${receivedId}, track=${event.track.kind}`);

          // Track this stream as coming from this peer
          conn.remoteStreamIds.add(receivedId);

          // Try to find matching announced metadata from this peer.
          // The announced streamId (sender's ID) may differ from receivedId.
          const state = useRoom.getState();
          let matchedAnnouncedId: string | null = null;
          for (const [announcedId, info] of state.streams) {
            if (info.peerId === remotePeerId) {
              // Check if this announced stream already has a mediaStream mapped
              if (!state.mediaStreams.has(announcedId)) {
                matchedAnnouncedId = announcedId;
                break;
              }
            }
          }

          // Store under the announced ID if found, otherwise under receivedId
          const storeId = matchedAnnouncedId ?? receivedId;
          console.log(`[WebRTC] Storing stream as ${storeId} (received=${receivedId}, matched=${matchedAnnouncedId})`);

          // Map receivedId -> storeId for later cleanup
          if (storeId !== receivedId) {
            remoteStreamMapRef.current.set(receivedId, storeId);
          }

          useRoom.getState().setMediaStream(storeId, remoteStream);

          // When tracks end, clean up
          event.track.onended = () => {
            const tracks = remoteStream.getTracks();
            if (tracks.every((t) => t.readyState === 'ended')) {
              useRoom.getState().removeMediaStream(storeId);
              conn.remoteStreamIds.delete(receivedId);
              remoteStreamMapRef.current.delete(receivedId);
            }
          };
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendMessage({
            type: 'ice-candidate',
            targetPeerId: remotePeerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          conn.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          sendMessage({
            type: 'offer',
            targetPeerId: remotePeerId,
            sdp: pc.localDescription!,
          });
        } catch (err) {
          console.error('[WebRTC] Negotiation error:', err);
        } finally {
          conn.makingOffer = false;
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state for ${remotePeerId}: ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state for ${remotePeerId}: ${pc.connectionState}`);
      };

      connectionsRef.current.set(remotePeerId, conn);

      // If we have no local tracks, onnegotiationneeded won't fire.
      // Send an explicit offer so the remote peer creates a reciprocal
      // connection and can send us tracks later.
      if (localStreamsRef.current.size === 0) {
        (async () => {
          try {
            conn.makingOffer = true;
            const offer = await pc.createOffer();
            if (pc.signalingState !== 'stable') return;
            await pc.setLocalDescription(offer);
            sendMessage({
              type: 'offer',
              targetPeerId: remotePeerId,
              sdp: pc.localDescription!,
            });
            console.log(`[WebRTC] Sent explicit offer to ${remotePeerId} (no local tracks)`);
          } catch (err) {
            console.error('[WebRTC] Explicit offer error:', err);
          } finally {
            conn.makingOffer = false;
          }
        })();
      }

      return conn;
    },
    [sendMessage],
  );

  const handleMessage = useCallback(
    async (msg: ServerMessage) => {
      const myPeerId = useRoom.getState().peerId;
      if (!myPeerId) return;

      switch (msg.type) {
        case 'peer-joined': {
          console.log(`[WebRTC] peer-joined: ${msg.peer.peerId}, I will create offer`);
          // We are an existing peer; initiate connection to the new peer
          createPeerConnection(msg.peer.peerId);
          break;
        }

        case 'offer': {
          console.log(`[WebRTC] offer from ${msg.fromPeerId}`);
          let conn = connectionsRef.current.get(msg.fromPeerId);
          if (!conn) {
            conn = createPeerConnection(msg.fromPeerId);
          }
          const { pc } = conn;

          const offerCollision =
            conn.makingOffer || pc.signalingState !== 'stable';

          if (offerCollision) {
            // Determine politeness: lower peerId is polite
            const iAmPolite = myPeerId < msg.fromPeerId;
            if (!iAmPolite) {
              console.log('[WebRTC] Ignoring colliding offer (I am impolite)');
              return;
            }
            console.log('[WebRTC] Rolling back for colliding offer (I am polite)');
            await pc.setLocalDescription({ type: 'rollback' });
          }

          await pc.setRemoteDescription(msg.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendMessage({
            type: 'answer',
            targetPeerId: msg.fromPeerId,
            sdp: pc.localDescription!,
          });
          break;
        }

        case 'answer': {
          console.log(`[WebRTC] answer from ${msg.fromPeerId}`);
          const conn = connectionsRef.current.get(msg.fromPeerId);
          if (!conn) return;
          if (conn.pc.signalingState === 'stable') {
            console.log('[WebRTC] Already stable, ignoring answer');
            return;
          }
          await conn.pc.setRemoteDescription(msg.sdp);
          break;
        }

        case 'ice-candidate': {
          const conn = connectionsRef.current.get(msg.fromPeerId);
          if (!conn) return;
          try {
            await conn.pc.addIceCandidate(msg.candidate);
          } catch (err) {
            console.error('[WebRTC] ICE candidate error:', err);
          }
          break;
        }

        case 'peer-left': {
          console.log(`[WebRTC] peer-left: ${msg.peerId}`);
          const leftConn = connectionsRef.current.get(msg.peerId);
          if (leftConn) {
            // Clean up any stream ID mappings from this peer
            for (const receivedId of leftConn.remoteStreamIds) {
              const mappedId = remoteStreamMapRef.current.get(receivedId);
              if (mappedId) {
                remoteStreamMapRef.current.delete(receivedId);
              }
            }
            leftConn.pc.close();
            connectionsRef.current.delete(msg.peerId);
          }
          break;
        }

        case 'stream-announced': {
          console.log(`[WebRTC] stream-announced: peer=${msg.peerId} stream=${msg.streamId} label=${msg.label}`);
          const roomState = useRoom.getState();
          roomState.addStream({
            streamId: msg.streamId,
            peerId: msg.peerId,
            label: msg.label,
            monitorName: msg.monitorName,
          });

          // If we already received a mediaStream from this peer via ontrack
          // but stored it under the received ID (because announcement hadn't
          // arrived yet), re-map it to the announced ID.
          const peerConn = connectionsRef.current.get(msg.peerId);
          if (peerConn && !roomState.mediaStreams.has(msg.streamId)) {
            // Look for an unmapped mediaStream from this peer
            for (const receivedId of peerConn.remoteStreamIds) {
              const ms = roomState.mediaStreams.get(receivedId);
              if (ms && !roomState.streams.has(receivedId)) {
                // This mediaStream has no matching announcement — remap it
                console.log(`[WebRTC] Remapping stream ${receivedId} -> ${msg.streamId}`);
                roomState.removeMediaStream(receivedId);
                roomState.setMediaStream(msg.streamId, ms);
                remoteStreamMapRef.current.set(receivedId, msg.streamId);
                break;
              }
            }
          }
          break;
        }

        case 'stream-removed': {
          console.log(`[WebRTC] stream-removed: peer=${msg.peerId} stream=${msg.streamId}`);
          useRoom.getState().removeStream(msg.streamId);
          break;
        }
      }
    },
    [createPeerConnection, sendMessage],
  );

  useEffect(() => {
    const cleanup = addHandler(handleMessage);
    return cleanup;
  }, [addHandler, handleMessage]);

  const addLocalStream = useCallback(
    (stream: MediaStream, label: string, monitorName: string) => {
      localStreamsRef.current.set(stream.id, stream);

      // Add tracks to all existing connections
      for (const conn of connectionsRef.current.values()) {
        for (const track of stream.getTracks()) {
          conn.pc.addTrack(track, stream);
        }
      }

      // Announce stream to all peers
      sendMessage({
        type: 'stream-announce',
        streamId: stream.id,
        label,
        monitorName,
      });
    },
    [sendMessage],
  );

  const removeLocalStream = useCallback(
    (streamId: string) => {
      const stream = localStreamsRef.current.get(streamId);
      if (!stream) return;

      for (const conn of connectionsRef.current.values()) {
        for (const sender of conn.pc.getSenders()) {
          if (sender.track && stream.getTracks().includes(sender.track)) {
            conn.pc.removeTrack(sender);
          }
        }
      }

      localStreamsRef.current.delete(streamId);
      sendMessage({ type: 'stream-remove', streamId });
    },
    [sendMessage],
  );

  const closeAll = useCallback(() => {
    for (const conn of connectionsRef.current.values()) {
      conn.pc.close();
    }
    connectionsRef.current.clear();
    for (const stream of localStreamsRef.current.values()) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    localStreamsRef.current.clear();
    remoteStreamMapRef.current.clear();
  }, []);

  return { addLocalStream, removeLocalStream, closeAll };
}
