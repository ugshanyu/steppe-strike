import { CombatMap } from '../shared/combat-map.js';
import { DT, PLAYER_FLAG } from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { InputController } from './input.js';
import { RealtimeClient } from './network.js';
import { GameUI } from './ui.js';
import { WorldView } from './world-view.js';

const sequenceAcked = (sequence, ack) => ((ack - sequence + 65_536) % 65_536) < 32_768;
const angleLerp = (a, b, amount) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * amount;
const mixPlayer = (a, b, amount) => ({
  ...b,
  x: a.x + (b.x - a.x) * amount,
  y: a.y + (b.y - a.y) * amount,
  z: a.z + (b.z - a.z) * amount,
  yaw: angleLerp(a.yaw, b.yaw, amount),
  pitch: a.pitch + (b.pitch - a.pitch) * amount,
});

export class SteppeStrike {
  constructor(canvas, { resolveUrl }) {
    this.ui = new GameUI();
    this.view = new WorldView(canvas);
    this.input = new InputController(canvas);
    this.net = new RealtimeClient(resolveUrl, {
      status: (status) => this.ui.setStatus(status),
      event: (event) => this.onEvent(event),
      snapshot: (snapshot) => this.onSnapshot(snapshot),
      latency: (latency) => this.ui.setLatency(latency),
    });
    this.world = null;
    this.localId = 0;
    this.local = null;
    this.names = new Map();
    this.pending = [];
    this.remoteFrames = [];
    this.sequence = 0;
    this.serverTick = 0;
    this.capacity = 10;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.lastFireNonce = 0;
    this.started = false;
    requestAnimationFrame((time) => this.frame(time));
  }

  start(name) {
    if (this.started) return;
    this.started = true;
    this.ui.enterGame(this.input.touch);
    this.input.capture();
    this.net.connect(name);
  }

  onEvent(message) {
    if (message.t === 'welcome') {
      this.localId = message.id;
      this.capacity = message.maxPlayers;
      this.world = new CombatMap();
      this.view.setWorld(this.world);
      this.names.clear();
      for (const player of message.players) this.names.set(player.id, player);
      this.ui.updatePopulation(this.names.size, this.capacity);
      this.ui.setMatch(message.match);
      this.ui.announce(message.reconnected ? 'ТОГЛОЛТОД БУЦАЖ ОРЛОО' : 'ТУЛААНД НЭГДЛЭЭ');
      return;
    }
    if (message.t === 'join' || message.t === 'rejoin') {
      this.names.set(message.id, message);
      this.ui.updatePopulation(this.names.size, this.capacity);
      if (message.id !== this.localId) this.ui.announce(`${message.name} нэгдлээ`, 1_000);
      return;
    }
    if (message.t === 'leave') {
      this.names.delete(message.id);
      this.ui.updatePopulation(this.names.size, this.capacity);
      return;
    }
    if (message.t === 'match') {
      this.ui.setMatch(message);
      if (message.phase === 'live') this.ui.announce(`ҮЕ ${message.round} · ЭХЭЛЛЭЭ`);
      if (message.phase === 'round_end') this.ui.announce('ҮЕ ДУУСЛАА', 2_400);
      if (message.phase === 'match_end') this.ui.announce('ТОГЛОЛТ ДУУСЛАА', 5_000);
      return;
    }
    if (message.t === 'shot') {
      this.view.fire(message.shooter);
      if (message.shooter === this.localId) this.ui.shotFeedback(message.hit && !message.friendly);
      if (message.target === this.localId && message.damage) this.ui.damageFeedback();
      return;
    }
    if (message.t === 'kill') {
      const killer = this.names.get(message.killer)?.name || 'Player';
      const victim = this.names.get(message.victim)?.name || 'Player';
      this.ui.addKill(killer, victim, message.headshot);
      if (message.victim === this.localId) this.ui.announce('ТА УНАЛАА · ДАРААГИЙН ҮЕИЙГ ХҮЛЭЭНЭ ҮҮ', 3_000);
      return;
    }
    if (message.t === 'error') this.ui.announce(message.reason, 4_000);
  }

  onSnapshot(snapshot) {
    if (!this.world) return;
    this.serverTick = snapshot.tick;
    this.remoteFrames.push(snapshot);
    if (this.remoteFrames.length > 12) this.remoteFrames.shift();
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    this.pending = this.pending.filter((entry) => !sequenceAcked(entry.seq, snapshot.ack));
    const predicted = { ...authoritative, jumpHeld: this.local?.jumpHeld || false };
    if (authoritative.flags & PLAYER_FLAG.ALIVE) {
      for (const entry of this.pending) {
        predicted.yaw = entry.yaw;
        predicted.pitch = entry.pitch;
        stepMovement(this.world, predicted, entry, DT);
      }
    }
    const firstState = !this.local;
    this.local = predicted;
    if (firstState) this.input.setLook(authoritative.yaw, authoritative.pitch);
    this.ui.setVitals(authoritative);
  }

  simulationStep() {
    if (!this.local || !this.localId || !this.world) return;
    const input = this.input.read();
    this.sequence = (this.sequence + 1) & 0xffff;
    const entry = { seq: this.sequence, ...input };
    this.pending.push(entry);
    if (this.pending.length > 180) this.pending.shift();
    this.net.sendInput(this.sequence, input, this.serverTick);
    if (input.fireNonce !== this.lastFireNonce) {
      this.lastFireNonce = input.fireNonce;
      this.view.fire(this.localId);
    }
    if (!(this.local.flags & PLAYER_FLAG.ALIVE)) return;
    this.local.yaw = input.yaw;
    this.local.pitch = input.pitch;
    stepMovement(this.world, this.local, input, DT);
  }

  interpolatedPlayers() {
    const after = this.remoteFrames.at(-1);
    if (!after) return [];
    const targetTick = after.tick - 6;
    let before = this.remoteFrames[0];
    let next = after;
    for (let index = 1; index < this.remoteFrames.length; index += 1) {
      if (this.remoteFrames[index].tick >= targetTick) {
        before = this.remoteFrames[index - 1];
        next = this.remoteFrames[index];
        break;
      }
    }
    const span = Math.max(1, next.tick - before.tick);
    const amount = Math.max(0, Math.min(1, (targetTick - before.tick) / span));
    const previous = new Map(before.players.map((player) => [player.id, player]));
    return next.players.map((player) => {
      const old = previous.get(player.id);
      return old ? mixPlayer(old, player, amount) : player;
    });
  }

  spectatorTarget(players) {
    if (!this.local || (this.local.flags & PLAYER_FLAG.ALIVE)) return null;
    return players.find((player) => (
      player.id !== this.localId
      && player.team === this.local.team
      && (player.flags & PLAYER_FLAG.ALIVE)
    )) || players.find((player) => (
      player.id !== this.localId && (player.flags & PLAYER_FLAG.ALIVE)
    )) || null;
  }

  frame(time) {
    const elapsed = Math.min(0.1, (time - this.lastFrame) / 1_000);
    this.lastFrame = time;
    this.accumulator += elapsed;
    while (this.accumulator >= DT) {
      this.simulationStep();
      this.accumulator -= DT;
    }
    const players = this.interpolatedPlayers();
    const spectator = this.spectatorTarget(players);
    this.view.syncPlayers(players, this.names, this.localId, spectator?.id);
    this.view.render(this.local, elapsed, spectator);
    this.ui.setSpectating(spectator ? this.names.get(spectator.id)?.name : '');
    requestAnimationFrame((next) => this.frame(next));
  }
}
