# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

team-link — self-hosted gaming screen-sharing service with collaborative game tools. Electron desktop app captures and broadcasts screens; browser viewers join via room code. Collaborative game tools (notes, resource map) sync in real-time via Yjs CRDTs.

## Dev Commands

```bash
pnpm install              # install all deps
pnpm dev:server           # signaling server (port 3777)
pnpm dev:web              # web viewer (port 5173, proxies /ws and /api to server)
pnpm dev:desktop          # electron host app
pnpm build                # build all packages (shared must build first)
pnpm build:shared         # build shared types (required before other packages)
pnpm typecheck            # type-check all packages
pnpm lint                 # lint all packages
```

For development, run `pnpm dev:server` and `pnpm dev:web` (or `pnpm dev:desktop`) concurrently. The web dev server proxies WebSocket and API requests to the server at localhost:3777.

No test framework is configured yet.

## Architecture

Monorepo with pnpm workspaces. Five packages with this dependency graph:

```
shared ← server
shared ← ui ← web
shared ← ui ← desktop
```

- **packages/shared** — TypeScript types, signaling protocol message definitions, constants. Must be built before other packages. Defines `SignalMessage` discriminated union (the full signaling protocol) and room/peer/stream types.
- **packages/server** — Express + ws. Two WebSocket endpoints: `/ws/signal` for WebRTC signaling, `/ws/yjs/:roomCode/:toolId` for Yjs CRDT sync. Serves the built web app as SPA fallback in production. Default port 3000 (dev port 3777).
- **packages/ui** — Shared React component and hook library (not independently built). Core hooks: `useSignaling` (WS connection), `useWebRTC` (peer connections + streams), `useRoom` (Zustand store), `useYjs` (CRDT doc provider). Game tools use a plugin registry pattern in `game-tools/registry.ts`.
- **packages/web** — Vite + React SPA. Two stages: lobby (create/join room) and room view (tiling stream layout + game tool sidebar).
- **packages/desktop** — Electron-vite app. Three stages: setup (server URL + name), source selection (multi-screen picker), hosting (broadcast + viewer). Uses Electron's desktopCapturer for screen enumeration.

## Key Patterns

- **WebRTC full mesh** for 2-8 peers. Politeness algorithm for offer collision (lower peerId = polite side). STUN via Google's public servers.
- **Signaling protocol** is a discriminated union on `type` field. Client messages: `create-room`, `join-room`, `leave-room`, `offer`, `answer`, `ice-candidate`, `stream-announce`, `stream-remove`. Server messages mirror these plus `room-created`, `room-joined`, `peer-joined`, `peer-left`, `error`.
- **Room state** lives server-side in `rooms.ts`. Rooms auto-cleanup after 30s grace period when empty. Room codes are 6-char alphanumeric (no ambiguous chars like 0/O/1/l).
- **Yjs sync** uses y-protocols sync v1 + awareness protocol over WebSocket. Each room:tool pair gets its own Yjs Doc. Game tools receive `{ serverUrl, roomCode, toolId }` props and create their own Yjs connection.
- **Game tool plugins** register via `GameToolRegistry`. Each plugin declares `{ id, name, games[], component }`. `games: []` means available for all games. Built-in tools: CollabNotes (Tiptap + Yjs), ResourceMap (click-to-place markers synced via Y.Array).
- **Room store** is Zustand (`useRoom`). Holds room code, peer list, stream metadata, and received MediaStream objects.
- **Electron IPC**: main process exposes `get-sources` handler; renderer calls via `window.electronAPI.getSources()` through context-isolated preload bridge.

## Docker

Production Dockerfile builds shared → ui → server → web, then runs `node packages/server/dist/index.js` on port 3000. The server serves the web app's built assets.
