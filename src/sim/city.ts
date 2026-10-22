// Towns: territory, the town planner, buildings, fields, roads and bridges, walls, jobs, births,
// trade, crime and colonies. Towns grow by themselves from a camp fire to a skyline.
import type { Sim } from './sim';
import { St, UF, T, Job, JOB_NAMES } from './units';
import { SPECIES } from './species';
import { G, Gene } from './genetics';
import { TICKS_PER_YEAR, BIOMES, B, R, RES_NAMES, Tree, TREES, Deco } from './defs';
import { BT, BUILDINGS, type City, type Band, type Building } from './entities';
import { passable, Mode, wanderTarget } from './move';
import * as people from './people';
import * as realm from './kingdom';
import * as war from './war';
import * as faith from './culture';

const BUILD_STYLE: Record<string, number> = { human: 0, elf: 1, dwarf: 2, orc: 3, goblin: 4, lizard: 5, avian: 6, undead: 7, beast: 8 };

// ------------------------------------------------------------------ small helpers
export function addStock(sim: Sim, c: number, res: number, amt: number) {
  const city = sim.cities[c];
  if (!city || !city.alive) return;
  const cap = storageCap(sim, city, res);
  city.stock[res] = Math.min(cap, city.stock[res] + amt);
}

function storageCap(sim: Sim, city: City, res: number): number {
  let n = 0;
  for (const b of city.buildings) { const bd = sim.buildings[b]; if (bd.alive && bd.built >= 1 && BUILDINGS[bd.type].storage) n++; }
  const base = res === R.Food ? 60 + city.pop * 3 : res === R.Gold || res === R.Gems || res === R.Mithril ? 400 : 80 + city.pop * 2;
  return base * (1 + n * 0.6);
}

export function hasBuilding(sim: Sim, city: City, t: BT, done = true): boolean {
  for (const b of city.buildings) { const bd = sim.buildings[b]; if (bd.type === t && bd.alive && (!done || bd.built >= 1)) return true; }
  return false;
}
function countBuilding(sim: Sim, city: City, t: BT): number {
  let n = 0;
  for (const b of city.buildings) { const bd = sim.buildings[b]; if (bd.type === t && bd.alive) n++; }
  return n;
}
function techs(sim: Sim, city: City) { return sim.kingdoms[city.kingdom].techs; }

/** where to drop off goods: the nearest finished storage building */
export function storageOf(sim: Sim, c: number, x: number, y: number): [number, number] {
  const city = sim.cities[c];
  let best: [number, number] = [city.x + 1, city.y + 2.1], bd = 1e9;
  for (const b of city.buildings) {
    const bb = sim.buildings[b];
    if (!bb.alive || bb.built < 1 || !BUILDINGS[bb.type].storage) continue;
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h + 0.1;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bd) { bd = d; best = [cx, cy]; }
  }
  return best;
}

/** a house with room, else -1 */
export function findHome(sim: Sim, c: number): number {
  const city = sim.cities[c];
  const homes: number[] = [];
  for (const b of city.buildings) { const bd = sim.buildings[b]; if (bd.alive && bd.built >= 1 && BUILDINGS[bd.type].housing) homes.push(b); }
  if (!homes.length) return -1;
  return homes[sim.rng.int(homes.length)];
}

export function rulerUnit(sim: Sim, k: number): number {
  if (k < 0) return -1;
  const kg = sim.kingdoms[k];
  if (!kg || kg.ruler <= 0) return -1;
  return sim.units.idx(kg.ruler);
}

export function workplace(sim: Sim, c: number, job: Job): number {
  const city = sim.cities[c];
  const list: number[] = [];
  for (const b of city.buildings) {
    const bd = sim.buildings[b];
    if (!bd.alive || bd.built < 1) continue;
    const j = BUILDINGS[bd.type].jobs;
    if (j && (j as Record<number, number>)[job]) list.push(b);
    else if (job === Job.Noble && (bd.type === BT.Palace || bd.type === BT.Castle || bd.type === BT.Manor)) list.push(b);
    else if (job === Job.Merchant && bd.type === BT.Market) list.push(b);
    else if (job === Job.Sailor && bd.type === BT.Dock) list.push(b);
  }
  if (!list.length) {
    if (job === Job.Scholar || job === Job.Priest || job === Job.Noble) { for (const b of city.buildings) if (sim.buildings[b].type === BT.Hearth && sim.buildings[b].alive) return b; }
    return -1;
  }
  return list[sim.rng.int(list.length)];
}

