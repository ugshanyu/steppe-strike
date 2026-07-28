import { BUTTON } from '../shared/constants.js';

const KEY_BITS = {
  KeyW: BUTTON.FORWARD,
  ArrowUp: BUTTON.FORWARD,
  KeyS: BUTTON.BACK,
  ArrowDown: BUTTON.BACK,
  KeyA: BUTTON.LEFT,
  ArrowLeft: BUTTON.LEFT,
  KeyD: BUTTON.RIGHT,
  ArrowRight: BUTTON.RIGHT,
  Space: BUTTON.JUMP,
};

export class InputController {
  constructor(canvas, onSlotChange = () => {}) {
    this.canvas = canvas;
    this.onSlotChange = onSlotChange;
    this.keys = 0;
    this.touchMove = 0;
    this.actions = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.slot = 0;
    this.lookPointer = null;
    this.lookLast = { x: 0, y: 0 };
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      || innerWidth <= 760;
    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  bindKeyboard() {
    addEventListener('keydown', (event) => {
      if (/^Digit[1-6]$/.test(event.code)) {
        this.selectSlot(Number(event.code.slice(-1)) - 1);
        return;
      }
      const bit = KEY_BITS[event.code];
      if (bit) {
        event.preventDefault();
        this.keys |= bit;
      }
    });
    addEventListener('keyup', (event) => {
      const bit = KEY_BITS[event.code];
      if (bit) this.keys &= ~bit;
    });
    addEventListener('blur', () => {
      this.keys = 0;
      this.actions = 0;
    });
  }

  requestPointerLock() {
    if (this.touch || document.pointerLockElement === this.canvas) return;
    try {
      this.canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch { /* drag-to-look remains available */ }
  }

  bindMouse() {
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    this.canvas.addEventListener('click', () => this.requestPointerLock());
    addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === this.canvas) this.look(event.movementX, event.movementY, 0.0022);
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.touch) return;
      if (event.button === 0) this.actions |= BUTTON.MINE;
      if (event.button === 2) this.actions |= BUTTON.PLACE;
      if (document.pointerLockElement !== this.canvas && event.button === 0) {
        this.lookPointer = event.pointerId;
        this.lookLast = { x: event.clientX, y: event.clientY };
        this.canvas.setPointerCapture(event.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer || document.pointerLockElement === this.canvas) return;
      this.look(event.clientX - this.lookLast.x, event.clientY - this.lookLast.y, 0.004);
      this.lookLast = { x: event.clientX, y: event.clientY };
    });
    const release = (event) => {
      if (event.button === 0) this.actions &= ~BUTTON.MINE;
      if (event.button === 2) this.actions &= ~BUTTON.PLACE;
      if (event.pointerId === this.lookPointer) this.lookPointer = null;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', release);
    addEventListener('wheel', (event) => {
      this.selectSlot((this.slot + Math.sign(event.deltaY) + 6) % 6);
    }, { passive: true });
  }

  bindTouch() {
    this.bindJoystick();
    this.bindHold(document.querySelector('#mine-button'), BUTTON.MINE);
    this.bindHold(document.querySelector('#place-button'), BUTTON.PLACE);
    this.bindHold(document.querySelector('#jump-button'), BUTTON.JUMP);
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.touch || event.clientX < innerWidth * 0.34 || this.lookPointer !== null) return;
      this.lookPointer = event.pointerId;
      this.lookLast = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.lookPointer) return;
      this.look(event.clientX - this.lookLast.x, event.clientY - this.lookLast.y, 0.005);
      this.lookLast = { x: event.clientX, y: event.clientY };
    });
    const stopLook = (event) => {
      if (event.pointerId === this.lookPointer) this.lookPointer = null;
    };
    this.canvas.addEventListener('pointerup', stopLook);
    this.canvas.addEventListener('pointercancel', stopLook);
  }

  bindJoystick() {
    const joystick = document.querySelector('#joystick');
    const knob = document.querySelector('#joystick-knob');
    let pointer = null;
    const update = (event) => {
      const box = joystick.getBoundingClientRect();
      const dx = event.clientX - box.left - box.width / 2;
      const dy = event.clientY - box.top - box.height / 2;
      const scale = Math.min(1, 42 / (Math.hypot(dx, dy) || 1));
      const x = dx * scale;
      const y = dy * scale;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      this.touchMove = (y < -12 ? BUTTON.FORWARD : 0) | (y > 12 ? BUTTON.BACK : 0)
        | (x < -12 ? BUTTON.LEFT : 0) | (x > 12 ? BUTTON.RIGHT : 0);
    };
    joystick.addEventListener('pointerdown', (event) => {
      pointer = event.pointerId;
      joystick.setPointerCapture(pointer);
      update(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === pointer) update(event);
    });
    const stop = (event) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      this.touchMove = 0;
      knob.style.transform = '';
    };
    joystick.addEventListener('pointerup', stop);
    joystick.addEventListener('pointercancel', stop);
  }

  bindHold(element, bit) {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (bit === BUTTON.JUMP) this.keys |= bit;
      else this.actions |= bit;
      element.classList.add('active');
      element.setPointerCapture(event.pointerId);
    });
    const stop = () => {
      if (bit === BUTTON.JUMP) this.keys &= ~bit;
      else this.actions &= ~bit;
      element.classList.remove('active');
    };
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
  }

  selectSlot(slot) {
    this.slot = Math.max(0, Math.min(5, slot));
    this.onSlotChange(this.slot);
  }

  look(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * sensitivity));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  read() {
    return {
      buttons: this.keys | this.touchMove | this.actions,
      yaw: this.yaw,
      pitch: this.pitch,
      slot: this.slot,
    };
  }

  setLook(yaw, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  capture() {
    this.requestPointerLock();
  }
}
