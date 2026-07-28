import { SteppeStrike } from './game.js';

const canvas = document.querySelector('#game-canvas');
const form = document.querySelector('#join-form');
const nameInput = document.querySelector('#player-name');
const game = new SteppeStrike(canvas);

const remembered = localStorage.getItem('steppe-name');
nameInput.value = remembered || `Нүүдэлчин ${Math.floor(100 + Math.random() * 900)}`;

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim().slice(0, 18) || 'Нүүдэлчин';
  localStorage.setItem('steppe-name', name);
  game.start(name);
});
