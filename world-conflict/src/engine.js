/* engine.js — map generation, game state, full simulation */
"use strict";

/* ===== MUTABLE GLOBALS ===== */
let S = null, MAP = null, unitSeq = 1, moveSeq = 1;
let baseDirty = true, selectedProvince = -1;
let moveArming = false, strikeArming = false, navalArming = false, missileArming = false;
let armedUnitIds = [];
const UI_DIRTY = {};
['topbar','province','build','military','intel','nations','diplomacy','politics','research','events'].forEach(k => UI_DIRTY[k] = true);
function markDirty(...keys) { if (keys.includes('all')) Object.keys(UI_DIRTY).forEach(k => UI_DIRTY[k] = true); else keys.forEach(k => { if (k in UI_DIRTY) UI_DIRTY[k] = true; }); }
function showBanner(msg) { if (window._showBanner) window._showBanner(msg); }

/* ===== MAP GENERATION ===== */
function generateMap(seed) {
  const rng = mulberry32(seed);
  function makeNoise(gs) {
    const g = new Float32Array(gs * gs);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return (x, y) => {
      const gx = x*(gs-1), gy = y*(gs-1);
      const x0 = Math.floor(gx)|0, y0 = Math.floor(gy)|0;
      const fx = gx-x0, fy = gy-y0;
      const sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
      const I = (xx, yy) => g[clamp(yy,0,gs-1)*gs+clamp(xx,0,gs-1)];
      const a = I(x0,y0)+(I(x0+1,y0)-I(x0,y0))*sx;
      const b = I(x0,y0+1)+(I(x0+1,y0+1)-I(x0,y0+1))*sx;
      return a+(b-a)*sy;
    };
  }
  const n1 = makeNoise(6), n2 = makeNoise(12), n3 = makeNoise(24);
  const elev = new Float32Array(MAPW*MAPH);
  const land = new Uint8Array(MAPW*MAPH);
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    const u = x/MAPW, v = y/MAPH;
    let e = n1(u,v)*0.55 + n2(u,v)*0.30 + n3(u,v)*0.15;
    const dx = u-0.5, dy = v-0.5;
    e -= (dx*dx+dy*dy)*1.1;
    elev[y*MAPW+x] = e;
    land[y*MAPW+x] = e > 0.27 ? 1 : 0;
  }
  // largest connected land component
  const comp = new Int32Array(MAPW*MAPH).fill(-1);
  let bestComp = -1, bestSz = 0, nComp = 0;
  const stk = [];
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || comp[i] !== -1) continue;
    let sz = 0; stk.push(i); comp[i] = nComp;
    while (stk.length) {
      const c = stk.pop(); sz++;
      const cx = c%MAPW, cy = (c/MAPW)|0;
      if (cx > 0       && land[c-1]    && comp[c-1]    === -1) { comp[c-1]    = nComp; stk.push(c-1); }
      if (cx < MAPW-1  && land[c+1]    && comp[c+1]    === -1) { comp[c+1]    = nComp; stk.push(c+1); }
      if (cy > 0       && land[c-MAPW] && comp[c-MAPW] === -1) { comp[c-MAPW] = nComp; stk.push(c-MAPW); }
      if (cy < MAPH-1  && land[c+MAPW] && comp[c+MAPW] === -1) { comp[c+MAPW] = nComp; stk.push(c+MAPW); }
    }
    if (sz > bestSz) { bestSz = sz; bestComp = nComp; }
    nComp++;
  }
  for (let i = 0; i < land.length; i++) if (comp[i] !== bestComp) land[i] = 0;
  // province seeds (Voronoi)
  const seeds = [];
  const minD2 = 16*16;
  for (let att = 0; att < 40000 && seeds.length < LAND_TARGET; att++) {
    const x = (rng()*MAPW)|0, y = (rng()*MAPH)|0;
    if (!land[y*MAPW+x]) continue;
    let ok = true;
    for (const s of seeds) { const dx=s.x-x, dy=s.y-y; if (dx*dx+dy*dy < minD2) { ok = false; break; } }
    if (ok) seeds.push({x, y});
  }
  // assign cells
  const cellProv = new Int16Array(MAPW*MAPH).fill(-1);
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    if (!land[y*MAPW+x]) continue;
    let best = -1, bd = Infinity;
    for (let s = 0; s < seeds.length; s++) { const dx=seeds[s].x-x,dy=seeds[s].y-y,d=dx*dx+dy*dy; if (d<bd){bd=d;best=s;} }
    cellProv[y*MAPW+x] = best;
  }
  // centroids + adjacency
  const adjS = seeds.map(() => new Set());
  const isBorder = new Uint8Array(MAPW*MAPH);
  const cx = new Float64Array(seeds.length), cy = new Float64Array(seeds.length), cn = new Float64Array(seeds.length);
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    const p = cellProv[y*MAPW+x]; if (p < 0) continue;
    cx[p] += x; cy[p] += y; cn[p]++;
    const r = x < MAPW-1 ? cellProv[y*MAPW+x+1] : -1;
    const d = y < MAPH-1 ? cellProv[(y+1)*MAPW+x] : -1;
    if (r !== p) { isBorder[y*MAPW+x] = 1; if (r >= 0) { adjS[p].add(r); adjS[r].add(p); } }
    if (d !== p) { isBorder[y*MAPW+x] = 1; if (d >= 0) { adjS[p].add(d); adjS[d].add(p); } }
  }
  // build province list
  const remap = new Int16Array(seeds.length).fill(-1);
  const provinces = [];
  for (let s = 0; s < seeds.length; s++) {
    if (cn[s] < 4) continue;
    remap[s] = provinces.length;
    const ex = cx[s]/cn[s], ey = cy[s]/cn[s];
    const e = elev[Math.round(ey)*MAPW+Math.round(ex)] || 0.3;
    const tr = rng();
    let terrain = 'plains';
    if (e > 0.46 || tr < 0.10) terrain = 'mountain';
    else if (tr < 0.30) terrain = 'forest';
    else if (tr < 0.36) terrain = 'desert';
    const T = TERRAINS[terrain];
    provinces.push({
      x: ex, y: ey, terrain,
      name: genProvName(rng),
      oilRich: rng() < T.oilChance,
      steelRich: rng() < T.steelChance,
      rareRich: rng() < T.rareChance,
      coastal: false,
      adj: [],
      seaAdj: [],
    });
  }
  for (let i = 0; i < cellProv.length; i++) {
    if (cellProv[i] >= 0) { cellProv[i] = remap[cellProv[i]]; if (cellProv[i] < 0) cellProv[i] = -1; }
  }
  for (let s = 0; s < seeds.length; s++) {
    if (remap[s] < 0) continue;
    for (const o of adjS[s]) if (remap[o] >= 0 && remap[o] !== remap[s]) {
      if (!provinces[remap[s]].adj.includes(remap[o])) provinces[remap[s]].adj.push(remap[o]);
    }
  }
  // coastal detection
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    const p = cellProv[y*MAPW+x]; if (p < 0) continue;
    if ((x>0 && !land[y*MAPW+x-1]) || (x<MAPW-1 && !land[y*MAPW+x+1]) ||
        (y>0 && !land[(y-1)*MAPW+x]) || (y<MAPH-1 && !land[(y+1)*MAPW+x]))
      provinces[p].coastal = true;
  }
  for (const p of provinces) if (p.coastal && p.terrain === 'plains') p.terrain = 'coastal';
  // sea component flood fill
  const seaComp = new Int32Array(MAPW*MAPH).fill(-1);
  let nSea = 0;
  for (let i = 0; i < land.length; i++) {
    if (land[i] || seaComp[i] !== -1) continue;
    stk.push(i); seaComp[i] = nSea;
    while (stk.length) {
      const c = stk.pop();
      const cx2 = c%MAPW, cy2 = (c/MAPW)|0;
      if (cx2>0       && !land[c-1]    && seaComp[c-1]    === -1) { seaComp[c-1]    = nSea; stk.push(c-1); }
      if (cx2<MAPW-1  && !land[c+1]    && seaComp[c+1]    === -1) { seaComp[c+1]    = nSea; stk.push(c+1); }
      if (cy2>0       && !land[c-MAPW] && seaComp[c-MAPW] === -1) { seaComp[c-MAPW] = nSea; stk.push(c-MAPW); }
      if (cy2<MAPH-1  && !land[c+MAPW] && seaComp[c+MAPW] === -1) { seaComp[c+MAPW] = nSea; stk.push(c+MAPW); }
    }
    nSea++;
  }
  // sea adjacency between coastal provinces
  const provSeaComps = provinces.map(() => new Set());
  for (let y = 0; y < MAPH; y++) for (let x = 0; x < MAPW; x++) {
    const p = cellProv[y*MAPW+x]; if (p < 0 || !provinces[p].coastal) continue;
    for (const ni of [y*MAPW+x-1, y*MAPW+x+1, (y-1)*MAPW+x, (y+1)*MAPW+x]) {
      if (ni >= 0 && ni < land.length && !land[ni] && seaComp[ni] >= 0) provSeaComps[p].add(seaComp[ni]);
    }
  }
  const coastalIds = provinces.map((_,i)=>i).filter(i=>provinces[i].coastal);
  for (let ai = 0; ai < coastalIds.length; ai++) {
    const a = coastalIds[ai];
    for (let bi = ai+1; bi < coastalIds.length; bi++) {
      const b = coastalIds[bi];
      let shared = false;
      for (const sc of provSeaComps[a]) if (provSeaComps[b].has(sc)) { shared = true; break; }
      if (shared) {
        if (!provinces[a].seaAdj.includes(b)) provinces[a].seaAdj.push(b);
        if (!provinces[b].seaAdj.includes(a)) provinces[b].seaAdj.push(a);
      }
    }
  }
  return { cellProv, isBorder, provinces };
}

