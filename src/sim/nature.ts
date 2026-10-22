// Nature: grass regrows, forests spread, crops ripen, fire spreads and burns out, lava flows and cools,
// corruption creeps, seasons turn, ages of the world come and go, plagues break out,
// disasters strike and monsters come out of the wild places.
import type { Sim } from './sim';
import { St, UF, T } from './units';
import { SPECIES, SPECIES_BY_KEY } from './species';
import { TICKS_PER_YEAR, BIOMES, B, Tree, TREES, Deco, SEA } from './defs';
import { BT } from './entities';
import * as civ from './city';
import * as people from './people';

export interface Disease {
  id: number; name: string; lethality: number; spread: number; duration: number; species: number[];
  cases: number; deaths: number; born: number; active: boolean; zombie?: boolean;
}

interface NatureState { ptr: number; burning: Set<number>; lava: { i: number; vol: number }[]; tornados: { x: number; y: number; dx: number; dy: number; life: number }[] }
const states = new WeakMap<Sim, NatureState>();
function st(sim: Sim): NatureState {
  let s = states.get(sim);
  if (!s) {
    s = { ptr: 0, burning: new Set(), lava: [], tornados: [] };
    const w = sim.world;
    for (let i = 0; i < w.n; i++) if (w.fire[i]) s.burning.add(i);
    states.set(sim, s);
  }
  return s;
}
export function tornados(sim: Sim) { return st(sim).tornados; }

// ------------------------------------------------------------------ fire
export function ignite(sim: Sim, i: number, power = 120) {
  const w = sim.world;
  if (w.isWater(i) || w.biome[i] === B.Lava) return;
  w.fire[i] = Math.max(w.fire[i], power);
  st(sim).burning.add(i);
  w.markDirty(i);
}

function stepFire(sim: Sim) {
  const s = st(sim), w = sim.world, U = sim.units;
  if (!s.burning.size) return;
  const rain = sim.weather.rain;
  const dead: number[] = [];
  const add: number[] = [];
  for (const i of s.burning) {
    let f = w.fire[i];
    const fuel = w.tree[i] ? 1 : w.bld[i] ? 1.5 : 0.3;
    f -= (fuel > 0.5 ? 1 : 3) + rain * 6;
    if (f <= 0) {
      w.fire[i] = 0; dead.push(i);
      if (w.tree[i]) { w.tree[i] = sim.rng.chance(0.3) ? Tree.Dead : 0; w.deco[i] = Deco.Ash; }
      w.veg[i] = 0; if (w.field[i]) w.field[i] = 2;
      w.markDirty(i);
      continue;
    }
    w.fire[i] = f;
    // spread
    if ((sim.tick + i) % 4 === 0) {
      const x = i % w.w, y = (i / w.w) | 0;
      const d = sim.rng.int(4);
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0) + (sim.weather.wind > 0.6 ? 1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (w.inb(nx, ny)) {
        const j = ny * w.w + nx;
        if (!w.fire[j] && !w.isWater(j)) {
          const dry = sim.season === 1 ? 1.5 : sim.season === 3 ? 0.5 : 1;
          const p = (w.tree[j] ? 0.5 : w.bld[j] ? 0.35 : w.field[j] ? 0.3 : w.veg[j] > 150 ? 0.08 : 0.01) * dry * (1 - rain);
          if (sim.rng.chance(p)) add.push(j);
        }
      }
    }
    // buildings burn
    if (w.bld[i] && (sim.tick & 3) === 0) {
      const b = sim.buildings[w.bld[i] - 1];
      if (b && b.alive) { b.hp -= 6; if (b.hp <= 0) civ.destroyBuilding(sim, b.id, 'burned down'); }
    }
    // creatures standing in it
    if ((sim.tick + i) % 6 === 0) U.near(x0(i, w.w) + 0.5, ((i / w.w) | 0) + 0.5, 0.75, (j) => { if (!SPECIES[U.spec[j]].fly && SPECIES[U.spec[j]].key !== 'dragon' && SPECIES[U.spec[j]].key !== 'demon') sim.damage(j, 4, -1, 'burned'); });
  }
  for (const i of dead) s.burning.delete(i);
  for (const j of add) ignite(sim, j, 90 + sim.rng.int(60));
}
const x0 = (i: number, W: number) => i % W;

