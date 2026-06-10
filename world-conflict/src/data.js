/* data.js — all static game definitions */
"use strict";

/* ===== CONSTANTS ===== */
const MAPW = 600, MAPH = 340;
const LAND_TARGET = 90;
const NATION_COUNT = 10;
const WIN_SHARE = 0.55;
const TICKS_PER_SEC = [0, 1, 4, 12, 48];
const ELECTION_INTERVAL = 1460;
const EVENT_INTERVAL_MIN = 120, EVENT_INTERVAL_MAX = 280;
const REBELLION_THRESHOLD = 30;
const REBELLION_HOURS = 48;
const SUPPLY_RADIUS = 5;
const WORLD_COUNCIL_INTERVAL = 240;
const RESOURCES = ['money','food','oil','steel','electronics','rare_metals','manpower'];

/* ===== NATIONS ===== */
const NATION_DEFS = [
  { name:'Arvenia',      color:'#d6494f' },
  { name:'Boreal Union', color:'#4d7fd6' },
  { name:'Cestria',      color:'#53b364' },
  { name:'Drakmar',      color:'#d6a138' },
  { name:'Ostrava',      color:'#9259c9' },
  { name:'Veridia',      color:'#3cb5b0' },
  { name:'Khalend',      color:'#d66ba6' },
  { name:'Tervany',      color:'#9a7a52' },
  { name:'Embria',       color:'#e07840' },
  { name:'Syndicate',    color:'#78c0e8' },
];

/* ===== TERRAINS ===== */
const TERRAINS = {
  plains:   { name:'Plains',   moveMult:1.0, defMult:1.0,  shade:0,   foodMult:1.3, oilChance:0.15, steelChance:0.05, rareChance:0.04 },
  forest:   { name:'Forest',   moveMult:1.3, defMult:1.2,  shade:-14, foodMult:0.7, oilChance:0.08, steelChance:0.08, rareChance:0.05 },
  mountain: { name:'Mountain', moveMult:1.8, defMult:1.5,  shade:-30, foodMult:0.3, oilChance:0.10, steelChance:0.30, rareChance:0.20 },
  desert:   { name:'Desert',   moveMult:1.2, defMult:0.85, shade:25,  foodMult:0.2, oilChance:0.35, steelChance:0.05, rareChance:0.08 },
  coastal:  { name:'Coastal',  moveMult:1.0, defMult:1.0,  shade:5,   foodMult:1.0, oilChance:0.20, steelChance:0.05, rareChance:0.04 },
};

