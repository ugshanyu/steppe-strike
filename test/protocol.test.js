import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON, MSG } from '../shared/constants.js';
import {
  decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, INPUT_BYTES, PLAYER_BYTES,
} from '../shared/protocol.js';

test('input packets preserve combat controls, shot nonce, and viewed server tick', () => {
  const buffer = encodeInput(
    65538,
    BUTTON.FORWARD | BUTTON.FIRE,
    Math.PI * 5,
    9,
    513,
    987_654,
  );
  assert.equal(buffer.byteLength, INPUT_BYTES);
  const view = new DataView(buffer);
  assert.equal(view.getUint8(0), MSG.INPUT);
  const decoded = decodeInput(view);
  assert.equal(decoded.seq, 2);
  assert.equal(decoded.buttons, BUTTON.FORWARD | BUTTON.FIRE);
  assert.equal(decoded.fireNonce, 513);
  assert.equal(decoded.viewTick, 987_654);
  assert.ok(decoded.yaw >= -Math.PI && decoded.yaw <= Math.PI);
  assert.ok(decoded.pitch <= 1.45);
});

test('snapshots support distant positions and authoritative combat state', () => {
  const player = {
    id: 42, x: -4096.34, y: 31.2, z: 6144.67, vx: 2.5, vy: -1, vz: 0.3,
    yaw: -1.2, pitch: 0.32, team: 2, health: 67, armor: 21, ammo: 13,
    flags: 5, kills: 8, deaths: 3, reserveAmmo: 71,
  };
  const buffer = encodeSnapshot(123456, 88, [player]);
  assert.equal(buffer.byteLength, 9 + PLAYER_BYTES);
  const decoded = decodeSnapshot(new DataView(buffer));
  assert.equal(decoded.tick, 123456);
  assert.equal(decoded.ack, 88);
  assert.equal(decoded.players[0].id, player.id);
  assert.equal(decoded.players[0].team, 2);
  assert.equal(decoded.players[0].health, 67);
  assert.equal(decoded.players[0].armor, 21);
  assert.equal(decoded.players[0].ammo, 13);
  assert.equal(decoded.players[0].flags, 5);
  assert.equal(decoded.players[0].kills, 8);
  assert.equal(decoded.players[0].deaths, 3);
  assert.equal(decoded.players[0].reserveAmmo, 71);
  assert.ok(Math.abs(decoded.players[0].x - player.x) < 0.02);
});

test('malformed snapshot length is rejected', () => {
  const valid = encodeSnapshot(1, 0, []);
  const bytes = new Uint8Array(valid.byteLength + 1);
  bytes.set(new Uint8Array(valid));
  assert.equal(decodeSnapshot(new DataView(bytes.buffer)), null);
});
