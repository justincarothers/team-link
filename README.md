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

## Flight Monitor

This repo also includes a local flight monitor at `/flights` backed by the server package.

1. Copy [`.env.example`](/home/zephyrus/team-link/.env.example) to `.env` and add your Amadeus test credentials.
2. Start the server and web app:

```bash
pnpm dev:server
pnpm dev:web
```

3. Open `http://localhost:5173/flights`.

What it does:

- scans the current real nonstop international `PDX` routes once per day
- stores snapshots in `data/flights-monitor.json`
- detects new lows and threshold-breaking fares
- exposes JSON endpoints under `/api/flights/*`
- can POST alerts to `FLIGHT_MONITOR_WEBHOOK_URL`

The destination list is intentionally configurable through `FLIGHT_MONITOR_DESTINATIONS` so you can tune the watched nonstop routes without code changes.

## License

[MIT](LICENSE)