/* ===== UNIT TYPES ===== */
const UNIT_TYPES = {
  /* — LAND — */
  militia:    { name:'Militia',          cls:'land',  atk:2,  def:5,  hp:18, spd:3.5, cost:{money:200,manpower:1},                                  upkeep:{money:0.20,food:0.02}, time:3,  req:null,           bld:'barracks',   icon:'◻', desc:'Cheap garrison.' },
  inf:        { name:'Infantry',         cls:'land',  atk:4,  def:7,  hp:22, spd:3.0, cost:{money:300,manpower:2},                                  upkeep:{money:0.35,food:0.03}, time:4,  req:null,           bld:'barracks',   icon:'▣', desc:'Reliable all-purpose infantry.' },
  sf:         { name:'Special Forces',   cls:'land',  atk:9,  def:7,  hp:20, spd:2.5, cost:{money:2000,manpower:3},                                 upkeep:{money:1.20,food:0.05}, time:20, req:'special_forces',bld:'barracks',   icon:'✦', desc:'Elite soldiers. High attack.' },
  mot:        { name:'Motorised Inf.',   cls:'land',  atk:5,  def:6,  hp:24, spd:1.5, cost:{money:550,oil:30,manpower:2},                           upkeep:{money:0.50,oil:0.4,food:0.03}, time:6, req:'motorised', bld:'barracks', icon:'▤', desc:'Fast infantry in vehicles.' },
  mech:       { name:'Mechanised Inf.',  cls:'land',  atk:7,  def:8,  hp:28, spd:2.0, cost:{money:800,steel:50,oil:40,manpower:3},                  upkeep:{money:0.70,oil:0.5,food:0.04}, time:8, req:'mechanised', bld:'factory', icon:'▥', desc:'Infantry in IFVs.' },
  arm:        { name:'Armour',           cls:'land',  atk:11, def:8,  hp:32, spd:2.0, cost:{money:1000,steel:100,oil:60,manpower:3},                upkeep:{money:0.90,oil:0.7,food:0.04}, time:10, req:'armour',  bld:'factory',  icon:'◆', desc:'Tank units. Vulnerable to AT.' },
  heavy_arm:  { name:'Heavy Armour',     cls:'land',  atk:15, def:11, hp:38, spd:2.5, cost:{money:1800,steel:200,oil:80,manpower:4},                upkeep:{money:1.40,oil:1.0,food:0.05}, time:18, req:'heavy_armour', bld:'factory', icon:'◈', desc:'Main battle tanks.' },
  art:        { name:'Artillery',        cls:'land',  atk:3,  def:3,  hp:18, spd:3.5, ranged:10, cost:{money:700,steel:80,manpower:3},              upkeep:{money:0.70,food:0.04}, time:8, req:'artillery',  bld:'factory',   icon:'✚', desc:'Bombards adjacent provinces.' },
  mlrs:       { name:'MLRS',             cls:'land',  atk:2,  def:2,  hp:18, spd:3.5, ranged:14, range:2, cost:{money:1200,steel:120,electronics:20,manpower:3}, upkeep:{money:1.00,oil:0.3,food:0.04}, time:12, req:'rockets', bld:'factory', icon:'⊕', desc:'Rocket artillery. Range 2.' },
  aa:         { name:'Anti-Air',         cls:'land',  atk:1,  def:4,  hp:20, spd:3.5, aaDef:12,  cost:{money:600,steel:60,electronics:20,manpower:2}, upkeep:{money:0.60,food:0.03}, time:7, req:'aa_doctrine', bld:'factory',  icon:'⊗', desc:'Shoots down aircraft.' },
  at:         { name:'Anti-Tank',        cls:'land',  atk:2,  def:4,  hp:20, spd:3.5, atBonus:8, cost:{money:500,steel:60,manpower:2},              upkeep:{money:0.50,food:0.03}, time:6, req:'anti_tank',  bld:'factory',   icon:'⊙', desc:'+damage vs. armour.' },
  engineer:   { name:'Engineers',        cls:'land',  atk:2,  def:4,  hp:20, spd:3.5, cost:{money:500,manpower:3},                                  upkeep:{money:0.50,food:0.03}, time:6, req:null,          bld:'barracks',   icon:'⚙', desc:'Build forts faster.' },
  srbm:       { name:'Ballistic Missile',cls:'land',  atk:0,  def:0,  hp:12, spd:4.0, strikeDmg:40,strikeRange:8, cost:{money:3000,steel:150,electronics:80,rare_metals:30,manpower:4}, upkeep:{money:2.0,electronics:0.1}, time:30, req:'missiles', bld:'missile_silo', icon:'☄', desc:'Long-range missile strike.' },
  nuke:       { name:'Nuclear Warhead',  cls:'land',  atk:0,  def:0,  hp:10, spd:5.0, strikeDmg:200,strikeRange:10,nuclear:true, cost:{money:8000,steel:400,electronics:300,rare_metals:200,manpower:5}, upkeep:{money:4.0,electronics:0.3,rare_metals:0.1}, time:72, req:'nuclear_weapons', bld:'missile_silo', icon:'☢', desc:'WMD. Massive AOE. Severe consequences.' },
  /* — AIR — */
  drone:      { name:'Recon Drone',      cls:'air',   atk:3,  def:2,  hp:14, spd:0, range:6,  cooldown:4, cost:{money:800,electronics:50,manpower:1},            upkeep:{money:0.60,oil:0.3,electronics:0.05}, time:8,  req:'drones',      bld:'airbase',    icon:'⛟', desc:'Reveals positions. Light strike.' },
  fig:        { name:'Fighter',          cls:'air',   atk:7,  def:9,  hp:20, spd:0, range:5,  cooldown:6, cost:{money:1200,steel:100,oil:80,manpower:2},          upkeep:{money:1.00,oil:0.8},                  time:12, req:'fighters',     bld:'airbase',    icon:'✈', desc:'Air superiority. Intercepts.' },
  multi:      { name:'Multirole',        cls:'air',   atk:9,  def:8,  hp:22, spd:0, range:6,  cooldown:6, cost:{money:1600,steel:120,oil:100,electronics:40,manpower:2}, upkeep:{money:1.30,oil:1.0,electronics:0.05}, time:16, req:'multirole', bld:'airbase', icon:'✈', desc:'Effective vs. air and ground.' },
  bmb:        { name:'Bomber',           cls:'air',   atk:16, def:3,  hp:24, spd:0, range:7,  cooldown:8, cost:{money:1500,steel:140,oil:100,manpower:2},          upkeep:{money:1.40,oil:1.0},                  time:14, req:'bombers',      bld:'airbase',    icon:'⊞', desc:'Heavy strategic bomber.' },
  ah:         { name:'Attack Helicopter',cls:'air',   atk:10, def:5,  hp:20, spd:0, range:4,  cooldown:5, armouredBonus:6, cost:{money:1000,steel:80,oil:60,manpower:2}, upkeep:{money:0.90,oil:0.7}, time:10, req:'helicopters', bld:'airbase', icon:'⊕', desc:'Excellent vs. armour.' },
  trans_heli: { name:'Transport Heli.',  cls:'air',   atk:1,  def:2,  hp:16, spd:0, range:4,  cooldown:4, capacity:3, cost:{money:600,steel:60,oil:40,manpower:2}, upkeep:{money:0.60,oil:0.5}, time:8, req:'helicopters', bld:'airbase', icon:'⊠', desc:'Carries 3 land units.' },
  /* — NAVAL — */
  patrol:     { name:'Patrol Boat',      cls:'naval', atk:3,  def:4,  hp:18, spd:2.5, cost:{money:400,steel:40,oil:20,manpower:2},                  upkeep:{money:0.40,oil:0.3},                  time:4,  req:'naval_power',  bld:'naval_base', icon:'⛵', desc:'Cheap coastal patrol.' },
  dest:       { name:'Destroyer',        cls:'naval', atk:7,  def:7,  hp:28, spd:2.0, subHunter:true, cost:{money:1200,steel:150,oil:60,manpower:5}, upkeep:{money:1.10,oil:0.6},                  time:10, req:'naval_power',  bld:'naval_base', icon:'⛵', desc:'Fast. Anti-submarine.' },
  sub:        { name:'Submarine',        cls:'naval', atk:10, def:4,  hp:22, spd:2.5, stealth:true, cost:{money:1500,steel:200,electronics:60,oil:40,manpower:4}, upkeep:{money:1.20,oil:0.5,electronics:0.05}, time:14, req:'submarines', bld:'naval_base', icon:'○', desc:'Stealth. Ambush attacks.' },
  cruiser:    { name:'Cruiser',          cls:'naval', atk:12, def:9,  hp:38, spd:2.0, coastalBombard:14, cost:{money:2000,steel:250,oil:80,manpower:8}, upkeep:{money:1.80,oil:0.8},               time:20, req:'cruisers',     bld:'naval_base', icon:'⛵', desc:'Heavy warship. Bombards coast.' },
  carrier:    { name:'Aircraft Carrier', cls:'naval', atk:4,  def:8,  hp:50, spd:3.0, airRangeBonus:5, cost:{money:4000,steel:400,oil:100,electronics:100,manpower:20}, upkeep:{money:3.50,oil:1.5,electronics:0.1}, time:36, req:'carriers', bld:'naval_base', icon:'⊞', desc:'Extends air range by 5.' },
  amp_ship:   { name:'Amphibious Assault',cls:'naval',atk:5,  def:6,  hp:30, spd:3.0, capacity:6, amphibious:true, cost:{money:1800,steel:200,oil:80,manpower:10}, upkeep:{money:1.50,oil:0.7}, time:18, req:'amphibious', bld:'naval_base', icon:'⛵', desc:'Carries 6 land units to hostile coast.' },
  trans_ship: { name:'Transport Ship',   cls:'naval', atk:1,  def:3,  hp:20, spd:3.0, capacity:8, cost:{money:800,steel:100,oil:40,manpower:5},      upkeep:{money:0.70,oil:0.4},                  time:8,  req:'naval_power',  bld:'naval_base', icon:'⛵', desc:'Carries 8 land units across sea.' },
};