// ------------------------------------------------------------------ lava
export function pourLava(sim: Sim, i: number, vol: number) {
  const w = sim.world;
  setBiome(sim, i, B.Lava);
  st(sim).lava.push({ i, vol });
  void w;
}

function stepLava(sim: Sim) {
  const s = st(sim), w = sim.world, U = sim.units;
  if (!s.lava.length || sim.tick % 3) return;
  const next: { i: number; vol: number }[] = [];
  for (const l of s.lava) {
    if (l.vol <= 0) continue;
    const x = l.i % w.w, y = (l.i / w.w) | 0;
    // flow to the lowest neighbours
    const opts: number[] = [];
    for (let d = 0; d < 8; d++) {
      const nx = x + [1, -1, 0, 0, 1, 1, -1, -1][d], ny = y + [0, 0, 1, -1, 1, -1, 1, -1][d];
      if (!w.inb(nx, ny)) continue;
      const j = ny * w.w + nx;
      if (w.biome[j] === B.Lava) continue;
      if (w.height[j] <= w.height[l.i] + 0.01 || sim.rng.chance(0.15)) opts.push(j);
    }
    for (const j of opts.slice(0, 2)) {
      if (w.isWater(j)) { setBiome(sim, j, B.Volcanic); w.height[j] = SEA + 0.01; sim.fx.push({ kind: 'steam', x: j % w.w + 0.5, y: ((j / w.w) | 0) + 0.5, t: 0, life: 30 }); continue; }
      if (w.bld[j]) civ.destroyBuilding(sim, w.bld[j] - 1, 'swallowed by lava');
      setBiome(sim, j, B.Lava);
      w.tree[j] = 0; w.field[j] = 0; w.road[j] = 0;
      U.near(j % w.w + 0.5, ((j / w.w) | 0) + 0.5, 1, (u) => { if (!SPECIES[U.spec[u]].fly) sim.kill(u, 'lava'); });
      // set the land around alight
      for (let d = 0; d < 4; d++) { const ax = j % w.w + [1, -1, 0, 0][d], ay = ((j / w.w) | 0) + [0, 0, 1, -1][d]; if (w.inb(ax, ay) && (w.tree[ay * w.w + ax] || w.bld[ay * w.w + ax])) ignite(sim, ay * w.w + ax); }
      next.push({ i: j, vol: l.vol - 1 - opts.length * 0.5 });
    }
  }
  s.lava = next.filter(l => l.vol > 0).slice(0, 400);
}

function setBiome(sim: Sim, i: number, b: B) {
  const w = sim.world;
  const wasWalk = w.walkable(i);
  w.biome[i] = b;
  if (w.walkable(i) !== wasWalk) w.regionsStale = true;
  w.markDirty(i);
}