/* ===== NEW GAME ===== */
function mkUnit(type, nation, exp) {
  exp = exp || 0;
  return { id: unitSeq++, type, nation, hp: UNIT_TYPES[type].hp, experience: exp, cooldown: 0, supplyDeficit: 0 };
}

function newGame(seedText, playerNation) {
  const seed = hashStr(seedText);
  MAP = generateMap(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const P = MAP.provinces;
  // pick nation capitals, well-spread
  const caps = [(rng()*P.length)|0];
  while (caps.length < NATION_COUNT) {
    let best = -1, bd = -1;
    for (let i = 0; i < P.length; i++) {
      if (caps.includes(i)) continue;
      let d = Infinity;
      for (const c of caps) d = Math.min(d, dist2(P[c].x, P[c].y, P[i].x, P[i].y));
      if (d > bd) { bd = d; best = i; }
    }
    caps.push(best);
  }
  // multi-source BFS nation assignment
  const owner = new Int16Array(P.length).fill(-1);
  const q = [];
  caps.forEach((p, n) => { owner[p] = n; q.push(p); });
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    for (const o of P[p].adj) if (owner[o] === -1) { owner[o] = owner[p]; q.push(o); }
  }
  for (let i = 0; i < P.length; i++) {
    if (owner[i] !== -1) continue;
    let best = 0, bd = Infinity;
    caps.forEach((c, n) => { const d = dist2(P[c].x,P[c].y,P[i].x,P[i].y); if (d < bd) { bd=d; best=n; } });
    owner[i] = best;
  }
  unitSeq = 1; moveSeq = 1;
  S = {
    tick: 0, speed: 1, player: playerNation, ended: false,
    pendingEvent: null, pendingElection: false,
    nextEvent: EVENT_INTERVAL_MIN + ((rng()*(EVENT_INTERVAL_MAX-EVENT_INTERVAL_MIN))|0),
    nextWorldCouncil: WORLD_COUNCIL_INTERVAL,
    activeEffects: [],
    wars: [],
    nations: NATION_DEFS.map((d, i) => ({
      id: i, name: d.name, color: d.color, dead: false, ai: i !== playerNation,
      money: 6000, food: 2000, oil: 1500, steel: 1000, electronics: 300, rare_metals: 100, manpower: 100,
      political_will: 50,
      approval: 60,
      faction_approval: { militarist:50, capitalist:50, communist:50, environmentalist:50, intellectual:50, religious:50 },
      activeEdicts: [],
      techsDone: [], research: null,
      relations: {},
      spyNets: {},
      intelCache: {},
      nextElection: ELECTION_INTERVAL + ((rng()*200)|0),
      startProvinces: 0,
      aiState: { cooldown: (i*3)%9, warTarget: -1 },
    })),
    provinces: P.map((p, i) => ({
      id: i, nation: owner[i],
      capital: caps.includes(i),
      city: caps.includes(i) || rng() < 0.25,
      coastal: p.coastal,
      buildings: { barracks:0,factory:0,airbase:0,naval_base:0,missile_silo:0,aa_battery:0,radar:0,command_hq:0,fort:0,
                   farm:0,mine:0,oil_rig:0,electronics_plant:0,trade_port:0,nuclear_plant:0,industry:0,
                   hospital:0,school:0,university:0,cultural_center:0,stadium:0,temple:0,police:0,park:0,
                   roads:0,railway:0,power_grid:0,water_supply:0 },
      buildQueue: [], units: [],
      population: 1.0 + rng()*2.0,
      happiness: 60,
      happiness_factors: { food:60, healthcare:50, education:50, entertainment:50, employment:60, safety:60, environment:70 },
      faction_pops: { militarist:0.17, capitalist:0.17, communist:0.17, environmentalist:0.16, intellectual:0.16, religious:0.17 },
      pollution: 0, crime: 20, unemployment: 15, rebellion_timer: 0,
    })),
    moves: [], spyOps: [], log: [],
  };
  // init relations
  for (let i = 0; i < NATION_COUNT; i++) for (let j = 0; j < NATION_COUNT; j++) if (i !== j)
    S.nations[i].relations[j] = { score: 0, war: false, alliance: false, trade_deal: false, nap_until: 0 };
  // starting buildings + units
  for (const pr of S.provinces) {
    const cnt = pr.capital ? 4 : pr.city ? 2 : 1;
    for (let k = 0; k < cnt; k++) pr.units.push(mkUnit('inf', pr.nation));
    if (pr.capital) { pr.buildings.barracks = 1; pr.buildings.roads = 1; pr.population += 2; }
    else if (pr.city) { pr.buildings.farm = 1; }
    if (pr.coastal && rng() < 0.35) pr.buildings.trade_port = 1;
  }
  for (const n of S.nations) n.startProvinces = S.provinces.filter(p => p.nation === n.id).length;
  for (const n of S.nations) n.approval = calcNationApproval(n.id);
  log('A new world emerges. Lead ' + S.nations[playerNation].name + ' to victory.');
  log('Dominate ' + Math.round(WIN_SHARE*100) + '% of provinces to win.');
  baseDirty = true;
  markDirty('all');
}