/* ===== BUILDINGS ===== */
const BUILDING_TYPES = {
  /* Military */
  barracks:     { name:'Barracks',           max:2, time:12, cat:'Military',    cost:{money:600,steel:100},                          req:null,             desc:'Enables infantry. Lvl 2 = faster training.' },
  factory:      { name:'Arms Factory',       max:2, time:24, cat:'Military',    cost:{money:1500,steel:400},                         req:'heavy_industry', desc:'Enables armoured & artillery units.' },
  airbase:      { name:'Airbase',            max:2, time:20, cat:'Military',    cost:{money:1200,steel:300,electronics:50},          req:null,             desc:'Enables aircraft. Lvl 2 = more sorties.' },
  naval_base:   { name:'Naval Base',         max:1, time:24, cat:'Military',    cost:{money:1500,steel:350},                         req:'naval_power',    desc:'Enables naval units. Coastal only.' },
  missile_silo: { name:'Missile Silo',       max:1, time:36, cat:'Military',    cost:{money:3000,steel:500,electronics:200,rare_metals:50}, req:'missiles', desc:'Launch pad for ballistic missiles & nukes.' },
  aa_battery:   { name:'AA Battery',         max:2, time:10, cat:'Military',    cost:{money:400,steel:80,electronics:30},            req:'aa_doctrine',    desc:'+8 AA defence per level.' },
  radar:        { name:'Radar Station',      max:1, time:14, cat:'Military',    cost:{money:600,electronics:100},                    req:null,             desc:'Reveals enemy movements in adj. provinces.' },
  command_hq:   { name:'Command HQ',         max:1, time:18, cat:'Military',    cost:{money:1200,electronics:150},                   req:null,             desc:'-15% unit training time.' },
  fort:         { name:'Fortress',           max:3, time:12, cat:'Military',    cost:{money:500,steel:200},                          req:null,             desc:'-15% damage to defenders per level.' },
  /* Economic */
  farm:         { name:'Farm',               max:3, time:10, cat:'Economic',    cost:{money:400},                                    req:null,             desc:'+2 food/h per level.' },
  mine:         { name:'Mine',               max:2, time:16, cat:'Economic',    cost:{money:600,steel:50},                           req:null,             desc:'+1.5 steel/h & +0.5 rare metals/h per level.' },
  oil_rig:      { name:'Oil Rig',            max:2, time:18, cat:'Economic',    cost:{money:800,steel:80,electronics:20},            req:null,             desc:'+3 oil/h per level (more if oil-rich terrain).' },
  electronics_plant: { name:'Electronics Plant', max:1, time:20, cat:'Economic', cost:{money:1200,steel:200,electronics:50,rare_metals:20}, req:'electronics', desc:'+2 electronics/h. Needs power grid.' },
  trade_port:   { name:'Trade Port',         max:1, time:16, cat:'Economic',    cost:{money:800,steel:150},                          req:null,             desc:'+30% money income. Enables trade deals. Coastal.' },
  nuclear_plant:{ name:'Nuclear Plant',      max:1, time:48, cat:'Economic',    cost:{money:4000,steel:600,electronics:300,rare_metals:100}, req:'nuclear_power', desc:'+60% province output. +5 pollution.' },
  industry:     { name:'Industry',           max:3, time:30, cat:'Economic',    cost:{money:1800,steel:400},                         req:'heavy_industry', desc:'+40% money income per level. +1 pollution/lvl.' },
  /* Civil */
  hospital:     { name:'Hospital',           max:2, time:14, cat:'Civil',       cost:{money:600,electronics:30},                     req:null,             desc:'+20 healthcare happiness per level.' },
  school:       { name:'School',             max:2, time:12, cat:'Civil',       cost:{money:400},                                    req:null,             desc:'+15 education happiness. +5% research speed.' },
  university:   { name:'University',         max:1, time:20, cat:'Civil',       cost:{money:1200,electronics:60},                    req:'public_education', desc:'+20 education happiness. +10% research speed.' },
  cultural_center: { name:'Cultural Centre', max:1, time:14, cat:'Civil',      cost:{money:700},                                    req:null,             desc:'+20 entertainment happiness.' },
  stadium:      { name:'Stadium',            max:1, time:16, cat:'Civil',       cost:{money:900,steel:100},                          req:null,             desc:'+15 entertainment happiness. +8 unit morale.' },
  temple:       { name:'Temple',             max:1, time:10, cat:'Civil',       cost:{money:300},                                    req:null,             desc:'+20 religious approval. +10 happiness to religious pop.' },
  police:       { name:'Police Station',     max:2, time:10, cat:'Civil',       cost:{money:400,electronics:20},                     req:null,             desc:'-30% crime per level. +15 safety happiness.' },
  park:         { name:'Park',               max:1, time:8,  cat:'Civil',       cost:{money:200},                                    req:null,             desc:'-1 pollution. +10 environment happiness.' },
  /* Infrastructure */
  roads:        { name:'Road Network',       max:1, time:14, cat:'Infrastructure', cost:{money:500,steel:80},                        req:null,             desc:'-25% land movement time. +10% economic output.' },
  railway:      { name:'Railway',            max:1, time:22, cat:'Infrastructure', cost:{money:1000,steel:200},                      req:'mass_production', desc:'-35% land movement time. +15% output.' },
  power_grid:   { name:'Power Grid',         max:1, time:12, cat:'Infrastructure', cost:{money:600,electronics:50,steel:80},         req:null,             desc:'Required for electronics plant. +10% output.' },
  water_supply: { name:'Water Supply',       max:1, time:10, cat:'Infrastructure', cost:{money:350},                                 req:null,             desc:'+15 healthcare happiness.' },
};

