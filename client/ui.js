const $ = (selector) => document.querySelector(selector);

export class GameUI {
  constructor() {
    this.join = $('#join-screen');
    this.hud = $('#hud');
    this.mobile = $('#mobile-controls');
    this.connection = $('#connection-status');
    this.roster = new Map();
    this.feedTimers = [];
    this.announcementTimer = null;
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
      status === 'connected' ? '#75eb72' : status === 'full' ? '#ff553e' : '#ffc84a';
  }

  updateLocal(player) {
    $('#health').textContent = player.hp;
    $('#health-bar').style.width = `${player.hp}%`;
    $('#health-bar').style.background = player.hp < 30 ? '#ff553e' : '#d8ff46';
    $('#ammo').textContent = player.ammo;
    $('#weapon-state').textContent = player.reloading ? 'СУМЛАЖ БАЙНА…' : 'AK-47';
  }

  updatePopulation(count, capacity = 96) {
    $('#population').textContent = `${count} / ${capacity}`;
  }

  setLatency(ms) {
    $('#latency').textContent = `${Math.round(ms)} MS`;
  }

  setScores(scores) {
    $('#blue-score').textContent = scores[1] || 0;
    $('#red-score').textContent = scores[2] || 0;
  }

  setInitialRoster(players) {
    this.roster.clear();
    for (const player of players) this.roster.set(player.id, { deaths: 0, kills: 0, ...player });
    this.renderRoster();
  }

  addPlayer(player) {
    const previous = this.roster.get(player.id) || {};
    this.roster.set(player.id, { kills: 0, deaths: 0, ...previous, ...player });
    this.renderRoster();
  }

  removePlayer(id) {
    this.roster.delete(id);
    this.renderRoster();
  }

  syncKills(players) {
    for (const state of players) {
      const player = this.roster.get(state.id);
      if (player) player.kills = state.kills;
    }
    this.renderRoster();
  }

  addKill(killerId, victimId, headshot) {
    const killer = this.roster.get(killerId) || { name: 'Unknown', team: 0, kills: 0 };
    const victim = this.roster.get(victimId) || { name: 'Unknown', team: 0, deaths: 0 };
    killer.kills++;
    victim.deaths++;
    const row = document.createElement('div');
    row.className = 'kill-row';
    const killerName = document.createElement('span');
    killerName.className = killer.team === 1 ? 'blue-name' : 'red-name';
    killerName.textContent = killer.name;
    const icon = document.createElement('b');
    icon.textContent = headshot ? ' ◆ HEADSHOT ◆ ' : ' ━ AK ━ ';
    const victimName = document.createElement('span');
    victimName.className = victim.team === 1 ? 'blue-name' : 'red-name';
    victimName.textContent = victim.name;
    row.append(killerName, icon, victimName);
    $('#kill-feed').prepend(row);
    while ($('#kill-feed').children.length > 5) $('#kill-feed').lastChild.remove();
    setTimeout(() => row.remove(), 6000);
    this.renderRoster();
  }

  renderRoster() {
    const renderTeam = (team, root) => {
      root.replaceChildren();
      [...this.roster.values()].filter((p) => p.team === team)
        .sort((a, b) => b.kills - a.kills)
        .forEach((player) => {
          const row = document.createElement('div');
          row.className = 'roster-row';
          for (const value of [player.name, player.kills || 0, player.deaths || 0]) {
            const span = document.createElement('span');
            span.textContent = value;
            row.append(span);
          }
          root.append(row);
        });
    };
    renderTeam(1, $('#blue-roster'));
    renderTeam(2, $('#red-roster'));
  }

  showScoreboard(show) {
    $('#scoreboard').classList.toggle('hidden', !show);
  }

  hitmarker(headshot) {
    const element = $('#hitmarker');
    element.classList.add('active');
    element.style.filter = headshot ? 'hue-rotate(145deg) brightness(1.5)' : '';
    setTimeout(() => element.classList.remove('active'), 100);
  }

  damage() {
    const element = $('#damage-flash');
    element.classList.add('active');
    setTimeout(() => element.classList.remove('active'), 160);
  }

  setDead(dead, seconds = 3) {
    $('#death-screen').classList.toggle('hidden', !dead);
    $('#respawn-time').textContent = Math.max(0, Math.ceil(seconds));
  }

  announce(text, duration = 2200) {
    const element = $('#announcement');
    element.textContent = text;
    element.classList.remove('hidden');
    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => element.classList.add('hidden'), duration);
  }
}