/* ===== STATE HELPERS ===== */
function getRelation(a, b) {
  if (!S.nations[a].relations[b]) S.nations[a].relations[b] = { score:0, war:false, alliance:false, trade_deal:false, nap_until:0 };
  return S.nations[a].relations[b];
}
function syncRelation(a, b) {
  const ra = getRelation(a,b), rb = getRelation(b,a);
  rb.score = ra.score; rb.war = ra.war; rb.alliance = ra.alliance; rb.trade_deal = ra.trade_deal; rb.nap_until = ra.nap_until;
}
function atWar(a, b) { if (a < 0 || b < 0) return a !== b; if (a === b) return false; return getRelation(a,b).war; }
function inAlliance(a, b) { if (a === b || a < 0 || b < 0) return false; return getRelation(a,b).alliance; }
function modRelation(a, b, delta) {
  if (a < 0 || b < 0) return;
  const r = getRelation(a,b); r.score = clamp(r.score+delta,-100,100); syncRelation(a,b);
}
function declareWar(a, b) {
  if (a < 0 || b < 0 || atWar(a,b)) return;
  const r = getRelation(a,b); r.war = true; r.alliance = false; r.nap_until = 0; syncRelation(a,b);
  const k = a < b ? a+'|'+b : b+'|'+a; if (!S.wars.includes(k)) S.wars.push(k);
  for (let i = 0; i < NATION_COUNT; i++) {
    if (i===a||i===b||S.nations[i].dead) continue;
    if (inAlliance(b,i) && !atWar(a,i)) declareWar(a,i);
  }
  log(S.nations[a].name + ' declares war on ' + S.nations[b].name + '!', true);
  markDirty('nations','diplomacy');
}
function makePeace(a, b) {
  if (!atWar(a,b)) return;
  const r = getRelation(a,b); r.war = false; r.score = Math.max(-30, r.score); syncRelation(a,b);
  S.wars = S.wars.filter(k => k !== (a<b?a+'|'+b:b+'|'+a));
  log(S.nations[a].name + ' and ' + S.nations[b].name + ' sign a peace treaty.', true);
  markDirty('nations','diplomacy');
}
function formAlliance(a, b) {
  if (atWar(a,b) || inAlliance(a,b)) return;
  const r = getRelation(a,b); r.alliance = true; r.score = Math.max(40, r.score+20); syncRelation(a,b);
  log(S.nations[a].name + ' and ' + S.nations[b].name + ' form an alliance!', true);
  markDirty('nations','diplomacy');
}
function breakAlliance(a, b) {
  const r = getRelation(a,b); r.alliance = false; r.score -= 20; syncRelation(a,b);
  markDirty('nations','diplomacy');
}
function hasTech(nid, id) { return !id || S.nations[nid].techsDone.includes(id); }
function canAfford(n, cost) {
  for (const [k,v] of Object.entries(cost)) if ((n[k]||0) < v) return false;
  return true;
}
function payResources(n, cost) { for (const [k,v] of Object.entries(cost)) n[k] = (n[k]||0) - v; }
function provinceCount(nid) { return S.provinces.filter(p => p.nation === nid).length; }
function nationStrength(nid) {
  let s = 0;
  for (const pr of S.provinces) for (const u of pr.units) if (u.nation === nid) s += u.hp*(UNIT_TYPES[u.type].atk+UNIT_TYPES[u.type].def)/UNIT_TYPES[u.type].hp;
  for (const mv of S.moves) if (mv.nation === nid) for (const u of mv.unitObjs) s += u.hp*(UNIT_TYPES[u.type].atk+UNIT_TYPES[u.type].def)/UNIT_TYPES[u.type].hp;
  return s;
}
function effAtk(nid, type) {
  let v = UNIT_TYPES[type].atk;
  if (hasTech(nid,'heavy_armour') && (type==='arm'||type==='heavy_arm')) v *= 1.25;
  if (S.nations[nid].activeEdicts.includes('professional_army')) v *= 1.15;
  return v * (1 + S.nations[nid].techsDone.length * 0.005);
}
function effDef(nid, type) {
  let v = UNIT_TYPES[type].def;
  if (hasTech(nid,'heavy_armour') && (type==='arm'||type==='heavy_arm')) v *= 1.25;
  if (S.nations[nid].activeEdicts.includes('professional_army')) v *= 1.15;
  return v;
}
function moveMult(nid, pid) {
  const pr = S.provinces[pid];
  let m = TERRAINS[MAP.provinces[pid].terrain].moveMult;
  if (pr.buildings.roads)   m *= 0.75;
  if (pr.buildings.railway) m *= 0.65;
  if (hasTech(nid,'logistics')) m *= 0.75;
  return m;
}
function stepTime(nid, units, destPid) {
  let slowest = 0;
  for (const u of units) slowest = Math.max(slowest, UNIT_TYPES[u.type].spd || 3.0);
  return Math.max(0.5, slowest * moveMult(nid, destPid));
}
function seaStepTime(fromPid, toPid) {
  const a = MAP.provinces[fromPid], b = MAP.provinces[toPid];
  return Math.max(2, Math.sqrt(dist2(a.x,a.y,b.x,b.y)) * 0.07);
}
function findLandPath(nid, from, to) {
  const passable = pid => { if (pid < 0 || pid >= S.provinces.length) return false; const o = S.provinces[pid].nation; return o === nid || o < 0 || atWar(nid, o); };
  if (!passable(to)) return null;
  const prev = new Int16Array(S.provinces.length).fill(-2); prev[from] = -1;
  const q = [from]; let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    if (p === to) { const path = []; let c = to; while (c !== -1) { path.unshift(c); c = prev[c]; } return path; }
    for (const o of MAP.provinces[p].adj) if (prev[o] === -2 && passable(o)) { prev[o] = p; q.push(o); }
  }
  return null;
}
function findNavalPath(nid, from, to) {
  if (!MAP.provinces[from].coastal || !MAP.provinces[to].coastal) return null;
  if (MAP.provinces[from].seaAdj.includes(to)) return [from, to];
  const prev = new Map(); prev.set(from, -1);
  const q = [from]; let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    if (p === to) { const path = []; let c = to; while (c !== -1) { path.unshift(c); c = prev.get(c); } return path; }
    for (const o of MAP.provinces[p].seaAdj) if (!prev.has(o)) { prev.set(o, p); q.push(o); }
  }
  return null;
}
function graphDistance(from, maxDist) {
  const dist = new Int16Array(S.provinces.length).fill(-1); dist[from] = 0;
  const q = [from]; let qi = 0;
  while (qi < q.length) {
    const p = q[qi++]; if (dist[p] >= maxDist) continue;
    for (const o of MAP.provinces[p].adj) if (dist[o] === -1) { dist[o] = dist[p]+1; q.push(o); }
  }
  return dist;
}
function getEdictMult(nid, key) {
  const n = S.nations[nid]; if (!n) return 1;
  let m = 1;
  for (const eid of n.activeEdicts) { const e = EDICTS.find(x=>x.id===eid); if (e&&e.effects[key]) m *= (1+e.effects[key]); }
  return m;
}
function getEdictBonus(nid, key) {
  const n = S.nations[nid]; if (!n) return 0;
  let b = 0;
  for (const eid of n.activeEdicts) { const e = EDICTS.find(x=>x.id===eid); if (e&&e.effects[key]) b += e.effects[key]; }
  return b;
}
function costText(cost) {
  const parts = [];
  const icons = { money:'₩', food:'🌾', oil:'🛢', steel:'⚔', electronics:'⚡', rare_metals:'💎', manpower:'👥', political_will:'☘' };
  for (const [k,v] of Object.entries(cost)) if (v > 0) parts.push((icons[k]||k)+fmt(v));
  return parts.join(' ');
}
function getAllTechs() { return [...TECH_TREES.military.techs, ...TECH_TREES.industrial.techs, ...TECH_TREES.social.techs]; }
function findNearestFriendly(from, nid) {
  const vis = new Set([from]); const q = [from];
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi]; if (S.provinces[p].nation === nid) return p;
    for (const o of MAP.provinces[p].adj) if (!vis.has(o)) { vis.add(o); q.push(o); }
  }
  return from;
}
function log(msg, important) {
  if (!S) return;
  important = !!important;
  S.log.unshift({ tick: S.tick, msg, important });
  if (S.log.length > 100) S.log.pop();
  markDirty('events');
  if (important) showBanner(msg);
}