// ------------------------------------------------------------------ finding resources
function sampleNear(sim: Sim, x: number, y: number, r: number, tries: number, ok: (i: number) => boolean): number {
  const w = sim.world;
  let best = -1, bd = 1e9;
  for (let k = 0; k < tries; k++) {
    const nx = Math.floor(x + sim.rng.range(-r, r)), ny = Math.floor(y + sim.rng.range(-r, r));
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (!ok(i)) continue;
    const d = (nx - x) ** 2 + (ny - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function findTree(sim: Sim, c: number, x: number, y: number): number {
  const w = sim.world;
  const ok = (i: number) => w.tree[i] !== 0 && w.tree[i] !== Tree.Crystal && TREES[w.tree[i]].wood > 0 && !w.bld[i] && !bad.has(i);
  let t = sampleNear(sim, x, y, 9, 40, ok);
  if (t < 0) t = sampleNear(sim, x, y, 20, 60, ok);
  return t;
}

export function findOre(sim: Sim, c: number, x: number, y: number): number {
  const w = sim.world, city = c >= 0 ? sim.cities[c] : null;
  const k = city ? sim.kingdoms[city.kingdom] : null;
  const ok = (i: number) => {
    const o = w.ore[i];
    if (!o || bad.has(i) || w.bld[i]) return false;
    if (o === 8) return !!k && k.techs.has('combustion');                // oil needs the right tools
    if (o === 7) return !!k && k.techs.has('steel');
    if (o === 3 || o === 4) return !!k && k.techs.has('bronze');
    return true;
  };
  const cx = city ? city.x : x, cy = city ? city.y : y;
  let t = sampleNear(sim, cx, cy, 10, 50, ok);
  if (t < 0) t = sampleNear(sim, cx, cy, 18, 70, ok);
  // no ore: quarry stone from rocky ground
  if (t < 0 || (city && city.stock[R.Stone] < 20 && w.ore[t] !== 1 && sim.rng.chance(0.5))) {
    const q = sampleNear(sim, cx, cy, 16, 60, (i) => { const b = w.biome[i]; return (b === B.Hills || b === B.Mountain || b === B.Volcanic || b === B.Badlands || b === B.Tundra) && !w.bld[i] && !bad.has(i); });
    if (q >= 0) return q;
  }
  return t;
}

export function findShore(sim: Sim, c: number, x: number, y: number): number {
  const w = sim.world, city = sim.cities[c];
  const ok = (i: number) => {
    if (w.isWater(i) || w.bld[i] && sim.buildings[w.bld[i] - 1].type !== BT.Dock) return false;
    const ix = i % w.w, iy = (i / w.w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = ix + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = iy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (w.inb(nx, ny) && (w.isWater(ny * w.w + nx) || w.river[ny * w.w + nx] >= 2)) return true;
    }
    return false;
  };
  return sampleNear(sim, city.x, city.y, 12, 50, ok);
}

export function findGame(sim: Sim, u: number, r: number): number {
  const U = sim.units;
  let best = -1, bd = 1e9;
  U.near(U.x[u], U.y[u], r, (j) => {
    const d = SPECIES[U.spec[j]];
    if (!d.prey || d.sapient || (U.flags[j] & UF.Tame)) return;
    if (d.kind === 'sea' && !(sim.world.walkable(sim.world.tileAt(U.x[j], U.y[j])))) return;
    const dd = (U.x[j] - U.x[u]) ** 2 + (U.y[j] - U.y[u]) ** 2;
    if (dd < bd) { bd = dd; best = j; }
  });
  return best;
}

/** tiles workers couldn't reach: skip them for a while */
const bad = new Set<number>();
let badClear = 0;
export function badTarget(sim: Sim, c: number, t: number) { if (t >= 0) bad.add(t); }
export function resetCaches() { bad.clear(); replant.length = 0; }

const replant: { t: number; tree: number; at: number }[] = [];
export function plantLater(sim: Sim, t: number, tree: number) { replant.push({ t, tree, at: sim.tick + TICKS_PER_YEAR }); }

// ------------------------------------------------------------------ fields
export function fieldToWork(sim: Sim, c: number, x: number, y: number): number {
  const city = sim.cities[c], w = sim.world;
  // drop fields that were built over or flooded
  if ((sim.tick & 63) === 0) city.fields = city.fields.filter(f => w.field[f] && !w.bld[f]);
  let best = -1, bd = 1e9;
  for (let k = 0; k < Math.min(12, city.fields.length); k++) {
    const f = city.fields[sim.rng.int(city.fields.length)];
    if (!w.field[f] || w.field[f] >= 250 && false) continue;
    const need = w.field[f] < 240 ? 1 : 3;     // ripe fields first
    const d = ((f % w.w) - x) ** 2 + (((f / w.w) | 0) - y) ** 2 - need * 40;
    if (d < bd) { bd = d; best = f; }
  }
  if (city.fields.length < city.fieldTarget && (best < 0 || sim.rng.chance(0.35))) {
    const n = newFieldSpot(sim, city);
    if (n >= 0) return n;
  }
  return best;
}

function fieldOk(sim: Sim, city: City, i: number): boolean {
  const w = sim.world;
  if (w.field[i] || w.bld[i] || w.road[i] >= 2 || w.river[i] || !w.walkable(i) || w.isWater(i)) return false;
  if (w.owner[i] !== city.id + 1) return false;
  const bdef = BIOMES[w.biome[i]];
  if (bdef.fert < 0.25 || bdef.move > 2) return false;
  // keep a little gap around buildings for streets
  const x = i % w.w, y = (i / w.w) | 0;
  if (Math.abs(x - city.x - 1) < 3 && Math.abs(y - city.y - 1) < 3) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (w.inb(nx, ny) && w.bld[ny * w.w + nx]) return false;
  }
  return true;
}

function newFieldSpot(sim: Sim, city: City): number {
  const w = sim.world;
  // grow next to an existing field so farms make patchwork blocks
  for (let k = 0; k < 10 && city.fields.length; k++) {
    const f = city.fields[sim.rng.int(city.fields.length)];
    const d = sim.rng.int(4);
    const nx = f % w.w + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = ((f / w.w) | 0) + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (fieldOk(sim, city, i)) return i;
  }
  const r = 3 + Math.sqrt(city.tiles) * 0.45;
  for (let k = 0; k < 20; k++) {
    const nx = Math.floor(city.x + 1 + sim.rng.range(-r, r)), ny = Math.floor(city.y + 1 + sim.rng.range(-r, r));
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (fieldOk(sim, city, i)) return i;
  }
  return -1;
}

// ------------------------------------------------------------------ founding
/** how good is (x,y) for a new town of this species? (-100 = impossible) */
export function settleScore(sim: Sim, x: number, y: number, spec: number, leader: number): number {
  const w = sim.world;
  if (!w.inb(x - 1, y - 1) || !w.inb(x + 3, y + 3)) return -100;
  const d = SPECIES[spec];
  const i0 = y * w.w + x;
  if (leader >= 0 && w.region[i0] !== w.region[w.tileAt(sim.units.x[leader], sim.units.y[leader])] && !d.fly) return -100;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const i = (y + dy) * w.w + x + dx;
    if (!w.walkable(i) || w.isWater(i) || w.river[i] || w.bld[i] || w.owner[i] || BIOMES[w.biome[i]].move > 2.3) return -100;
  }
  for (const c of sim.cities) if (c.alive && (c.x - x) ** 2 + (c.y - y) ** 2 < 13 * 13) return -100;
  let s = 0, water = 0, ore = 0, trees = 0;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -6; dx <= 6; dx += 2) {
    const nx = x + dx, ny = y + dy;
    if (!w.inb(nx, ny)) { s -= 2; continue; }
    const i = ny * w.w + nx;
    const b = w.biome[i], bd = BIOMES[b];
    if (bd.water) { water++; continue; }
    if (w.owner[i]) s -= 3;
    let hab = bd.habitable;
    if (d.homes.includes(b)) hab += 0.6;
    if (d.key === 'undead' && (b === B.Corrupted || b === B.Wasteland)) hab += 1;
    if (d.key === 'lizard' && b === B.Swamp) hab += 0.8;
    s += hab * 2 + bd.fert;
    if (w.river[i]) water += 0.5;
    if (w.ore[i]) ore++;
    if (w.tree[i]) trees++;
  }
  s += Math.min(6, water) * 1.5 + Math.min(4, ore) + Math.min(8, trees) * 0.5;
  if (water > 30) s -= (water - 30) * 2;
  return s;
}

export function foundCity(sim: Sim, band: Band, x: number, y: number): number {
  const U = sim.units, w = sim.world;
  const leader = band.leader;
  const spec = U.spec[leader];
  const d = SPECIES[spec];
  // nudge to a free 2x2 spot
  let fx = x, fy = y, ok = false;
  for (let r = 0; r < 5 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
    const nx = x + dx, ny = y + dy;
    if (canPlace(sim, null, BT.Hearth, nx, ny)) { fx = nx; fy = ny; ok = true; }
  }
  if (!ok) { band.age = Math.max(0, band.age - 60); return -1; }
  const id = sim.cities.length;
  const culture = band.culture >= 0 ? band.culture : faith.newCulture(sim, U.sub[leader], fx, fy);
  const cul = sim.cultures[culture];
  const lang = sim.langs.list[cul.lang];
  const name = sim.langs.place(lang, sim.rng.u32());
  const city: City = {
    id, name, kingdom: -1, x: fx, y: fy, founded: sim.tick, alive: true, culture, religion: U.religion[leader], species: spec,
    pop: 0, adults: 0, soldiers: 0, housing: 0, tiles: 0, buildings: [], stock: new Float32Array(R.COUNT), jobsWant: new Int16Array(Job.COUNT), jobsHave: new Int16Array(Job.COUNT),
    fields: [], fieldTarget: 0, plan: null, happy: 60, unrest: 0, loyalty: 80, fervor: 0, crime: 0,
    capital: false, port: -1, lastAttacked: -9999, siege: 0, plague: 0, equip: 0, festival: 0, governor: -1, walls: false, wallBuilt: false,
    famine: 0, growth: 0, history: [], originKingdom: -1, conquered: -1, faithShare: new Map(),
    members: [], queue: [], style: BUILD_STYLE[d.build || 'beast'] ?? 8, coastal: false, boats: 0, tame: 0, magic: 0, kids: 0, ruler: -1, radius: 5,
  };
  sim.cities.push(city);
  city.stock[R.Food] = 25; city.stock[R.Wood] = 10;
  // a colony stays in its mother kingdom; a tribe founds a new realm
  let k = band.kingdom;
  if (k >= 0 && sim.kingdoms[k]?.alive) { city.kingdom = k; sim.kingdoms[k].cities.push(id); city.originKingdom = k; }
  else { k = realm.newKingdom(sim, id, leader); city.kingdom = k; city.capital = true; city.originKingdom = k; }
  place(sim, city, BT.Hearth, fx, fy, true);
  claimAround(sim, city, 4);
  city.coastal = nearWater(sim, fx, fy, 6);
  // the band moves in
  for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.band[u] === band.id) joinCity(sim, id, u);
  band.alive = false;
  const kg = sim.kingdoms[k];
  const e = band.colonyOf >= 0
    ? sim.log('found', `Settlers from ${sim.cities[band.colonyOf].name} founded the town of ${name} for ${kg.name}.`, fx, fy, { c: id, k, imp: 1 })
    : sim.log('found', `A band of ${d.plural.toLowerCase()} settled down and founded ${name}. ${kg.name} is born.`, fx, fy, { c: id, k, imp: 2 });
  city.history.push(e.id);
  w.markOverlay(fy * w.w + fx);
  return id;
}

