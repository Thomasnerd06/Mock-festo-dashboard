/* World Conflict — an original single-player real-time grand strategy game.
   Everything is earned in-game; there is no premium currency or paid boost. */

"use strict";

/* ============================== Utilities ============================== */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function fmt(n) { return Math.floor(n).toLocaleString("en-GB"); }

/* ============================== Static data ============================== */

const MAPW = 480, MAPH = 270;          // index-map resolution (cells)
const PROVINCE_COUNT = 78;
const NATION_COUNT = 8;
const WIN_SHARE = 0.55;
const TICKS_PER_SEC = [0, 1, 5, 20];   // speed settings (game hours per real second)

const NATION_DEFS = [
  { name: "Arvenia",       color: "#d6494f" },
  { name: "Boreal Union",  color: "#4d7fd6" },
  { name: "Cestria",       color: "#53b364" },
  { name: "Drakmar",       color: "#d6a138" },
  { name: "Ostrava",       color: "#9259c9" },
  { name: "Veridia",       color: "#3cb5b0" },
  { name: "Khalend",       color: "#d66ba6" },
  { name: "Tervany",       color: "#9a7a52" },
];

const TERRAINS = {
  plains:   { name: "Plains",   moveMult: 1.0, defMult: 1.0,  shade: 0 },
  forest:   { name: "Forest",   moveMult: 1.2, defMult: 1.15, shade: -14 },
  mountain: { name: "Mountain", moveMult: 1.6, defMult: 1.35, shade: -30 },
};

const UNIT_TYPES = {
  inf: { name: "Infantry",      cls: "land", atk: 4,  def: 7,  hp: 22, spd: 3.0,
         cost: { money: 300,  supplies: 100, oil: 0,   manpower: 2 }, time: 4,  upkeep: 0.4,
         req: null,        building: "barracks", icon: "▣" },
  mot: { name: "Motorised Inf", cls: "land", atk: 6,  def: 6,  hp: 24, spd: 1.5,
         cost: { money: 550,  supplies: 150, oil: 40,  manpower: 2 }, time: 6,  upkeep: 0.6,
         req: "motorised", building: "barracks", icon: "▤" },
  arm: { name: "Armoured",      cls: "land", atk: 12, def: 8,  hp: 32, spd: 2.0,
         cost: { money: 950,  supplies: 250, oil: 120, manpower: 3 }, time: 10, upkeep: 1.1,
         req: "armour",    building: "factory",  icon: "◆" },
  art: { name: "Artillery",     cls: "land", atk: 3,  def: 3,  hp: 18, spd: 3.0, ranged: 9,
         cost: { money: 700,  supplies: 220, oil: 50,  manpower: 3 }, time: 8,  upkeep: 0.8,
         req: "artillery", building: "factory",  icon: "✚" },
  fig: { name: "Fighter",       cls: "air",  atk: 6,  def: 8,  hp: 20, spd: 0, range: 7,
         cost: { money: 1200, supplies: 200, oil: 150, manpower: 2 }, time: 12, upkeep: 1.4,
         req: "fighters",  building: "airbase",  icon: "✈" },
  bmb: { name: "Bomber",        cls: "air",  atk: 14, def: 3,  hp: 24, spd: 0, range: 9,
         cost: { money: 1500, supplies: 280, oil: 220, manpower: 2 }, time: 14, upkeep: 1.8,
         req: "bombers",   building: "airbase",  icon: "✈" },
};

const BUILDING_TYPES = {
  barracks: { name: "Barracks",   max: 1, time: 12, cost: { money: 600,  supplies: 200 },
              desc: "Allows infantry recruitment" },
  factory:  { name: "Arms Factory", max: 1, time: 24, cost: { money: 1500, supplies: 500 },
              desc: "Allows armour and artillery" },
  airbase:  { name: "Airbase",    max: 1, time: 24, cost: { money: 1200, supplies: 400 },
              desc: "Allows aircraft; required to fly missions" },
  industry: { name: "Industry",   max: 3, time: 30, cost: { money: 1800, supplies: 600 },
              desc: "+40% province output per level" },
  fort:     { name: "Fortress",   max: 3, time: 12, cost: { money: 500,  supplies: 300 },
              desc: "-15% damage to defenders per level" },
};

const TECHS = [
  { id: "motorised", name: "Motorised Warfare", time: 12, cost: 800,
    desc: "Unlocks Motorised Infantry", req: null },
  { id: "artillery", name: "Field Artillery",   time: 16, cost: 1000,
    desc: "Unlocks Artillery (bombards adjacent provinces)", req: null },
  { id: "armour",    name: "Armoured Corps",    time: 24, cost: 1600,
    desc: "Unlocks Armoured units", req: "motorised" },
  { id: "fighters",  name: "Air Superiority",   time: 24, cost: 1600,
    desc: "Unlocks Fighters", req: null },
  { id: "bombers",   name: "Strategic Bombing", time: 30, cost: 2200,
    desc: "Unlocks Bombers", req: "fighters" },
  { id: "inf2",      name: "Modern Infantry",   time: 20, cost: 1400,
    desc: "+25% infantry attack and defence", req: null },
  { id: "arm2",      name: "Composite Armour",  time: 30, cost: 2400,
    desc: "+25% armoured attack and defence", req: "armour" },
  { id: "logistics", name: "Logistics Network", time: 16, cost: 1200,
    desc: "Land units move 25% faster", req: null },
  { id: "economy",   name: "War Economy",       time: 20, cost: 1500,
    desc: "+25% money income", req: null },
];

const NAME_SYLLABLES = [
  "kar", "vel", "dor", "an", "is", "mor", "tan", "bel", "gra", "lun",
  "ost", "rav", "sel", "thu", "ver", "nor", "pol", "kes", "dra", "mir",
];

/* ============================== Game state ============================== */

let S = null;            // mutable game state
let MAP = null;          // generated map (derived from seed, not saved directly)
let unitSeq = 1;

const view = { x: 0, y: 0, scale: 2 };   // pan/zoom (map-cell coords -> screen)
let selectedProvince = -1;
let moveArming = false;                  // waiting for a move target click
let strikeArming = false;                // waiting for an air strike target click
let hoverProvince = -1;

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const baseCanvas = document.createElement("canvas");
baseCanvas.width = MAPW; baseCanvas.height = MAPH;
const baseCtx = baseCanvas.getContext("2d");
let baseDirty = true;

/* ============================== Map generation ============================== */

