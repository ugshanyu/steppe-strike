import { MSG } from './constants.js';

const ANGLE_SCALE = 10430;
const POS_SCALE = 100;
const VEL_SCALE = 100;
export const INPUT_BYTES = 9;
export const PLAYER_BYTES = 24;

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrapAngle = (value) => {
  let angle = Number.isFinite(value) ? value : 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

export function encodeInput(seq, buttons, yaw, pitch) {
  const buffer = new ArrayBuffer(INPUT_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.INPUT);
  view.setUint16(1, seq & 0xffff, true);
  view.setUint8(3, buttons & 0x7f);
  view.setInt16(4, Math.round(wrapAngle(yaw) * ANGLE_SCALE), true);
  view.setInt16(6, Math.round(clamp(pitch, -1.45, 1.45) * ANGLE_SCALE), true);
  view.setUint8(8, 0);
  return buffer;
}

export function decodeInput(view) {
  if (view.byteLength !== INPUT_BYTES || view.getUint8(0) !== MSG.INPUT) return null;
  return {
    seq: view.getUint16(1, true),
    buttons: view.getUint8(3) & 0x7f,
    yaw: wrapAngle(view.getInt16(4, true) / ANGLE_SCALE),
    pitch: clamp(view.getInt16(6, true) / ANGLE_SCALE, -1.45, 1.45),
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
  for (const p of players) {
    view.setUint16(offset, p.id, true);
    view.setInt16(offset + 2, clamp(Math.round(p.x * POS_SCALE), -32767, 32767), true);
    view.setInt16(offset + 4, clamp(Math.round(p.y * POS_SCALE), -32767, 32767), true);
    view.setInt16(offset + 6, clamp(Math.round(p.z * POS_SCALE), -32767, 32767), true);
    view.setInt16(offset + 8, clamp(Math.round(p.vx * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 10, clamp(Math.round(p.vy * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 12, clamp(Math.round(p.vz * VEL_SCALE), -32767, 32767), true);
    view.setInt16(offset + 14, Math.round(wrapAngle(p.yaw) * ANGLE_SCALE), true);
    view.setInt16(offset + 16, Math.round(clamp(p.pitch, -1.45, 1.45) * ANGLE_SCALE), true);
    view.setUint8(offset + 18, clamp(Math.ceil(p.hp), 0, 100));
    view.setUint8(offset + 19, (p.alive ? 1 : 0) | (p.reloadUntil ? 2 : 0));
    view.setUint8(offset + 20, p.team);
    view.setUint8(offset + 21, p.ammo);
    view.setUint16(offset + 22, clamp(p.kills, 0, 65535), true);
    offset += PLAYER_BYTES;
  }
  return buffer;
}

export function decodeSnapshot(view) {
  const count = view.getUint16(7, true);
  if (view.byteLength !== 9 + count * PLAYER_BYTES) return null;
  const players = [];
  let offset = 9;
  for (let i = 0; i < count; i++, offset += PLAYER_BYTES) {
    const flags = view.getUint8(offset + 19);
    players.push({
      id: view.getUint16(offset, true),
      x: view.getInt16(offset + 2, true) / POS_SCALE,
      y: view.getInt16(offset + 4, true) / POS_SCALE,
      z: view.getInt16(offset + 6, true) / POS_SCALE,
      vx: view.getInt16(offset + 8, true) / VEL_SCALE,
      vy: view.getInt16(offset + 10, true) / VEL_SCALE,
      vz: view.getInt16(offset + 12, true) / VEL_SCALE,
      yaw: wrapAngle(view.getInt16(offset + 14, true) / ANGLE_SCALE),
      pitch: view.getInt16(offset + 16, true) / ANGLE_SCALE,
      hp: view.getUint8(offset + 18),
      alive: Boolean(flags & 1),
      reloading: Boolean(flags & 2),
      team: view.getUint8(offset + 20),
      ammo: view.getUint8(offset + 21),
      kills: view.getUint16(offset + 22, true),
    });
  }
  return {
    tick: view.getUint32(1, true),
    ack: view.getUint16(5, true),
    players,
  };
}