function nearWater(sim: Sim, x: number, y: number, r: number) {
  const w = sim.world;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = x + dx, ny = y + dy;
    if (w.inb(nx, ny) && w.isWater(ny * w.w + nx) && !w.isDeep(ny * w.w + nx)) return true;
  }
  return false;
}

export function joinCity(sim: Sim, c: number, u: number) {
  const U = sim.units, city = sim.cities[c];
  if (!city || !city.alive) return;
  U.city[u] = c; U.band[u] = -1; U.flags[u] &= ~UF.Bandit;
  if (U.culture[u] < 0 || sim.rng.chance(0.25)) U.culture[u] = city.culture;
  if (U.religion[u] < 0 && city.religion >= 0) U.religion[u] = city.religion;
  U.house[u] = -1; U.state[u] = St.Idle; U.job[u] = Job.None;
  if (U.family[u] < 0) U.family[u] = sim.rng.u32() & 0x7fffffff;
}

// ------------------------------------------------------------------ territory
export function claim(sim: Sim, city: City, i: number) {
  const w = sim.world;
  const prev = w.owner[i] - 1;
  if (prev === city.id) return;
  if (prev >= 0 && sim.cities[prev]) sim.cities[prev].tiles--;
  w.owner[i] = city.id + 1; city.tiles++;
  w.markOverlay(i);
}
function unclaim(sim: Sim, city: City, i: number) {
  const w = sim.world;
  if (w.owner[i] !== city.id + 1) return;
  w.owner[i] = 0; city.tiles--; w.markOverlay(i);
}

function claimAround(sim: Sim, city: City, r: number) {
  const w = sim.world;
  for (let dy = -r; dy <= r + 1; dy++) for (let dx = -r; dx <= r + 1; dx++) {
    const nx = city.x + dx, ny = city.y + dy;
    if (!w.inb(nx, ny) || dx * dx + dy * dy > (r + 0.5) ** 2) continue;
    const i = ny * w.w + nx;
    if (w.owner[i] === 0 && !w.isDeep(i)) claim(sim, city, i);
  }
}

/** borders creep outward as the town grows */
function growBorders(sim: Sim, city: City) {
  const w = sim.world;
  city.radius = Math.min(26, 4 + Math.sqrt(city.pop) * 1.25 + (city.capital ? 2 : 0) + (hasBuilding(sim, city, BT.Castle) ? 3 : 0));
  const R2 = city.radius * city.radius;
  const tries = 16 + Math.min(40, city.pop);
  for (let k = 0; k < tries; k++) {
    const a = sim.rng.f() * Math.PI * 2, r = sim.rng.f() * city.radius;
    const nx = Math.floor(city.x + 1 + Math.cos(a) * r), ny = Math.floor(city.y + 1 + Math.sin(a) * r);
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (w.owner[i] === city.id + 1 || w.isDeep(i)) continue;
    // must touch our land
    let touch = false;
    for (let d = 0; d < 4 && !touch; d++) {
      const ax = nx + (d === 0 ? 1 : d === 1 ? -1 : 0), ay = ny + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (w.inb(ax, ay) && w.owner[ay * w.w + ax] === city.id + 1) touch = true;
    }
    if (!touch) continue;
    const o = w.owner[i] - 1;
    if (o >= 0) {
      // take land from a weaker neighbour only when at war, or if it is far from their centre
      const oc = sim.cities[o];
      if (!oc || !oc.alive) { claim(sim, city, i); continue; }
      const dOwn = (nx - city.x) ** 2 + (ny - city.y) ** 2, dTheirs = (nx - oc.x) ** 2 + (ny - oc.y) ** 2;
      if (oc.kingdom === city.kingdom ? dOwn * 1.3 < dTheirs : (sim.atWar(oc.kingdom, city.kingdom) && dOwn < dTheirs) || dOwn * 2 < dTheirs) {
        if (!w.bld[i]) claim(sim, city, i);
      }
      continue;
    }
    if ((nx - city.x - 1) ** 2 + (ny - city.y - 1) ** 2 <= R2) claim(sim, city, i);
  }
}

// ------------------------------------------------------------------ the planner
function canPlace(sim: Sim, city: City | null, t: BT, x: number, y: number): boolean {
  const w = sim.world, def = BUILDINGS[t];
  if (!w.inb(x - 1, y - 1) || !w.inb(x + def.w, y + def.h)) return false;
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
    const i = (y + dy) * w.w + x + dx;
    if (w.bld[i] || !w.walkable(i) || w.isWater(i) || w.river[i] || w.road[i] >= 2 || w.fire[i]) return false;
    const b = w.biome[i];
    if (b === B.Peak || b === B.Lava || (b === B.Mountain && t !== BT.Mine && t !== BT.Tower && t !== BT.Wall && t !== BT.Castle && city && city.style !== 2)) return false;
    if (city && w.owner[i] !== city.id + 1) return false;
    if (!city && w.owner[i]) return false;
  }
  if (t === BT.Wall || t === BT.Gate || t === BT.Tower) return true;
  // a one-tile street all round (walls excepted)
  for (let dy = -1; dy <= def.h; dy++) for (let dx = -1; dx <= def.w; dx++) {
    if (dy >= 0 && dy < def.h && dx >= 0 && dx < def.w) continue;
    const i = (y + dy) * w.w + x + dx;
    const bi = w.bld[i];
    if (bi) { const ot = sim.buildings[bi - 1].type; if (ot !== BT.Wall && ot !== BT.Tower && ot !== BT.Gate) return false; }
  }
  if (def.coastal) {
    let water = false;
    for (let dy = -1; dy <= def.h && !water; dy++) for (let dx = -1; dx <= def.w; dx++) {
      const i = (y + dy) * w.w + x + dx;
      if (w.isWater(i) && !w.isDeep(i)) { water = true; break; }
    }
    if (!water) return false;
  }
  if (t === BT.Mine) {
    let hill = false;
    for (let dy = -2; dy <= def.h + 1 && !hill; dy++) for (let dx = -2; dx <= def.w + 1; dx++) {
      if (!w.inb(x + dx, y + dy)) continue;
      const i = (y + dy) * w.w + x + dx;
      const b = w.biome[i];
      if (b === B.Hills || b === B.Mountain || w.ore[i]) { hill = true; break; }
    }
    if (!hill) return false;
  }
  return true;
}