/* ===== ECONOMY ===== */
function provinceIncome(pr) {
  const mp = MAP.provinces[pr.id]; const nid = pr.nation;
  if (nid < 0) return { money:0, food:0, oil:0, steel:0, electronics:0, rare_metals:0, manpower:0 };
  const T = TERRAINS[mp.terrain];
  const hm = 0.7 + pr.happiness * 0.006;
  const infra = (pr.buildings.power_grid ? 1.10 : 1.0) * (pr.buildings.roads ? 1.10 : 1.0) * (pr.buildings.railway ? 1.15 : 1.0);
  const ind = 1 + (pr.buildings.industry||0) * 0.40;
  const auto = hasTech(nid,'automation') ? 1.30 : 1.0;
  const city = pr.city ? 2 : 1;
  const pop = pr.population / 2.0;
  const nuclear = pr.buildings.nuclear_plant ? 1.60 : 1.0;
  const money_mult = getEdictMult(nid,'money_mult') * (1 + getEdictBonus(nid,'relations_bonus') * 0.01);
  return {
    money:  (8 * city * ind * hm * infra * auto * nuclear * pop * money_mult + (pr.buildings.trade_port ? 8 : 0)),
    food:   T.foodMult * (2 + (pr.buildings.farm||0) * 2) * pop,
    oil:    (mp.oilRich ? 8 : 2) * (1 + (pr.buildings.oil_rig||0) * 0.8) * getEdictMult(nid,'oil_mult'),
    steel:  (mp.steelRich ? 4 : 0.5) * (1 + (pr.buildings.mine||0) * 1.5) * getEdictMult(nid,'steel_mult'),
    electronics: (pr.buildings.electronics_plant||0) * 2 * (pr.buildings.power_grid ? 1 : 0.5) * getEdictMult(nid,'electronics_mult'),
    rare_metals: (mp.rareRich ? 2 : 0.2) * (1 + (pr.buildings.mine||0) * 0.4) * (hasTech(nid,'rare_metals_refining') ? 1.5 : 1.0),
    manpower: pr.population * 0.015 * getEdictMult(nid,'manpower_mult'),
  };
}
function nationIncome(nid) {
  const inc = { money:0, food:0, oil:0, steel:0, electronics:0, rare_metals:0, manpower:0 };
  let upMoney = 0, upOil = 0, upFood = 0;
  for (const pr of S.provinces) {
    if (pr.nation === nid) { const i = provinceIncome(pr); for (const k of RESOURCES) inc[k] = (inc[k]||0) + (i[k]||0); }
    for (const u of pr.units) if (u.nation === nid && UNIT_TYPES[u.type].upkeep) {
      const uk = UNIT_TYPES[u.type].upkeep;
      upMoney += uk.money||0; upOil += uk.oil||0; upFood += uk.food||0;
    }
  }
  for (const mv of S.moves) if (mv.nation === nid) for (const u of mv.unitObjs) if (UNIT_TYPES[u.type].upkeep) {
    const uk = UNIT_TYPES[u.type].upkeep; upMoney += uk.money||0; upOil += uk.oil||0; upFood += uk.food||0;
  }
  const n = S.nations[nid];
  for (const eid of n.activeEdicts) { const e = EDICTS.find(x=>x.id===eid); if (e&&e.upkeep) upMoney += e.upkeep; }
  // trade deal bonus
  for (let i = 0; i < NATION_COUNT; i++) {
    if (i===nid||S.nations[i].dead) continue;
    if (n.relations[i]&&n.relations[i].trade_deal) inc.money += inc.money * 0.05;
  }
  inc.money -= upMoney; inc.oil -= upOil; inc.food -= upFood;
  // active effect multipliers
  for (const ae of S.activeEffects) {
    if (ae.resource && ae.pct !== undefined) {
      inc[ae.resource] = (inc[ae.resource]||0) * (ae.bonus ? 1+ae.pct/100 : 1-ae.pct/100);
    }
  }
  return inc;
}
function applyEconomy() {
  for (const n of S.nations) {
    if (n.dead) continue;
    const inc = nationIncome(n.id);
    for (const k of RESOURCES) n[k] = Math.max(0, (n[k]||0) + (inc[k]||0));
    n.political_will = Math.min(100, (n.political_will||0) + 0.5/24 + (hasTech(n.id,'cultural_revolution')?1/24:0));
  }
}

/* ===== POPULATION & HAPPINESS ===== */
function calcHappiness(pr) {
  const nid = pr.nation; if (nid < 0) return 50;
  const n = S.nations[nid], hf = pr.happiness_factors;
  hf.food = clamp(n.food > 200 ? 85 : n.food > 50 ? 50 + n.food*0.17 : n.food*1.0, 0, 100);
  const hosp = (pr.buildings.hospital||0)*20 + (pr.buildings.water_supply?15:0) + (hasTech(nid,'universal_healthcare')?20:0) + getEdictBonus(nid,'happiness_healthcare') + (hasTech(nid,'advanced_medicine')?10:0);
  hf.healthcare = clamp(10 + hosp, 0, 100);
  const edu = (pr.buildings.school||0)*15 + (pr.buildings.university||0)*20 + getEdictBonus(nid,'happiness_education');
  hf.education = clamp(10 + edu, 0, 100);
  const ent = (pr.buildings.cultural_center||0)*20 + (pr.buildings.stadium||0)*15 + getEdictBonus(nid,'happiness_entertainment');
  hf.entertainment = clamp(10 + ent, 0, 100);
  const jobs = (pr.buildings.farm||0)*100 + (pr.buildings.mine||0)*150 + (pr.buildings.oil_rig||0)*120 + (pr.buildings.industry||0)*200 + (pr.buildings.electronics_plant||0)*150 + (pr.buildings.factory||0)*100 + (pr.buildings.barracks||0)*50 + (pr.city?200:50);
  pr.unemployment = clamp(100 - jobs/(pr.population*100)*100, 0, 95);
  hf.employment = clamp(100 - pr.unemployment*0.7 + getEdictBonus(nid,'happiness_employment') + (hasTech(nid,'social_welfare')?25:0), 0, 100);
  hf.safety = clamp(20 + (pr.buildings.police||0)*30 + Math.min(pr.units.filter(u=>u.nation===nid).length*5,40) - pr.crime*0.5, 0, 100);
  hf.environment = clamp(100 - pr.pollution*8 + (pr.buildings.park||0)*10, 0, 100);
  for (const ae of S.activeEffects) if (ae.happiness_delta) for (const k of Object.keys(hf)) hf[k] = clamp(hf[k]+ae.happiness_delta*0.05, 0, 100);
  return clamp(hf.food*0.20 + hf.healthcare*0.15 + hf.education*0.15 + hf.entertainment*0.10 + hf.employment*0.20 + hf.safety*0.10 + hf.environment*0.10, 0, 100);
}
function updatePopulation() {
  for (const pr of S.provinces) {
    if (pr.nation < 0) continue;
    pr.happiness = calcHappiness(pr);
    const gr = (pr.happiness-50)*0.00002*(hasTech(pr.nation,'universal_healthcare')?1.10:1.0);
    pr.population = Math.max(0.1, pr.population*(1+gr));
    const polEff = (pr.buildings.police||0)*10;
    pr.crime = clamp(pr.crime + (pr.happiness<40?0.5:-0.3) - polEff*0.1, 0, 80);
    const pollSrc = (pr.buildings.industry||0)*1 + (pr.buildings.nuclear_plant||0)*5 + (pr.buildings.factory||0)*0.5;
    const pollDec = (pr.buildings.park||0)*0.5;
    pr.pollution = clamp(pr.pollution + (pollSrc-pollDec)*0.01, 0, 20);
    if (pr.happiness < REBELLION_THRESHOLD) pr.rebellion_timer = (pr.rebellion_timer||0) + 1;
    else pr.rebellion_timer = Math.max(0, (pr.rebellion_timer||0) - 2);
  }
  if (S.tick % 24 === 0) updateFactionPops();
}
function updateFactionPops() {
  for (const pr of S.provinces) {
    if (pr.nation < 0) continue;
    const hf = pr.happiness_factors, fp = pr.faction_pops;
    fp.militarist = clamp(fp.militarist + (pr.happiness<40?0.002:-0.001) + (S.wars.some(k=>k.split('|').map(Number).includes(pr.nation))?0.001:0), 0.05, 0.5);
    fp.capitalist  = clamp(fp.capitalist  + (hf.employment>70?0.002:hf.employment<40?-0.002:0), 0.05, 0.5);
    fp.communist   = clamp(fp.communist   + (hf.employment<40?0.003:hf.employment>70?-0.001:0), 0.05, 0.5);
    fp.environmentalist = clamp(fp.environmentalist + (pr.pollution>5?0.002:pr.pollution<1?-0.001:0), 0.05, 0.5);
    fp.intellectual = clamp(fp.intellectual + (hf.education>70?0.002:hf.education<30?-0.001:0), 0.05, 0.5);
    fp.religious   = clamp(fp.religious   + (S.nations[pr.nation].activeEdicts.includes('state_religion')?0.002:-0.0005), 0.05, 0.5);
    const sum = FACTION_KEYS.reduce((a,k)=>a+fp[k],0);
    for (const k of FACTION_KEYS) fp[k] /= sum;
  }
}
function checkRebellion() {
  for (const pr of S.provinces) {
    if ((pr.rebellion_timer||0) < REBELLION_HOURS) continue;
    if ((pr.buildings.police||0) >= 2) { pr.rebellion_timer = 0; continue; }
    pr.units.push(mkUnit('militia', -1));
    pr.units.push(mkUnit('militia', -1));
    pr.rebellion_timer = 0;
    if (pr.nation === S.player) log('Rebellion in ' + MAP.provinces[pr.id].name + '!', true);
  }
}

