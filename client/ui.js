import { PLAYER_FLAG } from '../shared/constants.js';

const $ = (selector) => document.querySelector(selector);

export class GameUI {
  constructor() {
    this.join = $('#join-screen');
    this.hud = $('#hud');
    this.mobile = $('#mobile-controls');
    this.connection = $('#connection-status');
    this.announcementTimer = null;
    this.feedbackTimer = null;
  }

  enterGame(touch) {
    this.join.classList.add('hidden');
    this.hud.classList.remove('hidden');
    if (touch) this.mobile.classList.remove('hidden');
  }

  setStatus(status) {
    const labels = {
      connecting: 'ХОЛБОЖ БАЙНА',
      connected: 'ХОЛБОГДСОН',
      reconnecting: 'ДАХИН ХОЛБОЖ БАЙНА',
      full: 'ТОГЛОЛТ ДҮҮРСЭН',
      replaced: 'ӨӨР ТӨХӨӨРӨМЖ ДЭЭР НЭЭЛТТЭЙ',
    };
    this.connection.lastChild.textContent = ` ${labels[status] || status}`;
    this.connection.querySelector('i').style.background =
      status === 'connected' ? '#75eb72'
        : ['full', 'replaced'].includes(status) ? '#ff6b4a' : '#ffc84a';
  }

  setMatch(match = {}) {
    $('#attack-score').textContent = match.scores?.attackers ?? 0;
    $('#defend-score').textContent = match.scores?.defenders ?? 0;
    const labels = {
      warmup: 'ТОГЛОГЧ ХҮЛЭЭЖ БАЙНА',
      live: `ҮЕ ${match.round || 1}`,
      round_end: 'ҮЕ ДУУСЛАА',
      match_end: 'ТОГЛОЛТ ДУУСЛАА',
    };
    $('#round-state').textContent = labels[match.phase] || 'БЭЛЭН';
  }

  setVitals(player) {
    $('#health').textContent = player.health;
    $('#ammo').textContent = player.ammo;
    $('#reserve-ammo').textContent = player.reserveAmmo;
    $('#reload-state').textContent =
      player.flags & PLAYER_FLAG.RELOADING ? 'ЦЭНЭГЛЭЖ БАЙНА' : 'SERVICE RIFLE';
    document.body.classList.toggle('spectating', !(player.flags & PLAYER_FLAG.ALIVE));
  }

  setSpectating(name) {
    const label = $('#spectator-state');
    label.textContent = name ? `${name} · АЖИГЛАЖ БАЙНА` : '';
    label.classList.toggle('hidden', !name);
  }

  updatePopulation(count, capacity = 10) {
    $('#population').textContent = `${count} / ${capacity}`;
  }

  setLatency(ms) {
    $('#latency').textContent = `${Math.round(ms)} MS`;
  }

  shotFeedback(hit) {
    const crosshair = $('.crosshair');
    crosshair.classList.toggle('hit', hit);
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => crosshair.classList.remove('hit'), 120);
  }

  damageFeedback() {
    const damage = $('#damage-vignette');
    damage.classList.remove('active');
    requestAnimationFrame(() => damage.classList.add('active'));
    setTimeout(() => damage.classList.remove('active'), 220);
  }

  addKill(killer, victim, headshot) {
    const row = document.createElement('div');
    row.innerHTML = `<b></b><span>${headshot ? '◆' : '•'}</span><em></em>`;
    row.querySelector('b').textContent = killer;
    row.querySelector('em').textContent = victim;
    const feed = $('#kill-feed');
    feed.prepend(row);
    while (feed.children.length > 4) feed.lastElementChild.remove();
    setTimeout(() => row.remove(), 5_000);
  }

  announce(text, duration = 1_800) {
    const element = $('#announcement');
    element.textContent = text;
    element.classList.remove('hidden');
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => element.classList.add('hidden'), duration);
  }
}
