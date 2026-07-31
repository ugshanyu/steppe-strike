import * as THREE from 'three';
import { EYE_HEIGHT, PLAYER_FLAG } from '../shared/constants.js';
import { CHUNK_SIZE, chunkKey, floorDiv, localCoord } from '../shared/terrain.js';
import { createChunkGroup, disposeChunk } from './chunk-mesh.js';
import { PlayerAvatar } from './player-avatar.js';

function createRifle(camera) {
  const group = new THREE.Group();
  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xd2a77d }),
  );
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.14, 0.75),
    new THREE.MeshLambertMaterial({ color: 0x252b28 }),
  );
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.19, 0.28),
    new THREE.MeshLambertMaterial({ color: 0x67482d }),
  );
  const magazine = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.26, 0.17),
    new THREE.MeshLambertMaterial({ color: 0x343a36 }),
  );
  hand.position.set(0.1, -0.12, 0.1);
  stock.position.z = 0.4;
  magazine.position.set(0, -0.16, -0.04);
  group.add(hand, body, stock, magazine);
  group.position.set(0.48, -0.39, -0.82);
  group.rotation.set(-0.12, -0.18, 0.05);
  camera.add(group);
  return group;
}

export class WorldView {
  constructor(canvas) {
    this.canvas = canvas;
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      || innerWidth <= 760;
    this.viewRadius = this.touch ? 3 : 4;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec6d0);
    this.scene.fog = new THREE.Fog(0x8ec6d0, 60, (this.viewRadius + 1) * CHUNK_SIZE);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.06, 190);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.touch,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.touch ? 1.25 : 1.7));
    this.materials = {
      solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
      water: new THREE.MeshLambertMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    };
    this.world = null;
    this.chunks = new Map();
    this.chunkQueue = [];
    this.queued = new Set();
    this.players = new Map();
    this.localId = 0;
    this.recoil = 0;
    this.rifle = createRifle(this.camera);
    this.addLights();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xe8f6f4, 0x405234, 2.35));
    const sun = new THREE.DirectionalLight(0xffedbf, 2.1);
    sun.position.set(-35, 58, 24);
    this.scene.add(sun);
  }

  resize() {
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const portrait = this.camera.aspect < 0.7;
    this.rifleBaseZ = portrait ? -0.7 : -0.82;
    this.rifle.position.set(portrait ? 0.25 : 0.48, portrait ? -0.34 : -0.39, this.rifleBaseZ);
    this.rifle.scale.setScalar(portrait ? 0.78 : 1);
  }

  setWorld(world) {
    for (const group of this.chunks.values()) {
      this.scene.remove(group);
      disposeChunk(group);
    }
    this.chunks.clear();
    this.chunkQueue.length = 0;
    this.queued.clear();
    this.world = world;
  }

  queueChunk(cx, cz, urgent = false) {
    const key = chunkKey(cx, cz);
    if (this.queued.has(key)) return;
    this.queued.add(key);
    const entry = { cx, cz, key };
    if (urgent) this.chunkQueue.unshift(entry);
    else this.chunkQueue.push(entry);
  }

  rebuildChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const current = this.chunks.get(key);
    if (current) {
      this.scene.remove(current);
      disposeChunk(current);
      this.chunks.delete(key);
    }
    this.queueChunk(cx, cz, true);
  }

  markBlockDirty(x, z) {
    const cx = floorDiv(x);
    const cz = floorDiv(z);
    this.rebuildChunk(cx, cz);
    if (localCoord(x) === 0) this.rebuildChunk(cx - 1, cz);
    if (localCoord(x) === CHUNK_SIZE - 1) this.rebuildChunk(cx + 1, cz);
    if (localCoord(z) === 0) this.rebuildChunk(cx, cz - 1);
    if (localCoord(z) === CHUNK_SIZE - 1) this.rebuildChunk(cx, cz + 1);
  }

  updateChunks(local) {
    if (!this.world || !local) return;
    const cx = floorDiv(Math.floor(local.x));
    const cz = floorDiv(Math.floor(local.z));
    const desired = new Set();
    const candidates = [];
    for (let dz = -this.viewRadius; dz <= this.viewRadius; dz++) {
      for (let dx = -this.viewRadius; dx <= this.viewRadius; dx++) {
        candidates.push({ cx: cx + dx, cz: cz + dz, distance: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const entry of candidates) {
      const key = chunkKey(entry.cx, entry.cz);
      desired.add(key);
      if (!this.chunks.has(key)) this.queueChunk(entry.cx, entry.cz);
    }
    for (const [key, group] of this.chunks) {
      if (desired.has(key)) continue;
      this.scene.remove(group);
      disposeChunk(group);
      this.chunks.delete(key);
    }
    this.chunkQueue = this.chunkQueue.filter((entry) => {
      if (desired.has(entry.key)) return true;
      this.queued.delete(entry.key);
      return false;
    });
  }

  buildQueued() {
    const count = this.touch ? 1 : 2;
    for (let built = 0; built < count && this.chunkQueue.length; built++) {
      const { cx, cz, key } = this.chunkQueue.shift();
      this.queued.delete(key);
      if (this.chunks.has(key) || !this.world) continue;
      const group = createChunkGroup(this.world, cx, cz, this.materials);
      this.chunks.set(key, group);
      this.scene.add(group);
    }
  }

  syncPlayers(states, names, localId, spectatedId = null) {
    this.localId = localId;
    const seen = new Set();
    for (const state of states) {
      if (state.id === localId || state.id === spectatedId) continue;
      seen.add(state.id);
      let avatar = this.players.get(state.id);
      if (!avatar) {
        avatar = new PlayerAvatar(names.get(state.id)?.name || `Player ${state.id}`);
        this.players.set(state.id, avatar);
        this.scene.add(avatar.group);
      }
      avatar.target = state;
    }
    for (const [id, avatar] of this.players) {
      if (seen.has(id)) continue;
      this.scene.remove(avatar.group);
      avatar.dispose();
      this.players.delete(id);
    }
  }

  fire(playerId) {
    if (playerId === this.localId) this.recoil = 1;
    else this.players.get(playerId)?.fire();
  }

  render(local, dt, spectator = null) {
    const alpha = 1 - Math.exp(-dt * 13);
    for (const avatar of this.players.values()) {
      if (avatar.target) avatar.update(avatar.target, alpha);
    }
    const cameraState = spectator || local;
    if (cameraState) {
      this.camera.position.set(cameraState.x, cameraState.y + EYE_HEIGHT, cameraState.z);
      this.camera.rotation.set(cameraState.pitch, cameraState.yaw, 0);
      this.updateChunks(cameraState);
      const speed = Math.hypot(cameraState.vx, cameraState.vz);
      this.camera.position.y += Math.sin(performance.now() * 0.012) * Math.min(0.025, speed * 0.004);
      this.rifle.visible = !spectator && Boolean(local?.flags & PLAYER_FLAG.ALIVE);
      this.rifle.position.z = this.rifleBaseZ + this.recoil * 0.11;
      this.rifle.rotation.x = -0.12 + this.recoil * 0.08;
      this.recoil *= 0.7;
    }
    this.buildQueued();
    this.renderer.render(this.scene, this.camera);
  }
}
