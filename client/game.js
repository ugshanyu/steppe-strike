import { DT } from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { GameAudio } from './audio.js';
import { InputController } from './input.js';
import { RealtimeClient } from './network.js';
import { GameUI } from './ui.js';
import { WorldView } from './world-view.js';

const sequenceAcked = (sequence, ack) => ((ack - sequence + 65536) % 65536) < 32768;

export class SteppeStrike {
  constructor(canvas, { getAuthToken = () => '' } = {}) {
    this.ui = new GameUI();
    this.audio = new GameAudio();
    this.view = new WorldView(canvas);
    this.input = new InputController(canvas, (show) => this.ui.showScoreboard(show));
    this.net = new RealtimeClient({
      status: (status) => this.ui.setStatus(status),
      event: (event) => this.onEvent(event),
      snapshot: (snapshot) => this.onSnapshot(snapshot),
      latency: (latency) => this.ui.setLatency(latency),
    }, getAuthToken);
    this.localId = 0;
    this.local = null;
    this.names = new Map();
    this.pending = [];
    this.sequence = 0;
    this.accumulator = 0;
    this.lastFrame = performance.now();
    this.deadUntil = 0;
    this.capacity = 96;
    this.started = false;
    requestAnimationFrame((time) => this.frame(time));
  }

  start(name) {
    if (this.started) return;
    this.started = true;
    this.audio.unlock();
    this.ui.enterGame(this.input.touch);
    this.input.capture();
    this.net.connect(name);
  }

  onEvent(message) {
    if (message.t === 'welcome') {
      this.localId = message.id;
      this.capacity = message.maxPlayers;
      this.names.clear();
      for (const player of message.players) this.names.set(player.id, player);
      this.ui.setInitialRoster(message.players);
      this.ui.setScores(message.scores);
      this.ui.updatePopulation(message.players.length, this.capacity);
      this.ui.announce(message.reconnected ? 'ТУЛААНД ДАХИН ОРЛОО' : 'ТУЛААНД НЭГДЛЭЭ');
      return;
    }
    if (message.t === 'join' || message.t === 'rejoin') {
      const player = { id: message.id, name: message.name, team: message.team };
      this.names.set(message.id, { ...this.names.get(message.id), ...player });
      this.ui.addPlayer(player);
      this.ui.updatePopulation(this.names.size, this.capacity);
      if (message.id !== this.localId) {
        this.ui.announce(`${message.name} ${message.t === 'join' ? 'нэгдлээ' : 'буцаж ирлээ'}`, 1200);
      }
      return;
    }
    if (message.t === 'leave') {
      this.names.delete(message.id);
      this.ui.removePlayer(message.id);
      this.ui.updatePopulation(this.names.size, this.capacity);
      return;
    }
    if (message.t === 'shot') {
      const shooter = this.names.get(message.shooter);
      this.view.trace(message.from, message.to, shooter?.team || 0);
      if (message.shooter === this.localId) {
        this.view.kick();
        this.audio.shot();
        if (message.victim) {
          this.ui.hitmarker(message.headshot);
          this.audio.hit(message.headshot);
        }
      }
      return;
    }
    if (message.t === 'kill') {
      this.ui.addKill(message.killer, message.victim, message.headshot);
      this.ui.setScores(message.scores);
      if (message.victim === this.localId) {
        this.deadUntil = performance.now() + 3000;
        this.audio.death();
      }
      return;
    }
    if (message.t === 'spawn' && message.id === this.localId) {
      this.deadUntil = 0;
      this.ui.setDead(false);
      this.ui.announce('ТУЛААНД БУЦАЖ ОРЛОО', 1000);
      return;
    }
    if (message.t === 'gameover') {
      this.ui.announce(message.winner === 1 ? 'ХӨХ БАГ ЯЛЛАА' : 'УЛААН БАГ ЯЛЛАА', 7000);
      return;
    }
    if (message.t === 'matchstart') {
      this.ui.setScores(message.scores);
      this.ui.announce('ШИНЭ ТУЛААН ЭХЭЛЛЭЭ');
      return;
    }
    if (message.t === 'error') this.ui.announce(message.reason, 5000);
  }

  onSnapshot(snapshot) {
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    const oldHp = this.local?.hp ?? authoritative.hp;
    const wasAlive = this.local?.alive;
    this.pending = this.pending.filter((entry) => !sequenceAcked(entry.seq, snapshot.ack));
    const predicted = {
      ...authoritative,
      jumpHeld: this.local?.jumpHeld || false,
    };
    if (authoritative.alive) {
      for (const entry of this.pending) {
        predicted.yaw = entry.yaw;
        predicted.pitch = entry.pitch;
        stepMovement(predicted, entry, DT);
      }
    }
    this.local = predicted;
    if (authoritative.hp < oldHp) this.ui.damage();
    if (wasAlive === false && authoritative.alive) {
      this.input.setLook(authoritative.yaw, authoritative.pitch);
      this.deadUntil = 0;
    }
    this.view.syncPlayers(snapshot.players, this.names, this.localId);
    this.ui.syncKills(snapshot.players);
    this.ui.updatePopulation(snapshot.players.length, this.capacity);
    this.ui.updateLocal(authoritative);
  }

  simulationStep() {
    if (!this.local || !this.localId) return;
    const input = this.input.read();
    this.sequence = (this.sequence + 1) & 0xffff;
    const entry = { seq: this.sequence, ...input };
    this.pending.push(entry);
    if (this.pending.length > 120) this.pending.shift();
    this.net.sendInput(this.sequence, input);
    this.local.yaw = input.yaw;
    this.local.pitch = input.pitch;
    if (this.local.alive) stepMovement(this.local, input, DT);
  }

  frame(time) {
    const elapsed = Math.min(.1, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    this.accumulator += elapsed;
    while (this.accumulator >= DT) {
      this.simulationStep();
      this.accumulator -= DT;
    }
    if (this.local && !this.local.alive) {
      this.ui.setDead(true, (this.deadUntil - performance.now()) / 1000);
    } else {
      this.ui.setDead(false);
    }
    this.view.render(this.local, elapsed);
    requestAnimationFrame((next) => this.frame(next));
  }
}
