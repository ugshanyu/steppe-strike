import * as THREE from 'three';
import { PLAYER_FLAG } from '../shared/constants.js';

const material = (color) => new THREE.MeshLambertMaterial({ color });
const box = (width, height, depth, color) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.castShadow = true;
  return mesh;
};

function nameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  context.font = '700 23px system-ui';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(12, 18, 13, .74)';
  context.fillRect(0, 4, 256, 36);
  context.fillStyle = '#eef5df';
  context.fillText(name.slice(0, 18), 128, 31);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false,
  }));
  sprite.scale.set(3.2, 0.6, 1);
  sprite.position.y = 2.38;
  sprite.userData.texture = texture;
  return sprite;
}

function createRifle() {
  const rifle = new THREE.Group();
  const body = box(0.11, 0.12, 0.72, 0x222925);
  const stock = box(0.15, 0.18, 0.26, 0x61472f);
  const magazine = box(0.09, 0.24, 0.16, 0x303632);
  stock.position.z = 0.38;
  magazine.position.set(0, -0.15, -0.03);
  rifle.add(body, stock, magazine);
  rifle.rotation.x = -0.12;
  return rifle;
}

export class PlayerAvatar {
  constructor(name) {
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);
    this.torso = box(0.7, 0.76, 0.38, 0x4d704b);
    this.torso.position.y = 1.12;
    this.head = box(0.48, 0.48, 0.48, 0xd4a37a);
    this.head.position.y = 1.73;
    this.legs = box(0.56, 0.66, 0.34, 0x29352f);
    this.legs.position.y = 0.45;
    this.rifle = createRifle();
    this.rifle.position.set(0.37, 1.25, -0.38);
    this.visual.add(this.torso, this.head, this.legs, this.rifle, nameSprite(name));
    this.initialized = false;
    this.lastTeam = 0;
    this.recoil = 0;
    this.targetPosition = new THREE.Vector3();
  }

  fire() {
    this.recoil = 1;
  }

  update(state, alpha) {
    this.group.visible = Boolean(state.flags & PLAYER_FLAG.ALIVE);
    if (!this.group.visible) return;
    if (!this.initialized) {
      this.group.position.set(state.x, state.y, state.z);
      this.group.rotation.y = state.yaw;
      this.initialized = true;
    } else {
      this.targetPosition.set(state.x, state.y, state.z);
      this.group.position.lerp(this.targetPosition, alpha);
      const delta = Math.atan2(
        Math.sin(state.yaw - this.group.rotation.y),
        Math.cos(state.yaw - this.group.rotation.y),
      );
      this.group.rotation.y += delta * alpha;
    }
    this.head.rotation.x = -state.pitch * 0.3;
    this.rifle.rotation.x = -0.12 - state.pitch * 0.45 + this.recoil * 0.08;
    this.rifle.position.z = -0.38 + this.recoil * 0.08;
    this.recoil *= 0.72;
    if (state.team !== this.lastTeam) {
      this.lastTeam = state.team;
      this.torso.material.color.setHex(state.team === 1 ? 0xc78537 : 0x417bb3);
    }
  }

  dispose() {
    this.group.traverse((child) => {
      child.geometry?.dispose();
      child.material?.map?.dispose();
      child.material?.dispose();
      child.userData.texture?.dispose();
    });
  }
}