// ------------------------------------------------------------------ the slow cycle: grass, trees, crops, corruption
export function stepWorld(sim: Sim) {
  const s = st(sim), w = sim.world;
  const per = Math.ceil(w.n / 60);
  const season = sim.season;
  const iceAge = sim.ageKind === 'ice', sun = sim.ageKind === 'sun', magic = sim.ageKind === 'magic';
  for (let k = 0; k < per; k++) {
    const i = s.ptr; s.ptr = (s.ptr + 1) % w.n;
    const b = w.biome[i];
    const bd = BIOMES[b];
    if (bd.water) continue;
    const cold = w.temp[i] < 0 || iceAge;
    // grass
    let grow = season === 0 ? 8 : season === 1 ? (sun ? 2 : 6) : season === 2 ? 4 : cold ? 0 : 2;
    if (w.river[i]) grow += 3;
    const max = bd.vegMax * (0.5 + w.moist[i] / 510);
    if (w.veg[i] < max && grow) {
      const before = w.veg[i] >> 6;
      w.veg[i] = Math.min(max, w.veg[i] + grow);
      if (w.veg[i] >> 6 !== before) w.markDirty(i);
    }
    if (w.deco[i] === Deco.Ash && season === 0 && sim.rng.chance(0.3)) { w.deco[i] = 0; w.markDirty(i); }
    // crops ripen on their own in the growing season
    const f = w.field[i];
    if (f && f < 250 && season !== 3) {
      const g = Math.round((season === 2 ? 40 : 70) * (0.5 + bd.fert) * (sun ? 0.5 : 1));
      w.field[i] = Math.min(250, f + g);
      if ((f >> 6) !== (w.field[i] >> 6)) w.markDirty(i);
    }
    // forests spread a little
    const tr = w.tree[i];
    if (tr) {
      if (sim.rng.chance(0.012 * (bd.treeDensity + 0.05) * (season === 0 ? 2 : 1))) {
        const x = i % w.w, y = (i / w.w) | 0;
        const nx = x + sim.rng.irange(-1, 1), ny = y + sim.rng.irange(-1, 1);
        if (w.inb(nx, ny)) {
          const j = ny * w.w + nx;
          const jb = BIOMES[w.biome[j]];
          if (!w.tree[j] && !jb.water && !w.bld[j] && !w.field[j] && !w.road[j] && !w.river[j] && w.biome[j] !== B.Lava && jb.trees.length && (!w.owner[j] || sim.rng.chance(0.2))) {
            w.tree[j] = jb.trees.includes(tr) ? tr : jb.trees[sim.rng.int(jb.trees.length)];
            w.markDirty(j);
          }
        }
      }
    } else if (bd.trees.length && !w.bld[i] && !w.field[i] && !w.road[i] && !w.river[i] && !w.owner[i] && sim.rng.chance(bd.treeDensity * 0.0015)) {
      w.tree[i] = bd.trees[sim.rng.int(bd.trees.length)]; w.markDirty(i);
    }
    // corruption creeps; magic ages make enchanted groves grow
    if ((b === B.Corrupted && sim.rng.chance(0.01)) || (b === B.Enchanted && magic && sim.rng.chance(0.01))) {
      const x = i % w.w, y = (i / w.w) | 0;
      const nx = x + sim.rng.irange(-1, 1), ny = y + sim.rng.irange(-1, 1);
      if (w.inb(nx, ny)) {
        const j = ny * w.w + nx;
        if (!BIOMES[w.biome[j]].water && w.biome[j] !== B.Lava && w.biome[j] !== b && w.height[j] < 0.8 && !(b === B.Corrupted && sim.cities[w.owner[j] - 1]?.alive && sim.cities[w.owner[j] - 1].magic > 30)) {
          setBiome(sim, j, b);
          if (w.tree[j]) w.tree[j] = b === B.Corrupted ? Tree.Corrupt : Tree.Glowtree;
        }
      }
    }
    // lava cools slowly
    if (b === B.Lava && !s.lava.some(l => l.i === i) && sim.rng.chance(0.02)) setBiome(sim, i, B.Volcanic);
    // foot traffic fades
    if (w.traffic[i] > 0) w.traffic[i] = w.traffic[i] * 0.97;
    if (w.road[i] === 1 && w.traffic[i] < 40 && !w.owner[i] && sim.rng.chance(0.05)) { w.road[i] = 0; w.markDirty(i); }
  }
  stepFire(sim);
  stepLava(sim);
  stepTornados(sim);
  // lightning in storms
  if (sim.weather.storm > 0.5 && sim.rng.chance(0.02)) {
    const i = sim.rng.int(w.n);
    if (!w.isWater(i)) { sim.fx.push({ kind: 'lightning', x: i % w.w + 0.5, y: ((i / w.w) | 0) + 0.5, t: 0, life: 8 }); if (w.tree[i] || w.bld[i]) ignite(sim, i); }
  }
}