/* ===== RESEARCH TREES ===== */
const TECH_TREES = {
  military: {
    name:'Military Doctrine', color:'#e5604c',
    techs:[
      { id:'motorised',       name:'Motorised Warfare',      req:null,           cost:800,  time:12, desc:'Unlocks Motorised Infantry.' },
      { id:'mechanised',      name:'Mechanised Infantry',    req:'motorised',    cost:1200, time:18, desc:'Unlocks Mechanised Infantry.' },
      { id:'armour',          name:'Armoured Corps',         req:'motorised',    cost:1600, time:24, desc:'Unlocks Armour.' },
      { id:'heavy_armour',    name:'Heavy Armour',           req:'armour',       cost:2400, time:30, desc:'Unlocks Heavy Armour.' },
      { id:'artillery',       name:'Field Artillery',        req:null,           cost:1000, time:16, desc:'Unlocks Artillery (bombards adj).' },
      { id:'rockets',         name:'Rocket Artillery',       req:'artillery',    cost:1600, time:22, desc:'Unlocks MLRS (range 2).' },
      { id:'fighters',        name:'Air Superiority',        req:null,           cost:1600, time:24, desc:'Unlocks Fighters.' },
      { id:'bombers',         name:'Strategic Bombing',      req:'fighters',     cost:1800, time:28, desc:'Unlocks Bombers.' },
      { id:'multirole',       name:'Multirole Aircraft',     req:'fighters',     cost:2000, time:28, desc:'Unlocks Multirole.' },
      { id:'helicopters',     name:'Rotary Wing',            req:null,           cost:1400, time:20, desc:'Unlocks Attack & Transport Helicopters.' },
      { id:'aa_doctrine',     name:'Anti-Air Doctrine',      req:null,           cost:800,  time:14, desc:'Unlocks AA units & AA Battery.' },
      { id:'anti_tank',       name:'Anti-Tank Warfare',      req:null,           cost:700,  time:12, desc:'Unlocks Anti-Tank units.' },
      { id:'special_forces',  name:'Special Operations',     req:null,           cost:1400, time:20, desc:'Unlocks Special Forces.' },
      { id:'drones',          name:'Drone Warfare',          req:null,           cost:1200, time:18, desc:'Unlocks Recon Drones.' },
      { id:'naval_power',     name:'Naval Power',            req:null,           cost:1200, time:20, desc:'Unlocks Destroyers & Transports.' },
      { id:'submarines',      name:'Submarine Warfare',      req:'naval_power',  cost:1800, time:28, desc:'Unlocks Submarines (stealth).' },
      { id:'cruisers',        name:'Surface Warfare',        req:'naval_power',  cost:2000, time:28, desc:'Unlocks Cruisers (coastal bombard).' },
      { id:'carriers',        name:'Carrier Operations',     req:'cruisers',     cost:3000, time:36, desc:'Unlocks Aircraft Carriers.' },
      { id:'amphibious',      name:'Amphibious Ops',         req:'naval_power',  cost:1800, time:24, desc:'Unlocks Amphibious Assault Ships.' },
      { id:'missiles',        name:'Ballistic Missiles',     req:null,           cost:2800, time:36, desc:'Unlocks SRBM & Missile Silo.' },
      { id:'nuclear_weapons', name:'Nuclear Programme',      req:'missiles',     cost:5000, time:72, desc:'Unlocks Nuclear Warheads.' },
    ]
  },
  industrial: {
    name:'Industrial', color:'#d6a138',
    techs:[
      { id:'mass_production',      name:'Mass Production',     req:null,                cost:800,  time:14, desc:'-20% unit build time. Unlocks Railway.' },
      { id:'heavy_industry',       name:'Heavy Industry',      req:'mass_production',   cost:1200, time:20, desc:'Unlocks Factory Lvl 2 & Industry buildings.' },
      { id:'electronics',          name:'Electronics',         req:null,                cost:1000, time:18, desc:'Unlocks Electronics Plant.' },
      { id:'rare_metals_refining', name:'Rare Metals Refining',req:null,                cost:1200, time:20, desc:'+50% rare metal income.' },
      { id:'nuclear_power',        name:'Nuclear Energy',      req:'rare_metals_refining',cost:3000,time:40,desc:'Unlocks Nuclear Plant (+60% output).' },
      { id:'advanced_computing',   name:'Advanced Computing',  req:'electronics',       cost:1600, time:24, desc:'-20% all research time.' },
      { id:'automation',           name:'Automation',          req:'heavy_industry',    cost:2000, time:28, desc:'+30% economic output nationwide.' },
      { id:'logistics',            name:'Logistics',           req:'mass_production',   cost:1200, time:18, desc:'Land units move 25% faster.' },
    ]
  },
  social: {
    name:'Social', color:'#53b364',
    techs:[
      { id:'public_education',    name:'Public Education',    req:null,                  cost:800,  time:14, desc:'+15% research speed. Unlocks University.' },
      { id:'universal_healthcare',name:'Universal Healthcare', req:null,                  cost:1000, time:16, desc:'+20 healthcare happiness. Pop grows 10% faster.' },
      { id:'cultural_revolution', name:'Cultural Revolution', req:null,                  cost:1200, time:18, desc:'+1 political will/h. +10 intellectual approval.' },
      { id:'social_welfare',      name:'Social Welfare',      req:null,                  cost:1000, time:16, desc:'-50% unemployment effect on happiness.' },
      { id:'advanced_medicine',   name:'Advanced Medicine',   req:'universal_healthcare', cost:1600, time:24, desc:'-80% disease impact. +10 healthcare happiness.' },
      { id:'media_control',       name:'Mass Media',          req:null,                  cost:1000, time:18, desc:'Spy ops 20% more effective. +5 approval.' },
      { id:'diplomacy_corps',     name:'Diplomacy Corps',     req:null,                  cost:1200, time:20, desc:'+5 relations with all neutral nations.' },
      { id:'space_program',       name:'Space Programme',     req:'advanced_computing',  cost:4000, time:60, desc:'+30% research speed. +20 intellectual approval.' },
    ]
  }
};

