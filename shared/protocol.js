import { MSG } from './constants.js';

const ANGLE_SCALE = 10430;
const POS_SCALE = 100;
const VEL_SCALE = 100;
export const INPUT_BYTES = 10;
export const PLAYER_BYTES = 28;

const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
const wrapAngle = (value) => {
  let angle = Number.isFinite(value) ? value : 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

export function encodeInput(seq, buttons, yaw, pitch, slot = 0) {
  const buffer = new ArrayBuffer(INPUT_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.INPUT);
  view.setUint16(1, seq & 0xffff, true);
  view.setUint8(3, buttons & 0x7f);
  view.setInt16(4, Math.round(wrapAngle(yaw) * ANGLE_SCALE), true);
  view.setInt16(6, Math.round(clamp(pitch, -1.45, 1.45) * ANGLE_SCALE), true);
  view.setUint8(8, clamp(Math.floor(slot), 0, 5));
  view.setUint8(9, 0);
  return buffer;
}

export function decodeInput(view) {
  if (view.byteLength !== INPUT_BYTES || view.getUint8(0) !== MSG.INPUT) return null;
  return {
    seq: view.getUint16(1, true),
    buttons: view.getUint8(3) & 0x7f,
    yaw: wrapAngle(view.getInt16(4, true) / ANGLE_SCALE),
    pitch: clamp(view.getInt16(6, true) / ANGLE_SCALE, -1.45, 1.45),
    slot: clamp(view.getUint8(8), 0, 5),
  };
}

export function encodePing(time) {
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.PING);
  view.setFloat64(1, time, true);
  return buffer;
}

export function encodePong(time) {
  const buffer = new ArrayBuffer(9);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.PONG);
  view.setFloat64(1, time, true);
  return buffer;
}

export function encodeSnapshot(tick, ack, players) {
  const buffer = new ArrayBuffer(9 + players.length * PLAYER_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.SNAPSHOT);
  view.setUint32(1, tick >>> 0, true);
  view.setUint16(5, ack & 0xffff, true);
  view.setUint16(7, players.length, true);
  let offset = 9;
  for (const player of players) {
    view.setUint16(offset, player.id, true);
    view.setInt32(offset + 2, Math.round(player.x * POS_SCALE), true);
    view.setInt32(offset + 6, Math.round(player.y * POS_SCALE), true);
    view.setInt32(offset + 10, Math.round(player.z * POS_SCALE), true);
    view.setInt16(offset + 14, clamp(Math.round(player.vx * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 16, clamp(Math.round(player.vy * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 18, clamp(Math.round(player.vz * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 20, Math.round(wrapAngle(player.yaw) * ANGLE_SCALE), true);
    view.setInt16(offset + 22, Math.round(clamp(player.pitch, -1.45, 1.45) * ANGLE_SCALE), true);
    view.setUint8(offset + 24, clamp(player.slot || 0, 0, 5));
    view.setUint8(offset + 25, player.mining ? 1 : 0);
    view.setUint8(offset + 26, clamp(Math.round((player.mineProgress || 0) * 255), 0, 255));
    view.setUint8(offset + 27, 0);
    offset += PLAYER_BYTES;
  }
  return buffer;
}

export function decodeSnapshot(view) {
  if (view.byteLength < 9 || view.getUint8(0) !== MSG.SNAPSHOT) return null;
  const count = view.getUint16(7, true);
  if (view.byteLength !== 9 + count * PLAYER_BYTES) return null;
  const players = [];
  for (let index = 0, offset = 9; index < count; index++, offset += PLAYER_BYTES) {
    players.push({
      id: view.getUint16(offset, true),
      x: view.getInt32(offset + 2, true) / POS_SCALE,
      y: view.getInt32(offset + 6, true) / POS_SCALE,
      z: view.getInt32(offset + 10, true) / POS_SCALE,
      vx: view.getInt16(offset + 14, true) / VEL_SCALE,
      vy: view.getInt16(offset + 16, true) / VEL_SCALE,
      vz: view.getInt16(offset + 18, true) / VEL_SCALE,
      yaw: wrapAngle(view.getInt16(offset + 20, true) / ANGLE_SCALE),
      pitch: view.getInt16(offset + 22, true) / ANGLE_SCALE,
      slot: view.getUint8(offset + 24),
      mining: Boolean(view.getUint8(offset + 25) & 1),
      mineProgress: view.getUint8(offset + 26) / 255,
    });
  }
  return {
    tick: view.getUint32(1, true),
    ack: view.getUint16(5, true),
    players,
  };
}
