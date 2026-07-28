import * as THREE from 'three';

const material = (color) => new THREE.MeshStandardMaterial({
  color, roughness: 0.72, metalness: 0.04,
});

function box(width, height, depth, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function nameSprite(name, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const context = canvas.getContext('2d');
  context.font = '700 24px system-ui';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(8, 12, 9, .72)';
  context.fillRect(0, 4, 256, 36);
  context.fillStyle = color;
  context.fillText(name.slice(0, 18), 128, 31);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false,
  }));
  sprite.scale.set(3.4, 0.64, 1);
  sprite.position.y = 2.45;
  sprite.userData.texture = texture;
  return sprite;
}

export class PlayerAvatar {
  constructor(name, team) {
    const teamColor = team === 1 ? 0x298fe8 : 0xe64131;
    const labelColor = team === 1 ? '#65b8ff' : '#ff7869';
    this.group = new THREE.Group();
    this.visual = new THREE.Group();
    this.group.add(this.visual);
    this.torso = box(0.72, 0.78, 0.38, teamColor);
    this.torso.position.y = 1.15;
    this.head = box(0.48, 0.48, 0.48, 0xe8bf95);
    this.head.position.y = 1.78;
    this.legs = box(0.58, 0.68, 0.34, 0x252d2a);
    this.legs.position.y = 0.48;
    this.gun = box(0.14, 0.14, 1.05, 0x252824);
    this.gun.position.set(0.28, 1.32, -0.55);
    this.visual.add(this.torso, this.head, this.legs, this.gun, nameSprite(name, labelColor));
    this.initialized = false;
  }

  update(state, alpha) {
    this.visual.visible = state.alive;
    if (!this.initialized) {
      this.group.position.set(state.x, state.y, state.z);
      this.group.rotation.y = state.yaw;
      this.initialized = true;
    } else {
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, state.x, alpha);
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, state.y, alpha);
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, state.z, alpha);
      const delta = Math.atan2(Math.sin(state.yaw - this.group.rotation.y),
        Math.cos(state.yaw - this.group.rotation.y));
      this.group.rotation.y += delta * alpha;
    }
    this.head.rotation.x = -state.pitch * 0.35;
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

