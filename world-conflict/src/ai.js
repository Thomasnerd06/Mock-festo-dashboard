/* ai.js — AI decision-making for all non-player nations */
"use strict";

/* ===== AI TICK ===== */
function tickAI() {
  if (!S || !MAP) return;
  const rng = mulberry32(S.tick ^ 0xabcd1234);
  for (let nid = 0; nid < NATION_COUNT; nid++) {
    const n = S.nations[nid];
    if (!n.ai || n.dead) continue;
    const ai = n.aiState;
    if (ai.cooldown > 0) { ai.cooldown--; continue; }
    ai.cooldown = 4 + (rng()*5)|0;
    try {
      aiDoTurn(nid, n, ai, rng);
    } catch (_) { /* keep AI errors from crashing game */ }
  }
}

function aiDoTurn(nid, n, ai, rng) {
  const myProvs = S.provinces.filter(p => p.nation === nid);
  if (!myProvs.length) return;

  const enemies = aiGetEnemies(nid);
  const neutrals = aiGetNeutrals(nid);
  const allies  = aiGetAllies(nid);

  aiManageEconomy(nid, n, myProvs, rng);
  aiManageResearch(nid, n, rng);
  aiManageEdicts(nid, n, rng);
  aiManageDiplomacy(nid, n, myProvs, enemies, neutrals, allies, rng);
  aiManageBuild(nid, n, myProvs, rng);
  aiManageRecruit(nid, n, myProvs, rng);
  aiManageMilitary(nid, n, myProvs, enemies, rng);
  aiManageEspionage(nid, n, enemies, rng);
}

/* ===== DIPLOMACY ===== */
function aiGetEnemies(nid) {
  const list = [];
  for (let i = 0; i < NATION_COUNT; i++) {
    if (i !== nid && !S.nations[i].dead && atWar(nid, i)) list.push(i);
  }
  return list;
}
function aiGetNeutrals(nid) {
  const list = [];
  for (let i = 0; i < NATION_COUNT; i++) {
    if (i !== nid && !S.nations[i].dead && !atWar(nid,i) && !inAlliance(nid,i)) list.push(i);
  }
  return list;
}
function aiGetAllies(nid) {
  const list = [];
  for (let i = 0; i < NATION_COUNT; i++) {
    if (i !== nid && !S.nations[i].dead && inAlliance(nid, i)) list.push(i);
  }
  return list;
}

function aiManageDiplomacy(nid, n, myProvs, enemies, neutrals, allies, rng) {
  const myStr = nationStrength(nid);

  // seek peace if losing badly
  for (const eid of enemies) {
    const rel = getRelation(nid, eid);
    const enStr = nationStrength(eid);
    const myShare = myProvs.length / Math.max(1, S.provinces.filter(p=>!S.nations[p.nation]?.dead).length);
    if (myStr < enStr * 0.5 || myProvs.length < S.nations[nid].startProvinces * 0.3) {
      if (rng() < 0.15) makePeace(nid, eid);
    }
  }

  // declare war on weak neighbours if strong enough
  if (enemies.length === 0 && rng() < 0.04) {
    const borderNeighbours = [];
    for (const pr of myProvs) {
      for (const adj of MAP.provinces[pr.id].adj) {
        const n2 = S.provinces[adj].nation;
        if (n2 !== nid && n2 >= 0 && !S.nations[n2].dead && !atWar(nid,n2) && !inAlliance(nid,n2)) {
          if (!borderNeighbours.includes(n2)) borderNeighbours.push(n2);
        }
      }
    }
    if (borderNeighbours.length) {
      borderNeighbours.sort((a,b) => nationStrength(a)-nationStrength(b));
      const target = borderNeighbours[0];
      const targetStr = nationStrength(target);
      if (myStr > targetStr * 1.3 || rng() < 0.02) {
        declareWar(nid, target);
        ai_setWarTarget(nid, target);
      }
    }
  }

  // form alliances with high-relation neutrals
  if (allies.length < 2 && rng() < 0.05) {
    for (const nid2 of neutrals) {
      const rel = getRelation(nid, nid2);
      if (rel.score >= 30 && !atWar(nid, nid2)) {
        formAlliance(nid, nid2);
        break;
      }
    }
  }

  // improve relations with neutrals
  if (rng() < 0.08) {
    for (const nid2 of neutrals) {
      const rel = getRelation(nid, nid2);
      if (rel.score < 20 && !atWar(nid,nid2)) { modRelation(nid, nid2, 2 + (rng()*3)|0); break; }
    }
  }
}

