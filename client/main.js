import { SteppeStrike } from './game.js';
import { initializePlatform } from './platform.js';

const canvas = document.querySelector('#game-canvas');
const form = document.querySelector('#join-form');
const nameInput = document.querySelector('#player-name');
const status = document.querySelector('#join-status');

const remembered = localStorage.getItem('steppe-name');
nameInput.value = remembered || `Нүүдэлчин ${Math.floor(100 + Math.random() * 900)}`;

async function boot() {
  try {
    const platform = await initializePlatform();
    const game = new SteppeStrike(canvas, { getAuthToken: platform.getToken });
    if (platform.name) {
      nameInput.value = platform.name;
      nameInput.readOnly = true;
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = nameInput.value.trim().slice(0, 18) || 'Нүүдэлчин';
      if (!platform.embedded) localStorage.setItem('steppe-name', name);
      game.start(name);
    });
  } catch {
    status.textContent = 'Usion холболт амжилтгүй · Дахин нээнэ үү';
    nameInput.disabled = true;
    form.querySelector('button').disabled = true;
  }
}

boot();