// ------------------------------------------------------------------ seasons and weather
export function seasonChange(sim: Sim) {
  const s = sim.season;
  const ice = sim.ageKind === 'ice';
  sim.winter = s === 3 || ice ? 1 : s === 2 ? 0.25 : 0;
  sim.weather.rain = s === 0 ? 0.3 : s === 2 ? 0.4 : sim.ageKind === 'sun' ? 0 : 0.1;
  sim.weather.snow = s === 3 ? 0.6 : ice ? 0.5 : 0;
  sim.weather.storm = sim.rng.chance(0.15) ? 0.8 : 0;
  sim.weather.wind = sim.rng.f();
  sim.world.markAll();
  // harvest festivals
  if (s === 2) for (const c of sim.cities) if (c.alive && c.pop > 15 && c.stock[0] > c.pop * 2 && sim.rng.chance(0.4)) {
    c.festival = 60; c.happy = Math.min(100, c.happy + 10);
  }
}

// ------------------------------------------------------------------ ages of the world
const AGES: { kind: string; name: string; desc: string; w: number }[] = [
  { kind: 'dawn', name: 'Age of Dawn', desc: 'A calm age.', w: 3 },
  { kind: 'ice', name: 'Age of Ice', desc: 'Winters bite and the north freezes.', w: 1 },
  { kind: 'sun', name: 'Age of Sun', desc: 'Long hot summers and droughts.', w: 1 },
  { kind: 'chaos', name: 'Age of Chaos', desc: 'Tempers flare: wars, monsters and madness.', w: 1 },
  { kind: 'magic', name: 'Age of Magic', desc: 'Magic runs wild and enchanted groves spread.', w: 1 },
  { kind: 'dark', name: 'Age of Darkness', desc: 'Long nights. The dead do not rest.', w: 0.8 },
  { kind: 'wonders', name: 'Age of Wonders', desc: 'Ideas spark everywhere: research is faster.', w: 1 },
];
export function setAge(sim: Sim, kind: string, years = 40) {
  const a = AGES.find(x => x.kind === kind) || AGES[0];
  sim.ageKind = a.kind; sim.ageName = a.name; sim.ageUntil = sim.tick + years * TICKS_PER_YEAR;
  sim.log('age', `The ${a.name} begins. ${a.desc}`, sim.world.w / 2, sim.world.h / 2, { imp: 2 });
  if (a.kind === 'chaos') for (const k of sim.kingdoms) for (const r of k.relations.values()) r.opinion -= 20;
  seasonChange(sim);
}
export const AGE_LIST = AGES;

// ------------------------------------------------------------------ plagues
const PLAGUE_A = ['Red', 'Grey', 'Black', 'Weeping', 'Sweating', 'Spotted', 'Rotting', 'Shaking', 'Blue', 'Burning', 'Sleeping', 'Laughing'];
const PLAGUE_B = ['Plague', 'Pox', 'Fever', 'Cough', 'Rot', 'Flux', 'Blight', 'Sickness', 'Death'];
export function newDisease(sim: Sim, species: number[], strength = 1, zombie = false): number {
  const id = sim.diseases.length;
  const dz: Disease = {
    id, name: zombie ? 'Walking Death' : `${PLAGUE_A[sim.rng.int(PLAGUE_A.length)]} ${PLAGUE_B[sim.rng.int(PLAGUE_B.length)]}`,
    lethality: Math.min(0.9, sim.rng.range(0.08, 0.35) * strength), spread: Math.min(0.5, sim.rng.range(0.05, 0.16) * strength), duration: Math.round(sim.rng.range(60, 200)),
    species, cases: 0, deaths: 0, born: sim.tick, active: true, zombie,
  };
  sim.diseases.push(dz);
  return id;
}
export function infect(sim: Sim, u: number, dzId: number) {
  const U = sim.units, dz = sim.diseases[dzId];
  if (!dz || U.disease[u] || (U.immune[u] & (1 << (dzId % 32)))) return;
  U.disease[u] = dzId + 1; U.dtimer[u] = dz.duration; dz.cases++;
}
export function outbreak(sim: Sim, c: number, strength = 1) {
  const city = sim.cities[c];
  if (!city || !city.alive || !sim.laws.plagues) return;
  const species = [city.species];
  if (sim.rng.chance(0.4)) for (const o of sim.cities) if (o.alive && !species.includes(o.species) && sim.rng.chance(0.4)) species.push(o.species);
  const id = newDisease(sim, species, strength);
  const dz = sim.diseases[id];
  let n = 0;
  for (const u of city.members) if (sim.rng.chance(0.15) && n < 8) { infect(sim, u, id); n++; }
  city.plague = 120;
  sim.log('plague', `The ${dz.name} broke out in ${city.name}!`, city.x, city.y, { c, imp: 2 });
}