function ai_setWarTarget(nid, target) {
  S.nations[nid].aiState.warTarget = target;
}

/* ===== ECONOMY ===== */
function aiManageEconomy(nid, n, myProvs, rng) {
  // auto sell excess resources for money
  const targets = {food:500, oil:400, steel:300, electronics:100, rare_metals:50};
  for (const [res, target] of Object.entries(targets)) {
    if (n[res] > target * 3) {
      const sell = Math.floor((n[res] - target) * 0.3);
      if (sell > 10) { n[res] -= sell; n.money += sell * 0.8; }
    }
  }
}

/* ===== RESEARCH ===== */
function aiGetTechTree(techId) {
  for (const [k, tr] of Object.entries(TECH_TREES)) if (tr.techs.some(x=>x.id===techId)) return k;
  return 'military';
}

function aiManageResearch(nid, n, rng) {
  if (n.research) return;
  const allTechs = getAllTechs();
  const available = allTechs.filter(t => {
    if (n.techsDone.includes(t.id)) return false;
    if (t.req && !n.techsDone.includes(t.req)) return false;
    return n.money >= t.cost;
  });
  if (!available.length) return;
  // bias towards military techs
  const weighted = [];
  for (const t of available) {
    const treeKey = aiGetTechTree(t.id);
    const w = treeKey === 'military' ? 3 : 1;
    for (let i = 0; i < w; i++) weighted.push(t);
  }
  if (!weighted.length) return;
  const chosen = weighted[(rng() * weighted.length) | 0];
  n.research = { id: chosen.id, tree: aiGetTechTree(chosen.id), hoursLeft: chosen.time, totalHours: chosen.time };
  n.money -= chosen.cost;
}

/* ===== EDICTS ===== */
function aiManageEdicts(nid, n, rng) {
  if (rng() > 0.02) return;
  if (n.political_will < 20) return;
  const notActive = EDICTS.filter(e => !n.activeEdicts.includes(e.id));
  if (!notActive.length) return;
  // pick a random affordable edict
  const affordable = notActive.filter(e => {
    if (n.activeEdicts.some(ae => EDICTS.find(x=>x.id===ae)?.conflicts.includes(e.id))) return false;
    return n.political_will >= e.pw;
  });
  if (!affordable.length) return;
  const chosen = affordable[(rng() * affordable.length) | 0];
  enactEdict(nid, chosen.id);
}

/* ===== BUILD ===== */
const AI_BUILD_PRIORITY = [
  'barracks','farm','roads','factory','airbase','industry','fort','hospital','school','mine','oil_rig','naval_base','power_grid'
];

function aiManageBuild(nid, n, myProvs, rng) {
  if (rng() > 0.15) return;
  const freeProvs = myProvs.filter(p => p.buildQueue.length === 0);
  if (!freeProvs.length) return;

  for (const bId of AI_BUILD_PRIORITY) {
    const bt = BUILDING_TYPES[bId];
    if (!bt) continue;
    if (bt.req && !hasTech(nid, bt.req)) continue;
    if (!canAfford(n, bt.cost)) continue;

    // find province that needs this building
    for (const pr of freeProvs) {
      const cur = pr.buildings[bId] || 0;
      if (cur >= bt.max) continue;
      if (bId === 'naval_base' && !pr.coastal) continue;
      if (bId === 'trade_port' && !pr.coastal) continue;
      payResources(n, bt.cost);
      pr.buildQueue.push({ kind: 'building', type: bId, hoursLeft: bt.time, totalHours: bt.time });
      return;
    }
  }
}

/* ===== RECRUIT ===== */
const AI_RECRUIT_PRIORITY = ['inf','art','mot','arm','fig','bmb'];

function aiManageRecruit(nid, n, myProvs, rng) {
  if (rng() > 0.2) return;
  const atWaring = S.nations[nid].aiState.warTarget >= 0 || aiGetEnemies(nid).length > 0;

  for (const uType of AI_RECRUIT_PRIORITY) {
    const ut = UNIT_TYPES[uType];
    if (!ut) continue;
    if (ut.req && !hasTech(nid, ut.req)) continue;
    if (!canAfford(n, ut.cost)) continue;

    // find suitable province
    for (const pr of myProvs) {
      if (pr.buildQueue.length > 0) continue;
      const bld = ut.bld;
      if (bld && !(pr.buildings[bld] > 0)) continue;
      if (uType === 'naval' && !pr.coastal) continue;
      const units = pr.units.filter(u => u.nation === nid);
      if (units.length > 6) continue;

      payResources(n, ut.cost);
      const timeAdj = hasTech(nid,'mass_production') ? 0.8 : 1.0;
      const uTime = Math.ceil(ut.time * timeAdj);
      pr.buildQueue.push({ kind: 'unit', type: uType, hoursLeft: uTime, totalHours: uTime });
      markDirty('military');
      return;
    }
  }
}

