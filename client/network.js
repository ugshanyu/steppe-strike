import { MSG } from '../shared/constants.js';
import {
  decodeSnapshot, encodeInput, encodePing,
} from '../shared/protocol.js';

export class RealtimeClient {
  constructor(resolveUrl, handlers = {}) {
    this.resolveUrl = resolveUrl;
    this.handlers = handlers;
    this.socket = null;
    this.name = '';
    this.started = false;
    this.reconnectAttempt = 0;
    this.generation = 0;
    this.pingTimer = null;
    this.reconnectTimer = null;
  }

  connect(name) {
    this.name = name;
    this.started = true;
    this.open();
  }

  async open() {
    if (!this.started) return;
    const generation = ++this.generation;
    this.handlers.status?.(this.reconnectAttempt ? 'reconnecting' : 'connecting');
    try {
      const url = await this.resolveUrl();
      if (!this.started || generation !== this.generation) return;
      this.openSocket(url, generation);
    } catch {
      if (generation === this.generation) this.scheduleReconnect();
    }
  }

  openSocket(url, generation) {
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    const timeout = setTimeout(() => socket.close(), 8_000);
    socket.addEventListener('open', () => {
      if (generation !== this.generation) return socket.close();
      clearTimeout(timeout);
      this.reconnectAttempt = 0;
      socket.send(JSON.stringify({ t: 'hello', version: 2, name: this.name }));
      this.startPings();
    });
    socket.addEventListener('message', (event) => this.onMessage(event.data));
    socket.addEventListener('close', (event) => {
      clearTimeout(timeout);
      this.stopPings();
      if (socket !== this.socket || !this.started) return;
      this.handlers.status?.(event.code === 4001 ? 'full' : 'reconnecting');
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {});
  }

  scheduleReconnect() {
    if (!this.started || this.reconnectTimer) return;
    const delay = Math.min(8_000, 500 * 1.7 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay * (0.85 + Math.random() * 0.3));
  }

  onMessage(data) {
    if (typeof data === 'string') {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.t === 'welcome') this.handlers.status?.('connected');
      this.handlers.event?.(message);
      return;
    }
    const view = new DataView(data);
    if (view.byteLength >= 9 && view.getUint8(0) === MSG.SNAPSHOT) {
      const snapshot = decodeSnapshot(view);
      if (snapshot) this.handlers.snapshot?.(snapshot);
    } else if (view.byteLength === 9 && view.getUint8(0) === MSG.PONG) {
      this.handlers.latency?.(Math.max(0, performance.now() - view.getFloat64(1, true)));
    }
  }

  sendInput(seq, input, viewTick) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encodeInput(
        seq,
        input.buttons,
        input.yaw,
        input.pitch,
        input.fireNonce,
        viewTick,
      ));
    }
  }

  startPings() {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(encodePing(performance.now()));
      }
    }, 2_000);
  }

  stopPings() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
