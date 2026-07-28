import { randomUUID } from 'node:crypto';
import {
  BUTTON, DT, FIRE_INTERVAL_MS, MAG_SIZE, MAX_HP, MAX_PLAYERS, RELOAD_MS,
  RESPAWN_MS, SPAWN_SHIELD_MS, TEAM_BLUE, TEAM_LIMIT, TEAM_RED,
} from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { SPAWNS, testSpawns } from '../shared/world.js';
import { resolveShot } from './combat.js';

const cleanName = (value) => {
  const name = String(value || '').normalize('NFKC')
    .replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return name || `Нүүдэлчин ${Math.floor(100 + Math.random() * 900)}`;
};
const round = (value) => Math.round(value * 100) / 100;

export class GameWorld {
  constructor({ testMode = false } = {}) {
    this.testMode = testMode;
    this.players = new Map();
    this.nextId = 1;
    this.tickNumber = 0;
    this.teamScores = { [TEAM_BLUE]: 0, [TEAM_RED]: 0 };
    this.matchResetAt = 0;
    this.emit = () => {};
  }

  join({ name, session, ws }) {
    const safeSession = /^[\w-]{8,64}$/.test(session || '') ? session : randomUUID();
    const existing = [...this.players.values()].find((p) => p.session === safeSession);
    if (existing) {
      if (existing.ws && existing.ws !== ws) {
        existing.ws.player = null;
        existing.ws.close(4003, 'reconnected');
      }
      existing.ws = ws;
      existing.connected = true;
      existing.disconnectedAt = 0;
      existing.name = cleanName(name || existing.name);
      return { player: existing, reconnected: true };
    }
    if (this.connectedPlayers().length >= MAX_PLAYERS) return null;
    const team = this.pickTeam();
    const spawn = this.pickSpawn(team);
    const player = {
      id: this.allocateId(), session: safeSession, name: cleanName(name), team, ws,
      x: spawn.x, y: 0, z: spawn.z, vx: 0, vy: 0, vz: 0,
      yaw: spawn.yaw, pitch: 0, hp: MAX_HP, ammo: MAG_SIZE,
      alive: true, kills: 0, deaths: 0, jumpHeld: false,
      input: { seq: 0, buttons: 0, yaw: spawn.yaw, pitch: 0 },
      lastAck: 0, lastShotAt: -Infinity, reloadUntil: 0, respawnAt: 0,
      shieldUntil: Date.now() + SPAWN_SHIELD_MS, connected: true, disconnectedAt: 0,
    };
    this.players.set(player.id, player);
    return { player, reconnected: false };
  }

  allocateId() {
    while (this.players.has(this.nextId)) this.nextId = (this.nextId % 65535) + 1;
    return this.nextId++;
  }

  pickTeam() {
    const blue = this.connectedPlayers().filter((p) => p.team === TEAM_BLUE).length;
    const red = this.connectedPlayers().filter((p) => p.team === TEAM_RED).length;
    return blue <= red ? TEAM_BLUE : TEAM_RED;
  }

  pickSpawn(team) {
    const points = this.testMode ? testSpawns(team) : SPAWNS[team];
    const enemies = this.connectedPlayers().filter((p) => p.team !== team && p.alive);
    let best = points[0];
    let bestDistance = -1;
    for (const spawn of points) {
      const distance = enemies.length
        ? Math.min(...enemies.map((p) => Math.hypot(p.x - spawn.x, p.z - spawn.z)))
        : Math.random();
      if (distance > bestDistance) {
        best = spawn;
        bestDistance = distance;
      }
    }
    return best;
  }

  setInput(player, input) {
    if (!player.connected) return;
    player.input = input;
    player.lastAck = input.seq;
    player.yaw = input.yaw;
    player.pitch = input.pitch;
  }

  disconnect(player) {
    if (!player || this.players.get(player.id) !== player) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    player.input.buttons = 0;
  }

  connectedPlayers() {
    return [...this.players.values()].filter((player) => player.connected);
  }

