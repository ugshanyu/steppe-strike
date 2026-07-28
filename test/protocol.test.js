import test from 'node:test';
import assert from 'node:assert/strict';
import { BUTTON, MSG } from '../shared/constants.js';
import {
  decodeInput, decodeSnapshot, encodeInput, encodeSnapshot, INPUT_BYTES, PLAYER_BYTES,
} from '../shared/protocol.js';

test('input packets preserve build controls and hotbar slot', () => {
  const buffer = encodeInput(65538, BUTTON.FORWARD | BUTTON.MINE, Math.PI * 5, 9, 5);
  assert.equal(buffer.byteLength, INPUT_BYTES);
  const view = new DataView(buffer);
  assert.equal(view.getUint8(0), MSG.INPUT);
  const decoded = decodeInput(view);
  assert.equal(decoded.seq, 2);
  assert.equal(decoded.buttons, BUTTON.FORWARD | BUTTON.MINE);
  assert.equal(decoded.slot, 5);
  assert.ok(decoded.yaw >= -Math.PI && decoded.yaw <= Math.PI);
  assert.ok(decoded.pitch <= 1.45);
});

test('snapshots support distant voxel positions and mining state', () => {
  const player = {
    id: 42, x: -4096.34, y: 31.2, z: 6144.67, vx: 2.5, vy: -1, vz: 0.3,
    yaw: -1.2, pitch: 0.32, slot: 4, mining: true, mineProgress: 0.65,
  };
  const buffer = encodeSnapshot(123456, 88, [player]);
  assert.equal(buffer.byteLength, 9 + PLAYER_BYTES);
  const decoded = decodeSnapshot(new DataView(buffer));
  assert.equal(decoded.tick, 123456);
  assert.equal(decoded.ack, 88);
  assert.equal(decoded.players[0].id, player.id);
  assert.equal(decoded.players[0].slot, 4);
  assert.equal(decoded.players[0].mining, true);
  assert.ok(Math.abs(decoded.players[0].mineProgress - 0.65) < 0.01);
  assert.ok(Math.abs(decoded.players[0].x - player.x) < 0.02);
});

test('malformed snapshot length is rejected', () => {
  const valid = encodeSnapshot(1, 0, []);
  const bytes = new Uint8Array(valid.byteLength + 1);
  bytes.set(new Uint8Array(valid));
  assert.equal(decodeSnapshot(new DataView(bytes.buffer)), null);
});