/* ===== MILITARY ===== */
function aiManageMilitary(nid, n, myProvs, enemies, rng) {
  if (!enemies.length) {
    aiManageDefence(nid, n, myProvs, rng);
    return;
  }
  aiManageOffence(nid, n, myProvs, enemies, rng);
  aiManageDefence(nid, n, myProvs, rng);
}

function aiManageOffence(nid, n, myProvs, enemies, rng) {
  const eid = enemies[0];
  const enProvs = S.provinces.filter(p => p.nation === eid);
  if (!enProvs.length) return;

  // find border provinces that touch enemy territory
  const border = myProvs.filter(pr =>
    MAP.provinces[pr.id].adj.some(a => S.provinces[a].nation === eid)
  );

  for (const pr of border) {
    const attackers = pr.units.filter(u => u.nation === nid && UNIT_TYPES[u.type].cls === 'land' && u.hp > 2);
    if (attackers.length < 2) continue;

    // find weakest adjacent enemy province
    const adjEn = MAP.provinces[pr.id].adj
      .filter(a => S.provinces[a].nation === eid)
      .sort((a,b) => {
        const da = S.provinces[a].units.filter(u=>u.nation===eid).length;
        const db = S.provinces[b].units.filter(u=>u.nation===eid).length;
        return da - db;
      });

    if (!adjEn.length) continue;
    const target = adjEn[0];

    if (rng() < 0.4) {
      const ids = attackers.map(u => u.id);
      orderMove(nid, pr.id, ids, target);
    }
  }
}

function aiManageDefence(nid, n, myProvs, rng) {
  // redistribute defenders — move isolated units toward capital or threatened provinces
  const threatened = myProvs.filter(pr =>
    MAP.provinces[pr.id].adj.some(a => {
      const ap = S.provinces[a]; return ap.nation !== nid && atWar(nid, ap.nation);
    })
  );

  for (const pr of myProvs) {
    const idle = pr.units.filter(u => u.nation === nid && UNIT_TYPES[u.type].cls === 'land' && u.hp > 5);
    if (idle.length < 3) continue;
    if (threatened.some(t => t.id === pr.id)) continue;
    if (rng() > 0.1) continue;

    // send some to nearest threatened province
    const dest = threatened.sort((a,b) => {
      const da = graphDistance(pr.id, 10);
      return (da[a.id]||99) - (da[b.id]||99);
    })[0];
    if (!dest) continue;

    const movers = idle.slice(0, Math.floor(idle.length * 0.5));
    if (movers.length) orderMove(nid, pr.id, movers.map(u=>u.id), dest.id);
  }
}

/* ===== ESPIONAGE ===== */
function aiManageEspionage(nid, n, enemies, rng) {
  if (rng() > 0.03) return;
  if (!enemies.length) return;
  const eid = enemies[(rng() * enemies.length)|0];
  const lvl = n.spyNets[eid] || 0;
  const op = lvl === 0 ? 'build_network' : lvl >= 2 ? 'gather_intel' : 'build_network';
  const opDef = SPY_OPS.find(o => o.id === op);
  if (!opDef) return;
  if (!canAfford(n, opDef.cost)) return;
  payResources(n, opDef.cost);
  const timeAdj = hasTech(nid,'media_control') ? 0.8 : 1.0;
  S.spyOps.push({ opId: op, targetNid: eid, actorNid: nid, hoursLeft: opDef.time * timeAdj });
}

/* ===== HELPERS ===== */
function nationStrength(nid) {
  const provs = S.provinces.filter(p => p.nation === nid);
  let str = provs.length * 2;
  for (const pr of provs) str += pr.units.filter(u => u.nation === nid).length;
  str += (S.nations[nid].money || 0) * 0.001;
  return str;
}
function findNearestFriendly(pid, nid) {
  const q = [pid]; const vis = new Set([pid]);
  while (q.length) {
    const cur = q.shift();
    if (S.provinces[cur].nation === nid && cur !== pid) return cur;
    for (const adj of MAP.provinces[cur].adj) {
      if (!vis.has(adj)) { vis.add(adj); q.push(adj); }
    }
  }
  return pid;
}