/* ===== POLITICS ===== */
function calcNationApproval(nid) {
  const n = S.nations[nid];
  let total = 0, totalPop = 0;
  for (const pr of S.provinces) {
    if (pr.nation !== nid) continue;
    for (const fk of FACTION_KEYS) {
      total += pr.faction_pops[fk] * (n.faction_approval[fk]||50) * pr.population;
      totalPop += pr.faction_pops[fk] * pr.population;
    }
  }
  const base = totalPop > 0 ? total/totalPop : 50;
  return clamp(base + getEdictBonus(nid,'approval_bonus') + (hasTech(nid,'media_control')?5:0), 0, 100);
}
function updatePolitics() {
  for (const n of S.nations) {
    if (n.dead) continue;
    const fa = n.faction_approval;
    const isAtWar = S.wars.some(k => k.split('|').map(Number).includes(n.id));
    if (isAtWar) { fa.militarist=Math.min(100,fa.militarist+0.05); fa.communist=Math.max(0,fa.communist-0.02); fa.environmentalist=Math.max(0,fa.environmentalist-0.03); }
    else          { fa.militarist=Math.max(30,fa.militarist-0.02); }
    if (n.money > 5000) { fa.capitalist=Math.min(100,fa.capitalist+0.03); fa.communist=Math.max(0,fa.communist-0.02); }
    else if (n.money < 500) { fa.capitalist=Math.max(0,fa.capitalist-0.03); fa.communist=Math.min(100,fa.communist+0.03); }
    if (n.research) fa.intellectual = Math.min(100, fa.intellectual+0.01);
    for (const eid of n.activeEdicts) {
      const e = EDICTS.find(x=>x.id===eid); if (!e) continue;
      for (const fk of FACTION_KEYS) { const key=fk+'_approval'; if (e.effects[key]) fa[fk]=clamp(fa[fk]+e.effects[key]*0.001,0,100); }
    }
    for (const fk of FACTION_KEYS) fa[fk] = clamp(fa[fk], 0, 100);
    n.approval = calcNationApproval(n.id);
    if (n.id === S.player && S.tick >= n.nextElection && !S.pendingElection && !S.pendingEvent) {
      S.pendingElection = true; S.speed = 0; markDirty('all');
    }
    if (n.ai && S.tick >= n.nextElection) n.nextElection = S.tick + ELECTION_INTERVAL;
  }
}
function enactEdict(edictId) {
  const n = S.nations[S.player];
  const e = EDICTS.find(x=>x.id===edictId); if (!e) return false;
  if (n.activeEdicts.includes(edictId)) return false;
  if ((n.political_will||0) < e.pw) return false;
  for (const c of e.conflicts) { const idx=n.activeEdicts.indexOf(c); if(idx>=0) n.activeEdicts.splice(idx,1); }
  n.political_will -= e.pw;
  n.activeEdicts.push(edictId);
  for (const fk of FACTION_KEYS) { const key=fk+'_approval'; if (e.effects[key]) n.faction_approval[fk]=clamp(n.faction_approval[fk]+e.effects[key],0,100); }
  log('Edict enacted: ' + e.name + '.', true);
  markDirty('politics'); return true;
}
function revokeEdict(edictId) {
  const idx = S.nations[S.player].activeEdicts.indexOf(edictId);
  if (idx >= 0) { S.nations[S.player].activeEdicts.splice(idx,1); markDirty('politics'); }
}
function resolveElectionResult(won) {
  const n = S.nations[S.player];
  n.nextElection = S.tick + ELECTION_INTERVAL;
  S.pendingElection = false;
  if (!won) {
    const myPr = S.provinces.filter(p=>p.nation===S.player);
    const border = myPr.filter(p=>MAP.provinces[p.id].adj.some(a=>S.provinces[a].nation!==S.player));
    const tolose = Math.ceil(border.length*0.10);
    const srng = mulberry32(S.tick);
    shuffle(border, srng);
    for (let i = 0; i < Math.min(tolose,border.length); i++) {
      const pr = border[i]; if (pr.capital) continue;
      const en = MAP.provinces[pr.id].adj.map(a=>S.provinces[a]).find(p=>p.nation!==S.player&&!S.nations[p.nation].dead);
      captureProvince(pr, en ? en.nation : -1);
    }
    n.approval = 40;
    log('Election lost. Popular unrest costs you territory.', true);
  } else {
    log('Election won! ' + n.name + ' continues to rule.', true);
    n.approval = Math.max(n.approval, 55);
  }
  markDirty('all');
}

/* ===== ESPIONAGE ===== */
const SPY_OPS = [
  { id:'build_network',    name:'Build Network',        cost:{money:1000},        time:24, lvl:0, desc:'Increase spy network level in target nation.' },
  { id:'gather_intel',     name:'Gather Intel',         cost:{money:500},         time:12, lvl:1, desc:'Reveal enemy resources and military for 48h.' },
  { id:'steal_tech',       name:'Steal Technology',     cost:{money:1500},        time:36, lvl:2, desc:'30% chance to acquire one enemy technology.' },
  { id:'sabotage_factory', name:'Sabotage Buildings',   cost:{money:1200},        time:24, lvl:2, desc:'Destroy 1 level of a random enemy building.' },
  { id:'incite_rebellion', name:'Incite Rebellion',     cost:{money:2000,political_will:20}, time:48, lvl:3, desc:'Spawn rebel militia in an enemy province.' },
  { id:'assassinate',      name:'Assassinate Official', cost:{money:2500,political_will:30}, time:48, lvl:3, desc:'Reduce enemy approval for 72h.' },
  { id:'propaganda',       name:'Propaganda Campaign',  cost:{money:1000},        time:18, lvl:2, desc:'Reduce enemy faction approval.' },
];
function startSpyOp(targetNid, opId) {
  const n = S.nations[S.player];
  const op = SPY_OPS.find(o=>o.id===opId); if (!op) return false;
  const lvl = n.spyNets[targetNid]||0;
  if (lvl < op.lvl) return false;
  if (!canAfford(n, op.cost)) return false;
  payResources(n, op.cost);
  const timeAdj = hasTech(S.player,'media_control') ? 0.8 : 1.0;
  S.spyOps.push({ opId, targetNid, actorNid:S.player, hoursLeft:op.time*timeAdj });
  log('Spy op launched: ' + op.name + '.'); markDirty('intel'); return true;
}
function tickEspionage() {
  for (let i = S.spyOps.length-1; i >= 0; i--) {
    S.spyOps[i].hoursLeft--;
    if (S.spyOps[i].hoursLeft <= 0) { resolveSpyOp(S.spyOps[i]); S.spyOps.splice(i,1); }
  }
}
function resolveSpyOp(op) {
  const target = S.nations[op.targetNid], actor = S.nations[op.actorNid];
  const defBonus = target.activeEdicts.includes('censorship') ? 1.15 : 1.0;
  const success = Math.random() < clamp(0.55 + (actor.spyNets[op.targetNid]||0)*0.08 - defBonus*0.1, 0.1, 0.9);
  switch (op.opId) {
    case 'build_network':
      actor.spyNets[op.targetNid] = Math.min(5, (actor.spyNets[op.targetNid]||0)+1);
      if (op.actorNid===S.player) log('Spy network level raised in '+target.name+'.');
      break;
    case 'gather_intel':
      if (success) {
        actor.intelCache[op.targetNid] = { money:target.money, food:target.food, oil:target.oil, steel:target.steel, military:nationStrength(op.targetNid), expires:S.tick+48 };
        if (op.actorNid===S.player) { log('Intel gathered on '+target.name+'.'); markDirty('intel'); }
      }
      break;
    case 'steal_tech':
      if (success) {
        const avail = getAllTechs().filter(t=>target.techsDone.includes(t.id)&&!actor.techsDone.includes(t.id));
        if (avail.length) { const t=pick(avail,mulberry32(S.tick)); actor.techsDone.push(t.id); if(op.actorNid===S.player) log('Technology stolen: '+t.name+'!',true); }
      } else if (op.actorNid===S.player) log('Steal technology op failed.');
      break;
    case 'sabotage_factory':
      if (success) {
        const tpr = S.provinces.find(p=>p.nation===op.targetNid&&Object.values(p.buildings).some(v=>v>0));
        if (tpr) { const bk=Object.entries(tpr.buildings).filter(([,v])=>v>0).map(([k])=>k); if(bk.length){const k=bk[0];tpr.buildings[k]=Math.max(0,tpr.buildings[k]-1);} }
        if (op.actorNid===S.player) log('Sabotage successful in '+target.name+'!',true);
      } else if (op.actorNid===S.player) log('Sabotage op failed.');
      break;
    case 'incite_rebellion':
      if (success) {
        const ep=S.provinces.filter(p=>p.nation===op.targetNid&&p.happiness<60);
        if (ep.length) { const pr=pick(ep,mulberry32(S.tick)); pr.units.push(mkUnit('militia',-1)); pr.units.push(mkUnit('militia',-1)); if(op.actorNid===S.player) log('Rebellion incited in '+target.name+'!',true); }
      }
      break;
    case 'assassinate':
      if (success) {
        target.approval = Math.max(0, target.approval-15);
        if (op.actorNid===S.player) log('Assassination op succeeded. '+target.name+' in disarray!',true);
      }
      break;
    case 'propaganda':
      if (success) { for (const fk of FACTION_KEYS) target.faction_approval[fk]=Math.max(0,target.faction_approval[fk]-5); if(op.actorNid===S.player) log('Propaganda effective against '+target.name+'.'); }
      break;
  }
}

