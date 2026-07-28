import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DT } from '../shared/constants.js';
import { PORT, TEST_MODE } from './config.js';
import { GameWorld } from './game-world.js';
import { createRequestHandler } from './http.js';
import { attachRealtime } from './realtime.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const world = new GameWorld({ testMode: TEST_MODE });
const server = http.createServer(createRequestHandler(world, join(root, 'dist')));
const realtime = attachRealtime(server, world);
const gameTimer = setInterval(() => world.step(), DT * 1000);

server.on('connection', (socket) => socket.setNoDelay(true));
server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    game: 'steppe-strike',
    port: PORT,
    region: process.env.RAILWAY_REPLICA_REGION || 'local',
  }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  clearInterval(gameTimer);
  realtime.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