// ------------------------------------------------------------------ the dead
export function corpseRises(sim: Sim, x: number, y: number, killer = -1): boolean {
  const U = sim.units, w = sim.world;
  if (killer >= 0 && U.alive[killer]) {
    const kd = SPECIES[U.spec[killer]];
    if (kd.key === 'zombie') return sim.rng.chance(0.55);
    if (kd.key === 'undead' && U.city[killer] >= 0) return sim.rng.chance(0.4);
    if (kd.key === 'ghost' || kd.key === 'demon') return sim.rng.chance(0.15);
  }
  const t = w.tileAt(x, y);
  let p = 0.002;
  if (sim.ageKind === 'dark') p = 0.08;
  if (w.biome[t] === B.Corrupted) p += 0.2;
  if (w.bld[t] && sim.buildings[w.bld[t] - 1]?.type === BT.Graveyard) p += 0.1;
  return sim.rng.chance(p);
}

export function raiseDead(sim: Sim, x: number, y: number, deadSub: number, killer = -1) {
  const U = sim.units;
  // raised by an undead realm: becomes one of them
  if (killer >= 0 && U.alive[killer] && SPECIES[U.spec[killer]].key === 'undead' && U.city[killer] >= 0) {
    const c = U.city[killer];
    const sub = sim.baseSubspecies(SPECIES_BY_KEY.undead.id);
    const u = sim.spawn(sub, x, y, { age: 0, city: c, culture: sim.cities[c].culture, religion: sim.cities[c].religion });
    U.flags[u] |= UF.Undead;
    sim.fx.push({ kind: 'raise', x, y, t: 0, life: 20 });
    return;
  }
  const sub = sim.baseSubspecies(SPECIES_BY_KEY.zombie.id);
  const z = sim.spawn(sub, x, y, { age: 1 });
  U.flags[z] |= UF.Undead;
  sim.fx.push({ kind: 'raise', x, y, t: 0, life: 20 });
  void deadSub;
}