/* ===== EVENTS ===== */
function maybeFireEvent() {
  if (S.pendingEvent || S.pendingElection) return;
  if (S.tick < S.nextEvent) return;
  const eligible = RANDOM_EVENTS.filter(e => { try { return e.condition(S); } catch (_) { return true; } });
  if (!eligible.length) return;
  const evt = pick(eligible, mulberry32(S.tick ^ 0xdeadbeef));
  S.pendingEvent = evt;
  S.speed = 0;
  S.nextEvent = S.tick + EVENT_INTERVAL_MIN + Math.floor(Math.random()*(EVENT_INTERVAL_MAX-EVENT_INTERVAL_MIN));
  markDirty('events');
}
function resolveEventChoice(eventId, choiceIdx) {
  const evt = RANDOM_EVENTS.find(e=>e.id===eventId); if (!evt) return;
  const choice = evt.choices[choiceIdx]; if (!choice) return;
  if (choice.effect.cost) payResources(S.nations[S.player], choice.effect.cost);
  applyEventEffect(choice.effect);
  S.pendingEvent = null;
  if (!S.pendingElection) S.speed = Math.max(1, S.speed||1);
  markDirty('events');
}
function applyEventEffect(eff) {
  const n = S.nations[S.player];
  switch (eff.type) {
    case 'resource_bonus':
      S.activeEffects.push({ name:eff.type, resource:eff.resource, pct:eff.pct, bonus:true,  hoursLeft:eff.duration||24, desc:'+'+eff.pct+'% '+eff.resource });
      break;
    case 'resource_penalty':
      S.activeEffects.push({ name:eff.type, resource:eff.resource, pct:eff.pct, bonus:false, hoursLeft:eff.duration||24, desc:'-'+eff.pct+'% '+eff.resource });
      if (eff.happiness_delta) S.activeEffects.push({ name:'hap_penalty', hoursLeft:eff.duration||24, happiness_delta:eff.happiness_delta, desc:'Happiness effect' });
      break;
    case 'approval_change':
      n.approval = clamp(n.approval+(eff.delta||0), 0, 100);
      if (eff.faction) n.faction_approval[eff.faction] = clamp((n.faction_approval[eff.faction]||50)+(eff.faction_delta||0), 0, 100);
      if (eff.faction2) n.faction_approval[eff.faction2] = clamp((n.faction_approval[eff.faction2]||50)+(eff.faction2_delta||0), 0, 100);
      break;
    case 'happiness_boost':
      for (const pr of S.provinces) if (pr.nation===S.player) pr.happiness=Math.min(100,pr.happiness+(eff.delta||0));
      break;
    case 'faction_approval':
      if (eff.faction) n.faction_approval[eff.faction] = clamp((n.faction_approval[eff.faction]||50)+(eff.delta||0), 0, 100);
      if (eff.faction2) n.faction_approval[eff.faction2] = clamp((n.faction_approval[eff.faction2]||50)+(eff.faction2_delta||0), 0, 100);
      break;
    case 'research_boost':
      if (n.research) n.research.hoursLeft = Math.max(1, n.research.hoursLeft-12);
      break;
    case 'research_discount':
      S.activeEffects.push({ name:'research_disc', hoursLeft:eff.duration||48, research_disc_tree:eff.tree, research_disc_pct:eff.pct, desc:eff.pct+'% research discount' });
      if (eff.faction) n.faction_approval[eff.faction] = clamp((n.faction_approval[eff.faction]||50)+(eff.faction_delta||0), 0, 100);
      break;
    case 'pop_loss':
      for (const pr of S.provinces) if (pr.nation===S.player) pr.population=Math.max(0.2,pr.population*(1-eff.pct/100));
      if (eff.happiness_delta) for (const pr of S.provinces) if (pr.nation===S.player) pr.happiness=clamp(pr.happiness+eff.happiness_delta,0,100);
      break;
    case 'building_damage': {
      const myp = S.provinces.filter(p=>p.nation===S.player);
      if (myp.length) { const pr=pick(myp,mulberry32(S.tick)); const bk=Object.entries(pr.buildings).filter(([,v])=>v>0).map(([k])=>k); if(bk.length){for(let i=0;i<(eff.levels||1)&&i<bk.length;i++)pr.buildings[bk[i]]=Math.max(0,pr.buildings[bk[i]]-1);} }
      break; }
    case 'relations_all':
      for (let i = 0; i < NATION_COUNT; i++) if (i!==S.player&&!S.nations[i].dead) modRelation(S.player,i,eff.delta||0);
      if (eff.approval_delta) n.approval = clamp(n.approval+(eff.approval_delta||0), 0, 100);
      break;
    case 'defect_unit': {
      const wk = S.wars.find(k=>k.split('|').map(Number).includes(S.player));
      if (wk) { const eid=wk.split('|').map(Number).find(x=>x!==S.player); const ep=S.provinces.find(p=>p.nation===eid&&MAP.provinces[p.id].adj.some(a=>S.provinces[a].nation===S.player)); if(ep&&ep.units.length){const u=ep.units.pop();u.nation=S.player;const mp2=S.provinces.find(p=>p.nation===S.player&&MAP.provinces[p.id].adj.includes(ep.id));if(mp2)mp2.units.push(u);} }
      break; }
    case 'relations_enemy': {
      const wk2=S.wars.find(k=>k.split('|').map(Number).includes(S.player));
      if(wk2){const eid2=wk2.split('|').map(Number).find(x=>x!==S.player);modRelation(S.player,eid2,eff.delta||0);}
      break; }
  }
  if (eff.relations_all_delta) for (let i=0;i<NATION_COUNT;i++) if(i!==S.player&&!S.nations[i].dead) modRelation(S.player,i,eff.relations_all_delta);
}
function tickActiveEffects() {
  for (let i = S.activeEffects.length-1; i >= 0; i--) {
    S.activeEffects[i].hoursLeft--;
    if (S.activeEffects[i].hoursLeft <= 0) S.activeEffects.splice(i,1);
  }
}

