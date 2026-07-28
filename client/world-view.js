import * as THREE from 'three';
import { EYE_HEIGHT, WORLD_HALF } from '../shared/constants.js';
import { OBSTACLES } from '../shared/world.js';
import { PlayerAvatar } from './player-avatar.js';

const palette = {
  stone: 0x657066,
  wood: 0x8f653d,
  sand: 0xb99a57,
  blue: 0x256da2,
  red: 0xa83c2e,
};

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#6f7f48';
  context.fillRect(0, 0, 512, 512);
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < 32; x++) {
      const noise = ((x * 17 + z * 31 + x * z * 7) % 19) / 19;
      context.fillStyle = noise > .65 ? '#76884d' : noise < .2 ? '#687743' : '#718149';
      context.fillRect(x * 16, z * 16, 16, 16);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function addBox(scene, obstacle) {
  const geometry = new THREE.BoxGeometry(obstacle.w, obstacle.h, obstacle.d);
  const material = new THREE.MeshStandardMaterial({
    color: palette[obstacle.material] || palette.stone,
    roughness: .88,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(obstacle.x, obstacle.h / 2, obstacle.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 20),
    new THREE.LineBasicMaterial({ color: 0x182019, transparent: true, opacity: .33 }),
  );
  edge.position.copy(mesh.position);
  scene.add(edge);
}

function buildWorld(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  OBSTACLES.forEach((obstacle) => addBox(scene, obstacle));

  const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x586957, roughness: 1 });
  for (let i = 0; i < 44; i++) {
    const side = i % 4;
    const along = -48 + (i * 13 % 96);
    const distance = WORLD_HALF + 7 + (i * 7 % 10);
    const height = 3 + (i * 11 % 8);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(5 + i % 5, height, 5 + (i * 3) % 6), mountainMaterial);
    mesh.position.set(side < 2 ? along : (side === 2 ? -distance : distance), height / 2 - .1,
      side < 2 ? (side === 0 ? -distance : distance) : along);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  for (const [x, color] of [[-45, 0x43a8ff], [45, 0xff553e]]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(.12, 5, .12),
      new THREE.MeshStandardMaterial({ color: 0xd9dfd4, metalness: .5 }));
    pole.position.set(x, 2.5, 0);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.4, 2.2),
      new THREE.MeshStandardMaterial({ color }));
    flag.position.set(x, 4.1, -1);
    scene.add(pole, flag);
  }
}

function createWeapon(camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x252a25, roughness: .38, metalness: .5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5631, roughness: .8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(.14, .16, .76), dark);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.17, .2, .28), wood);
  stock.position.set(0, -.03, .43);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(.13, .28, .15), dark);
  magazine.position.set(0, -.18, .08);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .32),
    new THREE.MeshStandardMaterial({ color: 0xd2a77d }));
  hand.position.set(.13, -.13, .22);
  group.add(body, stock, magazine, hand);
  group.position.set(.42, -.34, -.72);
  group.rotation.set(-.06, -.05, 0);
  camera.add(group);
  return group;
}

export class WorldView {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x92bec8);
    this.scene.fog = new THREE.Fog(0x92bec8, 60, 125);
    this.camera = new THREE.PerspectiveCamera(74, 1, .06, 180);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(24, 18, 30);
    this.camera.lookAt(0, 2, 0);
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.players = new Map();
    this.effects = [];
    this.recoil = 0;
    buildWorld(this.scene);
    this.addLights();
    this.weapon = createWeapon(this.camera);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xd9f0f2, 0x36472c, 2.1));
    const sun = new THREE.DirectionalLight(0xfff1c4, 2.2);
    sun.position.set(-24, 42, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -58;
    sun.shadow.camera.right = 58;
    sun.shadow.camera.top = 58;
    sun.shadow.camera.bottom = -58;
    this.scene.add(sun);
  }

  resize() {
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  syncPlayers(states, names, localId) {
    const seen = new Set();
    for (const state of states) {
      if (state.id === localId) continue;
      seen.add(state.id);
      let avatar = this.players.get(state.id);
      if (!avatar) {
        avatar = new PlayerAvatar(names.get(state.id)?.name || `Player ${state.id}`, state.team);
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

  trace(from, to, team) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...from), new THREE.Vector3(...to),
    ]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
      color: team === 1 ? 0x8bd0ff : 0xff9a72, transparent: true, opacity: .9,
    }));
    this.scene.add(line);
    this.effects.push({ object: line, expires: performance.now() + 90 });
  }

  kick() {
    this.recoil = 1;
  }

  render(local, dt) {
    const alpha = 1 - Math.exp(-dt * 14);
    for (const avatar of this.players.values()) {
      if (avatar.target) avatar.update(avatar.target, alpha);
    }
    if (local) {
      this.camera.position.set(local.x, local.y + EYE_HEIGHT, local.z);
      this.camera.rotation.set(local.pitch, local.yaw, 0);
      const speed = Math.hypot(local.vx, local.vz);
      const bob = local.y === 0 ? Math.sin(performance.now() * .012) * Math.min(.025, speed * .004) : 0;
      this.camera.position.y += bob;
    }
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.weapon.position.z = -.72 + this.recoil * .12;
    this.weapon.rotation.x = -.06 + this.recoil * .09;
    const now = performance.now();
    this.effects = this.effects.filter((effect) => {
      if (effect.expires > now) return true;
      this.scene.remove(effect.object);
      effect.object.geometry.dispose();
      effect.object.material.dispose();
      return false;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