function makeNoise(rng, gridSize) {
  const g = [];
  for (let i = 0; i < gridSize * gridSize; i++) g.push(rng());
  return function (x, y) {
    const gx = x * (gridSize - 1), gy = y * (gridSize - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i = (xx, yy) => g[clamp(yy, 0, gridSize - 1) * gridSize + clamp(xx, 0, gridSize - 1)];
    const a = i(x0, y0) + (i(x0 + 1, y0) - i(x0, y0)) * sx;
    const b = i(x0, y0 + 1) + (i(x0 + 1, y0 + 1) - i(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function generateMap(seed) {
  const rng = mulberry32(seed);
  const n1 = makeNoise(rng, 6), n2 = makeNoise(rng, 12), n3 = makeNoise(rng, 24);

  // Elevation field; keep only the largest connected landmass so every
  // province is reachable by land.
  const elev = new Float32Array(MAPW * MAPH);
  const land = new Uint8Array(MAPW * MAPH);
  for (let y = 0; y < MAPH; y++) {
    for (let x = 0; x < MAPW; x++) {
      const u = x / MAPW, v = y / MAPH;
      let e = n1(u, v) * 0.55 + n2(u, v) * 0.3 + n3(u, v) * 0.15;
      // pull edges down so the landmass sits inside the frame
      const dx = u - 0.5, dy = v - 0.5;
      e -= (dx * dx + dy * dy) * 1.15;
      elev[y * MAPW + x] = e;
      land[y * MAPW + x] = e > 0.26 ? 1 : 0;
    }
  }

  // largest connected component (4-neighbour flood fill)
  const comp = new Int32Array(MAPW * MAPH).fill(-1);
  let bestComp = -1, bestSize = 0, nComp = 0;
  const stack = [];
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || comp[i] !== -1) continue;
    let size = 0;
    stack.push(i); comp[i] = nComp;
    while (stack.length) {
      const c = stack.pop(); size++;
      const cx = c % MAPW, cy = (c / MAPW) | 0;
      if (cx > 0        && land[c - 1]    && comp[c - 1] === -1)    { comp[c - 1] = nComp;    stack.push(c - 1); }
      if (cx < MAPW - 1 && land[c + 1]    && comp[c + 1] === -1)    { comp[c + 1] = nComp;    stack.push(c + 1); }
      if (cy > 0        && land[c - MAPW] && comp[c - MAPW] === -1) { comp[c - MAPW] = nComp; stack.push(c - MAPW); }
      if (cy < MAPH - 1 && land[c + MAPW] && comp[c + MAPW] === -1) { comp[c + MAPW] = nComp; stack.push(c + MAPW); }
    }
    if (size > bestSize) { bestSize = size; bestComp = nComp; }
    nComp++;
  }
  for (let i = 0; i < land.length; i++) if (comp[i] !== bestComp) land[i] = 0;

  // Province seeds: random land cells with a minimum spacing.
  const seeds = [];
  const minDist2 = 16 * 16;
  let attempts = 0;
  while (seeds.length < PROVINCE_COUNT && attempts < 30000) {
    attempts++;
    const x = (rng() * MAPW) | 0, y = (rng() * MAPH) | 0;
    if (!land[y * MAPW + x]) continue;
    let ok = true;
    for (const s of seeds) {
      const dx = s.x - x, dy = s.y - y;
      if (dx * dx + dy * dy < minDist2) { ok = false; break; }
    }
    if (ok) seeds.push({ x, y });
  }

  // Voronoi assignment of land cells to seeds.
  const cellProv = new Int16Array(MAPW * MAPH).fill(-1);
  for (let y = 0; y < MAPH; y++) {
    for (let x = 0; x < MAPW; x++) {
      if (!land[y * MAPW + x]) continue;
      let best = -1, bd = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const dx = seeds[s].x - x, dy = seeds[s].y - y;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = s; }
      }
      cellProv[y * MAPW + x] = best;
    }
  }

  // Adjacency, border cells, centroids.
  const adj = seeds.map(() => new Set());
  const isBorder = new Uint8Array(MAPW * MAPH);
  const cx = new Float64Array(seeds.length), cy = new Float64Array(seeds.length),
        cn = new Float64Array(seeds.length);
  for (let y = 0; y < MAPH; y++) {
    for (let x = 0; x < MAPW; x++) {
      const p = cellProv[y * MAPW + x];
      if (p < 0) continue;
      cx[p] += x; cy[p] += y; cn[p]++;
      const right = x < MAPW - 1 ? cellProv[y * MAPW + x + 1] : -1;
      const down = y < MAPH - 1 ? cellProv[(y + 1) * MAPW + x] : -1;
      if (right !== p) { isBorder[y * MAPW + x] = 1; if (right >= 0) { adj[p].add(right); adj[right].add(p); } }
      if (down !== p) { isBorder[y * MAPW + x] = 1; if (down >= 0) { adj[p].add(down); adj[down].add(p); } }
    }
  }

  // Drop any province that ended up with no cells (rare).
  const provinces = [];
  const remap = new Int16Array(seeds.length).fill(-1);
  for (let s = 0; s < seeds.length; s++) {
    if (cn[s] < 4) continue;
    remap[s] = provinces.length;
    const ex = cx[s] / cn[s], ey = cy[s] / cn[s];
    const e = elev[Math.round(ey) * MAPW + Math.round(ex)] || 0.3;
    let terrain = "plains";
    const tr = rng();
    if (e > 0.46 || tr < 0.12) terrain = "mountain";
    else if (tr < 0.42) terrain = "forest";
    let name = "";
    const syl = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < syl; k++) name += NAME_SYLLABLES[(rng() * NAME_SYLLABLES.length) | 0];
    name = name[0].toUpperCase() + name.slice(1);
    provinces.push({
      x: ex, y: ey, terrain, name,
      oilRich: rng() < 0.18,
      adj: [],
    });
  }
  for (let i = 0; i < cellProv.length; i++) {
    if (cellProv[i] >= 0) cellProv[i] = remap[cellProv[i]];
    if (cellProv[i] === undefined) cellProv[i] = -1;
  }
  for (let s = 0; s < seeds.length; s++) {
    if (remap[s] < 0) continue;
    for (const o of adj[s]) if (remap[o] >= 0 && remap[o] !== remap[s]) {
      provinces[remap[s]].adj.push(remap[o]);
    }
  }

  return { cellProv, isBorder, provinces, elev };
}

/* ============================== New game setup ============================== */

function newGame(seedText, playerNation) {
  const seed = hashSeed(seedText);
  MAP = generateMap(seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const P = MAP.provinces;

  // Pick well-spread capitals (greedy farthest-point on centroids).
  const capitals = [(rng() * P.length) | 0];
  while (capitals.length < NATION_COUNT) {
    let best = -1, bd = -1;
    for (let i = 0; i < P.length; i++) {
      if (capitals.includes(i)) continue;
      let d = Infinity;
      for (const c of capitals) {
        const dx = P[c].x - P[i].x, dy = P[c].y - P[i].y;
        d = Math.min(d, dx * dx + dy * dy);
      }
      if (d > bd) { bd = d; best = i; }
    }
    capitals.push(best);
  }

  // Contiguous nations via multi-source BFS over the adjacency graph.
  const owner = new Int16Array(P.length).fill(-1);
  const queue = [];
  capitals.forEach((p, n) => { owner[p] = n; queue.push(p); });
  let qi = 0;
  while (qi < queue.length) {
    const p = queue[qi++];
    for (const o of P[p].adj) {
      if (owner[o] === -1) { owner[o] = owner[p]; queue.push(o); }
    }
  }
  // isolated leftovers (shouldn't happen on one landmass) -> nearest capital
  for (let i = 0; i < P.length; i++) {
    if (owner[i] === -1) {
      let best = 0, bd = Infinity;
      capitals.forEach((c, n) => {
        const dx = P[c].x - P[i].x, dy = P[c].y - P[i].y;
        if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = n; }
      });
      owner[i] = best;
    }
  }

  S = {
    seedText, seed,
    tick: 0,
    speed: 1,
    player: playerNation,
    ended: false,
    nations: NATION_DEFS.map((d, i) => ({
      id: i, name: d.name, color: d.color,
      money: 5000, supplies: 2200, oil: 1000, manpower: 80,
      techsDone: [], research: null,   // research: {id, hoursLeft}
      dead: false, ai: i !== playerNation,
      aiCooldown: (i * 2) % 7,
      startProvinces: 0,
    })),
    wars: [],                 // ["a|b", ...] with a<b
    peaceOffers: [],          // [{from, to}]
    provinces: P.map((p, i) => ({
      id: i, nation: owner[i],
      capital: capitals.includes(i),
      city: false,
      buildings: { barracks: 0, factory: 0, airbase: 0, industry: 0, fort: 0 },
      buildQueue: [],         // [{kind:'building'|'unit', type, hoursLeft}]
      units: [],              // [{id, type, nation, hp, cooldown}]
    })),
    moves: [],                // [{units:[ids], nation, path:[pids], from, hoursLeft, stepHours}]
    log: [],
  };

  // cities: capital + roughly a third of each nation's provinces
  for (const pr of S.provinces) {
    if (pr.capital) { pr.city = true; continue; }
    pr.city = rng() < 0.3;
  }

  // starting garrisons and buildings
  for (const pr of S.provinces) {
    const count = pr.capital ? 4 : pr.city ? 2 : 1;
    for (let k = 0; k < count; k++) {
      pr.units.push({ id: unitSeq++, type: "inf", nation: pr.nation, hp: UNIT_TYPES.inf.hp, cooldown: 0 });
    }
    if (pr.capital) pr.buildings.barracks = 1;
  }
  for (const n of S.nations) {
    n.startProvinces = S.provinces.filter(p => p.nation === n.id).length;
  }

  selectedProvince = -1;
  moveArming = strikeArming = false;
  baseDirty = true;
  log(`A new world takes shape. You lead ${S.nations[playerNation].name}.`);
  log(`Control ${Math.round(WIN_SHARE * 100)}% of all provinces to win.`);
}