/* ===== MILITARY ORDERS ===== */
function orderMove(nation, from, unitIds, to) {
  const pr = S.provinces[from];
  const units = pr.units.filter(u=>unitIds.includes(u.id)&&u.nation===nation&&UNIT_TYPES[u.type].cls==='land');
  if (!units.length) return false;
  const path = findLandPath(nation, from, to);
  if (!path||path.length<2) return false;
  pr.units = pr.units.filter(u=>!units.includes(u));
  const step = stepTime(nation, units, path[1]);
  S.moves.push({ id:moveSeq++, nation, unitObjs:units, path, stepIndex:0, hoursLeft:step, stepHours:step, type:'land' });
  return true;
}
function orderNavalMove(nation, from, unitIds, to) {
  const pr = S.provinces[from];
  const units = pr.units.filter(u=>unitIds.includes(u.id)&&u.nation===nation&&UNIT_TYPES[u.type].cls==='naval');
  if (!units.length) return false;
  const path = findNavalPath(nation, from, to);
  if (!path||path.length<2) return false;
  pr.units = pr.units.filter(u=>!units.includes(u));
  const step = seaStepTime(path[0], path[1]);
  S.moves.push({ id:moveSeq++, nation, unitObjs:units, path, stepIndex:0, hoursLeft:step, stepHours:step, type:'naval' });
  return true;
}
function orderAirStrike(nation, fromPid, targetPid) {
  const pr = S.provinces[fromPid];
  if (pr.nation!==nation||!pr.buildings.airbase) return false;
  const planes = pr.units.filter(u=>u.nation===nation&&UNIT_TYPES[u.type].cls==='air'&&u.cooldown<=0);
  if (!planes.length) return false;
  let rangeBonus = 0;
  for (const sp of MAP.provinces[fromPid].seaAdj) { const spr=S.provinces[sp]; if(!spr) continue; if(spr.units.some(u=>u.nation===nation&&u.type==='carrier')) rangeBonus=Math.max(rangeBonus,5); }
  const range = Math.max(...planes.map(u=>UNIT_TYPES[u.type].range||5)) + rangeBonus;
  const dists = graphDistance(fromPid, range);
  if (dists[targetPid]<0||dists[targetPid]>range) return false;
  const tp = S.provinces[targetPid];
  const enemies = tp.units.filter(u=>atWar(nation,u.nation)||u.nation===-1);
  if (!enemies.length && !atWar(nation,tp.nation)) return false;
  let aaDmg = (tp.buildings.aa_battery||0)*8;
  aaDmg += tp.units.filter(u=>u.type==='aa'&&(u.nation===tp.nation||inAlliance(u.nation,tp.nation))).length*UNIT_TYPES.aa.aaDef;
  applyDamageToGroup(planes, aaDmg*0.08);
  pr.units = pr.units.filter(u=>u.hp>0.5);
  let dmg = 0;
  for (const u of planes) {
    if (u.hp <= 0.5) continue;
    const armouredTargets = enemies.some(e=>e.type==='arm'||e.type==='heavy_arm');
    dmg += effAtk(nation,u.type) * (u.hp/UNIT_TYPES[u.type].hp) * (u.type==='ah'&&armouredTargets?1.5:1.0);
    u.cooldown = UNIT_TYPES[u.type].cooldown||6;
  }
  applyDamageToGroup(enemies, dmg);
  tp.units = tp.units.filter(u=>u.hp>0.5);
  log(S.nations[nation].name+' air strike on '+MAP.provinces[targetPid].name+'.');
  markDirty('province','military'); return true;
}
function launchMissile(nation, fromPid, targetPid) {
  const pr = S.provinces[fromPid];
  if (pr.nation!==nation||!pr.buildings.missile_silo) return false;
  const missile = pr.units.find(u=>u.nation===nation&&(u.type==='srbm'||u.type==='nuke'));
  if (!missile) return false;
  const T = UNIT_TYPES[missile.type];
  if (!T.strikeRange) return false;
  const dists = graphDistance(fromPid, T.strikeRange);
  if (dists[targetPid]<0||dists[targetPid]>T.strikeRange) return false;
  const tp = S.provinces[targetPid];
  if (!atWar(nation,tp.nation)&&tp.nation>=0) return false;
  applyDamageToGroup(tp.units, T.strikeDmg);
  tp.units = tp.units.filter(u=>u.hp>0.5);
  if (missile.type==='nuke') {
    for (const bk of Object.keys(tp.buildings)) tp.buildings[bk]=Math.max(0,tp.buildings[bk]-1);
    for (let i=0;i<NATION_COUNT;i++) if(i!==nation) modRelation(nation,i,-50);
    log('☢ '+S.nations[nation].name+' launched a NUCLEAR STRIKE on '+MAP.provinces[targetPid].name+'!!!',true);
  } else {
    const bk=Object.entries(tp.buildings).filter(([,v])=>v>0).map(([k])=>k);
    if(bk.length) tp.buildings[bk[0]]=Math.max(0,tp.buildings[bk[0]]-1);
    log(S.nations[nation].name+' SRBM strike on '+MAP.provinces[targetPid].name+'.',true);
  }
  pr.units.splice(pr.units.indexOf(missile),1);
  markDirty('province','military'); return true;
}

/* ===== COMBAT ===== */
function applyDamageToGroup(units, total) {
  if (!units.length||total<=0) return;
  let rem = total;
  for (const u of units) { if(rem<=0)break; const d=Math.min(u.hp,rem/units.length+rem*0.05); u.hp-=d; rem-=d; }
  for (const u of units) { if(rem<=0)break; const d=Math.min(u.hp,rem); u.hp-=d; rem-=d; }
}
function calcSideDmg(nation, units, pr) {
  let total = 0;
  for (const u of units) {
    const atkV = effAtk(nation, u.type);
    const expB = 1 + (u.experience||0)*0.003;
    total += atkV * (u.hp/UNIT_TYPES[u.type].hp) * expB;
  }
  return total * 0.12 * (0.85+Math.random()*0.3);
}
function resolveCombat() {
  for (const pr of S.provinces) {
    if (pr.units.length < 2) continue;
    const byNat = new Map();
    for (const u of pr.units) { if(!byNat.has(u.nation)) byNat.set(u.nation,[]); byNat.get(u.nation).push(u); }
    if (byNat.size < 2) continue;
    const nats = [...byNat.keys()];
    const dmgTo = new Map(nats.map(n=>[n,0]));
    let anyFight = false;
    for (let i=0;i<nats.length;i++) for (let j=i+1;j<nats.length;j++) {
      const a=nats[i], b=nats[j];
      if (a!==-1&&b!==-1&&!atWar(a,b)) continue;
      anyFight = true;
      dmgTo.set(b, dmgTo.get(b)+calcSideDmg(a,byNat.get(a).filter(u=>UNIT_TYPES[u.type].cls==='land'),pr));
      dmgTo.set(a, dmgTo.get(a)+calcSideDmg(b,byNat.get(b).filter(u=>UNIT_TYPES[u.type].cls==='land'),pr));
    }
    if (!anyFight) continue;
    for (const [nid,dmg] of dmgTo) {
      if (dmg<=0) continue;
      const defMult = nid===pr.nation ? Math.max(0.4,1-(pr.buildings.fort||0)*0.15)/TERRAINS[MAP.provinces[pr.id].terrain].defMult : 1.0;
      const land = byNat.get(nid).filter(u=>UNIT_TYPES[u.type].cls==='land');
      applyDamageToGroup(land, dmg*defMult);
      for (const u of land) if (u.hp>0) u.experience=Math.min(100,(u.experience||0)+0.5);
    }
    pr.units = pr.units.filter(u=>u.hp>0.5);
    // routed units flee
    for (const [nid,units] of byNat) {
      for (const u of units) {
        if (u.hp>0&&u.hp<UNIT_TYPES[u.type].hp*0.2&&Math.random()<0.4) {
          const fl=findNearestFriendly(pr.id,nid);
          if (fl!==pr.id) { pr.units=pr.units.filter(x=>x!==u); S.provinces[fl].units.push(u); }
        }
      }
    }
  }
  // naval combat in same coastal province
  for (const pr of S.provinces) {
    const byNat2 = new Map();
    for (const u of pr.units) if(UNIT_TYPES[u.type].cls==='naval'){if(!byNat2.has(u.nation))byNat2.set(u.nation,[]);byNat2.get(u.nation).push(u);}
    if (byNat2.size < 2) continue;
    const nats2 = [...byNat2.keys()];
    for (let i=0;i<nats2.length;i++) for (let j=i+1;j<nats2.length;j++) {
      const a=nats2[i],b=nats2[j]; if(!atWar(a,b)) continue;
      const au=byNat2.get(a).filter(u=>!UNIT_TYPES[u.type].stealth||byNat2.get(b).some(x=>UNIT_TYPES[x.type].subHunter));
      const bu=byNat2.get(b).filter(u=>!UNIT_TYPES[u.type].stealth||byNat2.get(a).some(x=>UNIT_TYPES[x.type].subHunter));
      applyDamageToGroup(bu, calcSideDmg(a,au,pr));
      applyDamageToGroup(au, calcSideDmg(b,bu,pr));
    }
    pr.units = pr.units.filter(u=>u.hp>0.5);
  }
  // artillery bombardment
  for (const pr of S.provinces) {
    const arts = pr.units.filter(u=>u.type==='art'||u.type==='mlrs');
    if (!arts.length) continue;
    for (const a of arts) {
      const range = UNIT_TYPES[a.type].range||1;
      const dists = graphDistance(pr.id, range);
      let bTarget=-1, bCount=0;
      for (let pid=0;pid<S.provinces.length;pid++) {
        if(dists[pid]<1||dists[pid]>range) continue;
        const ec=S.provinces[pid].units.filter(u=>atWar(a.nation,u.nation)||u.nation===-1).length;
        if(ec>bCount){bCount=ec;bTarget=pid;}
      }
      if (bTarget>=0) {
        const tp=S.provinces[bTarget];
        const en=tp.units.filter(u=>atWar(a.nation,u.nation)||u.nation===-1);
        applyDamageToGroup(en, (UNIT_TYPES[a.type].ranged||10)*0.10*(a.hp/UNIT_TYPES[a.type].hp));
        tp.units=tp.units.filter(u=>u.hp>0.5);
      }
    }
  }
}
function checkCaptures() {
  for (const pr of S.provinces) {
    const def = pr.nation;
    if (pr.units.filter(u=>u.nation===def&&UNIT_TYPES[u.type].cls==='land').length) continue;
    const inv = pr.units.find(u=>u.nation!==def&&u.nation!==-1&&UNIT_TYPES[u.type].cls==='land'&&(def<0||atWar(u.nation,def)));
    if (inv) captureProvince(pr, inv.nation);
  }
}
function captureProvince(pr, captor) {
  const old = pr.nation;
  pr.nation = captor;
  pr.buildings.fort = Math.max(0,(pr.buildings.fort||0)-1);
  pr.buildQueue = [];
  baseDirty = true; markDirty('nations','province','build');
  if (captor===S.player||old===S.player)
    log(S.nations[captor<0?S.player:captor].name+' captures '+MAP.provinces[pr.id].name+(pr.capital?' — capital!':'')+'.',pr.capital);
  if (pr.capital&&old>=0) for (const p of S.provinces) if(p.nation===old) p.happiness=Math.max(p.happiness-20,10);
  checkElimination(old);
}
function checkElimination(nid) {
  if (nid < 0 || S.nations[nid].dead) return;
  if (provinceCount(nid) > 0) return;
  const n = S.nations[nid]; n.dead = true;
  for (const pr of S.provinces) pr.units=pr.units.filter(u=>u.nation!==nid);
  S.moves = S.moves.filter(m=>m.nation!==nid);
  S.wars = S.wars.filter(k=>!k.split('|').map(Number).includes(nid));
  log(n.name+' has been eliminated!', true); markDirty('nations');
}