function findSpot(sim: Sim, city: City, t: BT): [number, number] | null {
  const def = BUILDINGS[t];
  const cx = city.x + 1 - def.w / 2, cy = city.y + 1 - def.h / 2;
  const maxR = Math.max(3, city.radius - 1);
  let best: [number, number] | null = null, bs = 1e9;
  for (let k = 0; k < 90; k++) {
    // look close first, then farther
    const r = 2 + (k / 90) * maxR;
    const a = sim.rng.f() * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
    if (!canPlace(sim, city, t, x, y)) continue;
    let s = hyp(x - cx, y - cy);
    if (t === BT.Mine || t === BT.LumberCamp) s = -s * 0.3;    // these like the edge
    if (t === BT.Graveyard) s = -s * 0.2;
    // keep fields if we can
    const w = sim.world;
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) if (w.field[(y + dy) * w.w + x + dx]) s += 2;
    if (s < bs) { bs = s; best = [x, y]; }
    if (k > 30 && best) break;
  }
  return best;
}

/** put a building down as a construction site (or finished, for the founding fire) */
function place(sim: Sim, city: City, t: BT, x: number, y: number, done = false): number {
  const w = sim.world, def = BUILDINGS[t];
  const id = sim.buildings.length;
  const k = sim.kingdoms[city.kingdom];
  const b: Building = { id, type: t, city: city.id, x, y, w: def.w, h: def.h, hp: def.hp, maxHp: def.hp, built: done ? 1 : 0, alive: true, era: k ? k.era : 0, style: city.style, born: sim.tick };
  sim.buildings.push(b);
  city.buildings.push(id);
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
    const i = (y + dy) * w.w + x + dx;
    w.bld[i] = id + 1; w.tree[i] = 0; w.field[i] = 0; w.deco[i] = 0;
    if (w.owner[i] !== city.id + 1) claim(sim, city, i);
    w.markDirty(i);
  }
  if (done) finishBuilding(sim, id);
  return id;
}

export function finishBuilding(sim: Sim, id: number) {
  const b = sim.buildings[id];
  b.built = 1;
  const city = sim.cities[b.city];
  if (!city) return;
  const w = sim.world;
  const def = BUILDINGS[b.type];
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) w.markDirty((b.y + dy) * w.w + b.x + dx);
  if (def.housing) city.housing += def.housing;
  if (b.type === BT.Dock) city.port = id;
  if (b.type === BT.Wall || b.type === BT.Gate || b.type === BT.Tower) { city.wallBuilt = true; w.regionsStale = true; return; }
  // a road from the door to the town centre
  if (b.type !== BT.Hearth && b.type !== BT.Bridge) layRoad(sim, city, b.x + (b.w >> 1), b.y + b.h, city.x + 1, city.y + 2);
  const big = b.type === BT.Wonder || b.type === BT.Palace || b.type === BT.Castle || b.type === BT.LaunchPad || b.type === BT.Academy || b.type === BT.University || b.type === BT.Monument;
  if (big) {
    if (b.type === BT.Wonder || b.type === BT.Monument) b.name = wonderName(sim, city, b.type);
    const e = sim.log('build', `${city.name} finished ${b.name ? 'the ' + b.name : 'a ' + def.name.toLowerCase()}.`, b.x + b.w / 2, b.y + b.h / 2, { c: city.id, k: city.kingdom, imp: b.type === BT.Wonder || b.type === BT.LaunchPad ? 2 : 1 });
    city.history.push(e.id);
    const kg = sim.kingdoms[city.kingdom];
    if (kg) kg.prestige += b.type === BT.Wonder ? 50 : 10;
  }
}

const WONDERS = ['Great Pyramid', 'Hanging Gardens', 'Colossus', 'Great Lighthouse', 'Sky Temple', 'Eternal Library', 'Star Observatory', 'Titan Statue', 'Golden Ziggurat', 'Crystal Spire'];
function wonderName(sim: Sim, city: City, t: BT): string {
  if (t === BT.Monument) {
    const r = people.charByUid(sim, sim.kingdoms[city.kingdom]?.ruler ?? -1);
    return r ? `Statue of ${r.name}` : `Statue of ${city.name}`;
  }
  return `${WONDERS[sim.rng.int(WONDERS.length)]} of ${city.name}`;
}

/** an L-shaped road; bridges over rivers when the people know how */
function layRoad(sim: Sim, city: City, x0: number, y0: number, x1: number, y1: number) {
  const w = sim.world, k = sim.kingdoms[city.kingdom];
  const level = k.techs.has('combustion') ? 4 : k.techs.has('construction') ? 3 : k.techs.has('wheel') ? 2 : 1;
  let x = x0, y = y0, n = 0;
  const horizFirst = sim.rng.chance(0.5);
  while ((x !== x1 || y !== y1) && n++ < 60) {
    if (horizFirst ? x !== x1 : y === y1) x += Math.sign(x1 - x); else y += Math.sign(y1 - y);
    if (!w.inb(x, y)) return;
    const i = y * w.w + x;
    if (w.bld[i] || w.isWater(i)) continue;
    if (w.road[i] >= level) continue;
    if (w.river[i]) { if (city.stock[R.Wood] < 2) return; city.stock[R.Wood] -= 2; w.road[i] = Math.max(2, level); }
    else w.road[i] = Math.max(w.road[i], level === 1 ? 1 : level);
    if (w.field[i]) { w.field[i] = 0; }
    w.tree[i] = 0;
    w.markDirty(i);
  }
}

/** what should the town build next? */
function choose(sim: Sim, city: City): BT | -1 {
  const k = sim.kingdoms[city.kingdom], tech = k.techs, pop = city.pop;
  const can = (t: BT) => {
    const d = BUILDINGS[t];
    if (d.tech && !tech.has(d.tech)) return false;
    if (pop < d.minPop) return false;
    if (d.max !== undefined && countBuilding(sim, city, t) >= d.max) return false;
    if (d.capitalOnly && !city.capital) return false;
    if (d.coastal && !city.coastal) return false;
    if (SPECIES[city.species].key === 'undead' && (t === BT.Granary || t === BT.Barn || t === BT.Tavern || t === BT.Hospital)) return false;
    return true;
  };
  const afford = (t: BT, slack = 1) => {
    const cost = BUILDINGS[t].cost as Record<number, number>;
    for (const r in cost) if (city.stock[+r] < cost[r] * slack) return false;
    return true;
  };
  // homes first when crowded
  const crowded = pop + 3 >= city.housing;
  if (crowded) {
    const homes: BT[] = [BT.Highrise, BT.Manor, BT.House, BT.Hut, BT.Tent];
    for (const h of homes) if (can(h) && afford(h)) return h;
    if (city.housing < 8 && afford(BT.Tent)) return BT.Tent;
  }
  const order: BT[] = [
    BT.Granary, BT.Shrine, BT.LumberCamp, BT.Dock, BT.Mine, BT.Barn, BT.Smithy, BT.Temple, BT.Library, BT.Market, BT.Barracks,
    BT.Graveyard, BT.Warehouse, BT.Tavern, BT.Stable, BT.Palace, BT.Monument, BT.Lighthouse, BT.Castle, BT.Academy, BT.Hospital,
    BT.University, BT.Wonder, BT.Factory, BT.PowerPlant, BT.Airport, BT.LaunchPad,
  ];
  for (const t of order) {
    if (!can(t)) continue;
    if (t === BT.Barracks && !k.wars.length && k.ambition !== 'conquer' && sim.rng.chance(0.7)) continue;
    if (t === BT.Academy && !SPECIES[city.species].magic && sim.rng.chance(0.6)) continue;
    if (t === BT.Mine && !nearOre(sim, city)) continue;
    if (afford(t)) return t;
    // save up for important things instead of spending everything on lesser ones
    if ((t === BT.Granary || t === BT.Wonder || t === BT.LaunchPad || t === BT.Palace) && afford(t, 0.4)) return -1;
  }
  if (pop + 8 >= city.housing) for (const h of [BT.Highrise, BT.Manor, BT.House, BT.Hut]) if (can(h) && afford(h)) return h;
  return -1;
}