/* ============================== State helpers ============================== */

function warKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
function atWar(a, b) { return a !== b && S.wars.includes(warKey(a, b)); }

function declareWar(a, b) {
  const k = warKey(a, b);
  if (!S.wars.includes(k)) {
    S.wars.push(k);
    log(`${S.nations[a].name} declares war on ${S.nations[b].name}!`, true);
  }
}

function makePeace(a, b) {
  const k = warKey(a, b);
  const i = S.wars.indexOf(k);
  if (i >= 0) {
    S.wars.splice(i, 1);
    S.peaceOffers = S.peaceOffers.filter(o => warKey(o.from, o.to) !== k);
    log(`${S.nations[a].name} and ${S.nations[b].name} sign a peace treaty.`, true);
  }
}

function hasTech(nation, id) { return !id || S.nations[nation].techsDone.includes(id); }

function effStat(nation, type, stat) {
  const t = UNIT_TYPES[type];
  let v = t[stat];
  if (type === "inf" && hasTech(nation, "inf2") && (stat === "atk" || stat === "def")) v *= 1.25;
  if (type === "arm" && hasTech(nation, "arm2") && (stat === "atk" || stat === "def")) v *= 1.25;
  return v;
}

function provinceIncome(pr) {
  const mult = 1 + pr.buildings.industry * 0.4;
  const city = pr.city ? 2 : 1;
  return {
    money: 8 * city * mult,
    supplies: 4 * city * mult,
    oil: (MAP.provinces[pr.id].oilRich ? 8 : 1.5) * mult,
    manpower: 0.02 * city,
  };
}

function nationIncome(nid) {
  const inc = { money: 0, supplies: 0, oil: 0, manpower: 0 };
  let upkeep = 0;
  for (const pr of S.provinces) {
    if (pr.nation === nid) {
      const i = provinceIncome(pr);
      inc.money += i.money; inc.supplies += i.supplies; inc.oil += i.oil; inc.manpower += i.manpower;
    }
    for (const u of pr.units) if (u.nation === nid) upkeep += UNIT_TYPES[u.type].upkeep;
  }
  for (const mv of S.moves) if (mv.nation === nid) {
    for (const u of mv.unitObjs) upkeep += UNIT_TYPES[u.type].upkeep;
  }
  if (hasTech(nid, "economy")) inc.money *= 1.25;
  inc.money -= upkeep;
  return inc;
}

function nationStrength(nid) {
  let s = 0;
  for (const pr of S.provinces) for (const u of pr.units)
    if (u.nation === nid) s += u.hp * (UNIT_TYPES[u.type].atk + UNIT_TYPES[u.type].def);
  for (const mv of S.moves) if (mv.nation === nid)
    for (const u of mv.unitObjs) s += u.hp * (UNIT_TYPES[u.type].atk + UNIT_TYPES[u.type].def);
  return s;
}

function provinceCount(nid) {
  let c = 0;
  for (const pr of S.provinces) if (pr.nation === nid) c++;
  return c;
}

function canAfford(n, cost) {
  return n.money >= (cost.money || 0) && n.supplies >= (cost.supplies || 0) &&
         n.oil >= (cost.oil || 0) && n.manpower >= (cost.manpower || 0);
}

function pay(n, cost) {
  n.money -= cost.money || 0;
  n.supplies -= cost.supplies || 0;
  n.oil -= cost.oil || 0;
  n.manpower -= cost.manpower || 0;
}

function log(msg, important) {
  S.log.unshift({ tick: S.tick, msg, important: !!important });
  if (S.log.length > 80) S.log.pop();
  uiDirty.log = true;
  if (important) showBanner(msg);
}

/* Path for land movement. Passable: own provinces and provinces of nations
   you are at war with. Returns array of province ids or null. */
function findPath(nation, from, to) {
  const passable = pid => {
    const o = S.provinces[pid].nation;
    return o === nation || atWar(nation, o);
  };
  if (!passable(to)) return null;
  const prev = new Int16Array(S.provinces.length).fill(-2);
  prev[from] = -1;
  const q = [from];
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    if (p === to) {
      const path = [];
      let c = to;
      while (c !== -1) { path.unshift(c); c = prev[c]; }
      return path;
    }
    for (const o of MAP.provinces[p].adj) {
      if (prev[o] === -2 && passable(o)) { prev[o] = p; q.push(o); }
    }
  }
  return null;
}

function graphDistance(from, maxDist) {
  const dist = new Int16Array(S.provinces.length).fill(-1);
  dist[from] = 0;
  const q = [from];
  let qi = 0;
  while (qi < q.length) {
    const p = q[qi++];
    if (dist[p] >= maxDist) continue;
    for (const o of MAP.provinces[p].adj) {
      if (dist[o] === -1) { dist[o] = dist[p] + 1; q.push(o); }
    }
  }
  return dist;
}

/* ============================== Orders ============================== */

function orderMove(nation, from, unitIds, to) {
  const pr = S.provinces[from];
  const units = pr.units.filter(u => unitIds.includes(u.id) && u.nation === nation &&
                                     UNIT_TYPES[u.type].cls === "land");
  if (!units.length) return false;
  const path = findPath(nation, from, to);
  if (!path || path.length < 2) return false;
  pr.units = pr.units.filter(u => !units.includes(u));
  const stepHours = stepTime(nation, units, path[1]);
  S.moves.push({
    nation, unitObjs: units, path, stepIndex: 0,
    hoursLeft: stepHours, stepHours,
  });
  return true;
}

function stepTime(nation, units, destPid) {
  let slowest = 0;
  for (const u of units) slowest = Math.max(slowest, UNIT_TYPES[u.type].spd);
  let h = slowest * TERRAINS[MAP.provinces[destPid].terrain].moveMult;
  if (hasTech(nation, "logistics")) h *= 0.75;
  return Math.max(0.5, h);
}

function orderAirStrike(nation, from, target) {
  const pr = S.provinces[from];
  if (pr.nation !== nation || pr.buildings.airbase < 1) return false;
  const planes = pr.units.filter(u => u.nation === nation && UNIT_TYPES[u.type].cls === "air" && u.cooldown <= 0);
  if (!planes.length) return false;
  const range = Math.max(...planes.map(u => UNIT_TYPES[u.type].range));
  const dist = graphDistance(from, range);
  if (dist[target] === -1 || dist[target] > range) return false;
  const tp = S.provinces[target];
  const enemies = tp.units.filter(u => atWar(nation, u.nation));
  if (!enemies.length && !atWar(nation, tp.nation)) return false;

  let dmg = 0;
  for (const u of planes) { dmg += effStat(nation, u.type, "atk") * (u.hp / UNIT_TYPES[u.type].hp); u.cooldown = 6; }
  // defending fighters intercept
  const defFighters = tp.units.filter(u => u.type === "fig" && atWar(nation, u.nation));
  let aa = enemies.reduce((s, u) => s + UNIT_TYPES[u.type].def * 0.05, 0);
  aa += defFighters.length * 4;
  applyDamage(planes, aa);
  pr.units = pr.units.filter(u => u.hp > 0);
  if (enemies.length) {
    applyDamage(enemies, dmg);
    tp.units = tp.units.filter(u => u.hp > 0);
  }
  log(`${S.nations[nation].name} air strike on ${MAP.provinces[target].name}.`);
  return true;
}