/* ===== FACTIONS ===== */
const FACTIONS = {
  militarist:      { name:'Militarists',       color:'#e5604c', icon:'⚔',  desc:'Military strength and expansion.' },
  capitalist:      { name:'Capitalists',       color:'#d6a138', icon:'💰', desc:'Free markets and open trade.' },
  communist:       { name:'Communists',        color:'#e06060', icon:'★',  desc:'State industry and social welfare.' },
  environmentalist:{ name:'Environmentalists', color:'#53b364', icon:'🌿', desc:'Clean energy and green policy.' },
  intellectual:    { name:'Intellectuals',     color:'#4d7fd6', icon:'🔬', desc:'Education, research, and culture.' },
  religious:       { name:'Religious',         color:'#d6c87a', icon:'✝',  desc:'Faith, tradition, and conservative values.' },
};
const FACTION_KEYS = Object.keys(FACTIONS);

/* ===== EDICTS ===== */
const EDICTS = [
  { id:'free_market',         name:'Free Market',            cat:'Economic',    pw:20, upkeep:0, conflicts:['planned_economy'],        desc:'Deregulate the economy.', effects:{ money_mult:0.15, capitalist_approval:15, communist_approval:-10 } },
  { id:'planned_economy',     name:'Planned Economy',        cat:'Economic',    pw:25, upkeep:0, conflicts:['free_market'],             desc:'State controls key industries.', effects:{ steel_mult:0.20, electronics_mult:0.15, capitalist_approval:-15, communist_approval:15 } },
  { id:'trade_tariffs',       name:'Trade Tariffs',          cat:'Economic',    pw:15, upkeep:0, conflicts:[],                          desc:'Tax imports. Boosts income.', effects:{ money_mult:0.10, relations_penalty:-5 } },
  { id:'nationalize_oil',     name:'Nationalise Oil',        cat:'Economic',    pw:30, upkeep:0, conflicts:['free_market'],             desc:'State controls oil.', effects:{ oil_mult:0.30, capitalist_approval:-20, communist_approval:20 } },
  { id:'foreign_investment',  name:'Foreign Investment',     cat:'Economic',    pw:20, upkeep:3, conflicts:['planned_economy'],         desc:'Attract foreign capital.', effects:{ money_mult:0.20, capitalist_approval:10, communist_approval:-8 } },
  { id:'universal_healthcare_law', name:'Universal Healthcare', cat:'Social',  pw:30, upkeep:4, conflicts:[],                          desc:'Free healthcare for all.', effects:{ happiness_healthcare:20, intellectual_approval:15, communist_approval:10 } },
  { id:'education_for_all',   name:'Education for All',      cat:'Social',      pw:25, upkeep:3, conflicts:[],                          desc:'Free schooling nationwide.', effects:{ research_speed:0.10, intellectual_approval:15, happiness_education:15 } },
  { id:'entertainment_subsidies', name:'Entertainment Subsidies', cat:'Social', pw:20, upkeep:2, conflicts:[],                          desc:'State-funded arts and entertainment.', effects:{ happiness_entertainment:15, intellectual_approval:8 } },
  { id:'social_welfare_net',  name:'Social Safety Net',      cat:'Social',      pw:30, upkeep:5, conflicts:[],                          desc:'Unemployment benefits and welfare.', effects:{ happiness_employment:20, communist_approval:15, capitalist_approval:-5 } },
  { id:'conscription',        name:'Conscription',           cat:'Military',    pw:20, upkeep:0, conflicts:['professional_army'],       desc:'Mandatory military service.', effects:{ manpower_mult:0.50, communist_approval:-12, militarist_approval:15 } },
  { id:'professional_army',   name:'Professional Army',      cat:'Military',    pw:25, upkeep:4, conflicts:['conscription'],            desc:'Volunteer professional military.', effects:{ unit_quality:0.15, militarist_approval:10 } },
  { id:'nuclear_doctrine',    name:'Nuclear Doctrine',       cat:'Military',    pw:35, upkeep:0, conflicts:[],                          desc:'Declare nuclear first-use policy.', effects:{ deterrence:true, environmentalist_approval:-20, militarist_approval:20, relations_penalty:-10 } },
  { id:'press_freedom',       name:'Press Freedom',          cat:'Political',   pw:15, upkeep:0, conflicts:['censorship'],              desc:'Free independent media.', effects:{ intellectual_approval:20, religious_approval:-5, relations_bonus:5 } },
  { id:'censorship',          name:'State Censorship',       cat:'Political',   pw:20, upkeep:0, conflicts:['press_freedom'],           desc:'Control the narrative.', effects:{ intellectual_approval:-20, approval_bonus:5, spy_defence:0.15 } },
  { id:'state_religion',      name:'State Religion',         cat:'Political',   pw:20, upkeep:0, conflicts:['secular_state'],           desc:'Official state religion.', effects:{ religious_approval:25, intellectual_approval:-10 } },
  { id:'secular_state',       name:'Secular State',          cat:'Political',   pw:15, upkeep:0, conflicts:['state_religion'],          desc:'Separation of religion and state.', effects:{ intellectual_approval:15, religious_approval:-20 } },
  { id:'green_industry',      name:'Green Industry',         cat:'Environment', pw:25, upkeep:2, conflicts:['heavy_industry_subsidies'], desc:'Mandate clean production.', effects:{ pollution_mult:-0.50, industry_mult:-0.15, environmentalist_approval:25, capitalist_approval:-10 } },
  { id:'heavy_industry_subsidies', name:'Heavy Industry Subsidies', cat:'Environment', pw:20, upkeep:3, conflicts:['green_industry'], desc:'Subsidise heavy industry.', effects:{ steel_mult:0.25, electronics_mult:0.25, pollution_mult:0.50, environmentalist_approval:-20 } },
];

