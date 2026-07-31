import { MSG } from './constants.js';

const ANGLE_SCALE = 10430;
const POS_SCALE = 100;
const VEL_SCALE = 100;
export const INPUT_BYTES = 14;
export const PLAYER_BYTES = 32;

const clamp = (number, min, max) => Math.max(min, Math.min(max, number));
const wrapAngle = (value) => {
  let angle = Number.isFinite(value) ? value : 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};

export function encodeInput(seq, buttons, yaw, pitch, fireNonce = 0, viewTick = 0) {
  const buffer = new ArrayBuffer(INPUT_BYTES);
  const view = new DataView(buffer);
  view.setUint8(0, MSG.INPUT);
  view.setUint16(1, seq & 0xffff, true);
  view.setUint8(3, buttons & 0x7f);
  view.setInt16(4, Math.round(wrapAngle(yaw) * ANGLE_SCALE), true);
  view.setInt16(6, Math.round(clamp(pitch, -1.45, 1.45) * ANGLE_SCALE), true);
  view.setUint16(8, fireNonce & 0xffff, true);
  view.setUint32(10, viewTick >>> 0, true);
  return buffer;
}

export function decodeInput(view) {
  if (view.byteLength !== INPUT_BYTES || view.getUint8(0) !== MSG.INPUT) return null;
  return {
    seq: view.getUint16(1, true),
    buttons: view.getUint8(3) & 0x7f,
    yaw: wrapAngle(view.getInt16(4, true) / ANGLE_SCALE),
    pitch: clamp(view.getInt16(6, true) / ANGLE_SCALE, -1.45, 1.45),
    fireNonce: view.getUint16(8, true),
    viewTick: view.getUint32(10, true),
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
    view.setUint8(offset + 24, clamp(player.team || 0, 0, 2));
    view.setUint8(offset + 25, clamp(player.health ?? 100, 0, 100));
    view.setUint8(offset + 26, clamp(player.armor || 0, 0, 100));
    view.setUint8(offset + 27, clamp(player.ammo || 0, 0, 255));
    view.setUint8(offset + 28, player.flags || 0);
    view.setUint8(offset + 29, clamp(player.kills || 0, 0, 255));
    view.setUint8(offset + 30, clamp(player.deaths || 0, 0, 255));
    view.setUint8(offset + 31, clamp(player.reserveAmmo || 0, 0, 255));
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
      team: view.getUint8(offset + 24),
      health: view.getUint8(offset + 25),
      armor: view.getUint8(offset + 26),
      ammo: view.getUint8(offset + 27),
      flags: view.getUint8(offset + 28),
      kills: view.getUint8(offset + 29),
      deaths: view.getUint8(offset + 30),
      reserveAmmo: view.getUint8(offset + 31),
    });
  }
  return {
    tick: view.getUint32(1, true),
    ack: view.getUint16(5, true),
    players,
  };
}