function applyDamage(units, total) {
  let remaining = total;
  for (const u of units) {
    if (remaining <= 0) break;
    const d = Math.min(u.hp, remaining / units.length + remaining * 0.1);
    u.hp -= d; remaining -= d;
  }
  // overflow onto survivors
  for (const u of units) {
    if (remaining <= 0) break;
    const d = Math.min(u.hp, remaining);
    u.hp -= d; remaining -= d;
  }
}

/* ============================== Simulation tick (1 hour) ============================== */

function gameTick() {
  S.tick++;

  /* Economy */
  for (const n of S.nations) {
    if (n.dead) continue;
    const inc = nationIncome(n.id);
    n.money = Math.max(0, n.money + inc.money);
    n.supplies += inc.supplies;
    n.oil += inc.oil;
    n.manpower += inc.manpower;
  }

  /* Research */
  for (const n of S.nations) {
    if (n.dead || !n.research) continue;
    n.research.hoursLeft--;
    if (n.research.hoursLeft <= 0) {
      n.techsDone.push(n.research.id);
      const t = TECHS.find(t => t.id === n.research.id);
      if (n.id === S.player) log(`Research complete: ${t.name}.`, true);
      n.research = null;
      uiDirty.research = true;
    }
  }

  /* Construction & recruitment */
  for (const pr of S.provinces) {
    if (!pr.buildQueue.length) continue;
    const job = pr.buildQueue[0];
    job.hoursLeft--;
    if (job.hoursLeft <= 0) {
      pr.buildQueue.shift();
      if (job.kind === "building") {
        pr.buildings[job.type]++;
        if (pr.nation === S.player) log(`${BUILDING_TYPES[job.type].name} completed in ${MAP.provinces[pr.id].name}.`);
      } else {
        pr.units.push({ id: unitSeq++, type: job.type, nation: pr.nation, hp: UNIT_TYPES[job.type].hp, cooldown: 0 });
        if (pr.nation === S.player) log(`${UNIT_TYPES[job.type].name} ready in ${MAP.provinces[pr.id].name}.`);
      }
      if (pr.id === selectedProvince) uiDirty.province = true;
    }
  }

  /* Movement */
  for (let i = S.moves.length - 1; i >= 0; i--) {
    const mv = S.moves[i];
    mv.hoursLeft--;
    if (mv.hoursLeft > 0) continue;
    mv.stepIndex++;
    const here = mv.path[mv.stepIndex];
    const pr = S.provinces[here];
    const hostile = pr.units.some(u => atWar(mv.nation, u.nation)) ||
                    (atWar(mv.nation, pr.nation));
    const lastStep = mv.stepIndex === mv.path.length - 1;
    if (lastStep || hostile && pr.units.some(u => atWar(mv.nation, u.nation))) {
      // arrive (or stop to fight)
      for (const u of mv.unitObjs) pr.units.push(u);
      S.moves.splice(i, 1);
      if (here === selectedProvince) uiDirty.province = true;
    } else {
      const next = mv.path[mv.stepIndex + 1];
      // abort if path became impassable (peace signed mid-march)
      const o = S.provinces[next].nation;
      if (o !== mv.nation && !atWar(mv.nation, o)) {
        for (const u of mv.unitObjs) pr.units.push(u);
        S.moves.splice(i, 1);
      } else {
        mv.stepHours = stepTime(mv.nation, mv.unitObjs, next);
        mv.hoursLeft = mv.stepHours;
      }
    }
  }

  /* Air cooldowns */
  for (const pr of S.provinces) for (const u of pr.units) if (u.cooldown > 0) u.cooldown--;

  /* Combat */
  resolveCombat();

  /* Province capture: hostile units present, no friendly defenders */
  for (const pr of S.provinces) {
    if (!pr.units.length) continue;
    const defenders = pr.units.some(u => u.nation === pr.nation);
    if (defenders) continue;
    const invader = pr.units.find(u => atWar(u.nation, pr.nation) && UNIT_TYPES[u.type].cls === "land");
    if (invader) {
      const old = pr.nation;
      pr.nation = invader.nation;
      pr.buildings.fort = Math.max(0, pr.buildings.fort - 1);
      pr.buildQueue = [];
      baseDirty = true;
      uiDirty.nations = true;
      if (invader.nation === S.player || old === S.player) {
        log(`${S.nations[invader.nation].name} captures ${MAP.provinces[pr.id].name}${pr.capital ? " — a capital!" : ""}.`, pr.capital);
      }
      checkElimination(old);
    }
  }

  /* AI */
  for (const n of S.nations) {
    if (!n.ai || n.dead) continue;
    n.aiCooldown--;
    if (n.aiCooldown <= 0) { n.aiCooldown = 6; aiThink(n); }
  }

  /* Victory check */
  if (!S.ended) {
    const total = S.provinces.length;
    const mine = provinceCount(S.player);
    if (mine === 0 && !S.moves.some(m => m.nation === S.player)) endGame(false);
    else if (mine / total >= WIN_SHARE) endGame(true);
  }

  uiDirty.topbar = true;
  if (S.tick % 4 === 0) { uiDirty.nations = true; uiDirty.research = true; }
}

function resolveCombat() {
  for (const pr of S.provinces) {
    if (pr.units.length < 2) continue;
    const byNation = new Map();
    for (const u of pr.units) {
      if (!byNation.has(u.nation)) byNation.set(u.nation, []);
      byNation.get(u.nation).push(u);
    }
    if (byNation.size < 2) continue;
    const nations = [...byNation.keys()];
    const dmgTo = new Map(nations.map(n => [n, 0]));
    let fighting = false;
    for (let i = 0; i < nations.length; i++) {
      for (let j = i + 1; j < nations.length; j++) {
        const a = nations[i], b = nations[j];
        if (!atWar(a, b)) continue;
        fighting = true;
        dmgTo.set(b, dmgTo.get(b) + sideDamage(a, byNation.get(a), pr));
        dmgTo.set(a, dmgTo.get(a) + sideDamage(b, byNation.get(b), pr));
      }
    }
    if (!fighting) continue;
    for (const [n, dmg] of dmgTo) {
      if (dmg <= 0) continue;
      let d = dmg;
      if (n === pr.nation) d *= Math.max(0.4, 1 - pr.buildings.fort * 0.15) / TERRAINS[MAP.provinces[pr.id].terrain].defMult;
      applyDamage(byNation.get(n), d);
    }
    pr.units = pr.units.filter(u => u.hp > 0);
  }

  /* Artillery bombardment of adjacent enemies (no return fire) */
  for (const pr of S.provinces) {
    const arts = pr.units.filter(u => u.type === "art");
    if (!arts.length) continue;
    for (const a of arts) {
      const target = MAP.provinces[pr.id].adj
        .map(pid => S.provinces[pid])
        .find(tp => tp.units.some(u => atWar(a.nation, u.nation)));
      if (!target) continue;
      const enemies = target.units.filter(u => atWar(a.nation, u.nation));
      applyDamage(enemies, UNIT_TYPES.art.ranged * 0.12 * (a.hp / UNIT_TYPES.art.hp));
      target.units = target.units.filter(u => u.hp > 0);
    }
  }
}

function sideDamage(nation, units, pr) {
  const defending = nation === pr.nation;
  let total = 0;
  for (const u of units) {
    const stat = defending ? effStat(nation, u.type, "def") : effStat(nation, u.type, "atk");
    total += stat * (u.hp / UNIT_TYPES[u.type].hp);
  }
  return total * 0.14 * (0.85 + Math.random() * 0.3);
}

