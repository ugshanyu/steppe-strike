import { DT } from '../shared/constants.js';
import { stepMovement } from '../shared/physics.js';
import { VoxelWorld } from '../shared/voxel-world.js';
import { InputController } from './input.js';
import { RealtimeClient } from './network.js';
import { GameUI } from './ui.js';
import { WorldView } from './world-view.js';

const sequenceAcked = (sequence, ack) => ((ack - sequence + 65536) % 65536) < 32768;

export class SteppeWorld {
  constructor(canvas, { getAuthToken = () => '' } = {}) {
    this.ui = new GameUI();
    this.view = new WorldView(canvas);
    this.input = new InputController(canvas, (slot) => this.selectSlot(slot));
    this.ui.bindHotbar((slot) => this.input.selectSlot(slot));
    this.net = new RealtimeClient({
      status: (status) => this.ui.setStatus(status),
      event: (event) => this.onEvent(event),
      snapshot: (snapshot) => this.onSnapshot(snapshot),
      latency: (latency) => this.ui.setLatency(latency),
    }, getAuthToken);
    this.world = null;
    this.localId = 0;
    this.local = null;
    this.names = new Map();
    this.pending = [];
    this.sequence = 0;
    this.revision = 0;
    this.capacity = 96;
    this.accumulator = 0;
    this.lastFrame = performance.now();
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

  selectSlot(slot) {
    this.ui.setSlot(slot);
    this.view.setSlot(slot);
  }

  onEvent(message) {
    if (message.t === 'welcome') {
      this.localId = message.id;
      this.capacity = message.maxPlayers;
      this.revision = message.world.revision || 0;
      this.world = new VoxelWorld(message.world.seed);
      this.view.setWorld(this.world);
      this.names.clear();
      for (const player of message.players) this.names.set(player.id, player);
      this.ui.updatePopulation(this.names.size, this.capacity);
      this.ui.announce(message.reconnected ? 'ЕРТӨНЦӨД БУЦАЖ ОРЛОО' : 'ЕРТӨНЦӨД НЭГДЛЭЭ');
      return;
    }
    if (message.t === 'chunks' && this.world) {
      this.revision = Math.max(this.revision, message.revision || 0);
      for (const chunk of message.chunks || []) {
        let changed = false;
        for (const [x, y, z, id] of chunk.edits || []) {
          this.world.setBlock(x, y, z, id);
          changed = true;
        }
        if (changed) this.view.rebuildChunk(chunk.cx, chunk.cz);
      }
      return;
    }
    if (message.t === 'block' && this.world) {
      this.world.setBlock(message.x, message.y, message.z, message.id);
      this.revision = Math.max(this.revision, message.revision || 0);
      this.view.markBlockDirty(message.x, message.z);
      return;
    }
    if (message.t === 'join' || message.t === 'rejoin') {
      this.names.set(message.id, { id: message.id, name: message.name });
      this.ui.updatePopulation(this.names.size, this.capacity);
      if (message.id !== this.localId) this.ui.announce(`${message.name} нэгдлээ`, 1000);
      return;
    }
    if (message.t === 'leave') {
      this.names.delete(message.id);
      this.ui.updatePopulation(this.names.size, this.capacity);
      return;
    }
    if (message.t === 'error') this.ui.announce(message.reason, 4000);
  }

  onSnapshot(snapshot) {
    if (!this.world) return;
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    this.pending = this.pending.filter((entry) => !sequenceAcked(entry.seq, snapshot.ack));
    const predicted = {
      ...authoritative,
      jumpHeld: this.local?.jumpHeld || false,
    };
    for (const entry of this.pending) {
      predicted.yaw = entry.yaw;
      predicted.pitch = entry.pitch;
      stepMovement(this.world, predicted, entry, DT);
    }
    const firstState = !this.local;
    this.local = predicted;
    if (firstState) this.input.setLook(authoritative.yaw, authoritative.pitch);
    this.view.syncPlayers(snapshot.players, this.names, this.localId);
  }

  simulationStep() {
    if (!this.local || !this.localId || !this.world) return;
    const input = this.input.read();
    this.sequence = (this.sequence + 1) & 0xffff;
    const entry = { seq: this.sequence, ...input };
    this.pending.push(entry);
    if (this.pending.length > 120) this.pending.shift();
    this.net.sendInput(this.sequence, input);
    this.local.yaw = input.yaw;
    this.local.pitch = input.pitch;
    this.local.slot = input.slot;
    stepMovement(this.world, this.local, input, DT);
  }

  frame(time) {
    const elapsed = Math.min(0.1, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    this.accumulator += elapsed;
    while (this.accumulator >= DT) {
      this.simulationStep();
      this.accumulator -= DT;
    }
    const target = this.view.render(this.local, elapsed);
    this.ui.setTarget(target, this.local?.mineProgress || 0);
    requestAnimationFrame((next) => this.frame(next));
  }
}