function nearOre(sim: Sim, city: City) {
  const w = sim.world;
  for (let k = 0; k < 40; k++) {
    const nx = Math.floor(city.x + sim.rng.range(-12, 12)), ny = Math.floor(city.y + sim.rng.range(-12, 12));
    if (w.inb(nx, ny) && (w.ore[ny * w.w + nx] || w.biome[ny * w.w + nx] === B.Hills || w.biome[ny * w.w + nx] === B.Mountain)) return true;
  }
  return false;
}

export function siteToBuild(sim: Sim, c: number, x: number, y: number): number {
  const city = sim.cities[c];
  let best = -1, bd = 1e9;
  for (const b of city.buildings) {
    const bb = sim.buildings[b];
    if (!bb.alive || bb.built >= 1) continue;
    // walls wait for other work
    const d = (bb.x - x) ** 2 + (bb.y - y) ** 2 + (bb.type === BT.Wall ? 200 : 0) - (BUILDINGS[bb.type].housing ? 100 : 0);
    if (d < bd) { bd = d; best = b; }
  }
  // repair damaged buildings too
  if (best < 0) for (const b of city.buildings) {
    const bb = sim.buildings[b];
    if (bb.alive && bb.hp < bb.maxHp * 0.7) { bb.hp = Math.min(bb.maxHp, bb.hp + bb.maxHp * 0.1); return -1; }
  }
  return best;
}

function sitesOpen(sim: Sim, city: City) {
  let n = 0;
  for (const b of city.buildings) { const bb = sim.buildings[b]; if (bb.alive && bb.built < 1 && bb.type !== BT.Wall && bb.type !== BT.Gate && bb.type !== BT.Tower) n++; }
  return n;
}

function plan(sim: Sim, city: City) {
  if (sitesOpen(sim, city) >= 1 + Math.floor(city.pop / 45)) return;
  const ch = choose(sim, city);
  if (ch === -1) return;
  const t = ch as BT;
  const spot = findSpot(sim, city, t);
  if (!spot) { if (sim.rng.chance(0.1)) city.radius += 1; return; }
  const cost = BUILDINGS[t].cost as Record<number, number>;
  for (const r in cost) city.stock[+r] -= cost[r];
  place(sim, city, t, spot[0], spot[1]);
}

// ------------------------------------------------------------------ walls
function planWalls(sim: Sim, city: City) {
  const w = sim.world, k = sim.kingdoms[city.kingdom];
  if (city.walls || !k.techs.has('masonry') || city.pop < 50) return;
  const threatened = k.wars.length > 0 || sim.tick - city.lastAttacked < TICKS_PER_YEAR * 3 || SPECIES[city.species].key === 'dwarf';
  if (!threatened && sim.rng.chance(0.9)) return;
  // a ring around the built-up core
  let maxR = 4;
  for (const b of city.buildings) {
    const bb = sim.buildings[b];
    if (!bb.alive || bb.type === BT.Mine || bb.type === BT.LumberCamp || bb.type === BT.Dock || bb.type === BT.Lighthouse) continue;
    maxR = Math.max(maxR, hyp(bb.x + bb.w / 2 - city.x - 1, bb.y + bb.h / 2 - city.y - 1) + Math.max(bb.w, bb.h) / 2 + 1.5);
  }
  if (maxR > 15) return;      // too spread out to wall in
  const r = Math.ceil(maxR);
  const cx = city.x + 1, cy = city.y + 1;
  const tiles: number[] = [];
  const seen = new Set<number>();
  for (let a = 0; a < 360; a += 1.2) {
    const x = Math.floor(cx + Math.cos(a * Math.PI / 180) * r), y = Math.floor(cy + Math.sin(a * Math.PI / 180) * r);
    if (!w.inb(x, y)) continue;
    const i = y * w.w + x;
    if (seen.has(i)) continue;
    seen.add(i);
    tiles.push(i);
  }
  city.queue = tiles.filter(i => !w.isWater(i) && !w.river[i] && !w.bld[i] && w.biome[i] !== B.Peak && w.biome[i] !== B.Lava);
  city.walls = true;
}

function buildWallPiece(sim: Sim, city: City) {
  const w = sim.world;
  if (!city.queue.length) return;
  if (city.stock[R.Stone] < 3) return;
  for (let n = 0; n < 3 && city.queue.length; n++) {
    const i = city.queue.shift()!;
    if (w.bld[i] || w.isWater(i)) continue;
    const x = i % w.w, y = (i / w.w) | 0;
    // gates where roads or paths cross; towers every so often
    const t = w.road[i] || w.traffic[i] > 150 ? BT.Gate : (sim.kingdoms[city.kingdom].techs.has('construction') && (x + y) % 9 === 0 ? BT.Tower : BT.Wall);
    if (w.owner[i] !== city.id + 1) { if (w.owner[i]) continue; claim(sim, city, i); }
    const cost = BUILDINGS[t].cost as Record<number, number>;
    let ok = true; for (const r in cost) if (city.stock[+r] < cost[r]) ok = false;
    if (!ok) { city.queue.unshift(i); return; }
    for (const r in cost) city.stock[+r] -= cost[r];
    w.road[i] = t === BT.Gate ? Math.max(1, w.road[i]) : 0;
    place(sim, city, t, x, y);
  }
  // make sure there are at least 4 gates
  if (!city.queue.length) ensureGates(sim, city);
}

function ensureGates(sim: Sim, city: City) {
  let gates = 0;
  const walls: Building[] = [];
  for (const b of city.buildings) { const bb = sim.buildings[b]; if (!bb.alive) continue; if (bb.type === BT.Gate) gates++; else if (bb.type === BT.Wall) walls.push(bb); }
  for (let g = gates; g < 4 && walls.length; g++) {
    const cx = city.x + 1, cy = city.y + 1;
    const ang = g * Math.PI / 2;
    let best: Building | null = null, bd = 1e9;
    for (const wb of walls) { const a = Math.atan2(wb.y - cy, wb.x - cx); const d = Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang))); if (d < bd) { bd = d; best = wb; } }
    if (best) best.type = BT.Gate;
  }
}

// ------------------------------------------------------------------ destruction
export function destroyBuilding(sim: Sim, id: number, cause = 'destroyed') {
  const b = sim.buildings[id];
  if (!b || !b.alive) return;
  b.alive = false;
  const w = sim.world, def = BUILDINGS[b.type];
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) {
    const i = (b.y + dy) * w.w + b.x + dx;
    if (w.bld[i] === id + 1) { w.bld[i] = 0; if (!w.isWater(i)) w.deco[i] = b.type === BT.Wall || b.type === BT.Gate ? Deco.Rubble : Deco.Ruins; w.markDirty(i); }
  }
  sim.fx.push({ kind: 'collapse', x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0, life: 24, size: Math.max(b.w, b.h) });
  if (b.type === BT.Wall || b.type === BT.Gate || b.type === BT.Tower) w.regionsStale = true;
  const city = sim.cities[b.city];
  if (!city) return;
  city.buildings = city.buildings.filter(x => x !== id);
  if (b.built >= 1 && def.housing) city.housing -= def.housing;
  if (city.port === id) city.port = -1;
  if (b.type === BT.Wonder) sim.log('ruin', `The ${b.name || 'wonder'} of ${city.name} was ${cause}.`, b.x, b.y, { c: city.id, imp: 2 });
  if (b.type === BT.Hearth && city.alive) {
    // the town hall gone: rebuild it if people remain, else the town is lost
    if (city.pop > 3 && cause !== 'conquered') {
      const spot = findSpot(sim, city, BT.Hearth) ?? (canPlace(sim, city, BT.Hearth, b.x, b.y) ? [b.x, b.y] as [number, number] : null);
      if (spot) { place(sim, city, BT.Hearth, spot[0], spot[1], true); return; }
    }
    destroyCity(sim, city.id, cause);
  }
}