function checkElimination(nid) {
  if (provinceCount(nid) > 0) return;
  const n = S.nations[nid];
  if (n.dead) return;
  n.dead = true;
  // disband everything
  for (const pr of S.provinces) pr.units = pr.units.filter(u => u.nation !== nid);
  S.moves = S.moves.filter(m => m.nation !== nid);
  S.wars = S.wars.filter(k => !k.split("|").map(Number).includes(nid));
  log(`${n.name} has been wiped from the map.`, true);
  uiDirty.nations = true;
}

function endGame(won) {
  S.ended = true;
  S.speed = 0;
  document.querySelectorAll(".spd").forEach(b => b.classList.toggle("active", b.dataset.spd === "0"));
  const m = document.getElementById("end-modal");
  document.getElementById("end-title").textContent = won ? "Victory" : "Defeat";
  document.getElementById("end-text").textContent = won
    ? `${S.nations[S.player].name} dominates the world after ${Math.floor(S.tick / 24)} days of war.`
    : `${S.nations[S.player].name} has fallen. The world moves on without you.`;
  m.classList.remove("hidden");
}

/* ============================== AI ============================== */

function aiThink(n) {
  const myProvinces = S.provinces.filter(p => p.nation === n.id);
  if (!myProvinces.length) return;
  const myStrength = nationStrength(n.id);
  const enemies = S.nations.filter(o => !o.dead && o.id !== n.id && atWar(n.id, o.id));

  /* Diplomacy: pick a fight if at peace and clearly stronger than a neighbour. */
  if (!enemies.length && S.tick > 48) {
    const neighbours = new Set();
    for (const p of myProvinces) for (const a of MAP.provinces[p.id].adj) {
      const o = S.provinces[a].nation;
      if (o !== n.id && !S.nations[o].dead) neighbours.add(o);
    }
    let target = -1, weakest = Infinity;
    for (const o of neighbours) {
      const st = nationStrength(o);
      if (st < weakest) { weakest = st; target = o; }
    }
    if (target >= 0 && myStrength > weakest * 1.35 && Math.random() < 0.3) {
      declareWar(n.id, target);
      if (target === S.player) uiDirty.nations = true;
    }
  }

  /* Sue for peace if battered. */
  for (const e of enemies) {
    if (nationStrength(e.id) > myStrength * 1.8 && provinceCount(n.id) < n.startProvinces * 0.7) {
      if (e.id === S.player) {
        if (!S.peaceOffers.some(o => o.from === n.id && o.to === e.id)) {
          S.peaceOffers.push({ from: n.id, to: e.id });
          log(`${n.name} offers you peace.`, true);
          uiDirty.nations = true;
        }
      } else if (Math.random() < 0.4) {
        makePeace(n.id, e.id);
      }
    }
  }

  /* Accept stale offers between AIs (and clean dead ones) */
  S.peaceOffers = S.peaceOffers.filter(o => atWar(o.from, o.to));

  /* Research: pick the first affordable tech. */
  if (!n.research) {
    for (const t of TECHS) {
      if (n.techsDone.includes(t.id) || !hasTech(n.id, t.req)) continue;
      if (n.money >= t.cost + 1500) {
        n.money -= t.cost;
        n.research = { id: t.id, hoursLeft: t.time };
        break;
      }
    }
  }

  /* Build: prioritise barracks in cities, then industry, then a factory. */
  const idleCities = myProvinces.filter(p => p.city && !p.buildQueue.length);
  for (const p of idleCities) {
    let want = null;
    if (!p.buildings.barracks) want = "barracks";
    else if (p.buildings.industry < 2) want = "industry";
    else if (!p.buildings.factory && hasTech(n.id, "armour")) want = "factory";
    else if (!p.buildings.airbase && hasTech(n.id, "fighters")) want = "airbase";
    if (!want) continue;
    const b = BUILDING_TYPES[want];
    if (n.money >= (b.cost.money || 0) + 2000 && canAfford(n, b.cost)) {
      pay(n, b.cost);
      p.buildQueue.push({ kind: "building", type: want, hoursLeft: b.time });
    }
  }

  /* Recruit: spend surplus money on the best unlocked land unit. */
  const recruitOrder = ["arm", "mot", "art", "inf"];
  for (const p of myProvinces) {
    if (p.buildQueue.length) continue;
    for (const ut of recruitOrder) {
      const t = UNIT_TYPES[ut];
      if (!hasTech(n.id, t.req)) continue;
      if (p.buildings[t.building] < 1) continue;
      if (n.money < t.cost.money + 2500 || !canAfford(n, t.cost)) continue;
      pay(n, t.cost);
      p.buildQueue.push({ kind: "unit", type: ut, hoursLeft: t.time });
      break;
    }
  }

  /* Military: attack weak adjacent enemy provinces, reinforce threatened ones. */
  if (!enemies.length) return;
  const enemyIds = new Set(enemies.map(e => e.id));

  const localStrength = pr => pr.units.reduce(
    (s, u) => s + u.hp * (UNIT_TYPES[u.type].atk + UNIT_TYPES[u.type].def) / UNIT_TYPES[u.type].hp, 0);

  for (const p of myProvinces) {
    const landUnits = p.units.filter(u => u.nation === n.id && UNIT_TYPES[u.type].cls === "land");
    if (!landUnits.length) continue;
    const hostileHere = p.units.some(u => atWar(n.id, u.nation));
    if (hostileHere) continue; // stay and fight

    // adjacent enemy province we can beat?
    let bestTarget = -1, bestRatio = 0;
    for (const a of MAP.provinces[p.id].adj) {
      const tp = S.provinces[a];
      if (!enemyIds.has(tp.nation)) continue;
      const defStr = localStrength(tp) + 3;
      const myStr = landUnits.reduce((s, u) => s + u.hp * (UNIT_TYPES[u.type].atk) / UNIT_TYPES[u.type].hp, 0);
      const ratio = myStr / defStr;
      if (ratio > bestRatio) { bestRatio = ratio; bestTarget = a; }
    }
    if (bestTarget >= 0 && bestRatio > 1.3 && landUnits.length >= 2) {
      const leave = p.capital ? 1 : 0;
      const movers = landUnits.slice(leave).map(u => u.id);
      if (movers.length) orderMove(n.id, p.id, movers, bestTarget);
      continue;
    }

    // interior idle stacks drift toward the nearest border with an enemy
    const isBorderProv = MAP.provinces[p.id].adj.some(a => enemyIds.has(S.provinces[a].nation));
    if (!isBorderProv && landUnits.length >= 2 && Math.random() < 0.5) {
      // find nearest own border province
      const dist = graphDistance(p.id, 12);
      let best = -1, bd = Infinity;
      for (const op of myProvinces) {
        if (MAP.provinces[op.id].adj.some(a => enemyIds.has(S.provinces[a].nation))) {
          if (dist[op.id] >= 0 && dist[op.id] < bd) { bd = dist[op.id]; best = op.id; }
        }
      }
      if (best >= 0) {
        const leave = p.capital ? 1 : 0;
        const movers = landUnits.slice(leave).map(u => u.id);
        if (movers.length) orderMove(n.id, p.id, movers, best);
      }
    }
  }

  /* Air strikes on adjacent enemy stacks */
  for (const p of myProvinces) {
    if (p.buildings.airbase < 1) continue;
    const planes = p.units.filter(u => UNIT_TYPES[u.type].cls === "air" && u.cooldown <= 0 && u.nation === n.id);
    if (!planes.length) continue;
    const range = Math.max(...planes.map(u => UNIT_TYPES[u.type].range));
    const dist = graphDistance(p.id, range);
    let best = -1, bestStr = 8;
    for (let i = 0; i < S.provinces.length; i++) {
      if (dist[i] < 0) continue;
      const tp = S.provinces[i];
      const str = tp.units.filter(u => atWar(n.id, u.nation)).length;
      if (str > bestStr) { bestStr = str; best = i; }
    }
    if (best >= 0) orderAirStrike(n.id, p.id, best);
  }
}

