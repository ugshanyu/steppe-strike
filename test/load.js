import { performance } from 'node:perf_hooks';
import { BUTTON } from '../shared/constants.js';
import { encodeSnapshot } from '../shared/protocol.js';
import { RoomManager } from '../server/room-manager.js';

const ROOM_COUNT = Number.parseInt(process.env.LOAD_ROOMS || '50', 10);
const PLAYERS_PER_ROOM = 10;
const TICKS = Number.parseInt(process.env.LOAD_TICKS || '600', 10);
const FRAME_BUDGET_MS = 1_000 / 60;
const socket = () => ({ close() {} });

const manager = new RoomManager({
  roomOptions: { warmupMs: 0, roundMs: 300_000 },
});
const simulations = [];
for (let roomIndex = 0; roomIndex < ROOM_COUNT; roomIndex += 1) {
  const roomId = `load-${roomIndex}`;
  const roomSeats = [];
  for (let playerIndex = 0; playerIndex < PLAYERS_PER_ROOM; playerIndex += 1) {
    const userId = `${roomId}-p${playerIndex}`;
    const joined = manager.join({
      userId,
      roomId,
      sessionId: `session-${userId}`,
    }, userId, socket(), 0);
    roomSeats.push(joined.seat);
  }
  simulations.push({ room: manager.rooms.get(roomId), seats: roomSeats });
}
manager.step(1);

const durations = [];
let encodedBytes = 0;
for (let tick = 1; tick <= TICKS; tick += 1) {
  const started = performance.now();
  for (const simulation of simulations) {
    for (let index = 0; index < simulation.seats.length; index += 1) {
      const seat = simulation.seats[index];
      simulation.room.setInput(seat, {
        seq: tick & 0xffff,
        buttons: tick % 120 < 60 ? BUTTON.FORWARD : BUTTON.RIGHT,
        yaw: index % 2 ? Math.PI / 2 : -Math.PI / 2,
        pitch: 0,
        fireNonce: 0,
        viewTick: simulation.room.tickNumber,
      }, tick * FRAME_BUDGET_MS);
    }
  }
  manager.step(tick * FRAME_BUDGET_MS);
  if (tick % 3 === 0) {
    for (const room of manager.rooms.values()) {
      const players = room.snapshotPlayers();
      for (const recipient of room.match.connectedSeats()) {
        encodedBytes += encodeSnapshot(room.tickNumber, recipient.lastAck, players).byteLength;
      }
    }
  }
  durations.push(performance.now() - started);
}

durations.sort((a, b) => a - b);
const percentile = (fraction) =>
  durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)];
const report = {
  rooms: ROOM_COUNT,
  players: ROOM_COUNT * PLAYERS_PER_ROOM,
  ticks: TICKS,
  tickP95Ms: Number(percentile(0.95).toFixed(3)),
  tickP99Ms: Number(percentile(0.99).toFixed(3)),
  tickMaxMs: Number(durations.at(-1).toFixed(3)),
  encodedMiB: Number((encodedBytes / 1_048_576).toFixed(2)),
  frameBudgetMs: Number(FRAME_BUDGET_MS.toFixed(3)),
};
console.log(JSON.stringify(report));
if (report.tickP99Ms > FRAME_BUDGET_MS) {
  throw new Error(`60 Hz load gate failed: p99 ${report.tickP99Ms}ms`);
}
