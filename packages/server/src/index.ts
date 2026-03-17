import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PORT, WS_SIGNAL_PATH, WS_YJS_PATH } from '@team-link/shared';
import { handleSignalingMessage, handleDisconnect } from './signaling.js';
import { handleYjsConnection } from './yjs-sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

const app = express();
const server = createServer(app);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Serve web viewer in production
const webDistPath = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webDistPath));
app.get('*', (_req, res, next) => {
  // Only serve index.html for non-API, non-WS routes
  if (_req.path.startsWith('/api') || _req.path.startsWith('/ws')) {
    return next();
  }
  res.sendFile(path.join(webDistPath, 'index.html'), (err) => {
    if (err) next();
  });
});

// WebSocket servers
const signalWss = new WebSocketServer({ noServer: true });
const yjsWss = new WebSocketServer({ noServer: true });

signalWss.on('connection', (ws) => {
  ws.on('message', (data) => {
    handleSignalingMessage(ws, data.toString());
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

yjsWss.on('connection', (ws, req) => {
  handleYjsConnection(ws, req);
});

// Route WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  const url = request.url ?? '';

  if (url.startsWith(WS_SIGNAL_PATH)) {
    signalWss.handleUpgrade(request, socket, head, (ws) => {
      signalWss.emit('connection', ws, request);
    });
  } else if (url.startsWith(WS_YJS_PATH)) {
    yjsWss.handleUpgrade(request, socket, head, (ws) => {
      yjsWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`team-link server listening on http://localhost:${PORT}`);
  console.log(`  Signaling: ws://localhost:${PORT}${WS_SIGNAL_PATH}`);
  console.log(`  Yjs sync:  ws://localhost:${PORT}${WS_YJS_PATH}/:room/:tool`);
});
