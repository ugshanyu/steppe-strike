import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PORT, RESULT_KEY_ID, RESULT_SECRET, SERVICE_ID, TEST_MODE, USION_API_URL,
} from './config.js';
import { createRequestHandler } from './http.js';
import { FixedTicker } from './fixed-ticker.js';
import { attachRealtime } from './realtime.js';
import { ResultReporter } from './result-reporter.js';
import { RoomManager } from './room-manager.js';
import { TEST_MATCH_SPAWNS } from './match-room.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultReporter = new ResultReporter({
  apiUrl: USION_API_URL,
  serviceId: SERVICE_ID,
  keyId: RESULT_KEY_ID,
  secret: RESULT_SECRET,
});
const rooms = new RoomManager({
  resultReporter: resultReporter.configured() ? resultReporter : null,
  roomOptions: TEST_MODE ? {
    warmupMs: 100,
    roundEndMs: 300,
    scoreToWin: 2,
    spawnPoints: TEST_MATCH_SPAWNS,
  } : {},
});
const ticker = new FixedTicker((now) => rooms.step(now));
const server = http.createServer(createRequestHandler(rooms, join(root, 'dist'), {
  resultReporter,
  ticker,
}));
const realtime = attachRealtime(server, rooms);
ticker.start();

server.on('connection', (socket) => socket.setNoDelay(true));
server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    game: 'steppe-strike',
    port: PORT,
    region: process.env.RAILWAY_REPLICA_REGION || 'local',
    tickRate: 60,
    resultSigning: resultReporter.configured(),
  }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ level: 'info', event: 'shutdown', signal }));
  ticker.stop();
  realtime.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