/* ===== SUPPLY ===== */
function distToFriendly(from, nid) {
  const vis=new Set([from]); const q=[[from,0]];
  for (let qi=0;qi<q.length;qi++) {
    const [p,d]=q[qi]; if(S.provinces[p].nation===nid) return d;
    for (const o of MAP.provinces[p].adj) if(!vis.has(o)){vis.add(o);q.push([o,d+1]);}
  }
  return 999;
}
function checkSupply() {
  for (const pr of S.provinces) {
    for (const u of pr.units) {
      if (UNIT_TYPES[u.type].cls!=='land') continue;
      const rad = SUPPLY_RADIUS + (pr.units.some(x=>x.type==='supply'&&x.nation===u.nation)?3:0);
      const d = distToFriendly(pr.id, u.nation);
      if (d > rad) { u.supplyDeficit=(u.supplyDeficit||0)+1; if(u.supplyDeficit>3) u.hp=Math.max(1,u.hp-0.3); }
      else u.supplyDeficit=Math.max(0,(u.supplyDeficit||0)-1);
    }
  }
}

/* ===== RESEARCH ===== */
function tickResearch() {
  for (const n of S.nations) {
    if (n.dead||!n.research) continue;
    let spd = 1.0;
    for (const pr of S.provinces) if(pr.nation===n.id) spd+=(pr.buildings.school||0)*0.05+(pr.buildings.university||0)*0.10;
    if (hasTech(n.id,'public_education'))   spd+=0.15;
    if (hasTech(n.id,'advanced_computing')) spd+=0.20;
    if (hasTech(n.id,'space_program'))      spd+=0.30;
    spd += getEdictBonus(n.id,'research_speed');
    for (const ae of S.activeEffects) if(ae.research_disc_tree&&(ae.research_disc_tree===n.research.tree||ae.research_disc_tree==='all')) spd+=ae.research_disc_pct/100;
    n.research.hoursLeft -= spd;
    if (n.research.hoursLeft <= 0) {
      n.techsDone.push(n.research.id);
      const tree = TECH_TREES[n.research.tree];
      const tech = tree.techs.find(t=>t.id===n.research.id);
      if (n.id===S.player) log('Research complete: '+tech.name+'!', true);
      n.research = null; markDirty('research');
    }
  }
}
function tickBuildQueues() {
  for (const pr of S.provinces) {
    if (!pr.buildQueue.length) continue;
    const job = pr.buildQueue[0];
    const speedMult = (pr.buildings.command_hq?0.85:1.0) * (hasTech(pr.nation,'mass_production')?0.80:1.0);
    job.hoursLeft -= 1/speedMult;
    if (job.hoursLeft <= 0) {
      pr.buildQueue.shift();
      if (job.kind==='building') {
        pr.buildings[job.type]=(pr.buildings[job.type]||0)+1;
        if(pr.nation===S.player) log(BUILDING_TYPES[job.type].name+' completed in '+MAP.provinces[pr.id].name+'.');
      } else {
        pr.units.push(mkUnit(job.type, pr.nation));
        if(pr.nation===S.player) log(UNIT_TYPES[job.type].name+' ready in '+MAP.provinces[pr.id].name+'.');
      }
      if (pr.id===selectedProvince) markDirty('province','build','military');
    }
  }
}
function tickMoves() {
  for (let i=S.moves.length-1;i>=0;i--) {
    const mv=S.moves[i]; mv.hoursLeft--;
    if (mv.hoursLeft>0) continue;
    mv.stepIndex++;
    const here=mv.path[mv.stepIndex];
    const pr=S.provinces[here];
    const last=mv.stepIndex===mv.path.length-1;
    if (last) { for(const u of mv.unitObjs) pr.units.push(u); S.moves.splice(i,1); if(here===selectedProvince) markDirty('province','military'); }
    else {
      const next=mv.path[mv.stepIndex+1], nPr=S.provinces[next];
      const ok=mv.type==='naval'?true:(nPr.nation===mv.nation||nPr.nation<0||atWar(mv.nation,nPr.nation));
      if (!ok) { for(const u of mv.unitObjs) pr.units.push(u); S.moves.splice(i,1); }
      else {
        const step=mv.type==='naval'?seaStepTime(here,next):stepTime(mv.nation,mv.unitObjs,next);
        mv.hoursLeft=step; mv.stepHours=step;
      }
    }
  }
}

/* ===== MAIN TICK ===== */
function gameTick() {
  if (!S||S.ended) return;
  S.tick++;
  applyEconomy();
  tickResearch();
  tickBuildQueues();
  tickMoves();
  tickEspionage();
  if (S.tick%6===0) { checkSupply(); updatePopulation(); checkRebellion(); }
  if (S.tick%12===0) updatePolitics();
  resolveCombat();
  checkCaptures();
  tickActiveEffects();
  if (S.tick>=S.nextWorldCouncil) { S.nextWorldCouncil=S.tick+WORLD_COUNCIL_INTERVAL; runWorldCouncil(); }
  if (!S.pendingEvent&&!S.pendingElection) maybeFireEvent();
  if (!S.ended) {
    const tot=S.provinces.length, mine=provinceCount(S.player);
    if (mine===0&&!S.moves.some(m=>m.nation===S.player)) endGame(false);
    else if (mine/tot>=WIN_SHARE) endGame(true);
  }
  if (S.tick%4===0) markDirty('topbar','nations');
}
function runWorldCouncil() {
  const issues = ['trade','security','environment','humanitarian aid','nuclear disarmament'];
  log('World Council: '+pick(issues,mulberry32(S.tick))+' debate.');
  if (S.wars.length>0) for (const wk of S.wars) { const [a,b]=wk.split('|').map(Number); modRelation(a,b,-1); }
}
function endGame(won) {
  S.ended=true; S.speed=0;
  document.querySelectorAll('.spd').forEach(b=>b.classList.toggle('active',b.dataset.spd==='0'));
  document.getElementById('end-title').textContent = won?'Victory!':'Defeat';
  document.getElementById('end-text').textContent = won
    ? S.nations[S.player].name+' dominates the world after '+Math.floor(S.tick/24)+' days.'
    : S.nations[S.player].name+' has been erased from history.';
  document.getElementById('end-modal').classList.remove('hidden');
}