/* ===== RANDOM EVENTS ===== */
const RANDOM_EVENTS = [
  { id:'trade_winds',    title:'Favourable Trade Winds',   cat:'Economic',   condition:_=>true,
    desc:'A surge in international trade boosts your economy.',
    choices:[
      { text:'Accept the windfall.',        effect:{ type:'resource_bonus', resource:'money', pct:15, duration:24 } },
      { text:'Reinvest in infrastructure.', effect:{ type:'resource_bonus', resource:'money', pct:8, duration:48, also:'industry_boost' } },
    ]},
  { id:'market_crash',   title:'Market Crash',             cat:'Economic',   condition:_=>true,
    desc:'International financial turmoil hammers your economy.',
    choices:[
      { text:'Weather the storm.',                        effect:{ type:'resource_penalty', resource:'money', pct:20, duration:36 } },
      { text:'Emergency stimulus (costs ₩2000).',        effect:{ type:'resource_penalty', resource:'money', pct:8, duration:18, cost:{money:2000} } },
    ]},
  { id:'resource_discovery', title:'Resource Discovery',  cat:'Economic',   condition:_=>true,
    desc:'Surveys reveal significant deposits in one of your provinces.',
    choices:[
      { text:'Begin extraction immediately.', effect:{ type:'resource_bonus', resource:'oil', pct:50, duration:168 } },
      { text:'Develop sustainably.',          effect:{ type:'resource_bonus', resource:'oil', pct:25, duration:240, also:'steel_small_bonus' } },
    ]},
  { id:'supply_crisis',  title:'Supply Chain Crisis',      cat:'Economic',   condition:_=>true,
    desc:'Global disruptions cut off critical supply routes.',
    choices:[
      { text:'Source domestically (costs ₩500).', effect:{ type:'resource_penalty', resource:'food', pct:10, duration:24, cost:{money:500} } },
      { text:'Accept the disruption.',             effect:{ type:'resource_penalty', resource:'food', pct:25, duration:48 } },
    ]},
  { id:'coup_attempt',   title:'Coup Attempt',             cat:'Political',  condition: s => s.nations[s.player].approval < 45,
    desc:'A faction within your military attempts a power grab.',
    choices:[
      { text:'Crush the coup with loyal troops.',           effect:{ type:'approval_change', delta:-5,  faction:'militarist', faction_delta:-15 } },
      { text:'Negotiate and grant concessions (₩1500).',   effect:{ type:'approval_change', delta:-3,  faction:'militarist', faction_delta:10, cost:{money:1500} } },
      { text:'Grant emergency military powers.',           effect:{ type:'approval_change', delta:-10, faction:'militarist', faction_delta:25, faction2:'intellectual', faction2_delta:-20 } },
    ]},
  { id:'popular_uprising', title:'Popular Uprising',       cat:'Political',  condition: s => s.provinces.some(p => p.nation === s.player && p.happiness < 35),
    desc:'Citizens are taking to the streets. Unrest is spreading.',
    choices:[
      { text:'Send in police (₩800).',                     effect:{ type:'approval_change', delta:-8,  cost:{money:800} } },
      { text:'Address concerns (₩2000, 20 PW).',           effect:{ type:'happiness_boost', delta:10,  cost:{money:2000,political_will:20} } },
      { text:'Declare emergency rule.',                    effect:{ type:'approval_change', delta:-10, faction:'intellectual', faction_delta:-25 } },
    ]},
  { id:'scandal',        title:'Political Scandal',        cat:'Political',  condition:_=>true,
    desc:'A corruption scandal is exposed by the press.',
    choices:[
      { text:'Deny everything.',              effect:{ type:'approval_change', delta:-15 } },
      { text:'Apologise publicly (30 PW).',   effect:{ type:'approval_change', delta:-5, cost:{political_will:30} } },
    ]},
  { id:'elite_veterans', title:'Battle-Hardened Veterans', cat:'Military',   condition: s => s.provinces.some(p => p.nation === s.player && p.units.some(u => u.nation === s.player && u.experience > 40)),
    desc:'A unit distinguished itself in combat and demands recognition.',
    choices:[
      { text:'Honour them with a commendation.',           effect:{ type:'faction_approval', faction:'militarist', delta:10, also:'exp_boost' } },
      { text:'Use them as instructors.',                   effect:{ type:'research_boost', delta:5, faction:'intellectual', faction_delta:5 } },
    ]},
  { id:'disease_outbreak', title:'Disease Outbreak',       cat:'Natural',    condition:_=>true,
    desc:'A dangerous disease is spreading through your population.',
    choices:[
      { text:'Impose quarantine.',                         effect:{ type:'pop_loss', pct:2, duration:48, happiness_delta:-10 } },
      { text:'Emergency response (₩1500).',               effect:{ type:'pop_loss', pct:1, cost:{money:1500} } },
      { text:'Hope it passes.',                            effect:{ type:'pop_loss', pct:5, duration:72, happiness_delta:-20 } },
    ]},
  { id:'earthquake',     title:'Earthquake',               cat:'Natural',    condition:_=>true,
    desc:'A powerful earthquake has struck one of your provinces.',
    choices:[
      { text:'Mobilise emergency services (₩2000).', effect:{ type:'building_damage', levels:1, cost:{money:2000} } },
      { text:'Accept international aid.',             effect:{ type:'building_damage', levels:2, relations_all_delta:10 } },
    ]},
  { id:'good_harvest',   title:'Bumper Harvest',           cat:'Natural',    condition:_=>true,
    desc:'Exceptional weather produces record agricultural yields.',
    choices:[
      { text:'Stockpile the surplus.',    effect:{ type:'resource_bonus', resource:'food', pct:40, duration:72 } },
      { text:'Export for profit.',        effect:{ type:'resource_bonus', resource:'money', pct:15, duration:48 } },
    ]},
  { id:'flood',          title:'Devastating Floods',       cat:'Natural',    condition:_=>true,
    desc:'Severe flooding has damaged farmland.',
    choices:[
      { text:'Emergency relief funds (₩1200).', effect:{ type:'resource_penalty', resource:'food', pct:15, duration:24, cost:{money:1200} } },
      { text:'Accept the losses.',               effect:{ type:'resource_penalty', resource:'food', pct:35, duration:48, happiness_delta:-8 } },
    ]},
  { id:'foreign_interference', title:'Foreign Interference', cat:'Diplomatic', condition: s => s.wars.length > 0,
    desc:'A foreign power is funding opposition groups within your territory.',
    choices:[
      { text:'Expose and expel their operatives.',  effect:{ type:'approval_change', delta:3 } },
      { text:'Counter-propaganda (₩800).',          effect:{ type:'approval_change', delta:5, cost:{money:800} } },
    ]},
  { id:'un_condemnation', title:'World Council Condemnation', cat:'Diplomatic', condition: s => s.wars.length > 0,
    desc:'The World Council has condemned your recent actions.',
    choices:[
      { text:'Ignore the resolution.',  effect:{ type:'relations_all', delta:-5, approval_delta:-3 } },
      { text:'Offer a public apology.', effect:{ type:'relations_all', delta:-2, approval_delta:-8 } },
    ]},
  { id:'peace_prize',    title:'International Peace Award', cat:'Diplomatic',  condition: s => s.wars.length === 0,
    desc:'Your peaceful foreign policy has earned international recognition.',
    choices:[
      { text:'Accept graciously.',       effect:{ type:'approval_change', delta:8, relations_all_delta:5, faction:'intellectual', faction_delta:15 } },
      { text:'Dedicate it to the people.',effect:{ type:'approval_change', delta:12, faction:'communist', faction_delta:10, faction2:'intellectual', faction2_delta:10 } },
    ]},
  { id:'arms_race',      title:'Global Arms Race',          cat:'Military',    condition:_=>true,
    desc:'International tensions are driving a global arms race.',
    choices:[
      { text:'Join the arms race.',             effect:{ type:'research_discount', tree:'military', pct:30, duration:48, faction:'militarist', faction_delta:15 } },
      { text:'Stay out of it.',                 effect:{ type:'faction_approval', faction:'environmentalist', delta:15, faction2:'intellectual', faction2_delta:10 } },
    ]},
  { id:'pandemic',       title:'Global Pandemic',           cat:'Natural',     condition:_=>true,
    desc:'A pandemic is spreading across the world.',
    choices:[
      { text:'Close the borders.',               effect:{ type:'pop_loss', pct:3, duration:120, happiness_delta:-10 } },
      { text:'International cooperation (₩3000).',effect:{ type:'pop_loss', pct:1, cost:{money:3000}, relations_all_delta:10 } },
    ]},
  { id:'military_defection', title:'Enemy Defection',       cat:'Military',    condition: s => s.wars.length > 0,
    desc:'A unit of enemy soldiers wishes to defect to your side.',
    choices:[
      { text:'Accept the defectors.',   effect:{ type:'defect_unit', faction:'militarist', faction_delta:8 } },
      { text:'Return them (relations).',effect:{ type:'relations_enemy', delta:15 } },
    ]},
];

