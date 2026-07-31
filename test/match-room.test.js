import assert from 'node:assert/strict';
import test from 'node:test';
import { BUTTON, PLAYER_FLAG } from '../shared/constants.js';
import { MatchRoom } from '../server/match-room.js';
import { PHASE } from '../server/match.js';
import { RoomManager } from '../server/room-manager.js';

const socket = () => ({
  closed: null,
  close(code, reason) { this.closed = { code, reason }; },
});
const identity = (userId, roomId = 'room-1') => ({
  userId,
  roomId,
  sessionId: `session-${userId}`,
});

function liveRoom(events = []) {
  const room = new MatchRoom('room-1', {
    now: 0,
    warmupMs: 0,
    emit: (event) => events.push(event),
  });
  const alpha = room.join(identity('alpha'), 'Alpha', socket(), 0).seat;
  const bravo = room.join(identity('bravo'), 'Bravo', socket(), 0).seat;
  room.step(1);
  assert.equal(room.match.phase, PHASE.LIVE);
  return { room, alpha, bravo };
}

test('manager isolates the same player identity into separate Usion rooms', () => {
  const rooms = new RoomManager({ roomOptions: { warmupMs: 0 } });
  const first = rooms.join(identity('alpha', 'room-a'), 'Alpha', socket(), 0);
  const second = rooms.join(identity('alpha', 'room-b'), 'Alpha', socket(), 0);
  assert.notEqual(first.room, second.room);
  assert.equal(first.room.map, second.room.map);
  assert.equal(rooms.health().rooms, 2);
  assert.equal(first.room.match.seats.size, 1);
  assert.equal(second.room.match.seats.size, 1);
});

test('room enforces ten seats and retains a reconnect seat', () => {
  const room = new MatchRoom('room-1', { now: 0 });
  for (let index = 0; index < 10; index += 1) {
    assert.ok(room.join(identity(`p${index}`), `P${index}`, socket(), 0));
  }
  assert.equal(room.join(identity('overflow'), 'Overflow', socket(), 0), null);
  const seat = room.match.seats.get('p0');
  room.disconnect(seat, 10);
  const ws = socket();
  const joined = room.join(identity('p0'), 'P0', ws, 11);
  assert.equal(joined.reconnected, true);
  assert.equal(joined.seat.ws, ws);
});

test('a duplicate connection replaces the old socket without duplicating the seat', () => {
  const room = new MatchRoom('room-1', { now: 0 });
  const oldSocket = socket();
  const first = room.join(identity('alpha'), 'Alpha\u0000', oldSocket, 0);
  const newSocket = socket();
  const second = room.join(identity('alpha'), 'Alpha', newSocket, 1);
  assert.equal(second.seat, first.seat);
  assert.equal(room.match.seats.size, 1);
  assert.deepEqual(oldSocket.closed, { code: 4009, reason: 'connected elsewhere' });
  assert.equal(second.seat.name, 'Alpha');
});

test('authoritative input moves a live player and acknowledges wire sequence', () => {
  const { room, alpha } = liveRoom();
  const before = alpha.x;
  assert.equal(room.setInput(alpha, {
    seq: 65_535,
    buttons: BUTTON.FORWARD,
    yaw: -Math.PI / 2,
    pitch: 0,
    fireNonce: 0,
    viewTick: room.tickNumber,
  }, 2), true);
  room.step(18);
  assert.ok(alpha.x > before);
  assert.equal(alpha.lastAck, 65_535);
  assert.equal(room.setInput(alpha, {
    seq: 0,
    buttons: 0,
    yaw: alpha.yaw,
    pitch: 0,
    fireNonce: 0,
    viewTick: room.tickNumber,
  }, 19), true);
  assert.equal(alpha.lastAck, 0);
  assert.equal(room.setInput(alpha, {
    seq: 0,
    buttons: BUTTON.FORWARD,
    yaw: alpha.yaw,
    pitch: 0,
    fireNonce: 0,
    viewTick: room.tickNumber,
  }, 20), false);
});

test('server-owned rifle applies damage, ammo, events, and immutable snapshots', () => {
  const events = [];
  const { room, alpha, bravo } = liveRoom(events);
  Object.assign(alpha, {
    x: -23.5, y: 21, z: -23.5, yaw: -Math.PI / 2, pitch: -0.05,
  });
  Object.assign(bravo, {
    x: 8.5, y: 20, z: -23.5, yaw: Math.PI / 2, pitch: 0,
  });
  alpha.history.push(2, alpha);
  bravo.history.push(2, bravo);
  assert.equal(room.setInput(alpha, {
    seq: 1,
    buttons: BUTTON.FIRE,
    yaw: alpha.yaw,
    pitch: alpha.pitch,
    fireNonce: 1,
    viewTick: room.tickNumber,
  }, 2), true);
  room.step(100);
  assert.equal(alpha.ammo, 29);
  assert.ok(bravo.health < 100);
  assert.ok(events.some((event) => event.t === 'shot' && event.hit));
  const snapshot = room.snapshotPlayers().find((player) => player.id === alpha.networkId);
  assert.ok(snapshot.flags & PLAYER_FLAG.ALIVE);
  assert.equal(snapshot.ammo, 29);
  assert.equal(room.map.setBlock(0, 2, 10, 0), false);
});