// ------------------------------------------------------------------ disasters (also god powers)
export function earthquake(sim: Sim, x: number, y: number, r = 10) {
  const w = sim.world;
  sim.fx.push({ kind: 'quake', x, y, t: 0, life: 60, size: r });
  for (const b of sim.buildings) {
    if (!b.alive) continue;
    const d = hyp(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
    if (d > r) continue;
    b.hp -= b.maxHp * (0.9 - d / r * 0.7) * sim.rng.range(0.4, 1.2);
    if (b.hp <= 0) civ.destroyBuilding(sim, b.id, 'shaken down by an earthquake');
  }
  // cracks in the earth
  let cx = x, cy = y;
  const ang = sim.rng.f() * Math.PI * 2;
  for (let s = 0; s < r * 1.5; s++) {
    cx += Math.cos(ang + Math.sin(s * 0.7) * 0.6); cy += Math.sin(ang + Math.sin(s * 0.7) * 0.6);
    if (!w.inb(cx | 0, cy | 0)) break;
    const i = w.tileAt(cx, cy);
    if (!w.isWater(i)) { w.deco[i] = Deco.Rubble; w.road[i] = 0; w.tree[i] = 0; w.markDirty(i); }
  }
  sim.units.near(x, y, r, (u) => { if (!SPECIES[sim.units.spec[u]].fly) sim.damage(u, 8, -1, 'earthquake'); });
}

export function meteor(sim: Sim, x: number, y: number, r = 4) {
  const w = sim.world, U = sim.units;
  sim.fx.push({ kind: 'meteor', x, y, t: 0, life: 40, size: r });
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = hyp(dx, dy);
    if (d > r) continue;
    const nx = Math.floor(x) + dx, ny = Math.floor(y) + dy;
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (w.bld[i]) civ.destroyBuilding(sim, w.bld[i] - 1, 'hit by a meteor');
    w.tree[i] = 0; w.field[i] = 0; w.road[i] = 0;
    w.height[i] = Math.max(SEA + 0.005, w.height[i] - (1 - d / r) * 0.08);
    if (!w.isWater(i)) { w.deco[i] = d < r * 0.5 ? Deco.Crater : Deco.Ash; w.biome[i] = w.biome[i] === B.Snow ? B.Tundra : w.biome[i]; }
    if (d > r * 0.6 && sim.rng.chance(0.5)) ignite(sim, i);
    if (d < 1.5 && sim.rng.chance(0.5)) { w.ore[i] = sim.rng.chance(0.3) ? 7 : 3; w.oreAmt[i] = 80; }
    w.markDirty(i);
  }
  U.near(x, y, r + 1, (u) => sim.kill(u, 'a falling star'));
}

export function eruption(sim: Sim, x: number, y: number, size = 30) {
  const w = sim.world;
  const i = w.tileAt(x, y);
  sim.fx.push({ kind: 'eruption', x, y, t: 0, life: 80, size: 6 });
  w.height[i] = Math.min(0.95, w.height[i] + 0.05);
  pourLava(sim, i, size);
  for (let k = 0; k < 4; k++) { const j = w.tileAt(x + sim.rng.range(-1.5, 1.5), y + sim.rng.range(-1.5, 1.5)); pourLava(sim, j, size * 0.7); }
  // ash falls around
  for (let k = 0; k < 60; k++) { const j = w.tileAt(x + sim.rng.range(-10, 10), y + sim.rng.range(-10, 10)); if (!w.isWater(j) && !w.bld[j]) { w.deco[j] = Deco.Ash; w.veg[j] = 0; w.markDirty(j); } }
}

export function tornado(sim: Sim, x: number, y: number) {
  const a = sim.rng.f() * Math.PI * 2;
  st(sim).tornados.push({ x, y, dx: Math.cos(a) * 0.12, dy: Math.sin(a) * 0.12, life: 300 });
}
function stepTornados(sim: Sim) {
  const s = st(sim), w = sim.world, U = sim.units;
  for (const t of s.tornados) {
    t.life--;
    t.dx += sim.rng.range(-0.02, 0.02); t.dy += sim.rng.range(-0.02, 0.02);
    const sp = hyp(t.dx, t.dy); if (sp > 0.18) { t.dx *= 0.18 / sp; t.dy *= 0.18 / sp; }
    t.x += t.dx; t.y += t.dy;
    if (!w.inb(t.x | 0, t.y | 0)) { t.life = 0; continue; }
    if (sim.tick % 3) continue;
    const i = w.tileAt(t.x, t.y);
    if (w.tree[i] && sim.rng.chance(0.5)) { w.tree[i] = 0; w.markDirty(i); }
    if (w.bld[i]) { const b = sim.buildings[w.bld[i] - 1]; b.hp -= 40; if (b.hp <= 0) civ.destroyBuilding(sim, b.id, 'torn apart by a tornado'); }
    if (w.field[i]) { w.field[i] = 2; w.markDirty(i); }
    U.near(t.x, t.y, 1.5, (u) => { if (SPECIES[U.spec[u]].size < 2.5) { U.x[u] += sim.rng.range(-3, 3); U.y[u] += sim.rng.range(-3, 3); U.x[u] = Math.max(0, Math.min(w.w - 1, U.x[u])); U.y[u] = Math.max(0, Math.min(w.h - 1, U.y[u])); sim.damage(u, 3, -1, 'tornado'); } });
  }
  s.tornados = s.tornados.filter(t => t.life > 0);
}

