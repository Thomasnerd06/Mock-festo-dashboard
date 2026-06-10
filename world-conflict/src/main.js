/* main.js — game loop, input, save/load, modals */
"use strict";

/* ===== GAME LOOP ===== */
let lastFrameTime = 0;
let tickAccum = 0;

function gameLoop(now) {
  requestAnimationFrame(gameLoop);

  const dt = Math.min((now - lastFrameTime) / 1000, 0.25);
  lastFrameTime = now;

  if (S && !S.ended && !S.pendingEvent && !S.pendingElection) {
    const tps = TICKS_PER_SEC[S.speed] || 0;
    if (tps > 0) {
      tickAccum += dt * tps;
      const maxPerFrame = 8;
      let count = 0;
      while (tickAccum >= 1 && count < maxPerFrame) {
        tickAccum -= 1;
        gameTick();
        count++;
      }
    }
    markDirty('topbar');
  }

  render();
  uiUpdate();
}

/* ===== SPEED CONTROLS ===== */
function initSpeedControls() {
  document.querySelectorAll('.spd').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!S) return;
      S.speed = parseInt(btn.dataset.spd);
      document.querySelectorAll('.spd').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function syncSpeedButtons() {
  if (!S) return;
  document.querySelectorAll('.spd').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.spd) === S.speed);
  });
}

/* ===== TAB CONTROLS ===== */
function initTabs() {
  document.querySelectorAll('#left-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#left-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.ltab-page').forEach(p => p.classList.add('hidden'));
      const page = document.getElementById('ltab-' + btn.dataset.ltab);
      if (page) page.classList.remove('hidden');
      markDirty(btn.dataset.ltab);
    });
  });

  document.querySelectorAll('#right-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#right-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.rtab-page').forEach(p => p.classList.add('hidden'));
      const page = document.getElementById('rtab-' + btn.dataset.rtab);
      if (page) page.classList.remove('hidden');
      markDirty(btn.dataset.rtab);
    });
  });
}

/* ===== KEYBOARD ===== */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if (!S) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        S.speed = S.speed === 0 ? 1 : 0;
        syncSpeedButtons();
        break;
      case '1': case '2': case '3': case '4':
        S.speed = parseInt(e.key);
        syncSpeedButtons();
        break;
      case '0':
        S.speed = 0;
        syncSpeedButtons();
        break;
      case 'Escape':
        moveArming = false; strikeArming = false; navalArming = false; missileArming = false; armedUnitIds = [];
        document.querySelectorAll('.modal').forEach(m => {
          if (!m.id.includes('start')) m.classList.add('hidden');
        });
        break;
    }
  });
}

/* ===== SAVE / LOAD ===== */
const SAVE_KEY = 'world_conflict_save_v1';

function saveGame() {
  if (!S || !MAP) return;
  try {
    const data = { S: deepClone(S), mapSeed: MAP.seed, camX, camY, camZ, selectedProvince };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    showBanner('Game saved.');
  } catch (err) {
    showBanner('Save failed: ' + err.message);
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { showBanner('No save found.'); return; }
    const data = JSON.parse(raw);
    MAP = generateMap(data.mapSeed);
    S = data.S;
    camX = data.camX ?? MAPW/2;
    camY = data.camY ?? MAPH/2;
    camZ = data.camZ ?? 1;
    selectedProvince = data.selectedProvince ?? -1;
    baseDirty = true;
    markDirty('all');
    syncSpeedButtons();
    document.getElementById('start-modal').classList.add('hidden');
    showBanner('Game loaded.');
  } catch (err) {
    showBanner('Load failed: ' + err.message);
  }
}

/* ===== START MODAL ===== */
function initStartModal() {
  const picker = document.getElementById('nation-picker');
  picker.innerHTML = NATION_DEFS.map((nd, i) =>
    `<div class="nation-btn" data-nid="${i}" style="border-color:${nd.color}" onclick="selectNation(${i})">
      <span style="color:${nd.color}">${nd.name}</span>
    </div>`
  ).join('');

  let selectedNation = 0;
  selectNation(0);

  window.selectNation = function(nid) {
    selectedNation = nid;
    document.querySelectorAll('.nation-btn').forEach(b => {
      b.classList.toggle('selected', parseInt(b.dataset.nid) === nid);
    });
  };

  // Start button injected into modal
  const box = document.querySelector('#start-modal .modal-box');
  let startBtn = document.getElementById('btn-start-game');
  if (!startBtn) {
    startBtn = document.createElement('button');
    startBtn.id = 'btn-start-game';
    startBtn.textContent = 'Start Game';
    startBtn.style.marginTop = '16px';
    box.appendChild(startBtn);
  }

  startBtn.addEventListener('click', () => {
    const seedText = document.getElementById('seed-input').value.trim() || String(Date.now());
    startNewGame(seedText, selectedNation);
  });
}

function startNewGame(seedText, playerNation) {
  const seed = hashStr(seedText);
  MAP = generateMap(seed);
  MAP.seed = seed;
  newGame(seedText, playerNation);
  selectedProvince = -1;
  camX = MAPW / 2; camY = MAPH / 2; camZ = 1;
  baseDirty = true;
  markDirty('all');
  syncSpeedButtons();
  document.getElementById('start-modal').classList.add('hidden');
}

/* ===== SYSTEM BUTTON WIRING ===== */
function initSysButtons() {
  document.getElementById('btn-save').addEventListener('click', saveGame);
  document.getElementById('btn-load').addEventListener('click', loadGame);
  document.getElementById('btn-new').addEventListener('click', () => {
    S = null; MAP = null; selectedProvince = -1;
    document.getElementById('start-modal').classList.remove('hidden');
    document.getElementById('nation-picker').querySelectorAll('.nation-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.nation-btn')?.classList.add('selected');
  });

  document.getElementById('btn-end-new').addEventListener('click', () => {
    document.getElementById('end-modal').classList.add('hidden');
    document.getElementById('start-modal').classList.remove('hidden');
  });
}

/* ===== GAME END ===== */
function showEndModal(title, text) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-text').textContent = text;
  document.getElementById('end-modal').classList.remove('hidden');
  S.ended = true;
}
window._showEndModal = showEndModal;

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
  uiInit();
  initSpeedControls();
  initTabs();
  initKeyboard();
  initSysButtons();
  initStartModal();

  // check for saved game
  const hasSave = !!localStorage.getItem(SAVE_KEY);
  if (hasSave) {
    const box = document.querySelector('#start-modal .modal-box');
    let loadBtn = document.getElementById('btn-load-existing');
    if (!loadBtn) {
      loadBtn = document.createElement('button');
      loadBtn.id = 'btn-load-existing';
      loadBtn.textContent = 'Load Saved Game';
      loadBtn.style.marginTop = '8px';
      loadBtn.style.marginLeft = '8px';
      box.appendChild(loadBtn);
    }
    loadBtn.addEventListener('click', loadGame);
  }

  requestAnimationFrame(gameLoop);
});