export function destroyCity(sim: Sim, c: number, cause: string) {
  const city = sim.cities[c];
  if (!city || !city.alive) return;
  city.alive = false;
  const w = sim.world, U = sim.units;
  for (const b of [...city.buildings]) destroyBuilding(sim, b, cause);
  for (let i = 0; i < w.n; i++) if (w.owner[i] === c + 1) { w.owner[i] = 0; w.markOverlay(i); }
  for (const f of city.fields) { if (w.field[f]) { w.field[f] = 0; w.markDirty(f); } }
  city.tiles = 0; city.fields = [];
  for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.city[u] === c) { U.city[u] = -1; U.house[u] = -1; U.job[u] = 0; if (U.army[u] >= 0) war.leaveArmy(sim, u); }
  const k = sim.kingdoms[city.kingdom];
  const e = sim.log('ruin', `${city.name} was ${cause === 'abandoned' ? 'abandoned' : 'destroyed (' + cause + ')'}. Only ruins remain.`, city.x, city.y, { c, k: city.kingdom, imp: 2 });
  city.history.push(e.id);
  if (k) {
    k.cities = k.cities.filter(x => x !== c);
    if (city.capital) realm.moveCapital(sim, k.id);
    if (!k.cities.length) realm.fall(sim, k.id, cause);
  }
}

// ------------------------------------------------------------------ work done at buildings
export function produce(sim: Sim, c: number, job: Job, u: number) {
  const city = sim.cities[c], k = sim.kingdoms[city.kingdom], U = sim.units;
  const smart = 0.6 + 0.8 * U.genome[u * G + Gene.Intel] / 255 + (U.traits[u] & (1 << T.Genius) ? 0.8 : 0) + (U.traits[u] & (1 << T.Wise) ? 0.3 : 0);
  switch (job) {
    case Job.Scholar:
      k.research += 2.2 * smart * (hasBuilding(sim, city, BT.University) ? 1.6 : 1);
      if (sim.rng.chance(0.004 * smart)) realm.inspiration(sim, k.id, u);
      break;
    case Job.Priest:
      city.fervor = Math.min(100, city.fervor + 2);
      faith.preach(sim, c, u);
      break;
    case Job.Smith: {
      const metal = city.stock[R.Metal];
      if (metal >= 1) { city.stock[R.Metal] -= 1; city.equip = Math.min(1, city.equip + 0.03 * (hasBuilding(sim, city, BT.Factory) ? 2.5 : 1)); }
      else if (city.stock[R.Stone] >= 1) { city.stock[R.Stone] -= 1; city.equip = Math.min(0.5, city.equip + 0.01); }
      break;
    }
    case Job.Mage:
      city.magic = Math.min(100, city.magic + 3);
      if (U.genome[u * G + Gene.Magic] > 120 || SPECIES[U.spec[u]].magic) U.setTrait(u, T.Mage);
      sim.express(u);
      break;
    case Job.Healer:
      U.near(U.x[u], U.y[u], 10, (j) => { if (U.city[j] === c) { if (U.disease[j] && sim.rng.chance(0.25)) U.disease[j] = 0; U.hp[j] = Math.min(U.maxHp[j], U.hp[j] + 5); } });
      break;
    case Job.Merchant:
      city.stock[R.Gold] += 0.5 + city.pop / 80;
      break;
    case Job.Noble:
      city.loyalty = Math.min(100, city.loyalty + 1); k.gold += 0.3;
      break;
    case Job.Sailor:
      if (city.port >= 0) { city.boats = Math.min(6, city.boats + 0.2); addStock(sim, c, R.Food, 1); }
      break;
  }
}

export function tradePartner(sim: Sim, c: number): number {
  const city = sim.cities[c], k = sim.kingdoms[city.kingdom];
  let best = -1, bs = -1e9;
  for (let n = 0; n < 8; n++) {
    const o = sim.cities[sim.rng.int(sim.cities.length)];
    if (!o || !o.alive || o.id === c) continue;
    const d = hyp(o.x - city.x, o.y - city.y);
    if (d > 70 || d < 6) continue;
    if (sim.atWar(o.kingdom, city.kingdom)) continue;
    if (sim.world.region[sim.world.tileAt(o.x, o.y)] !== sim.world.region[sim.world.tileAt(city.x, city.y)]) continue;
    const rel = k.relations.get(o.kingdom);
    const s = o.pop - d * 0.5 + (o.kingdom === city.kingdom ? 5 : 0) + (rel ? rel.opinion * 0.2 : 0);
    if (s > bs) { bs = s; best = o.id; }
  }
  return best;
}

export function tradeArrive(sim: Sim, c: number, p: number, u: number) {
  const home = sim.cities[c], other = sim.cities[p];
  const U = sim.units;
  if (!other || !other.alive) return;
  const profit = 3 + Math.min(20, (home.pop + other.pop) / 20);
  home.stock[R.Gold] += profit; other.stock[R.Gold] += profit * 0.5;
  if (other.kingdom !== home.kingdom) {
    realm.meet(sim, home.kingdom, other.kingdom);
    realm.opinion(sim, home.kingdom, other.kingdom, 2, 'trade');
    const rel = sim.kingdoms[home.kingdom].relations.get(other.kingdom);
    if (rel) rel.trade = true;
    // ideas travel with traders
    if (sim.rng.chance(0.15)) realm.shareTech(sim, other.kingdom, home.kingdom);
    if (sim.rng.chance(0.1)) faith.spreadAlong(sim, c, p);
  }
  // and so do diseases
  if (U.disease[u] === 0 && other.plague > 0 && sim.rng.chance(0.3)) { const dz = sim.diseases.find(d => d.active && d.species.includes(U.spec[u])); if (dz) { U.disease[u] = dz.id + 1; U.dtimer[u] = dz.duration; } }
  U.tx[u] = home.x + 1; U.ty[u] = home.y + 2; U.state[u] = St.Move; U.timer[u] = 1500;
}

export function thiefTarget(sim: Sim, c: number): number {
  const city = sim.cities[c];
  if (sim.rng.chance(0.6)) return c;   // most thieves rob their own town
  return tradePartner(sim, c);
}

export function steal(sim: Sim, c: number, target: number, u: number) {
  const U = sim.units, t = sim.cities[target], home = sim.cities[c];
  if (!t || !t.alive) return;
  // guards nearby may catch the thief
  let guard = -1;
  U.near(U.x[u], U.y[u], 5, (j) => { if (U.city[j] === target && (U.job[j] === Job.Guard || U.job[j] === Job.Soldier)) { guard = j; return true; } });
  if (guard >= 0 && sim.rng.chance(0.5)) {
    t.crime = Math.max(0, t.crime - 5);
    if (sim.rng.chance(0.5)) { sim.kill(u, 'executed for theft', guard); return; }
    U.job[u] = Job.None; return;
  }
  const amt = Math.min(t.stock[R.Gold], 2 + sim.rng.int(8));
  t.stock[R.Gold] -= amt; home.stock[R.Gold] += amt * 0.5;
  t.crime = Math.min(100, t.crime + 3);
  t.happy -= 1;
  if (amt > 6 && sim.rng.chance(0.15)) sim.log('crime', `A thief made off with ${Math.round(amt)} gold from ${t.name}.`, t.x, t.y, { c: t.id, imp: 0 });
}

