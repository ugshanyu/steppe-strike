import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON, MSG } from '../shared/constants.js';
import {
  decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, INPUT_BYTES, PLAYER_BYTES,
} from '../shared/protocol.js';

test('input packets are compact and clamp unsafe values', () => {
  const buffer = encodeInput(65538, BUTTON.FORWARD | BUTTON.FIRE, Math.PI * 5, 9);
  assert.equal(buffer.byteLength, INPUT_BYTES);
  const view = new DataView(buffer);
  assert.equal(view.getUint8(0), MSG.INPUT);
  const decoded = decodeInput(view);
  assert.equal(decoded.seq, 2);
  assert.equal(decoded.buttons, BUTTON.FORWARD | BUTTON.FIRE);
  assert.ok(decoded.yaw >= -Math.PI && decoded.yaw <= Math.PI);
  assert.ok(decoded.pitch <= 1.45);
});

test('snapshots preserve authoritative player state', () => {
  const player = {
    id: 42, x: -12.34, y: 1.2, z: 45.67, vx: 2.5, vy: -1, vz: 0.3,
    yaw: -1.2, pitch: .32, hp: 67, alive: true, reloadUntil: 123,
    team: 2, ammo: 7, kills: 19,
  };
  const buffer = encodeSnapshot(123456, 88, [player]);
  assert.equal(buffer.byteLength, 9 + PLAYER_BYTES);
  const decoded = decodeSnapshot(new DataView(buffer));
  assert.equal(decoded.tick, 123456);
  assert.equal(decoded.ack, 88);
  assert.equal(decoded.players[0].id, player.id);
  assert.equal(decoded.players[0].team, player.team);
  assert.equal(decoded.players[0].ammo, player.ammo);
  assert.equal(decoded.players[0].kills, player.kills);
  assert.equal(decoded.players[0].reloading, true);
  assert.ok(Math.abs(decoded.players[0].x - player.x) < .02);
});

test('malformed snapshot length is rejected', () => {
  const valid = encodeSnapshot(1, 0, []);
  const bytes = new Uint8Array(valid.byteLength + 1);
  bytes.set(new Uint8Array(valid));
  assert.equal(decodeSnapshot(new DataView(bytes.buffer)), null);
});
