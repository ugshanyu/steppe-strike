import { BUTTON } from '../shared/constants.js';

const keyMap = {
  KeyW: BUTTON.FORWARD,
  ArrowUp: BUTTON.FORWARD,
  KeyS: BUTTON.BACK,
  ArrowDown: BUTTON.BACK,
  KeyA: BUTTON.LEFT,
  ArrowLeft: BUTTON.LEFT,
  KeyD: BUTTON.RIGHT,
  ArrowRight: BUTTON.RIGHT,
  Space: BUTTON.JUMP,
  KeyR: BUTTON.RELOAD,
};

export class InputController {
  constructor(canvas, onScoreboard) {
    this.canvas = canvas;
    this.onScoreboard = onScoreboard;
    this.keys = 0;
    this.touchMove = 0;
    this.firing = false;
    this.yaw = 0;
    this.pitch = 0;
    this.aimPointer = null;
    this.aimLast = { x: 0, y: 0 };
    this.mouseDrag = null;
    this.touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      || innerWidth <= 760;
    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  bindKeyboard() {
    addEventListener('keydown', (event) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        this.onScoreboard(true);
        return;
      }
      const bit = keyMap[event.code];
      if (bit) {
        event.preventDefault();
        this.keys |= bit;
      }
    });
    addEventListener('keyup', (event) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        this.onScoreboard(false);
        return;
      }
      const bit = keyMap[event.code];
      if (bit) this.keys &= ~bit;
    });
    addEventListener('blur', () => {
      this.keys = 0;
      this.firing = false;
      this.onScoreboard(false);
    });
  }

  bindMouse() {
    this.canvas.addEventListener('click', () => {
      if (!this.touch && document.pointerLockElement !== this.canvas) {
        try {
          this.canvas.requestPointerLock?.()?.catch?.(() => {});
        } catch { /* drag-to-look remains available */ }
      }
    });
    addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.look(event.movementX, event.movementY, 0.0022);
    });
    addEventListener('mousedown', (event) => {
      if (event.button === 0 && document.pointerLockElement === this.canvas) this.firing = true;
    });
    addEventListener('mouseup', (event) => {
      if (event.button === 0) this.firing = false;
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (this.touch || event.button !== 0 || document.pointerLockElement === this.canvas) return;
      this.mouseDrag = event.pointerId;
      this.aimLast = { x: event.clientX, y: event.clientY };
      this.firing = true;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.mouseDrag || document.pointerLockElement === this.canvas) return;
      this.look(event.clientX - this.aimLast.x, event.clientY - this.aimLast.y, 0.004);
      this.aimLast = { x: event.clientX, y: event.clientY };
    });
    const releaseDrag = (event) => {
      if (event.pointerId !== this.mouseDrag) return;
      this.mouseDrag = null;
      this.firing = false;
    };
    this.canvas.addEventListener('pointerup', releaseDrag);
    this.canvas.addEventListener('pointercancel', releaseDrag);
  }

  bindTouch() {
    const joystick = document.querySelector('#joystick');
    const knob = document.querySelector('#joystick-knob');
    const fire = document.querySelector('#fire-button');
    const jump = document.querySelector('#jump-button');
    const reload = document.querySelector('#reload-button');
    let movePointer = null;

    const updateStick = (event) => {
      const box = joystick.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(dx, dy);
      const scale = Math.min(1, 42 / (distance || 1));
      const x = dx * scale;
      const y = dy * scale;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      this.touchMove = 0;
      if (y < -12) this.touchMove |= BUTTON.FORWARD;
      if (y > 12) this.touchMove |= BUTTON.BACK;
      if (x < -12) this.touchMove |= BUTTON.LEFT;
      if (x > 12) this.touchMove |= BUTTON.RIGHT;
    };
    joystick.addEventListener('pointerdown', (event) => {
      movePointer = event.pointerId;
      joystick.setPointerCapture(movePointer);
      updateStick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (event.pointerId === movePointer) updateStick(event);
    });
    const releaseStick = (event) => {
      if (event.pointerId !== movePointer) return;
      movePointer = null;
      this.touchMove = 0;
      knob.style.transform = '';
    };
    joystick.addEventListener('pointerup', releaseStick);
    joystick.addEventListener('pointercancel', releaseStick);

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.touch || event.clientX < innerWidth * 0.35 || this.aimPointer !== null) return;
      this.aimPointer = event.pointerId;
      this.aimLast = { x: event.clientX, y: event.clientY };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.aimPointer) return;
      this.look(event.clientX - this.aimLast.x, event.clientY - this.aimLast.y, 0.005);
      this.aimLast = { x: event.clientX, y: event.clientY };
    });
    const releaseAim = (event) => {
      if (event.pointerId === this.aimPointer) this.aimPointer = null;
    };
    this.canvas.addEventListener('pointerup', releaseAim);
    this.canvas.addEventListener('pointercancel', releaseAim);

    const hold = (element, bit, activeClass = '') => {
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (bit === BUTTON.FIRE) this.firing = true;
        else this.keys |= bit;
        if (activeClass) element.classList.add(activeClass);
        element.setPointerCapture(event.pointerId);
      });
      const stop = () => {
        if (bit === BUTTON.FIRE) this.firing = false;
        else this.keys &= ~bit;
        if (activeClass) element.classList.remove(activeClass);
      };
      element.addEventListener('pointerup', stop);
      element.addEventListener('pointercancel', stop);
    };
    hold(fire, BUTTON.FIRE, 'active');
    hold(jump, BUTTON.JUMP);
    hold(reload, BUTTON.RELOAD);
  }

  look(dx, dy, sensitivity) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch - dy * sensitivity));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  read() {
    return {
      buttons: this.keys | this.touchMove | (this.firing ? BUTTON.FIRE : 0),
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  setLook(yaw, pitch = 0) {
    this.yaw = yaw;
    this.pitch = pitch;
  }

  capture() {
    if (!this.touch) {
      try {
        this.canvas.requestPointerLock?.()?.catch?.(() => {});
      } catch { /* drag-to-look remains available */ }
    }
  }
}
