/* ui.js — canvas rendering and all HTML panel updates */
"use strict";

/* ===== CANVAS STATE ===== */
let canvas, ctx;
let camX = 0, camY = 0, camZ = 1;
let dragging = false, dragSX = 0, dragSY = 0, dragCX = 0, dragCY = 0;
let hoverProv = -1;

/* ===== PROVINCE PIXEL CACHE ===== */
let provPixels = null; // imageData-based lookup: pixel -> provId

/* ===== INIT ===== */
function uiInit() {
  canvas = document.getElementById('map');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  canvas.addEventListener('mousedown',  onMouseDown);
  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseup',    onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('wheel',      onWheel, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function resizeCanvas() {
  const wrap = document.getElementById('map-wrap');
  canvas.width  = wrap.clientWidth  || 960;
  canvas.height = wrap.clientHeight || 540;
  baseDirty = true;
}

/* ===== CAMERA ===== */
function screenToWorld(sx, sy) {
  return { x: (sx - canvas.width*0.5) / camZ + camX, y: (sy - canvas.height*0.5) / camZ + camY };
}
function worldToScreen(wx, wy) {
  return { x: (wx - camX)*camZ + canvas.width*0.5, y: (wy - camY)*camZ + canvas.height*0.5 };
}
function clampCamera() {
  const hw = canvas.width  / (2*camZ);
  const hh = canvas.height / (2*camZ);
  camX = clamp(camX, hw, MAPW - hw);
  camY = clamp(camY, hh, MAPH - hh);
}

/* ===== MOUSE ===== */
function onMouseDown(e) {
  if (e.button === 1 || e.button === 2) return;
  dragging = true;
  dragSX = e.clientX; dragSY = e.clientY;
  dragCX = camX; dragCY = camY;
  canvas.style.cursor = 'grabbing';
}
function onMouseMove(e) {
  if (dragging) {
    const dx = (e.clientX - dragSX) / camZ;
    const dy = (e.clientY - dragSY) / camZ;
    camX = dragCX - dx; camY = dragCY - dy;
    clampCamera(); baseDirty = true;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const w = screenToWorld(mx, my);
  const pid = hitTestProvince(w.x, w.y);
  if (pid !== hoverProv) { hoverProv = pid; baseDirty = true; }
  updateTooltip(e.clientX, e.clientY, pid);
}
function onMouseUp(e) {
  if (!dragging) return;
  const dx = Math.abs(e.clientX - dragSX), dy = Math.abs(e.clientY - dragSY);
  dragging = false; canvas.style.cursor = '';
  if (dx < 4 && dy < 4 && S) {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const pid = hitTestProvince(w.x, w.y);
    handleMapClick(pid);
  }
}
function onMouseLeave() {
  dragging = false; hoverProv = -1;
  document.getElementById('map-tooltip').classList.add('hidden');
}
function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const wBefore = screenToWorld(mx, my);
  const factor = e.deltaY < 0 ? 1.15 : 0.87;
  camZ = clamp(camZ * factor, 0.5, 8);
  const wAfter = screenToWorld(mx, my);
  camX += wBefore.x - wAfter.x;
  camY += wBefore.y - wAfter.y;
  clampCamera(); baseDirty = true;
}

/* ===== HIT TEST ===== */
function hitTestProvince(wx, wy) {
  if (!MAP) return -1;
  const px = Math.round(wx)|0, py = Math.round(wy)|0;
  if (px < 0 || py < 0 || px >= MAPW || py >= MAPH) return -1;
  const cid = MAP.cellProv[py * MAPW + px];
  if (cid < 0) return -1;
  return MAP.provinces[cid] ? cid : -1;
}

/* ===== MAP CLICK ===== */
function handleMapClick(pid) {
  if (!S) return;
  const n = S.nations[S.player];

  if (moveArming && armedUnitIds.length && pid >= 0) {
    orderMove(S.player, selectedProvince, armedUnitIds, pid);
    moveArming = false; armedUnitIds = [];
    markDirty('military','province'); baseDirty = true; return;
  }
  if (navalArming && armedUnitIds.length && pid >= 0) {
    orderNavalMove(S.player, selectedProvince, armedUnitIds, pid);
    navalArming = false; armedUnitIds = [];
    markDirty('military','province'); baseDirty = true; return;
  }
  if (strikeArming && pid >= 0) {
    orderAirStrike(S.player, selectedProvince, pid);
    strikeArming = false;
    markDirty('military','province'); baseDirty = true; return;
  }
  if (missileArming && pid >= 0) {
    launchMissile(S.player, selectedProvince, pid);
    missileArming = false;
    markDirty('military','province'); baseDirty = true; return;
  }

  moveArming = false; strikeArming = false; navalArming = false; missileArming = false; armedUnitIds = [];

  if (pid >= 0) {
    selectedProvince = pid;
    markDirty('province','build','military','intel');
  }
  baseDirty = true;
}

/* ===== TOOLTIP ===== */
function updateTooltip(cx, cy, pid) {
  const el = document.getElementById('map-tooltip');
  if (pid < 0 || !S || !MAP) { el.classList.add('hidden'); return; }
  const pr = S.provinces[pid];
  const mp = MAP.provinces[pid];
  const owner = pr.nation >= 0 ? S.nations[pr.nation].name : 'Unclaimed';
  const terrain = TERRAINS[mp.terrain]?.name || mp.terrain;
  const units = pr.units.filter(u => u.nation === pr.nation).length;
  el.innerHTML = `<b>${mp.name}</b><br>${owner} &bull; ${terrain}<br>Pop: ${pr.population.toFixed(1)}M &bull; Units: ${units}<br>Happiness: ${pr.happiness.toFixed(0)}%`;
  el.classList.remove('hidden');
  const pad = 12;
  let tx = cx + pad, ty = cy + pad;
  if (tx + el.offsetWidth > window.innerWidth - 8) tx = cx - el.offsetWidth - pad;
  if (ty + el.offsetHeight > window.innerHeight - 8) ty = cy - el.offsetHeight - pad;
  el.style.left = tx + 'px'; el.style.top = ty + 'px';
}

