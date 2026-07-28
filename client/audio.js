export class GameAudio {
  constructor() {
    this.context = null;
  }

  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') this.context.resume();
  }

  tone(frequency, duration, volume, type = 'square', slide = 1) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  shot() {
    this.tone(120, 0.07, 0.12, 'sawtooth', 0.35);
  }

  hit(headshot = false) {
    this.tone(headshot ? 1100 : 720, 0.08, 0.08, 'square', 1.35);
  }

  death() {
    this.tone(150, 0.35, 0.1, 'sawtooth', 0.25);
  }
}