/* ============================== Rendering ============================== */

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rebuildBaseMap() {
  const img = baseCtx.createImageData(MAPW, MAPH);
  const d = img.data;
  const colors = S.nations.map(n => hexToRgb(n.color));
  for (let i = 0; i < MAP.cellProv.length; i++) {
    const p = MAP.cellProv[i];
    const o = i * 4;
    if (p < 0) {
      d[o] = 13; d[o + 1] = 22; d[o + 2] = 33; d[o + 3] = 255;   // ocean
      continue;
    }
    const pr = S.provinces[p];
    const c = colors[pr.nation];
    const shade = TERRAINS[MAP.provinces[p].terrain].shade;
    let r = c[0] + shade, g = c[1] + shade, b = c[2] + shade;
    if (MAP.isBorder[i]) { r -= 45; g -= 45; b -= 45; }
    d[o] = clamp(r, 0, 255); d[o + 1] = clamp(g, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
  }
  baseCtx.putImageData(img, 0, 0);
  baseDirty = false;
}

function resizeCanvas() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = r.width; canvas.height = r.height;
}

function mapToScreen(mx, my) { return [(mx - view.x) * view.scale, (my - view.y) * view.scale]; }
function screenToMap(sx, sy) { return [sx / view.scale + view.x, sy / view.scale + view.y]; }

function draw() {
  if (!S) return;
  if (baseDirty) rebuildBaseMap();
  ctx.fillStyle = "#0a0e13";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseCanvas, -view.x * view.scale, -view.y * view.scale,
                MAPW * view.scale, MAPH * view.scale);

  // selection outline
  if (selectedProvince >= 0) {
    const p = MAP.provinces[selectedProvince];
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    const [sx, sy] = mapToScreen(p.x, p.y);
    ctx.beginPath();
    ctx.arc(sx, sy, 10 * Math.sqrt(view.scale), 0, Math.PI * 2);
    ctx.stroke();
  }

  // moving stacks
  for (const mv of S.moves) {
    const a = MAP.provinces[mv.path[mv.stepIndex]];
    const b = MAP.provinces[mv.path[mv.stepIndex + 1]];
    const t = 1 - mv.hoursLeft / mv.stepHours;
    const mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t;
    const [sx, sy] = mapToScreen(mx, my);
    const [tx, ty] = mapToScreen(b.x, b.y);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    drawStack(sx, sy, mv.unitObjs.length, S.nations[mv.nation].color, true);
  }

  // province markers + garrisons
  for (const pr of S.provinces) {
    const p = MAP.provinces[pr.id];
    const [sx, sy] = mapToScreen(p.x, p.y);
    if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;
    if (pr.capital) {
      ctx.fillStyle = "#ffd75e";
      ctx.font = `${Math.max(10, 7 * view.scale)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("★", sx, sy - 6 * Math.sqrt(view.scale));
    } else if (pr.city) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(sx - 1.5, sy - 7 * Math.sqrt(view.scale), 3, 3);
    }
    if (pr.units.length) {
      drawStack(sx, sy, pr.units.length, S.nations[pr.units[0].nation].color, false);
    }
  }

  // hover label
  if (hoverProvince >= 0) {
    const p = MAP.provinces[hoverProvince];
    const pr = S.provinces[hoverProvince];
    const [sx, sy] = mapToScreen(p.x, p.y);
    const label = `${p.name} — ${S.nations[pr.nation].name}`;
    ctx.font = "12px sans-serif";
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = "rgba(10,14,19,0.85)";
    ctx.fillRect(sx - w / 2, sy + 12, w, 18);
    ctx.fillStyle = "#d6dde6";
    ctx.textAlign = "center";
    ctx.fillText(label, sx, sy + 25);
  }
}

function drawStack(sx, sy, count, color, moving) {
  const r = clamp(4 * Math.sqrt(view.scale), 5, 11);
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = moving ? "#fff" : "rgba(0,0,0,0.6)";
  ctx.lineWidth = moving ? 1.5 : 1;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.max(9, r)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count, sx, sy + 0.5);
  ctx.textBaseline = "alphabetic";
}

function provinceAt(sx, sy) {
  const [mx, my] = screenToMap(sx, sy);
  const cx = Math.floor(mx), cyy = Math.floor(my);
  if (cx < 0 || cyy < 0 || cx >= MAPW || cyy >= MAPH) return -1;
  return MAP.cellProv[cyy * MAPW + cx];
}

/* ============================== UI ============================== */

const uiDirty = { topbar: true, province: true, nations: true, research: true, log: true };
let bannerTimer = null;

function showBanner(msg) {
  const b = document.getElementById("banner");
  b.textContent = msg;
  b.classList.remove("hidden");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.add("hidden"), 3500);
}

function costText(cost) {
  const parts = [];
  if (cost.money) parts.push(`💰${fmt(cost.money)}`);
  if (cost.supplies) parts.push(`📦${fmt(cost.supplies)}`);
  if (cost.oil) parts.push(`🛢️${fmt(cost.oil)}`);
  if (cost.manpower) parts.push(`👥${cost.manpower}`);
  return parts.join(" ");
}

function renderTopbar() {
  const n = S.nations[S.player];
  document.getElementById("nation-flag").style.background = n.color;
  document.getElementById("nation-name").textContent = n.name;
  const inc = nationIncome(S.player);
  document.getElementById("res-money").textContent = fmt(n.money);
  document.getElementById("res-supplies").textContent = fmt(n.supplies);
  document.getElementById("res-oil").textContent = fmt(n.oil);
  document.getElementById("res-manpower").textContent = fmt(n.manpower);
  document.getElementById("inc-money").textContent = (inc.money >= 0 ? "+" : "") + inc.money.toFixed(0) + "/h";
  document.getElementById("inc-supplies").textContent = "+" + inc.supplies.toFixed(0) + "/h";
  document.getElementById("inc-oil").textContent = "+" + inc.oil.toFixed(0) + "/h";
  document.getElementById("inc-manpower").textContent = "+" + (inc.manpower * 24).toFixed(1) + "/d";
  document.getElementById("day").textContent = 1 + Math.floor(S.tick / 24);
  document.getElementById("hour").textContent = String(S.tick % 24).padStart(2, "0");
}

function renderProvincePanel() {
  const body = document.getElementById("pp-body");
  const nameEl = document.getElementById("pp-name");
  if (selectedProvince < 0) {
    nameEl.textContent = "No province selected";
    body.classList.add("hidden");
    return;
  }
  body.classList.remove("hidden");
  const pid = selectedProvince;
  const pr = S.provinces[pid];
  const mp = MAP.provinces[pid];
  const owner = S.nations[pr.nation];
  const mine = pr.nation === S.player;

  nameEl.textContent = mp.name + (pr.capital ? " ★" : pr.city ? " (city)" : "");
  document.getElementById("pp-owner").innerHTML =
    `<span class="swatch" style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${owner.color};margin-right:6px"></span>${owner.name}` +
    (atWar(S.player, pr.nation) ? ' <span class="rel war">AT WAR</span>' : "");
  const inc = provinceIncome(pr);
  document.getElementById("pp-info").textContent =
    `${TERRAINS[mp.terrain].name}${mp.oilRich ? " · Oil-rich" : ""} · ` +
    `💰${inc.money.toFixed(0)}/h 📦${inc.supplies.toFixed(0)}/h 🛢️${inc.oil.toFixed(1)}/h`;

  /* Buildings */
  const bEl = document.getElementById("pp-buildings");
  bEl.innerHTML = "";
  const n = S.nations[S.player];
  for (const [bid, b] of Object.entries(BUILDING_TYPES)) {
    const lvl = pr.buildings[bid];
    const row = document.createElement("div");
    row.className = "brow";
    const queued = pr.buildQueue.some(j => j.kind === "building" && j.type === bid);
    let right = "";
    if (mine && lvl < b.max && !queued) {
      right = `<button data-build="${bid}" ${canAfford(n, b.cost) ? "" : "disabled"}>Build</button>`;
    }
    row.innerHTML = `<span title="${b.desc}">${b.name} ${lvl > 0 ? "lvl " + lvl : "—"}</span>` +
      `<span class="cost">${mine && lvl < b.max ? costText(b.cost) : ""}</span>${right}`;
    bEl.appendChild(row);
  }
  bEl.querySelectorAll("[data-build]").forEach(btn => {
    btn.onclick = () => {
      const bid = btn.dataset.build;
      const b = BUILDING_TYPES[bid];
      if (!canAfford(n, b.cost)) return;
      pay(n, b.cost);
      pr.buildQueue.push({ kind: "building", type: bid, hoursLeft: b.time });
      uiDirty.province = uiDirty.topbar = true;
    };
  });

  /* Queue */
  const qEl = document.getElementById("pp-queue");
  qEl.innerHTML = pr.buildQueue.map(j =>
    `<div class="queue-item">⏳ ${(j.kind === "building" ? BUILDING_TYPES[j.type] : UNIT_TYPES[j.type]).name} — ${Math.ceil(j.hoursLeft)}h left</div>`
  ).join("");

  /* Recruit */
  const rEl = document.getElementById("pp-recruit");
  rEl.innerHTML = "";
  if (mine) {
    for (const [uid, u] of Object.entries(UNIT_TYPES)) {
      if (!hasTech(S.player, u.req)) continue;
      const hasBuilding = pr.buildings[u.building] >= 1;
      const row = document.createElement("div");
      row.className = "rrow";
      row.innerHTML =
        `<span>${u.icon} ${u.name}</span><span class="cost">${costText(u.cost)} · ${u.time}h</span>` +
        `<button data-recruit="${uid}" ${hasBuilding && canAfford(n, u.cost) ? "" : "disabled"} ` +
        `title="${hasBuilding ? "" : "Requires " + BUILDING_TYPES[u.building].name}">+</button>`;
      rEl.appendChild(row);
    }
    rEl.querySelectorAll("[data-recruit]").forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.recruit;
        const u = UNIT_TYPES[uid];
        if (!canAfford(n, u.cost)) return;
        pay(n, u.cost);
        pr.buildQueue.push({ kind: "unit", type: uid, hoursLeft: u.time });
        uiDirty.province = uiDirty.topbar = true;
      };
    });
  } else {
    rEl.innerHTML = `<div class="cost">Not your territory.</div>`;
  }

  /* Units */
  const uEl = document.getElementById("pp-units");
  uEl.innerHTML = "";
  for (const u of pr.units) {
    const t = UNIT_TYPES[u.type];
    const row = document.createElement("div");
    row.className = "urow";
    const ownerName = S.nations[u.nation].name;
    const checkbox = u.nation === S.player && t.cls === "land"
      ? `<input type="checkbox" data-uid="${u.id}" checked>` : "";
    row.innerHTML =
      `<label>${checkbox}<span style="color:${S.nations[u.nation].color}">${t.icon}</span> ${t.name}` +
      `<span class="hp">${Math.ceil(u.hp)}/${t.hp} hp${u.nation !== S.player ? " · " + ownerName : ""}` +
      `${t.cls === "air" && u.cooldown > 0 ? " · refuel " + Math.ceil(u.cooldown) + "h" : ""}</span></label>`;
    uEl.appendChild(row);
  }
  if (!pr.units.length) uEl.innerHTML = `<div class="cost">No units stationed.</div>`;

  /* Actions */
  const aEl = document.getElementById("pp-actions");
  aEl.innerHTML = "";
  const myLand = pr.units.filter(u => u.nation === S.player && UNIT_TYPES[u.type].cls === "land");
  if (myLand.length) {
    const btn = document.createElement("button");
    btn.textContent = moveArming ? "Click a target province…" : "Move selected units";
    if (moveArming) btn.classList.add("move-arming");
    btn.onclick = () => { moveArming = !moveArming; strikeArming = false; uiDirty.province = true; };
    aEl.appendChild(btn);
  }
  const myAir = pr.units.filter(u => u.nation === S.player && UNIT_TYPES[u.type].cls === "air" && u.cooldown <= 0);
  if (myAir.length && mine && pr.buildings.airbase >= 1) {
    const btn = document.createElement("button");
    btn.textContent = strikeArming ? "Click a strike target…" : `Air strike (${myAir.length} aircraft ready)`;
    if (strikeArming) btn.classList.add("move-arming");
    btn.onclick = () => { strikeArming = !strikeArming; moveArming = false; uiDirty.province = true; };
    aEl.appendChild(btn);
  }
}