/* ===== RENDER ===== */
function render() {
  if (!MAP || !S) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
  if (baseDirty) { drawBase(); baseDirty = false; }
  drawUnitsOverlay();
  drawSelectionOverlay();
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}
function lerpColor(c1, c2, t) {
  return [c1[0]+(c2[0]-c1[0])*t|0, c1[1]+(c2[1]-c1[1])*t|0, c1[2]+(c2[2]-c1[2])*t|0];
}

function drawBase() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  const scaleX = W / MAPW * camZ, scaleY = H / MAPH * camZ;
  const offX = -camX * camZ + W/2, offY = -camY * camZ + H/2;

  const tileW = Math.max(1, Math.ceil(scaleX + 1));
  const tileH = Math.max(1, Math.ceil(scaleY + 1));

  // determine visible cells
  const x0w = Math.max(0, ((0 - offX) / camZ)|0);
  const y0w = Math.max(0, ((0 - offY) / camZ)|0);
  const x1w = Math.min(MAPW-1, ((W - offX) / camZ + 1)|0);
  const y1w = Math.min(MAPH-1, ((H - offY) / camZ + 1)|0);

  const seaColor = [16, 34, 60];
  const borderColor = [0,0,0];

  // draw cells
  const img = ctx.createImageData(W, H);
  const d = img.data;

  for (let wy = y0w; wy <= y1w; wy++) {
    for (let wx = x0w; wx <= x1w; wx++) {
      const pid = MAP.cellProv[wy * MAPW + wx];
      let r, g, b;
      if (pid < 0) {
        [r,g,b] = seaColor;
      } else {
        const pr = S.provinces[pid];
        const mp = MAP.provinces[pid];
        const shade = TERRAINS[mp.terrain]?.shade || 0;
        let base;
        if (pr.nation >= 0 && S.nations[pr.nation] && !S.nations[pr.nation].dead) {
          base = hexToRgb(S.nations[pr.nation].color);
        } else {
          base = [80,80,80];
        }
        r = clamp(base[0]+shade,0,255);
        g = clamp(base[1]+shade,0,255);
        b = clamp(base[2]+shade,0,255);
        if (pid === hoverProv) { r=clamp(r+30,0,255); g=clamp(g+30,0,255); b=clamp(b+30,0,255); }
        if (MAP.isBorder[wy*MAPW+wx]) { r=(r+0)>>1; g=(g+0)>>1; b=(b+0)>>1; }
      }

      const sx = (wx * camZ + offX)|0;
      const sy = (wy * camZ + offY)|0;
      const ex = Math.min(W, sx + Math.ceil(camZ));
      const ey = Math.min(H, sy + Math.ceil(camZ));
      for (let py = Math.max(0,sy); py < ey; py++) {
        for (let px = Math.max(0,sx); px < ex; px++) {
          const idx = (py * W + px) * 4;
          d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  // draw city dots
  ctx.save();
  ctx.setTransform(camZ, 0, 0, camZ, -camX*camZ + W/2, -camY*camZ + H/2);
  for (const mp of MAP.provinces) {
    const pr = S.provinces[mp.id];
    if (!pr) continue;
    if (mp.x < x0w || mp.x > x1w || mp.y < y0w || mp.y > y1w) continue;
    const isCapital = pr.capital;
    const isCity = pr.city;
    if (!isCity && !isCapital) continue;
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, isCapital ? 3 : 1.8, 0, Math.PI*2);
    ctx.fillStyle = isCapital ? '#fff' : '#ddd';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    if (isCapital && camZ > 1.5) {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.min(6, camZ*3)}px sans-serif`;
      ctx.fillText(MAP.provinces[mp.id].name, mp.x+4, mp.y-4);
    }
  }
  ctx.restore();
}

function drawUnitsOverlay() {
  if (!S || !MAP) return;
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.setTransform(camZ, 0, 0, camZ, -camX*camZ + W/2, -camY*camZ + H/2);

  for (let pid = 0; pid < S.provinces.length; pid++) {
    const pr = S.provinces[pid];
    const mp = MAP.provinces[pid];
    if (!pr.units.length) continue;
    const nationUnits = new Map();
    for (const u of pr.units) {
      if (!nationUnits.has(u.nation)) nationUnits.set(u.nation, 0);
      nationUnits.set(u.nation, nationUnits.get(u.nation)+1);
    }
    let i = 0;
    for (const [nid, cnt] of nationUnits) {
      const col = nid >= 0 && S.nations[nid] ? S.nations[nid].color : '#888';
      const ox = (i - (nationUnits.size-1)/2) * 5;
      ctx.beginPath();
      ctx.arc(mp.x + ox, mp.y + 6, 3, 0, Math.PI*2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 0.5; ctx.stroke();
      if (cnt > 1 && camZ > 1) {
        ctx.fillStyle = '#fff';
        ctx.font = '3px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cnt, mp.x + ox, mp.y + 7.5);
      }
      i++;
    }
  }
  ctx.restore();
}

function drawSelectionOverlay() {
  if (!S || !MAP || selectedProvince < 0) return;
  const mp = MAP.provinces[selectedProvince];
  if (!mp) return;
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.setTransform(camZ, 0, 0, camZ, -camX*camZ + W/2, -camY*camZ + H/2);
  ctx.beginPath();
  ctx.arc(mp.x, mp.y, 8, 0, Math.PI*2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3,2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // if arming, draw range indicator
  if (strikeArming || missileArming) {
    const range = strikeArming ? 6 : 10;
    const dists = graphDistance(selectedProvince, range);
    for (let pid = 0; pid < S.provinces.length; pid++) {
      if (dists[pid] >= 0 && dists[pid] <= range && pid !== selectedProvince) {
        const tmp = MAP.provinces[pid];
        ctx.beginPath();
        ctx.arc(tmp.x, tmp.y, 5, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,80,80,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/* ===== TOPBAR ===== */
function renderTopbar() {
  if (!S) return;
  const n = S.nations[S.player];
  const inc = nationIncome(S.player);
  for (const res of RESOURCES) {
    const el = document.getElementById('res-' + res);
    const iel = document.getElementById('inc-' + res);
    if (el) el.textContent = fmt(n[res]);
    if (iel) {
      const v = inc[res] || 0;
      iel.textContent = (v >= 0 ? ' +' : ' ') + v.toFixed(1) + '/h';
      iel.style.color = v >= 0 ? 'var(--good)' : 'var(--bad)';
    }
  }
  const pwEl = document.getElementById('res-political_will');
  const pwInc = document.getElementById('inc-pw');
  if (pwEl) pwEl.textContent = fmt(n.political_will);
  if (pwInc) pwInc.textContent = '';

  const approvalPct = document.getElementById('approval-pct');
  const approvalFill = document.getElementById('approval-fill');
  if (approvalPct) approvalPct.textContent = Math.round(n.approval);
  if (approvalFill) {
    approvalFill.style.width = n.approval + '%';
    approvalFill.style.background = n.approval > 60 ? 'var(--good)' : n.approval > 40 ? 'var(--warn)' : 'var(--bad)';
  }

  const day = Math.floor(S.tick / 24) + 1;
  const hour = S.tick % 24;
  const dayEl = document.getElementById('day');
  const hourEl = document.getElementById('hour');
  if (dayEl) dayEl.textContent = day;
  if (hourEl) hourEl.textContent = String(hour).padStart(2,'0');

  const flagEl = document.getElementById('nation-flag');
  const nameEl = document.getElementById('nation-name');
  if (flagEl) flagEl.textContent = '';
  if (nameEl) nameEl.textContent = n.name;
}

/* ===== LEFT PANEL — PROVINCE ===== */
function renderProvinceTab() {
  const none = document.getElementById('pp-none');
  const body = document.getElementById('pp-body');
  if (selectedProvince < 0 || !S || !MAP) {
    none.classList.remove('hidden'); body.classList.add('hidden'); return;
  }
  none.classList.add('hidden'); body.classList.remove('hidden');

  const pr = S.provinces[selectedProvince];
  const mp = MAP.provinces[selectedProvince];
  const n  = pr.nation >= 0 ? S.nations[pr.nation] : null;

  document.getElementById('pp-name').textContent = mp.name;
  document.getElementById('pp-owner').innerHTML = `<b>Owner:</b> ${n ? `<span style="color:${n.color}">${n.name}</span>` : 'Unclaimed'}`;
  document.getElementById('pp-terrain').innerHTML = `<b>Terrain:</b> ${TERRAINS[mp.terrain]?.name || mp.terrain}${pr.capital?' &bull; Capital':''}${pr.city?' &bull; City':''}${pr.coastal?' &bull; Coastal':''}`;
  document.getElementById('pp-population').innerHTML = `<b>Population:</b> ${pr.population.toFixed(2)}M &bull; Unemployment: ${pr.unemployment.toFixed(0)}% &bull; Crime: ${pr.crime.toFixed(0)}%`;

  // happiness bar
  const hpct = pr.happiness;
  document.getElementById('pp-happiness-fill').style.width = hpct + '%';
  document.getElementById('pp-happiness-fill').style.background = hpct > 60 ? 'var(--good)' : hpct > 40 ? 'var(--warn)' : 'var(--bad)';
  document.getElementById('pp-happiness-val').textContent = hpct.toFixed(0) + '%';
  const factors = pr.happiness_factors;
  const factorHTML = Object.entries(factors).map(([k,v]) => {
    const col = v > 60 ? 'var(--good)' : v > 40 ? 'var(--warn)' : 'var(--bad)';
    return `<span style="color:${col}">${k.charAt(0).toUpperCase()+k.slice(1)}: ${v.toFixed(0)}</span>`;
  }).join(' &bull; ');
  document.getElementById('pp-happiness-factors').innerHTML = factorHTML;

  // factions
  const factionBar = document.getElementById('pp-factions-bar');
  const factionDetail = document.getElementById('pp-factions-detail');
  let barHTML = '<div style="display:flex;height:14px;border-radius:3px;overflow:hidden">';
  let detHTML = '';
  for (const fk of FACTION_KEYS) {
    const pct = (pr.faction_pops[fk]*100).toFixed(1);
    barHTML += `<div style="flex:${pr.faction_pops[fk]};background:${FACTIONS[fk].color};title:'${FACTIONS[fk].name}'" title="${FACTIONS[fk].name}: ${pct}%"></div>`;
    detHTML += `<span style="color:${FACTIONS[fk].color}">${FACTIONS[fk].icon} ${pct}%</span> `;
  }
  barHTML += '</div>';
  factionBar.innerHTML = barHTML;
  factionDetail.innerHTML = detHTML;

  // resources
  const resOut = document.getElementById('pp-res-outputs');
  if (n) {
    const inc = provinceIncome(selectedProvince, n.id);
    const items = Object.entries(inc).filter(([,v])=>v!==0).map(([k,v])=>`${k}: ${v>=0?'+':''}${v.toFixed(1)}/h`).join(' &bull; ');
    resOut.textContent = items || 'No resource output.';
  } else {
    resOut.textContent = '—';
  }

  // misc (pollution, rebellion)
  const misc = document.getElementById('pp-misc');
  let mHTML = '';
  if (pr.pollution > 0) mHTML += `<span style="color:var(--bad)">Pollution: ${pr.pollution.toFixed(1)}</span> `;
  if (pr.rebellion_timer > 0) mHTML += `<span style="color:var(--bad)">&#x26A0; Rebellion imminent</span>`;
  misc.innerHTML = mHTML;
}

/* ===== LEFT PANEL — BUILD ===== */
function renderBuildTab() {
  const none = document.getElementById('build-none');
  const body = document.getElementById('build-body');
  if (selectedProvince < 0 || !S) { none.classList.remove('hidden'); body.classList.add('hidden'); return; }
  const pr = S.provinces[selectedProvince];
  if (pr.nation !== S.player) { none.classList.remove('hidden'); none.textContent='Select an owned province first.'; body.classList.add('hidden'); return; }
  none.classList.add('hidden'); body.classList.remove('hidden');

  const n = S.nations[S.player];

  // current buildings
  const curEl = document.getElementById('build-current');
  const bEntries = Object.entries(pr.buildings).filter(([,v])=>v>0);
  curEl.innerHTML = bEntries.length
    ? bEntries.map(([k,v])=>`<div class="bld-row"><span>${BUILDING_TYPES[k]?.name||k} Lvl ${v}</span></div>`).join('')
    : '<i style="color:var(--dim)">None built.</i>';

  // build queue
  const qEl = document.getElementById('build-queue');
  qEl.innerHTML = pr.buildQueue.length
    ? pr.buildQueue.map(qi => {
        const label = qi.kind === 'unit' ? (UNIT_TYPES[qi.type]?.name || qi.type) : (BUILDING_TYPES[qi.type]?.name || qi.type);
        const pct = (1 - qi.hoursLeft / (qi.totalHours||1)) * 100;
        return `<div class="bld-row"><span>${label}</span><div class="bq-bar"><div style="width:${pct.toFixed(0)}%;background:var(--accent);height:4px;border-radius:2px"></div></div><i>${Math.ceil(qi.hoursLeft)}h left</i></div>`;
      }).join('')
    : '<i style="color:var(--dim)">Queue empty.</i>';

  // build options
  const optsEl = document.getElementById('build-options');
  let html = '';
  const cats = ['Military','Economic','Civil','Infrastructure'];
  for (const cat of cats) {
    html += `<div class="bld-cat">${cat}</div>`;
    for (const [bId, bt] of Object.entries(BUILDING_TYPES)) {
      if (bt.cat !== cat) continue;
      const cur = pr.buildings[bId] || 0;
      if (cur >= bt.max) continue;
      if (bt.req && !hasTech(S.player, bt.req)) continue;
      if ((bId === 'naval_base' || bId === 'trade_port') && !pr.coastal) continue;
      const canBuy = canAfford(n, bt.cost);
      const costStr = costText(bt.cost);
      html += `<div class="bld-option ${canBuy?'':'disabled'}">
        <div class="bld-name">${bt.name} (${bt.time}h)</div>
        <div class="bld-desc">${bt.desc}</div>
        <div class="bld-cost">${costStr}</div>
        <button onclick="uiEnqueue('${bId}')" ${canBuy?'':'disabled'}>Build</button>
      </div>`;
    }
  }
  optsEl.innerHTML = html;
}

function uiEnqueue(bId) {
  if (selectedProvince < 0 || !S) return;
  const pr = S.provinces[selectedProvince];
  const n  = S.nations[S.player];
  const bt = BUILDING_TYPES[bId];
  if (!bt || !canAfford(n, bt.cost)) return;
  payResources(n, bt.cost);
  pr.buildQueue.push({ kind: 'building', type: bId, hoursLeft: bt.time, totalHours: bt.time });
  markDirty('build');
}

/* ===== LEFT PANEL — MILITARY ===== */
function renderMilitaryTab() {
  const none = document.getElementById('mil-none');
  const body = document.getElementById('mil-body');
  if (selectedProvince < 0 || !S) { none.classList.remove('hidden'); body.classList.add('hidden'); return; }
  none.classList.add('hidden'); body.classList.remove('hidden');

  const pr = S.provinces[selectedProvince];
  const mp = MAP.provinces[selectedProvince];
  const n  = S.nations[S.player];

  // units here
  const unitsEl = document.getElementById('mil-units');
  const units = pr.units.filter(u => u.nation !== -1);
  if (units.length) {
    unitsEl.innerHTML = units.map(u => {
      const ut = UNIT_TYPES[u.type];
      const own = u.nation === S.player;
      const hpPct = (u.hp / ut.hp * 100).toFixed(0);
      const col = own ? 'var(--accent)' : 'var(--bad)';
      const chk = own ? `<input type="checkbox" class="unit-chk" data-uid="${u.id}">` : '';
      return `<div class="unit-row" style="border-left:3px solid ${col}">
        ${chk}<span>${ut.icon} ${ut.name}</span>
        <span title="HP">${hpPct}% HP</span>
        <span title="Exp">Exp:${(u.experience||0).toFixed(0)}</span>
        <span style="color:${S.nations[u.nation]?.color||'#888'}">${S.nations[u.nation]?.name||'?'}</span>
      </div>`;
    }).join('');
  } else {
    unitsEl.innerHTML = '<i style="color:var(--dim)">No units here.</i>';
  }

  // actions
  const actEl = document.getElementById('mil-actions');
  const myUnits = pr.units.filter(u => u.nation === S.player);
  let actHTML = '';
  if (myUnits.length && pr.nation === S.player) {
    actHTML += `<button class="act-btn" onclick="uiArmMove('land')">&#x2794; Move Land Units</button>`;
    if (pr.coastal) actHTML += `<button class="act-btn" onclick="uiArmMove('naval')">&#x26F5; Move Naval Units</button>`;
    if (pr.buildings.airbase) actHTML += `<button class="act-btn" onclick="uiArmStrike()">&#x2708; Air Strike</button>`;
    if (pr.buildings.missile_silo) actHTML += `<button class="act-btn" onclick="uiArmMissile()">&#x2604; Launch Missile</button>`;
  }
  actEl.innerHTML = actHTML;

  // recruit
  const recEl = document.getElementById('mil-recruit');
  let recHTML = '';
  for (const [uType, ut] of Object.entries(UNIT_TYPES)) {
    if (ut.req && !hasTech(S.player, ut.req)) continue;
    if (ut.bld && !(pr.buildings[ut.bld] > 0)) continue;
    if ((ut.cls === 'naval') && !pr.coastal) continue;
    if (pr.nation !== S.player) continue;
    const canBuy = canAfford(n, ut.cost);
    recHTML += `<div class="recruit-row ${canBuy?'':'disabled'}">
      <span>${ut.icon} ${ut.name}</span>
      <span class="rec-desc">${ut.desc}</span>
      <span class="rec-cost">${costText(ut.cost)}</span>
      <button onclick="uiRecruit('${uType}')" ${canBuy?'':'disabled'}>Recruit</button>
    </div>`;
  }
  recEl.innerHTML = recHTML || '<i style="color:var(--dim)">No units available here.</i>';
}

function uiGetSelectedUnitIds() {
  const chks = document.querySelectorAll('.unit-chk:checked');
  return Array.from(chks).map(c => parseInt(c.dataset.uid));
}

function uiArmMove(type) {
  const ids = uiGetSelectedUnitIds();
  if (!ids.length) {
    const pr = S.provinces[selectedProvince];
    const all = pr.units.filter(u => u.nation === S.player && UNIT_TYPES[u.type].cls === (type === 'naval' ? 'naval' : 'land'));
    ids.push(...all.map(u=>u.id));
  }
  if (!ids.length) return;
  armedUnitIds = ids;
  if (type === 'naval') navalArming = true; else moveArming = true;
  showBanner(type === 'naval' ? 'Click destination province for naval move.' : 'Click destination province to move units.');
}

function uiArmStrike() {
  strikeArming = true;
  showBanner('Click target province for air strike.');
}

function uiArmMissile() {
  missileArming = true;
  showBanner('Click target province for missile launch.');
}

function uiRecruit(uType) {
  if (selectedProvince < 0 || !S) return;
  const pr = S.provinces[selectedProvince];
  if (pr.nation !== S.player) return;
  const ut = UNIT_TYPES[uType];
  const n  = S.nations[S.player];
  if (!canAfford(n, ut.cost)) return;
  payResources(n, ut.cost);
  const timeAdj = hasTech(S.player,'mass_production') ? 0.8 : 1.0;
  const tHq = pr.buildings.command_hq > 0 ? 0.85 : 1.0;
  const uTime = Math.ceil(ut.time * timeAdj * tHq);
  pr.buildQueue.push({ kind: 'unit', type: uType, hoursLeft: uTime, totalHours: uTime });
  markDirty('military','build');
}

/* ===== LEFT PANEL — INTEL ===== */
function renderIntelTab() {
  const none = document.getElementById('intel-none');
  const body = document.getElementById('intel-body');
  if (selectedProvince < 0 || !S) { none.classList.remove('hidden'); body.classList.add('hidden'); return; }
  const pr = S.provinces[selectedProvince];
  if (pr.nation < 0 || pr.nation === S.player) { none.classList.remove('hidden'); none.textContent='Select an enemy province to view intel options.'; body.classList.add('hidden'); return; }
  none.classList.add('hidden'); body.classList.remove('hidden');

  const targetNid = pr.nation;
  const n = S.nations[S.player];
  const lvl = n.spyNets[targetNid] || 0;

  document.getElementById('intel-level').innerHTML = `Network level vs ${S.nations[targetNid].name}: <b>${lvl}/5</b>`;

  const opsEl = document.getElementById('intel-ops');
  opsEl.innerHTML = SPY_OPS.map(op => {
    const canUse = lvl >= op.lvl && canAfford(n, op.cost);
    const active = S.spyOps.some(o => o.opId === op.id && o.targetNid === targetNid && o.actorNid === S.player);
    return `<div class="spy-op ${canUse&&!active?'':'disabled'}">
      <b>${op.name}</b> (Lvl ${op.lvl}) — ${op.desc}<br>
      <small>${costText(op.cost)} &bull; ${op.time}h</small>
      <button onclick="uiLaunchOp('${op.id}',${targetNid})" ${canUse&&!active?'':'disabled'}>${active?'Active':'Launch'}</button>
    </div>`;
  }).join('');

  const cache = n.intelCache[targetNid];
  const repEl = document.getElementById('intel-report');
  if (cache && cache.expires > S.tick) {
    const tn = S.nations[targetNid];
    repEl.innerHTML = `<b>Intelligence Report: ${tn.name}</b><br>
      Money: ${fmt(cache.money)} &bull; Food: ${fmt(cache.food)} &bull; Oil: ${fmt(cache.oil)}<br>
      Military Strength: ${cache.military.toFixed(0)} &bull; Expires in ${cache.expires-S.tick}h`;
  } else {
    repEl.innerHTML = '<i style="color:var(--dim)">No intel available. Run Gather Intel operation.</i>';
  }
}

function uiLaunchOp(opId, targetNid) {
  startSpyOp(targetNid, opId);
  markDirty('intel');
}

/* ===== RIGHT PANEL — NATIONS ===== */
function renderNationsTab() {
  const el = document.getElementById('rtab-nations');
  if (!S) { el.innerHTML = ''; return; }
  const myProvs = S.provinces.filter(p=>p.nation===S.player).length;
  const total = S.provinces.length;
  let html = `<div class="panel-title">Nations</div>`;
  html += `<div class="pct-bar-wrap"><div class="pct-label">World Control: ${(myProvs/total*100).toFixed(1)}%</div><div class="pct-bar"><div style="width:${myProvs/total*100}%;background:${S.nations[S.player].color}"></div></div></div>`;
  html += '<table class="nat-table"><thead><tr><th>Nation</th><th>Provs</th><th>Strength</th><th>Status</th></tr></thead><tbody>';
  const sorted = [...S.nations].sort((a,b)=>{
    const ap = S.provinces.filter(p=>p.nation===a.id).length;
    const bp = S.provinces.filter(p=>p.nation===b.id).length;
    return bp - ap;
  });
  for (const n of sorted) {
    const provs = S.provinces.filter(p=>p.nation===n.id).length;
    const str = nationStrength(n.id).toFixed(0);
    const rel = n.id === S.player ? 'You' : getRelation(S.player, n.id).war ? '<span style="color:var(--bad)">&#x2694; War</span>' : getRelation(S.player, n.id).alliance ? '<span style="color:var(--good)">&#x1F91D; Ally</span>' : 'Neutral';
    const dead = n.dead ? '<span style="color:var(--dim)">Eliminated</span>' : '';
    html += `<tr class="${n.id===S.player?'player-row':''}"><td style="color:${n.color}">${n.name}</td><td>${provs}</td><td>${str}</td><td>${dead||rel}</td></tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

/* ===== RIGHT PANEL — DIPLOMACY ===== */
function renderDiplomacyTab() {
  const el = document.getElementById('rtab-diplomacy');
  if (!S) { el.innerHTML = ''; return; }
  let html = '<div class="panel-title">Diplomacy</div>';
  const others = S.nations.filter(n => n.id !== S.player && !n.dead);
  for (const n of others) {
    const rel = getRelation(S.player, n.id);
    const score = rel.score;
    const warBtn = rel.war
      ? `<button class="dip-btn" onclick="uiMakePeace(${n.id})">Sue for Peace</button>`
      : `<button class="dip-btn warn" onclick="uiDeclareWar(${n.id})">Declare War</button>`;
    const allyBtn = rel.alliance
      ? `<button class="dip-btn" onclick="uiBreakAlliance(${n.id})">Break Alliance</button>`
      : (!rel.war && score >= 20 ? `<button class="dip-btn" onclick="uiFormAlliance(${n.id})">Form Alliance</button>` : '');
    const relColor = score >= 20 ? 'var(--good)' : score <= -20 ? 'var(--bad)' : 'var(--warn)';
    html += `<div class="dip-row">
      <div style="color:${n.color}"><b>${n.name}</b></div>
      <div>Relations: <span style="color:${relColor}">${fmtSign(score)}</span></div>
      <div>${rel.war?'<b style="color:var(--bad)">AT WAR</b>':rel.alliance?'<b style="color:var(--good)">ALLY</b>':'Neutral'}</div>
      <div class="dip-btns">${warBtn}${allyBtn}</div>
    </div>`;
  }
  el.innerHTML = html;
}

function uiDeclareWar(nid) {
  if (!S || atWar(S.player, nid)) return;
  if (!confirm(`Declare war on ${S.nations[nid].name}?`)) return;
  declareWar(S.player, nid);
  markDirty('diplomacy','nations');
}
function uiMakePeace(nid) {
  if (!S || !atWar(S.player, nid)) return;
  makePeace(S.player, nid);
  markDirty('diplomacy','nations');
}
function uiFormAlliance(nid) {
  if (!S) return;
  formAlliance(S.player, nid);
  markDirty('diplomacy','nations');
}
function uiBreakAlliance(nid) {
  if (!S) return;
  const r = getRelation(S.player, nid);
  r.alliance = false; syncRelation(S.player, nid);
  modRelation(S.player, nid, -20);
  markDirty('diplomacy','nations');
}

/* ===== RIGHT PANEL — POLITICS ===== */
function renderPoliticsTab() {
  const el = document.getElementById('rtab-politics');
  if (!S) { el.innerHTML = ''; return; }
  const n = S.nations[S.player];
  const nextEl = n.nextElection - S.tick;
  let html = `<div class="panel-title">Politics</div>`;

  // approval
  html += `<div class="pol-section"><b>Overall Approval:</b> ${n.approval.toFixed(0)}%</div>`;
  html += `<div class="pol-section"><b>Next Election:</b> ${nextEl > 0 ? nextEl + ' h' : 'Overdue!'}</div>`;

  // faction approvals
  html += `<div class="pol-section"><b>Faction Approval</b>`;
  for (const fk of FACTION_KEYS) {
    const fa = n.faction_approval[fk] || 50;
    const col = fa >= 60 ? 'var(--good)' : fa >= 40 ? 'var(--warn)' : 'var(--bad)';
    html += `<div class="fac-row">${FACTIONS[fk].icon} ${FACTIONS[fk].name}: <span style="color:${col}">${fa.toFixed(0)}%</span></div>`;
  }
  html += '</div>';

  // active edicts
  html += `<div class="pol-section"><b>Active Edicts</b>`;
  if (n.activeEdicts.length) {
    html += n.activeEdicts.map(eid => {
      const e = EDICTS.find(x=>x.id===eid);
      return `<div class="edict-active">${e?.name||eid} <button class="sm-btn" onclick="uiRevokeEdict('${eid}')">Revoke</button></div>`;
    }).join('');
  } else html += '<div style="color:var(--dim)">None active.</div>';
  html += '</div>';

  // available edicts
  html += `<div class="pol-section"><b>Available Edicts (PW: ${Math.floor(n.political_will)})</b>`;
  for (const e of EDICTS) {
    if (n.activeEdicts.includes(e.id)) continue;
    const conflict = n.activeEdicts.some(ae => EDICTS.find(x=>x.id===ae)?.conflicts.includes(e.id));
    const canEnact = n.political_will >= e.pw && !conflict;
    html += `<div class="edict-option ${canEnact?'':'disabled'}">
      <b>${e.name}</b> <span style="color:var(--dim)">(${e.cat}, ${e.pw} PW)</span><br>
      <small>${e.desc}</small>
      <button class="sm-btn" onclick="uiShowEdict('${e.id}')" ${canEnact?'':'disabled'}>Enact</button>
    </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function uiShowEdict(edictId) {
  const e = EDICTS.find(x=>x.id===edictId); if (!e) return;
  document.getElementById('edict-title').textContent = 'Enact: ' + e.name;
  document.getElementById('edict-desc').textContent = e.desc;
  document.getElementById('edict-cost-text').textContent = 'Cost: ' + e.pw + ' Political Will' + (e.upkeep?` + ${e.upkeep} PW/h upkeep`:'');
  const effDiv = document.getElementById('edict-effects');
  effDiv.innerHTML = Object.entries(e.effects||{}).map(([k,v]) => `<div>${k}: ${v}</div>`).join('');
  document.getElementById('btn-edict-confirm').onclick = () => { enactEdict(S.player, edictId); markDirty('politics'); document.getElementById('edict-modal').classList.add('hidden'); };
  document.getElementById('btn-edict-cancel').onclick = () => document.getElementById('edict-modal').classList.add('hidden');
  document.getElementById('edict-modal').classList.remove('hidden');
}

function uiRevokeEdict(edictId) {
  revokeEdict(S.player, edictId);
  markDirty('politics');
}

/* ===== RIGHT PANEL — RESEARCH ===== */
function renderResearchTab() {
  const el = document.getElementById('rtab-research');
  if (!S) { el.innerHTML = ''; return; }
  const n = S.nations[S.player];
  let html = '<div class="panel-title">Research</div>';
  if (n.research) {
    const t = getAllTechs().find(x=>x.id===n.research.id);
    const pct = (1 - n.research.hoursLeft / (n.research.totalHours||1)) * 100;
    html += `<div class="res-active">
      <b>Researching: ${t?.name||n.research.id}</b>
      <div class="bq-bar"><div style="width:${pct.toFixed(0)}%;background:var(--accent);height:6px;border-radius:3px"></div></div>
      <small>${Math.ceil(n.research.hoursLeft)}h remaining</small>
      <button class="sm-btn" onclick="uiCancelResearch()">Cancel</button>
    </div>`;
  } else {
    html += '<div style="color:var(--dim)">No active research.</div>';
  }
  for (const [treeId, tree] of Object.entries(TECH_TREES)) {
    html += `<div class="tech-tree"><div class="tree-name" style="color:${tree.color}">${tree.name}</div>`;
    for (const t of tree.techs) {
      const done = n.techsDone.includes(t.id);
      const reqOk = !t.req || n.techsDone.includes(t.req);
      const canStart = !done && reqOk && !n.research && n.money >= t.cost;
      const active = n.research?.id === t.id;
      html += `<div class="tech-item ${done?'done':active?'active':reqOk?'':'locked'}">
        <span>${t.name}</span>
        <span style="color:var(--dim)">₩${t.cost} / ${t.time}h</span>
        ${done?'<span style="color:var(--good)">&#x2713;</span>':active?'<span style="color:var(--accent)">...</span>':canStart?`<button class="sm-btn" onclick="uiStartResearch('${t.id}')">Research</button>`:''}
        <small>${t.desc}</small>
      </div>`;
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

function uiStartResearch(techId) {
  if (!S) return;
  const n = S.nations[S.player];
  if (n.research) return;
  const t = getAllTechs().find(x=>x.id===techId);
  if (!t || !n.money || n.money < t.cost) return;
  const speedMult = hasTech(S.player,'advanced_computing') ? 0.8 : 1.0;
  const educMult  = hasTech(S.player,'public_education') ? 0.85 : 1.0;
  const spaceMult = hasTech(S.player,'space_program') ? 0.70 : 1.0;
  const edictBonus = n.activeEdicts.includes('education_for_all') ? 0.90 : 1.0;
  const disc = S.activeEffects.find(e=>e.research_disc_tree && getAllTechs().find(x=>x.id===techId&&Object.values(TECH_TREES).find(tr=>tr.techs.includes(x)&&tr===TECH_TREES[e.research_disc_tree])));
  const discFactor = disc ? (1 - disc.research_disc_pct/100) : 1.0;
  const adjTime = Math.ceil(t.time * speedMult * educMult * spaceMult * edictBonus * discFactor);
  n.money -= t.cost;
  let treeKey = 'military';
  for (const [k, tr] of Object.entries(TECH_TREES)) if (tr.techs.some(x=>x.id===techId)) { treeKey = k; break; }
  n.research = { id: techId, tree: treeKey, hoursLeft: adjTime, totalHours: adjTime };
  markDirty('research');
}

function uiCancelResearch() {
  if (!S) return;
  const n = S.nations[S.player];
  if (!n.research) return;
  const t = getAllTechs().find(x=>x.id===n.research.id);
  if (t) n.money += Math.floor(t.cost * 0.5);
  n.research = null;
  markDirty('research');
}

/* ===== RIGHT PANEL — EVENTS ===== */
function renderEventsTab() {
  const el = document.getElementById('rtab-events');
  if (!S) { el.innerHTML = ''; return; }
  let html = '<div class="panel-title">Event Log</div>';
  const logs = S.log.slice(-30).reverse();
  html += logs.map(entry => {
    const cls = entry.important ? 'log-important' : 'log-entry';
    return `<div class="${cls}">${entry.msg}</div>`;
  }).join('');
  if (!logs.length) html += '<div style="color:var(--dim)">No events yet.</div>';
  el.innerHTML = html;
}

/* ===== EVENT MODAL ===== */
function showEventModal(evt) {
  if (!evt) return;
  document.getElementById('event-category').textContent = evt.cat;
  document.getElementById('event-title').textContent = evt.title;
  document.getElementById('event-desc').textContent = evt.desc;
  const choicesEl = document.getElementById('event-choices');
  choicesEl.innerHTML = evt.choices.map((c,i) =>
    `<button class="choice-btn" onclick="uiEventChoice('${evt.id}',${i})">${c.text}</button>`
  ).join('');
  document.getElementById('event-modal').classList.remove('hidden');
}

function uiEventChoice(evtId, idx) {
  resolveEventChoice(evtId, idx);
  document.getElementById('event-modal').classList.add('hidden');
  markDirty('events','topbar');
}

/* ===== ELECTION MODAL ===== */
function showElectionModal() {
  const n = S.nations[S.player];
  document.getElementById('election-desc').textContent = `It is election day in ${n.name}. Current approval rating: ${n.approval.toFixed(0)}%.`;
  const factDiv = document.getElementById('election-factions');
  factDiv.innerHTML = FACTION_KEYS.map(fk => {
    const fa = n.faction_approval[fk]||50;
    const col = fa >= 60 ? 'var(--good)' : fa < 40 ? 'var(--bad)' : 'var(--warn)';
    return `<div class="fac-row">${FACTIONS[fk].icon} ${FACTIONS[fk].name}: <b style="color:${col}">${fa.toFixed(0)}%</b></div>`;
  }).join('');
  document.getElementById('election-result').classList.add('hidden');
  document.getElementById('election-voting').classList.remove('hidden');
  document.getElementById('btn-election-vote').onclick = () => uiHoldElection();
  document.getElementById('election-modal').classList.remove('hidden');
}

function uiHoldElection() {
  if (!S) return;
  const won = S.nations[S.player].approval >= 45;
  document.getElementById('election-outcome').textContent = won ? '&#x2713; Re-elected!' : '&#x2718; Defeated!';
  document.getElementById('election-outcome-text').textContent = won
    ? 'The people have spoken. Your government continues.'
    : 'The opposition takes over. Concessions must be made.';
  document.getElementById('election-outcome').style.color = won ? 'var(--good)' : 'var(--bad)';
  document.getElementById('election-result').classList.remove('hidden');
  document.getElementById('election-voting').classList.add('hidden');
  document.getElementById('btn-election-close').onclick = () => {
    document.getElementById('election-modal').classList.add('hidden');
    resolveElectionResult(won);
  };
}

/* ===== MAIN UI UPDATE ===== */
function uiUpdate() {
  if (!S) return;
  if (UI_DIRTY.topbar) { renderTopbar(); UI_DIRTY.topbar = false; }

  const activeLeftTab = document.querySelector('#left-tabs .tab.active')?.dataset.ltab;
  if (activeLeftTab === 'province' && UI_DIRTY.province) { renderProvinceTab(); UI_DIRTY.province = false; }
  if (activeLeftTab === 'build'    && UI_DIRTY.build)    { renderBuildTab();    UI_DIRTY.build    = false; }
  if (activeLeftTab === 'military' && UI_DIRTY.military) { renderMilitaryTab(); UI_DIRTY.military = false; }
  if (activeLeftTab === 'intel'    && UI_DIRTY.intel)    { renderIntelTab();    UI_DIRTY.intel    = false; }

  const activeRightTab = document.querySelector('#right-tabs .tab.active')?.dataset.rtab;
  if (activeRightTab === 'nations'   && UI_DIRTY.nations)   { renderNationsTab();   UI_DIRTY.nations   = false; }
  if (activeRightTab === 'diplomacy' && UI_DIRTY.diplomacy) { renderDiplomacyTab(); UI_DIRTY.diplomacy = false; }
  if (activeRightTab === 'politics'  && UI_DIRTY.politics)  { renderPoliticsTab();  UI_DIRTY.politics  = false; }
  if (activeRightTab === 'research'  && UI_DIRTY.research)  { renderResearchTab();  UI_DIRTY.research  = false; }
  if (activeRightTab === 'events'    && UI_DIRTY.events)    { renderEventsTab();    UI_DIRTY.events    = false; }

  // pending event modal
  if (S.pendingEvent) showEventModal(S.pendingEvent);
  if (S.pendingElection) showElectionModal();
}

/* ===== BANNER ===== */
window._showBanner = function(msg) {
  const el = document.getElementById('banner');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(window._bannerTimer);
  window._bannerTimer = setTimeout(() => el.classList.add('hidden'), 3000);
};