export function flood(sim: Sim, x: number, y: number, r = 6) {
  const w = sim.world;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const nx = Math.floor(x) + dx, ny = Math.floor(y) + dy;
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (w.height[i] < SEA + 0.05 && !w.isWater(i)) {
      if (w.bld[i]) { const b = sim.buildings[w.bld[i] - 1]; b.hp -= b.maxHp * 0.5; if (b.hp <= 0) civ.destroyBuilding(sim, b.id, 'washed away by a flood'); }
      if (w.field[i]) { w.field[i] = 0; }
      w.fire[i] = 0;
      w.markDirty(i);
    }
  }
  sim.fx.push({ kind: 'flood', x, y, t: 0, life: 40, size: r });
}

/** a monster appears somewhere fitting */
export function spawnMonster(sim: Sim, key: string, x?: number, y?: number): number {
  const w = sim.world;
  const d = SPECIES_BY_KEY[key];
  if (!d) return -1;
  if (x === undefined || y === undefined) {
    let found = false;
    for (let k = 0; k < 400 && !found; k++) {
      const i = sim.rng.int(w.n);
      const b = w.biome[i];
      const ok = d.homes.includes(b) || (d.swim === 2 && BIOMES[b].water) || (d.homes.length === 0 && !BIOMES[b].water);
      if (!ok) continue;
      if (w.owner[i] && d.kind !== 'titan') continue;
      x = i % w.w + 0.5; y = ((i / w.w) | 0) + 0.5; found = true;
    }
    if (!found) return -1;
  }
  const sub = sim.baseSubspecies(d.id);
  const u = sim.spawn(sub, x!, y!, { age: d.adult + 1 });
  if (d.kind === 'titan' || d.key === 'dragon' || d.key === 'kraken' || d.key === 'serpent') {
    const U = sim.units;
    const ch = people.makeNotable(sim, u, d.name);
    ch.name = monsterName(sim, d.name); ch.family = '';
    sim.log('monster', `${ch.name} the ${d.name.toLowerCase()} has appeared!`, x!, y!, { ch: ch.id, imp: 2 });
  }
  return u;
}
const MON_A = ['Ash', 'Grim', 'Vor', 'Skar', 'Mor', 'Thal', 'Kra', 'Zul', 'Fen', 'Gol', 'Ur', 'Bal', 'Nyx', 'Sar'];
const MON_B = ['gor', 'thax', 'vane', 'mire', 'gul', 'drak', 'oth', 'rax', 'eth', 'zor', 'mund', 'ghast'];
function monsterName(sim: Sim, _kind: string) { return MON_A[sim.rng.int(MON_A.length)] + MON_B[sim.rng.int(MON_B.length)]; }