function renderNations() {
  const el = document.getElementById("tab-nations");
  el.innerHTML = "";
  const total = S.provinces.length;
  const maxStr = Math.max(1, ...S.nations.map(n => n.dead ? 0 : nationStrength(n.id)));
  for (const n of S.nations) {
    const row = document.createElement("div");
    row.className = "nation-row" + (n.dead ? " dead" : "");
    const provs = provinceCount(n.id);
    const str = n.dead ? 0 : nationStrength(n.id);
    let relHtml = "", btnHtml = "";
    if (n.id === S.player) relHtml = `<span class="rel">YOU</span>`;
    else if (n.dead) relHtml = `<span class="rel">FALLEN</span>`;
    else if (atWar(S.player, n.id)) {
      relHtml = `<span class="rel war">WAR</span>`;
      const offered = S.peaceOffers.some(o => o.from === n.id && o.to === S.player);
      btnHtml = `<button data-peace="${n.id}">${offered ? "Accept peace" : "Offer peace"}</button>`;
    } else {
      relHtml = `<span class="rel peace">PEACE</span>`;
      btnHtml = `<button data-war="${n.id}">Declare war</button>`;
    }
    row.innerHTML =
      `<div class="swatch" style="background:${n.color}"></div>` +
      `<div class="nr-info"><div class="nr-name">${n.name}</div>` +
      `<div class="nr-stats">${provs}/${total} provinces · military ${"▮".repeat(Math.ceil(str / maxStr * 8)) || "—"}</div></div>` +
      relHtml + btnHtml;
    el.appendChild(row);
  }
  el.querySelectorAll("[data-war]").forEach(b => b.onclick = () => {
    declareWar(S.player, +b.dataset.war);
    uiDirty.nations = true;
  });
  el.querySelectorAll("[data-peace]").forEach(b => b.onclick = () => {
    const other = +b.dataset.peace;
    const offered = S.peaceOffers.some(o => o.from === other && o.to === S.player);
    if (offered) makePeace(S.player, other);
    else {
      // AI accepts if it is losing the war
      if (nationStrength(S.player) > nationStrength(other) * 1.2 ||
          provinceCount(other) < S.nations[other].startProvinces * 0.8) {
        makePeace(S.player, other);
      } else {
        log(`${S.nations[other].name} rejects your peace offer.`);
      }
    }
    uiDirty.nations = true;
  });
}

function renderResearch() {
  const el = document.getElementById("tab-research");
  el.innerHTML = "";
  const n = S.nations[S.player];
  for (const t of TECHS) {
    const done = n.techsDone.includes(t.id);
    const current = n.research && n.research.id === t.id;
    const locked = !hasTech(S.player, t.req);
    const row = document.createElement("div");
    row.className = "tech-row" + (done ? " done" : current ? " current" : "");
    let action = "";
    if (done) action = `<span class="rel peace">DONE</span>`;
    else if (current) action = `<span class="rel">${Math.ceil(n.research.hoursLeft)}h</span>`;
    else if (locked) action = `<span class="cost">needs ${TECHS.find(x => x.id === t.req).name}</span>`;
    else if (!n.research) action = `<button data-tech="${t.id}" ${n.money >= t.cost ? "" : "disabled"}>💰${fmt(t.cost)} · ${t.time}h</button>`;
    else action = `<span class="cost">💰${fmt(t.cost)} · ${t.time}h</span>`;
    row.innerHTML = `<div class="tr-head"><b>${t.name}</b>${action}</div><div class="desc">${t.desc}</div>` +
      (current ? `<div class="progressbar"><div style="width:${(1 - n.research.hoursLeft / t.time) * 100}%"></div></div>` : "");
    el.appendChild(row);
  }
  el.querySelectorAll("[data-tech]").forEach(b => b.onclick = () => {
    const t = TECHS.find(x => x.id === b.dataset.tech);
    if (n.money < t.cost || n.research) return;
    n.money -= t.cost;
    n.research = { id: t.id, hoursLeft: t.time };
    uiDirty.research = uiDirty.topbar = true;
  });
}

