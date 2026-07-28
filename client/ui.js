import { blockDef, HOTBAR_BLOCKS } from '../shared/blocks.js';

const $ = (selector) => document.querySelector(selector);

export class GameUI {
  constructor() {
    this.join = $('#join-screen');
    this.hud = $('#hud');
    this.mobile = $('#mobile-controls');
    this.connection = $('#connection-status');
    this.announcementTimer = null;
    this.hotbar = $('#hotbar');
    this.buildHotbar();
  }

  buildHotbar() {
    this.hotbar.replaceChildren();
    HOTBAR_BLOCKS.forEach((id, slot) => {
      const block = blockDef(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.slot = String(slot);
      button.setAttribute('aria-label', block.mn);
      const swatch = document.createElement('i');
      swatch.style.background = `#${block.color.toString(16).padStart(6, '0')}`;
      const key = document.createElement('small');
      key.textContent = String(slot + 1);
      button.append(swatch, key);
      this.hotbar.append(button);
    });
    this.setSlot(0);
  }

  bindHotbar(handler) {
    this.hotbar.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('button[data-slot]');
      if (button) handler(Number(button.dataset.slot));
    });
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
      full: 'ЕРТӨНЦ ДҮҮРСЭН',
    };
    this.connection.lastChild.textContent = ` ${labels[status] || status}`;
    this.connection.querySelector('i').style.background =
      status === 'connected' ? '#75eb72' : status === 'full' ? '#ff6b4a' : '#ffc84a';
  }

  setSlot(slot) {
    for (const button of this.hotbar.querySelectorAll('button')) {
      button.classList.toggle('selected', Number(button.dataset.slot) === slot);
    }
    $('#held-block').textContent = blockDef(HOTBAR_BLOCKS[slot]).mn;
  }

  setTarget(hit, progress = 0) {
    const target = $('#target-block');
    const mining = $('#mining-progress');
    target.textContent = hit ? blockDef(hit.block.id).mn : '';
    target.classList.toggle('visible', Boolean(hit));
    mining.classList.toggle('visible', progress > 0 && Boolean(hit));
    mining.firstElementChild.style.width = `${Math.round(progress * 100)}%`;
  }

  updatePopulation(count, capacity = 96) {
    $('#population').textContent = `${count} / ${capacity}`;
  }

  setLatency(ms) {
    $('#latency').textContent = `${Math.round(ms)} MS`;
  }

  announce(text, duration = 1800) {
    const element = $('#announcement');
    element.textContent = text;
    element.classList.remove('hidden');
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => element.classList.add('hidden'), duration);
  }
}