// ------------------------------------------------------------------ the census: jobs, births, needs
const JOB_PRIO: Job[] = [Job.Farmer, Job.Builder, Job.Woodcutter, Job.Soldier, Job.Miner, Job.Fisher, Job.Hunter, Job.Herder, Job.Gatherer,
  Job.Scholar, Job.Priest, Job.Smith, Job.Merchant, Job.Healer, Job.Mage, Job.Sailor, Job.Noble, Job.Guard, Job.Thief];

function census(sim: Sim) {
  const U = sim.units;
  for (const c of sim.cities) if (c.alive) { c.members.length = 0; c.jobsHave.fill(0); c.adults = 0; c.soldiers = 0; c.kids = 0; c.tame = 0; }
  for (let u = 0; u < U.hi; u++) {
    if (!U.alive[u]) continue;
    const c = U.city[u];
    if (c < 0) continue;
    const city = sim.cities[c];
    if (!city || !city.alive) { U.city[u] = -1; continue; }
    if (!SPECIES[U.spec[u]].sapient && !(U.flags[u] & UF.Undead)) { if (U.flags[u] & UF.Tame) city.tame++; continue; }
    city.members.push(u);
    if (sim.ageYears(u) >= SPECIES[U.spec[u]].adult) { city.adults++; city.jobsHave[U.job[u]]++; } else city.kids++;
    if (U.job[u] === Job.Soldier || U.army[u] >= 0) city.soldiers++;
  }
  for (const c of sim.cities) if (c.alive) c.pop = c.members.length;
}

function wantJobs(sim: Sim, city: City) {
  const W = city.jobsWant, k = sim.kingdoms[city.kingdom], A = city.adults;
  W.fill(0);
  if (A === 0) return;
  const undead = SPECIES[city.species].key === 'undead';
  const foodNeed = undead ? 0 : city.pop * 3;
  const foodDays = city.stock[R.Food] / Math.max(1, foodNeed);
  const farmShare = undead ? 0 : foodDays < 0.4 ? 0.45 : foodDays < 1 ? 0.35 : 0.25;
  const agri = k.techs.has('agriculture');
  W[agri ? Job.Farmer : Job.Gatherer] = Math.max(1, Math.round(A * farmShare));
  if (agri) W[Job.Gatherer] = foodDays < 0.3 ? Math.round(A * 0.08) : 0;
  W[Job.Hunter] = undead ? 0 : Math.max(A >= 4 ? 1 : 0, Math.round(A * (k.techs.has('hunting') ? 0.08 : 0.05)));
  W[Job.Builder] = Math.min(8, Math.max(1, Math.round(A * 0.08 + sitesOpen(sim, city) * 1.5 + city.queue.length / 15)));
  W[Job.Woodcutter] = Math.max(1, Math.round(A * (city.stock[R.Wood] < 30 + city.pop ? 0.14 : 0.06)));
  W[Job.Miner] = k.techs.has('stonetools') ? Math.round(A * (hasBuilding(sim, city, BT.Mine) ? 0.12 : 0.05)) : 0;
  if (city.coastal) W[Job.Fisher] = Math.round(A * (city.port >= 0 ? 0.1 : 0.05));
  let war = 0.07;
  if (k.wars.length) war = 0.22;
  if (k.ambition === 'conquer') war += 0.06;
  if (SPECIES[city.species].key === 'orc' || undead) war += 0.08;
  if (sim.tick - city.lastAttacked < TICKS_PER_YEAR) war += 0.08;
  W[Job.Soldier] = A >= 6 ? Math.max(1, Math.round(A * war)) : 0;
  if (A >= 25 && k.techs.has('masonry')) W[Job.Guard] = Math.round(A * 0.03) + (city.capital ? 2 : 0);
  // building jobs
  for (const b of city.buildings) {
    const bd = sim.buildings[b];
    if (!bd.alive || bd.built < 1) continue;
    const j = BUILDINGS[bd.type].jobs as Record<number, number> | undefined;
    if (j) for (const key in j) W[+key] += j[key];
  }
  if (W[Job.Merchant] === 0 && k.techs.has('trade') && A > 30) W[Job.Merchant] = 1;
  if (W[Job.Scholar] === 0 && k.techs.has('writing') && A > 20) W[Job.Scholar] = 1;
  if (city.capital || hasBuilding(sim, city, BT.Castle)) W[Job.Noble] = Math.min(4, Math.round(A / 40));
  if (city.port >= 0) W[Job.Sailor] = Math.max(W[Job.Sailor], 1);
  if (sim.laws.crime && city.happy < 40 && A > 20) W[Job.Thief] = Math.round(A * (40 - city.happy) / 400);
}

function assignJobs(sim: Sim, city: City) {
  const U = sim.units, W = city.jobsWant, H = city.jobsHave;
  let budget = Math.max(4, Math.ceil(city.adults / 3));
  const adultsList = city.members.filter(u => sim.ageYears(u) >= SPECIES[U.spec[u]].adult && U.army[u] < 0 && !(U.flags[u] & UF.Ruler));
  sim.rng.shuffle(adultsList);
  for (const job of JOB_PRIO) {
    while (H[job] < W[job] && budget > 0) {
      // take someone idle or from a job with too many people
      let pick = -1;
      for (const u of adultsList) {
        const cur = U.job[u];
        if (cur === job) continue;
        if (cur === Job.None || H[cur] > W[cur]) { pick = u; break; }
      }
      if (pick < 0) break;
      const cur = U.job[pick];
      H[cur]--; H[job]++; budget--;
      setJob(sim, pick, job);
    }
  }
  // anyone left idle gathers or farms
  for (const u of adultsList) if (U.job[u] === Job.None && budget-- > 0) setJob(sim, u, sim.kingdoms[city.kingdom].techs.has('agriculture') ? Job.Farmer : Job.Gatherer);
}

export function setJob(sim: Sim, u: number, job: Job) {
  const U = sim.units;
  U.job[u] = job;
  U.state[u] = St.Idle; U.think[u] = 0; U.carry[u] = 0;
  if (job === Job.Soldier || job === Job.Guard) war.equip(sim, u);
  else { U.weapon[u] = 0; U.armor[u] = 0; U.mount[u] = 0; U.slot[u] &= ~128; sim.express(u); }
}

function births(sim: Sim, city: City) {
  if (!sim.laws.births) return;
  const U = sim.units, d = SPECIES[city.species];
  if (d.noBreed || !d.breed) return;
  if (U.count >= sim.laws.maxUnits) return;
  const foodPer = city.stock[R.Food] / Math.max(1, city.pop);
  if (foodPer < 0.4 || city.famine > 3) return;
  const room = city.housing - city.pop;
  const housingF = room > 4 ? 1 : room > 0 ? 0.6 : 0.15;
  const happyF = 0.6 + city.happy / 200;
  // women of age, married first
  const mothers: number[] = [];
  for (const u of city.members) if (U.sex[u] === 1 && sim.ageYears(u) >= d.adult && sim.ageYears(u) < d.life * 0.65 && !(U.traits[u] & (1 << T.Infertile)) && !(U.flags[u] & UF.Undead)) mothers.push(u);
  const p = d.breed * 2 / 12 * housingF * happyF * (foodPer > 3 ? 1.2 : 1);
  for (const m of mothers) {
    const fert = (U.traits[m] & (1 << T.Fertile) ? 1.5 : 1) * (0.7 + 0.6 * U.genome[m * G + Gene.Fertility] / 255);
    if (!sim.rng.chance(p * fert)) continue;
    let father = U.spouse[m] ? U.idx(U.spouse[m]) : -1;
    if (father < 0 || !U.alive[father]) {
      father = -1;
      for (const f of city.members) if (U.sex[f] === 0 && !U.spouse[f] && sim.ageYears(f) >= d.adult && U.spec[f] === U.spec[m]) { father = f; break; }
      if (father >= 0) { U.spouse[m] = U.uid[father]; U.spouse[father] = U.uid[m]; }
    }
    if (father < 0) continue;
    const n = d.litter > 1 && sim.rng.chance(0.3) ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const kid = sim.spawn(U.sub[m], U.x[m] + sim.rng.range(-0.3, 0.3), U.y[m] + sim.rng.range(-0.3, 0.3), { age: 0, mother: m, father, city: city.id, culture: U.culture[m], religion: U.religion[m] });
      U.family[kid] = U.family[father] >= 0 ? U.family[father] : U.family[m];
      U.house[kid] = U.house[m];
      sim.totalBirths++;
      // children of rulers and heroes are remembered
      if (U.flags[m] & UF.Notable || U.flags[father] & UF.Notable) {
        const ch = people.makeNotable(sim, kid);
        const pf = sim.charOf(father), pm = sim.charOf(m);
        if (pf) { pf.children.push(ch.id); ch.dynasty = pf.dynasty; }
        if (pm) pm.children.push(ch.id);
      }
    }
  }
}

