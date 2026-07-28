import * as THREE from 'three';
import { blockDef, HOTBAR_BLOCKS } from '../shared/blocks.js';

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

export class PlayerAvatar {
  constructor(name, id) {
    const shirt = new THREE.Color().setHSL(((id * 0.173) % 1), 0.42, 0.5).getHex();
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);
    this.torso = box(0.7, 0.76, 0.38, shirt);
    this.torso.position.y = 1.12;
    this.head = box(0.48, 0.48, 0.48, 0xd4a37a);
    this.head.position.y = 1.73;
    this.legs = box(0.56, 0.66, 0.34, 0x29352f);
    this.legs.position.y = 0.45;
    this.held = box(0.28, 0.28, 0.28, blockDef(HOTBAR_BLOCKS[0]).color);
    this.held.position.set(0.46, 1.23, -0.32);
    this.visual.add(this.torso, this.head, this.legs, this.held, nameSprite(name));
    this.initialized = false;
    this.lastSlot = -1;
  }

  update(state, alpha) {
    if (!this.initialized) {
      this.group.position.set(state.x, state.y, state.z);
      this.group.rotation.y = state.yaw;
      this.initialized = true;
    } else {
      this.group.position.lerp(new THREE.Vector3(state.x, state.y, state.z), alpha);
      const delta = Math.atan2(Math.sin(state.yaw - this.group.rotation.y),
        Math.cos(state.yaw - this.group.rotation.y));
      this.group.rotation.y += delta * alpha;
    }
    this.head.rotation.x = -state.pitch * 0.3;
    if (state.slot !== this.lastSlot) {
      this.lastSlot = state.slot;
      this.held.material.color.setHex(blockDef(HOTBAR_BLOCKS[state.slot] || HOTBAR_BLOCKS[0]).color);
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
