import assert from 'node:assert/strict';
import test from 'node:test';
import { BUTTON } from '../shared/constants.js';
import { MatchRoom } from '../server/match-room.js';

const identity = (userId) => ({ userId, roomId: 'net-room', sessionId: `s-${userId}` });
const socket = () => ({ close() {} });

test('150ms latency, 60ms jitter, and 5% input loss remain playable and bounded', () => {
  const events = [];
  const room = new MatchRoom('net-room', {
    now: 0,
    warmupMs: 0,
    emit: (event) => events.push(event),
  });
  const alpha = room.join(identity('alpha'), 'Alpha', socket(), 0).seat;
  const bravo = room.join(identity('bravo'), 'Bravo', socket(), 0).seat;
  room.step(1);
  Object.assign(alpha, {
    x: -23.5, y: 21, z: -23.5, yaw: -Math.PI / 2, pitch: -0.05,
  });
  Object.assign(bravo, {
    x: 8.5, y: 20, z: -23.5, yaw: Math.PI / 2, pitch: 0,
  });
  alpha.history.push(2, alpha);
  bravo.history.push(2, bravo);

  const queued = [];
  const frameMs = 1_000 / 60;
  let fireNonce = 0;
  for (let tick = 1; tick <= 220; tick += 1) {
    const now = tick * frameMs;
    if (tick <= 180 && tick % 20 !== 0) {
      const firing = tick >= 31 && tick <= 36;
      if (tick === 31) fireNonce += 1;
      const jitter = ((tick * 37) % 121) - 60;
      queued.push({
        at: now + 150 + jitter,
        input: {
          seq: tick & 0xffff,
          buttons: (tick < 120 ? BUTTON.FORWARD : 0) | (firing ? BUTTON.FIRE : 0),
          yaw: -Math.PI / 2,
          pitch: -0.05,
          fireNonce,
          viewTick: Math.max(0, room.tickNumber - 9),
        },
      });
    }
    queued.sort((a, b) => a.at - b.at);
    while (queued[0]?.at <= now) room.setInput(alpha, queued.shift().input, now);
    room.step(now);
  }

  assert.ok(Number.isFinite(alpha.x) && Number.isFinite(alpha.y) && Number.isFinite(alpha.z));
  assert.ok(alpha.x > -21);
  assert.ok(alpha.x < 0);
  assert.ok(events.some((event) => event.t === 'shot' && event.shooter === alpha.networkId));
  assert.ok(alpha.ammo < 30);
  assert.equal(room.map.setBlock(0, 2, 0, 0), false);
});