  step(now = Date.now()) {
    this.tickNumber++;
    if (this.matchResetAt && now >= this.matchResetAt) this.resetMatch(now);
    for (const player of [...this.players.values()]) {
      if (!player.connected && now - player.disconnectedAt > 6000) {
        this.players.delete(player.id);
        this.emit({ t: 'leave', id: player.id });
        continue;
      }
      if (!player.connected) continue;
      if (!player.alive) {
        if (now >= player.respawnAt && !this.matchResetAt) this.respawn(player, now);
        continue;
      }
      if (player.reloadUntil && now >= player.reloadUntil) {
        player.reloadUntil = 0;
        player.ammo = MAG_SIZE;
      }
      player.yaw = player.input.yaw;
      player.pitch = player.input.pitch;
      if (!this.matchResetAt) stepMovement(player, player.input, DT);
      this.handleWeapon(player, now);
    }
  }

  handleWeapon(player, now) {
    const buttons = player.input.buttons;
    if ((buttons & BUTTON.RELOAD) && player.ammo < MAG_SIZE && !player.reloadUntil) {
      player.reloadUntil = now + RELOAD_MS;
    }
    if (!(buttons & BUTTON.FIRE) || this.matchResetAt || player.reloadUntil) return;
    if (player.ammo === 0) {
      player.reloadUntil = now + RELOAD_MS;
      return;
    }
    if (now - player.lastShotAt < FIRE_INTERVAL_MS) return;
    player.lastShotAt = now;
    player.ammo--;
    const shot = resolveShot(player, this.connectedPlayers(), now);
    const hit = shot.victim;
    if (hit) {
      hit.hp = Math.max(0, hit.hp - shot.damage);
      if (hit.hp === 0) this.kill(player, hit, shot.headshot, now);
    }
    this.emit({
      t: 'shot', shooter: player.id, victim: hit?.id || 0, headshot: shot.headshot,
      from: [round(shot.origin.x), round(shot.origin.y), round(shot.origin.z)],
      to: [round(shot.end.x), round(shot.end.y), round(shot.end.z)],
    });
    if (player.ammo === 0) player.reloadUntil = now + RELOAD_MS;
  }

  kill(killer, victim, headshot, now) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths++;
    victim.respawnAt = now + RESPAWN_MS;
    victim.input.buttons = 0;
    killer.kills++;
    this.teamScores[killer.team]++;
    this.emit({
      t: 'kill', killer: killer.id, victim: victim.id, headshot,
      scores: this.teamScores,
    });
    if (this.teamScores[killer.team] >= TEAM_LIMIT) {
      this.matchResetAt = now + 8000;
      this.emit({ t: 'gameover', winner: killer.team, resetAt: this.matchResetAt });
    }
  }

  respawn(player, now) {
    const spawn = this.pickSpawn(player.team);
    Object.assign(player, {
      x: spawn.x, y: 0, z: spawn.z, vx: 0, vy: 0, vz: 0,
      yaw: spawn.yaw, pitch: 0, hp: MAX_HP, ammo: MAG_SIZE,
      alive: true, reloadUntil: 0, respawnAt: 0, jumpHeld: false,
      shieldUntil: now + SPAWN_SHIELD_MS,
    });
    player.input = { seq: player.input.seq, buttons: 0, yaw: spawn.yaw, pitch: 0 };
    this.emit({ t: 'spawn', id: player.id, x: spawn.x, z: spawn.z });
  }

  resetMatch(now) {
    this.teamScores = { [TEAM_BLUE]: 0, [TEAM_RED]: 0 };
    this.matchResetAt = 0;
    for (const player of this.connectedPlayers()) {
      player.kills = 0;
      player.deaths = 0;
      this.respawn(player, now);
    }
    this.emit({ t: 'matchstart', scores: this.teamScores });
  }

  roster() {
    return this.connectedPlayers().map(({ id, name, team, kills, deaths }) =>
      ({ id, name, team, kills, deaths }));
  }
}
