import { MSG } from '../shared/constants.js';
import {
  decodeSnapshot, encodeInput, encodePing,
} from '../shared/protocol.js';

export class RealtimeClient {
  constructor(handlers = {}, getAuthToken = () => '') {
    this.handlers = handlers;
    this.getAuthToken = getAuthToken;
    this.socket = null;
    this.name = '';
    this.session = localStorage.getItem('steppe-session') || crypto.randomUUID();
    this.started = false;
    this.reconnectAttempt = 0;
    this.pingTimer = null;
  }

  connect(name) {
    this.name = name;
    this.started = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.handlers.status?.('connecting');

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      socket.send(JSON.stringify({
        t: 'hello', version: 1, name: this.name, session: this.session,
        authToken: this.getAuthToken(),
      }));
      this.handlers.status?.('connected');
      this.startPings();
    });
    socket.addEventListener('message', (event) => this.onMessage(event.data));
    socket.addEventListener('close', (event) => {
      this.stopPings();
      if (socket !== this.socket || !this.started) return;
      this.handlers.status?.(event.code === 4001 ? 'full' : 'reconnecting');
      const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempt++);
      setTimeout(() => this.connect(this.name), delay + Math.random() * 250);
    });
    socket.addEventListener('error', () => {});
  }

  onMessage(data) {
    if (typeof data === 'string') {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.t === 'welcome') {
        this.session = message.session;
        localStorage.setItem('steppe-session', message.session);
      }
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

  sendInput(seq, input) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(encodeInput(seq, input.buttons, input.yaw, input.pitch));
    }
  }

  startPings() {
    this.stopPings();
    this.pingTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(encodePing(performance.now()));
    }, 2000);
  }

  stopPings() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