function happiness(sim: Sim, city: City) {
  const k = sim.kingdoms[city.kingdom];
  let h = 55;
  const foodPer = city.stock[R.Food] / Math.max(1, city.pop);
  h += foodPer > 2 ? 10 : foodPer < 0.3 ? -20 : 0;
  h -= city.famine * 4;
  if (city.housing < city.pop) h -= Math.min(20, (city.pop - city.housing) * 1.5);
  if (hasBuilding(sim, city, BT.Tavern)) h += 8;
  if (hasBuilding(sim, city, BT.Temple)) h += 5;
  if (hasBuilding(sim, city, BT.Wonder)) h += 10;
  if (city.festival > 0) h += 15;
  h -= k.weariness * 0.3;
  h -= city.crime * 0.15;
  h -= city.plague > 0 ? 15 : 0;
  if (city.conquered >= 0 && sim.tick - city.conquered < TICKS_PER_YEAR * 20) h -= 12;
  if (city.culture !== sim.kingdoms[city.kingdom].culture) h -= 5;
  if (city.religion !== k.religion && k.religion >= 0) h -= 4;
  h += (k.stability - 50) * 0.2;
  if (k.goldenAge > sim.tick) h += 10;
  city.happy = Math.max(0, Math.min(100, city.happy * 0.7 + h * 0.3));
  city.crime = Math.max(0, Math.min(100, city.crime + (city.happy < 35 ? 1 : -1)));
}

/** a crowded town sends settlers out to found a new town */
function colonize(sim: Sim, city: City) {
  if (!sim.laws.expansion) return;
  const k = sim.kingdoms[city.kingdom];
  if (city.pop < 40 || city.stock[R.Food] < 30) return;
  if (sim.tick - city.founded < TICKS_PER_YEAR * 8) return;
  const want = city.pop > city.housing * 0.9 || city.pop > 110 || k.ambition === 'expand';
  if (!want || !sim.rng.chance(k.ambition === 'expand' ? 0.12 : 0.05)) return;
  const U = sim.units;
  const settlers = city.members.filter(u => sim.ageYears(u) >= SPECIES[U.spec[u]].adult && U.army[u] < 0 && !(U.flags[u] & (UF.Ruler | UF.Heir))).slice(0, 6 + sim.rng.int(6));
  if (settlers.length < 5) return;
  city.stock[R.Food] -= 15;
  const b = people.formBand(sim, settlers, k.id, city.id);
  if (b >= 0) for (const u of settlers) { U.carry[u] = 0; U.hunger[u] = 0; }
}

function upgradeRoads(sim: Sim, city: City) {
  const w = sim.world, k = sim.kingdoms[city.kingdom];
  const level = k.techs.has('combustion') ? 4 : k.techs.has('construction') ? 3 : k.techs.has('wheel') ? 2 : 1;
  if (level < 2) return;
  for (let n = 0; n < 30; n++) {
    const nx = Math.floor(city.x + sim.rng.range(-city.radius, city.radius)), ny = Math.floor(city.y + sim.rng.range(-city.radius, city.radius));
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (w.road[i] && w.road[i] < level && w.traffic[i] > 300 && !w.bld[i]) { w.road[i]++; w.markDirty(i); }
  }
}

/** keep the town's fields, and decay foot traffic so old paths fade */
function maintain(sim: Sim, city: City) {
  const w = sim.world;
  const farmers = city.jobsHave[Job.Farmer];
  city.fieldTarget = Math.min(140, farmers * 4 + 2);
  if (city.fields.length > city.fieldTarget + 10) {
    const f = city.fields.pop()!; w.field[f] = 0; w.markDirty(f);
  }
}

// ------------------------------------------------------------------ main loop (every 4 ticks)
let lastCensus = -1;
export function stepCities(sim: Sim) {
  const doCensus = sim.tick % 20 === 0;
  if (doCensus) census(sim);
  const n = sim.cities.length;
  for (let ci = 0; ci < n; ci++) {
    const city = sim.cities[ci];
    if (!city.alive) continue;
    // each town thinks every 20 ticks, spread out
    if ((ci + sim.tick / 4) % 5 !== 0) continue;
    if (city.pop === 0 && sim.tick - city.founded > 40) { destroyCity(sim, ci, 'abandoned'); continue; }
    if (city.festival > 0) city.festival = Math.max(0, city.festival - 20);
    if (city.siege > 0) city.siege--;
    growBorders(sim, city);
    wantJobs(sim, city);
    assignJobs(sim, city);
    plan(sim, city);
    planWalls(sim, city);
    buildWallPiece(sim, city);
    births(sim, city);
    happiness(sim, city);
    maintain(sim, city);
    if (sim.tick - city.growth >= TICKS_PER_YEAR) { city.growth = sim.tick; colonize(sim, city); upgradeRoads(sim, city); }
    // the undead do not eat, everyone else does: food keeps for a while
    if (city.stock[R.Food] > 0) city.stock[R.Food] *= 0.9995;
    // famine: the stores are empty
    if (SPECIES[city.species].key !== 'undead' && city.stock[R.Food] < Math.max(2, city.pop * 0.15)) city.famine = Math.min(10, city.famine + 1);
    else city.famine = Math.max(0, city.famine - 2);
    // the realm takes taxes
    const k = sim.kingdoms[city.kingdom];
    const tax = city.stock[R.Gold] * 0.08;
    city.stock[R.Gold] -= tax; k.gold += tax;
  }
  // replant saplings left by elves
  if (replant.length && replant[0].at <= sim.tick) {
    const w = sim.world;
    while (replant.length && replant[0].at <= sim.tick) {
      const r = replant.shift()!;
      if (!w.tree[r.t] && !w.bld[r.t] && !w.field[r.t] && !w.road[r.t]) { w.tree[r.t] = r.tree; w.markDirty(r.t); }
    }
  }
  if (sim.tick - badClear > 600) { bad.clear(); badClear = sim.tick; }
}

export { JOB_NAMES, RES_NAMES };
export function cityWithin(sim: Sim, i: number): City | null { const o = sim.world.owner[i] - 1; return o >= 0 ? sim.cities[o] : null; }
export function wanderInTown(sim: Sim, u: number, city: City): [number, number] { return wanderTarget(sim, u, city.x + 1, city.y + 1, 4 + Math.sqrt(city.tiles) * 0.3); }
export function _passable(sim: Sim, i: number) { return passable(sim, i, Mode.Walk); }
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
