/* smoke test — runs in Node.js with minimal DOM stubs */
"use strict";

// Stub globals
global.window = { _showBanner: () => {}, _showEndModal: () => {} };
global.localStorage = { getItem:()=>null, setItem:()=>{} };

// Load game files as scripts (browser-style globals via vm)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function loadScript(relPath) {
  const abs = path.resolve(__dirname, relPath);
  const code = fs.readFileSync(abs, 'utf8');
  vm.runInThisContext(code, { filename: abs });
}
loadScript('../src/data.js');
loadScript('../src/engine.js');
loadScript('../src/ai.js');

// Suppress UI functions
global.markDirty = (..._) => {};
global.showBanner = (_) => {};

// Override endGame if defined
const origEndGame = global.endGame;

let tests = 0, passed = 0;
function assert(cond, msg) {
  tests++;
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { console.error('  FAIL:', msg); }
}

// Test 1: Generate a map
console.log('\n=== Test 1: Map generation ===');
const seed = hashStr('test_seed_42');
const map = generateMap(seed);
map.seed = seed;
global.MAP = map;
assert(map.provinces.length >= 30, `Generated ${map.provinces.length} provinces (need >=30)`);
assert(map.provinces.length <= 110, `Province count ${map.provinces.length} <= 110`);
const allAdj = map.provinces.every(p => p.adj && p.adj.length >= 1);
assert(allAdj, 'All provinces have at least 1 adjacency');
console.log(`  Provinces: ${map.provinces.length}, Seed: ${seed}`);

// Test 2: newGame
console.log('\n=== Test 2: Game initialisation ===');
newGame('test_seed_42', 0);
assert(S !== null, 'S is not null after newGame');
assert(S.provinces.length === map.provinces.length, `Province count matches: ${S.provinces.length}`);
assert(S.nations.length === NATION_COUNT, `Nations count: ${S.nations.length}`);
const nationedProvs = S.provinces.filter(p => p.nation >= 0);
assert(nationedProvs.length > 0, `Some provinces are owned (${nationedProvs.length})`);
for (const n of S.nations) {
  const np = S.provinces.filter(p => p.nation === n.id).length;
  assert(np >= 1, `Nation ${n.name} has at least 1 province (has ${np})`);
}

// Test 3: Run 500 ticks
console.log('\n=== Test 3: 500 game ticks ===');
S.speed = 1;
for (let i = 0; i < 500; i++) {
  gameTick();
  if (i % 100 === 0) tickAI();
}
assert(S.tick === 500, `Tick counter is 500 (got ${S.tick})`);
const nanCheck = S.nations.every(n => {
  for (const res of RESOURCES) if (isNaN(n[res])) return false;
  return !isNaN(n.money) && !isNaN(n.approval);
});
assert(nanCheck, 'No NaN resources in any nation after 500 ticks');

// Test 4: Resources are positive (economy working)
console.log('\n=== Test 4: Economy ===');
const player = S.nations[S.player];
assert(player.money >= 0, `Player money >= 0 (got ${player.money.toFixed(0)})`);
console.log(`  Player resources: money=${player.money.toFixed(0)}, food=${player.food.toFixed(0)}, oil=${player.oil.toFixed(0)}`);

// Test 5: Population happiness
console.log('\n=== Test 5: Population & happiness ===');
const hapCheck = S.provinces.every(p => p.happiness >= 0 && p.happiness <= 100);
assert(hapCheck, 'All province happiness values in [0,100]');
const popCheck = S.provinces.every(p => p.population > 0);
assert(popCheck, 'All province populations > 0');

// Test 6: Save/load round-trip
console.log('\n=== Test 6: Deep clone (save/load proxy) ===');
const clone = deepClone(S);
assert(clone !== S, 'Clone is a different object');
assert(clone.nations.length === S.nations.length, `Clone nations count matches`);
assert(clone.provinces.length === S.provinces.length, `Clone provinces count matches`);
assert(clone.tick === S.tick, `Clone tick matches: ${clone.tick}`);

// Test 7: nationStrength helper
console.log('\n=== Test 7: AI helper functions ===');
const str = nationStrength(0);
assert(str >= 0, `nationStrength(0) = ${str} >= 0`);
const enemies = [];
for (let i = 1; i < NATION_COUNT; i++) if (!S.nations[i].dead) enemies.push(i);
assert(enemies.length > 0, `Non-player nations exist: ${enemies.length}`);

// Test 8: Province adjacency connectivity
console.log('\n=== Test 8: Map connectivity ===');
const visited = new Set();
const q2 = [0];
visited.add(0);
while (q2.length) {
  const cur = q2.shift();
  for (const adj of MAP.provinces[cur].adj) {
    if (!visited.has(adj)) { visited.add(adj); q2.push(adj); }
  }
}
assert(visited.size === MAP.provinces.length, `All ${MAP.provinces.length} provinces connected (visited ${visited.size})`);

// Test 9: Run 500 more ticks with AI
console.log('\n=== Test 9: 1000 total ticks with AI ===');
for (let i = 0; i < 500; i++) {
  gameTick();
  if (i % 50 === 0) tickAI();
}
assert(S.tick === 1000, `Tick counter is 1000 (got ${S.tick})`);
const nanCheck2 = S.nations.every(n => {
  for (const res of RESOURCES) if (isNaN(n[res])) return false;
  return !isNaN(n.money) && !isNaN(n.approval);
});
assert(nanCheck2, 'No NaN resources after 1000 ticks with AI');

// Report
console.log(`\n=== Results: ${passed}/${tests} tests passed ===`);
if (passed < tests) process.exit(1);
