# team-link

Self-hosted screen-sharing service for gaming groups with collaborative tools. Share your screen with friends and use real-time collaborative game tools -- notes, resource maps, and more.

## How It Works

- **Host** runs the desktop app, selects screens/windows to broadcast
- **Viewers** join via browser using a 6-character room code
- **WebRTC** streams video peer-to-peer (full mesh, 2-8 players)
- **Game tools** (collaborative notes, resource maps) sync in real-time via Yjs CRDTs

## Packages

| Package | Description |
|---------|-------------|
| `packages/shared` | TypeScript types, signaling protocol, constants |
| `packages/server` | Node.js signaling server (Express + WebSocket) |
| `packages/ui` | Shared React components and hooks |
| `packages/web` | Browser viewer app (Vite + React) |
| `packages/desktop` | Electron host app (electron-vite + React) |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Development

```bash
pnpm install

# Run server + web viewer (two terminals)
pnpm dev:server       # starts signaling server on :3777
pnpm dev:web          # starts web app on :5173 (proxies to server)

# Or run the desktop host app
pnpm dev:desktop
```

### Docker (server + web viewer)

```bash
docker build -t team-link .
docker run -p 3000:3000 team-link
```

Then open `http://localhost:3000` in a browser.

## Building

```bash
pnpm build            # build all packages
pnpm typecheck        # type-check everything
```

## License

[MIT](LICENSE)