function renderLog() {
  const el = document.getElementById("tab-log");
  el.innerHTML = S.log.map(l =>
    `<div class="log-item"><span class="lt">D${1 + Math.floor(l.tick / 24)} ${String(l.tick % 24).padStart(2, "0")}:00</span>${l.msg}</div>`
  ).join("");
}

function refreshUI() {
  if (uiDirty.topbar) { renderTopbar(); uiDirty.topbar = false; }
  if (uiDirty.province) { renderProvincePanel(); uiDirty.province = false; }
  if (uiDirty.nations) { renderNations(); uiDirty.nations = false; }
  if (uiDirty.research) { renderResearch(); uiDirty.research = false; }
  if (uiDirty.log) { renderLog(); uiDirty.log = false; }
}

/* ============================== Input ============================== */

let dragging = false, dragMoved = false, lastMx = 0, lastMy = 0;

canvas.addEventListener("mousedown", e => {
  dragging = true; dragMoved = false;
  lastMx = e.offsetX; lastMy = e.offsetY;
});

canvas.addEventListener("mousemove", e => {
  if (dragging) {
    const dx = e.offsetX - lastMx, dy = e.offsetY - lastMy;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    if (dragMoved) {
      view.x -= dx / view.scale;
      view.y -= dy / view.scale;
      lastMx = e.offsetX; lastMy = e.offsetY;
    }
  }
  hoverProvince = provinceAt(e.offsetX, e.offsetY);
});

window.addEventListener("mouseup", e => {
  if (!dragging) return;
  dragging = false;
  if (dragMoved || !S) return;
  const pid = provinceAt(lastMx, lastMy);
  if (pid < 0) { selectedProvince = -1; moveArming = strikeArming = false; uiDirty.province = true; return; }

  if (moveArming && selectedProvince >= 0 && pid !== selectedProvince) {
    const ids = [...document.querySelectorAll('#pp-units input[type="checkbox"]:checked')]
      .map(c => +c.dataset.uid);
    const ok = orderMove(S.player, selectedProvince, ids, pid);
    if (!ok) showBanner("No land route there. You can only cross your own territory or that of nations you are at war with.");
    moveArming = false;
    uiDirty.province = true;
    return;
  }
  if (strikeArming && selectedProvince >= 0) {
    const ok = orderAirStrike(S.player, selectedProvince, pid);
    if (!ok) showBanner("Target out of range, or no hostile forces there.");
    strikeArming = false;
    uiDirty.province = true;
    return;
  }
  selectedProvince = pid;
  moveArming = strikeArming = false;
  uiDirty.province = true;
});

canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const [mx, my] = screenToMap(e.offsetX, e.offsetY);
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  view.scale = clamp(view.scale * factor, 1, 12);
  view.x = mx - e.offsetX / view.scale;
  view.y = my - e.offsetY / view.scale;
}, { passive: false });

document.querySelectorAll(".spd").forEach(b => {
  b.onclick = () => {
    if (S && S.ended && b.dataset.spd !== "0") return;
    S.speed = +b.dataset.spd;
    document.querySelectorAll(".spd").forEach(x => x.classList.toggle("active", x === b));
  };
});

document.querySelectorAll(".tab").forEach(b => {
  b.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === b));
    document.querySelectorAll(".tab-page").forEach(p => p.classList.add("hidden"));
    document.getElementById("tab-" + b.dataset.tab).classList.remove("hidden");
  };
});

/* ============================== Save / load ============================== */

const SAVE_KEY = "world-conflict-save";

function saveGame() {
  const data = {
    seedText: S.seedText, tick: S.tick, player: S.player, ended: S.ended,
    nations: S.nations, wars: S.wars, peaceOffers: S.peaceOffers,
    provinces: S.provinces.map(p => ({
      nation: p.nation, capital: p.capital, city: p.city,
      buildings: p.buildings, buildQueue: p.buildQueue, units: p.units,
    })),
    moves: S.moves, unitSeq, log: S.log,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  showBanner("Game saved.");
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { showBanner("No saved game found."); return false; }
  const data = JSON.parse(raw);
  MAP = generateMap(hashSeed(data.seedText));
  S = {
    seedText: data.seedText, seed: hashSeed(data.seedText),
    tick: data.tick, speed: 0, player: data.player, ended: data.ended,
    nations: data.nations, wars: data.wars, peaceOffers: data.peaceOffers || [],
    provinces: data.provinces.map((p, i) => ({ id: i, ...p })),
    moves: data.moves, log: data.log,
  };
  unitSeq = data.unitSeq;
  selectedProvince = -1;
  moveArming = strikeArming = false;
  baseDirty = true;
  Object.keys(uiDirty).forEach(k => uiDirty[k] = true);
  document.querySelectorAll(".spd").forEach(b => b.classList.toggle("active", b.dataset.spd === "0"));
  document.getElementById("start-modal").classList.add("hidden");
  document.getElementById("end-modal").classList.add("hidden");
  showBanner("Game loaded (paused).");
  return true;
}

document.getElementById("btn-save").onclick = () => S && saveGame();
document.getElementById("btn-load").onclick = () => loadGame();
document.getElementById("btn-new").onclick = () => showStartModal();
document.getElementById("btn-end-new").onclick = () => {
  document.getElementById("end-modal").classList.add("hidden");
  showStartModal();
};

/* ============================== Start screen ============================== */

function showStartModal() {
  const modal = document.getElementById("start-modal");
  modal.classList.remove("hidden");
  const picker = document.getElementById("nation-picker");
  picker.innerHTML = "";
  NATION_DEFS.forEach((d, i) => {
    const b = document.createElement("button");
    b.className = "pick-nation";
    b.innerHTML = `<span class="swatch" style="background:${d.color}"></span>` +
      `<span>${d.name}<small>Playable nation</small></span>`;
    b.onclick = () => {
      const seedText = document.getElementById("seed-input").value.trim() ||
        String(Math.floor(Math.random() * 1e9));
      newGame(seedText, i);
      modal.classList.add("hidden");
      document.getElementById("end-modal").classList.add("hidden");
      S.speed = 1;
      document.querySelectorAll(".spd").forEach(x => x.classList.toggle("active", x.dataset.spd === "1"));
      Object.keys(uiDirty).forEach(k => uiDirty[k] = true);
      // centre the view on the player's capital
      const cap = S.provinces.find(p => p.capital && p.nation === i);
      if (cap) {
        view.scale = 2.5;
        view.x = MAP.provinces[cap.id].x - canvas.width / 2 / view.scale;
        view.y = MAP.provinces[cap.id].y - canvas.height / 2 / view.scale;
      }
    };
    picker.appendChild(b);
  });
}

/* ============================== Main loop ============================== */

let lastTime = performance.now();
let tickAccum = 0;

function frame(now) {
  const dt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
  if (S && S.speed > 0 && !S.ended &&
      document.getElementById("start-modal").classList.contains("hidden")) {
    tickAccum += dt * TICKS_PER_SEC[S.speed];
    let safety = 60;
    while (tickAccum >= 1 && safety-- > 0) { tickAccum -= 1; gameTick(); }
  }
  if (S) { draw(); refreshUI(); }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
showStartModal();
requestAnimationFrame(frame);