/* ===== NAME GENERATION ===== */
const NAME_PRE  = ['al','ar','bel','bor','cor','dar','del','dor','el','far','gil','gra','hal','kar','kel','lan','lar','lir','mar','mel','mir','mor','nor','ost','pel','pol','ral','ran','sal','sel','ser','sil','tal','tar','tel','tor','var','vel','ver','yor','zel'];
const NAME_SUF  = ['an','ar','ath','dal','dar','en','eon','er','eth','ford','ham','ian','iel','in','ion','ir','is','kan','kel','lan','las','len','lia','lon','lor','mar','mas','mon','mor','nar','nis','nor','on','or','oria','orn','ran','rath','ren','ria','rin','ron','sal','sar','sel','sol','tan','tar','ter','thal','tha','ton','tor','tra','ul','una','van','var','vel','via','vor'];

function genProvName(rng) {
  const p = NAME_PRE[(rng() * NAME_PRE.length) | 0];
  const s = NAME_SUF[(rng() * NAME_SUF.length) | 0];
  const raw = p + s;
  return raw[0].toUpperCase() + raw.slice(1);
}

/* ===== SMALL UTILITIES ===== */
function mulberry32(a) {
  return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1|a); t = (t + Math.imul(t^t>>>7, 61|t)) ^ t; return ((t^t>>>14)>>>0)/4294967296; };
}
function hashStr(s) { let h = 2166136261; for (let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0; }
function clamp(v,lo,hi){return v<lo?lo:v>hi?hi:v;}
function fmt(n,d=0){if(!isFinite(n))return'0';const s=Math.abs(n).toFixed(d);return (n<0?'-':'')+s.replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function fmtSign(n){return(n>=0?'+':'')+fmt(n,1);}
function dist2(ax,ay,bx,by){return(ax-bx)**2+(ay-by)**2;}
function pick(arr,rng){return arr[(rng()*arr.length)|0];}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=(rng()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];}return a;}
function hexRgb(h){return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
function deepClone(o){return JSON.parse(JSON.stringify(o));}