// ------------------------------------------------------------------ the year
export function yearly(sim: Sim) {
  // a new age?
  if (sim.laws.ages && sim.tick >= sim.ageUntil && sim.year > 20) {
    if (sim.ageKind !== 'dawn' || sim.rng.chance(0.3)) {
      const next = sim.ageKind === 'dawn' ? sim.rng.weighted(AGES.slice(1), AGES.slice(1).map(a => a.w)).kind : 'dawn';
      setAge(sim, next, next === 'dawn' ? 30 + sim.rng.int(50) : 15 + sim.rng.int(25));
    } else sim.ageUntil = sim.tick + TICKS_PER_YEAR * 10;
  }
  // plagues
  for (const dz of sim.diseases) if (dz.active && sim.tick - dz.born > TICKS_PER_YEAR * 3) {
    let cases = 0; const U = sim.units;
    for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.disease[u] === dz.id + 1) cases++;
    if (!cases) dz.active = false;
  }
  for (const c of sim.cities) if (c.plague > 0) c.plague = Math.max(0, c.plague - 120);
  if (sim.laws.plagues) for (const c of sim.cities) {
    if (!c.alive || c.pop < 60) continue;
    const crowd = c.pop / Math.max(10, c.housing);
    const hosp = c.buildings.some(b => sim.buildings[b].type === BT.Hospital);
    const p = 0.004 * crowd * (hosp ? 0.3 : 1) * (sim.kingdoms[c.kingdom].techs.has('sanitation') ? 0.3 : 1);
    if (sim.rng.chance(p)) outbreak(sim, c.id);
  }
  // disasters and monsters
  const w = sim.world;
  const scale = w.n / (256 * 256);
  if (sim.laws.disasters && sim.year > 30) {
    if (sim.rng.chance(0.03 * scale)) { const i = sim.rng.int(w.n); if (!w.isWater(i)) earthquake(sim, i % w.w, (i / w.w) | 0, 8 + sim.rng.int(8)); sim.log('disaster', 'The earth shook!', i % w.w, (i / w.w) | 0, { imp: 1 }); }
    if (sim.rng.chance(0.01 * scale)) { const i = sim.rng.int(w.n); meteor(sim, i % w.w, (i / w.w) | 0, 3 + sim.rng.int(3)); sim.log('disaster', 'A star fell from the sky!', i % w.w, (i / w.w) | 0, { imp: 1 }); }
    if (sim.rng.chance(0.02 * scale)) {
      for (let k = 0; k < 200; k++) { const i = sim.rng.int(w.n); if (w.biome[i] === B.Volcanic && w.height[i] > 0.6) { eruption(sim, i % w.w, (i / w.w) | 0, 20 + sim.rng.int(20)); sim.log('disaster', 'A volcano erupted!', i % w.w, (i / w.w) | 0, { imp: 2 }); break; } }
    }
    if (sim.rng.chance(0.02 * scale) && sim.season !== 3) { const i = sim.rng.int(w.n); if (!w.isWater(i)) { tornado(sim, i % w.w, (i / w.w) | 0); sim.log('disaster', 'A tornado touched down.', i % w.w, (i / w.w) | 0, { imp: 0 }); } }
  }
  if (sim.laws.monsters && sim.year > 40) {
    const chaos = sim.ageKind === 'chaos' ? 3 : 1;
    const roll = (p: number) => sim.rng.chance(p * scale * chaos);
    const count = (key: string) => sim.subs.filter(s => SPECIES[s.species].key === key).reduce((a, s) => a + Math.max(0, s.pop), 0);
    if (roll(0.012) && count('dragon') < 2) spawnMonster(sim, 'dragon');
    if (roll(0.01) && count('kraken') < 1) spawnMonster(sim, 'kraken');
    if (roll(0.01) && count('sandworm') < 2) spawnMonster(sim, 'sandworm');
    if (roll(0.01) && count('demon') < 6) for (let k = 0; k < 3; k++) spawnMonster(sim, 'demon');
    if (roll(0.004) && count('titan') < 1 && sim.year > 120) spawnMonster(sim, 'titan');
    if (roll(0.002) && count('serpent') < 1 && sim.year > 200) spawnMonster(sim, 'serpent');
    if (sim.ageKind === 'dark' && roll(0.2)) for (let k = 0; k < 5; k++) spawnMonster(sim, 'ghost');
  }
}

export { St, T, TREES, TICKS_PER_YEAR };
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
