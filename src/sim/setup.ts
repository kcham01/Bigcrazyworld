// Starting a world: generate the land, then fill it with life: herds that suit each biome,
// fish in the sea, and the first wandering tribes of each thinking race.
import { Sim } from './sim';
import { generateWorld, type GenOptions } from './worldgen';
import { SPECIES, SPECIES_BY_KEY } from './species';
import { BIOMES, B } from './defs';
import * as people from './people';
import { passable, Mode } from './move';

export interface StartOptions {
  races: string[];         // keys of thinking races to start with
  tribes: number;          // tribes per race
  animals: number;         // 0..2 density of wildlife
  monsters: boolean;       // start with a few monsters in the wild
}
export const DEFAULT_START: StartOptions = { races: ['human', 'elf', 'dwarf', 'orc'], tribes: 2, animals: 1, monsters: true };

export function newWorld(gen: GenOptions, start: StartOptions): Sim {
  const world = generateWorld(gen);
  const sim = new Sim(world, String(gen.seed));
  populate(sim, start);
  return sim;
}

/** biome → animals that live there, with weights */
const WILD: Partial<Record<B, [string, number][]>> = {
  [B.Grass]: [['sheep', 3], ['cow', 3], ['horse', 2], ['rabbit', 3], ['fox', 1], ['wolf', 0.6], ['chicken', 2], ['crow', 1]],
  [B.Forest]: [['deer', 4], ['rabbit', 2], ['pig', 2], ['wolf', 1.2], ['bear', 0.8], ['fox', 1.5], ['crow', 1]],
  [B.Taiga]: [['deer', 3], ['wolf', 1.5], ['bear', 1], ['elephant', 0.4]],
  [B.Tundra]: [['elephant', 1.2], ['wolf', 1], ['rabbit', 1], ['sheep', 1]],
  [B.Snow]: [['elephant', 0.5], ['wolf', 0.4]],
  [B.Savanna]: [['cow', 2], ['horse', 2], ['elephant', 0.8], ['camel', 0.8], ['chicken', 1]],
  [B.Desert]: [['camel', 2]],
  [B.Badlands]: [['camel', 1]],
  [B.Jungle]: [['pig', 2], ['croc', 1], ['chicken', 2], ['raptor', 0.3]],
  [B.Swamp]: [['croc', 2], ['pig', 1], ['slime', 0.3]],
  [B.Hills]: [['sheep', 3], ['wolf', 0.8], ['horse', 1], ['bear', 0.4]],
  [B.Mountain]: [['bear', 0.4]],
  [B.Prehistoric]: [['bronto', 2], ['raptor', 1.5], ['trex', 0.4]],
  [B.Enchanted]: [['deer', 3], ['rabbit', 3], ['treant', 0.2]],
  [B.Candy]: [['rabbit', 4], ['slime', 0.6]],
  [B.Mushroom]: [['pig', 2], ['slime', 0.8]],
  [B.Crystal]: [['golem', 0.15]],
  [B.Corrupted]: [['zombie', 0.4], ['ghost', 0.2]],
};

export function populate(sim: Sim, o: StartOptions) {
  const w = sim.world, rng = sim.rng;
  if (w.regionsStale) w.computeRegions();
  // wildlife: herds placed by biome
  const herds = Math.round(w.n / 260 * o.animals);
  for (let k = 0; k < herds; k++) {
    const i = rng.int(w.n);
    const opts = WILD[w.biome[i] as B];
    if (!opts) continue;
    const key = rng.weighted(opts.map(x => x[0]), opts.map(x => x[1]));
    const d = SPECIES_BY_KEY[key];
    if (!o.monsters && d.hostile) continue;
    const sub = sim.baseSubspecies(d.id);
    const n = d.kind === 'monster' ? 1 : d.diet === 'carn' ? rng.irange(2, 4) : rng.irange(4, 8);
    const x0 = i % w.w + 0.5, y0 = ((i / w.w) | 0) + 0.5;
    for (let m = 0; m < n; m++) {
      const x = x0 + rng.range(-2, 2), y = y0 + rng.range(-2, 2);
      if (!w.inb(x | 0, y | 0) || !passable(sim, w.tileAt(x, y), Mode.Walk) || BIOMES[w.biome[w.tileAt(x, y)]].water) continue;
      sim.spawn(sub, x, y);
    }
  }
  // the sea
  const fishSub = sim.baseSubspecies(SPECIES_BY_KEY.fish.id);
  const seaN = Math.round(w.n / 300 * o.animals);
  for (let k = 0; k < seaN; k++) {
    const i = rng.int(w.n);
    if (!BIOMES[w.biome[i]].water) continue;
    const x = i % w.w + 0.5, y = ((i / w.w) | 0) + 0.5;
    const r = rng.f();
    const key = w.biome[i] === B.DeepOcean ? (r < 0.08 ? 'whale' : r < 0.16 ? 'shark' : 'fish') : (r < 0.05 ? 'shark' : 'fish');
    const sub = key === 'fish' ? fishSub : sim.baseSubspecies(SPECIES_BY_KEY[key].id);
    const n = key === 'fish' ? rng.irange(2, 5) : 1;
    for (let m = 0; m < n; m++) sim.spawn(sub, x + rng.range(-1, 1), y + rng.range(-1, 1));
  }
  if (o.monsters) {
    const big = w.n / (256 * 256);
    for (let k = 0; k < Math.round(big); k++) placeOne(sim, 'dragon');
  }
  // the first tribes
  for (const key of o.races) for (let t = 0; t < o.tribes; t++) placeTribe(sim, key, 12);
  for (let s = 0; s < 3; s++) sim.step();
}

function placeOne(sim: Sim, key: string) {
  const w = sim.world, d = SPECIES_BY_KEY[key];
  for (let k = 0; k < 600; k++) {
    const i = sim.rng.int(w.n);
    if (!d.homes.includes(w.biome[i] as B)) continue;
    return sim.spawn(sim.baseSubspecies(d.id), i % w.w + 0.5, ((i / w.w) | 0) + 0.5);
  }
  return -1;
}

/** a tribe of a thinking race, placed in land it likes, away from other tribes */
export function placeTribe(sim: Sim, key: string, size: number, x?: number, y?: number): number {
  const w = sim.world, d = SPECIES_BY_KEY[key];
  if (!d) return -1;
  if (x === undefined || y === undefined) {
    let best = -1, bs = -1e9;
    for (let k = 0; k < 500; k++) {
      const i = sim.rng.int(w.n);
      const b = w.biome[i] as B;
      if (BIOMES[b].water || !w.walkable(i)) continue;
      let s = d.homes.includes(b) ? 10 : BIOMES[b].habitable * 4;
      if ((w.regionSize.get(w.region[i]) || 0) < 300) s -= 20;
      const ix = i % w.w, iy = (i / w.w) | 0;
      // stay clear of other people
      for (const b2 of sim.bands) if (b2.alive) { const dd = hyp(sim.units.x[b2.leader] - ix, sim.units.y[b2.leader] - iy); if (dd < 40) s -= (40 - dd) * 0.6; }
      for (const c of sim.cities) if (c.alive) { const dd = hyp(c.x - ix, c.y - iy); if (dd < 40) s -= (40 - dd) * 0.6; }
      s += sim.rng.f() * 3;
      if (s > bs) { bs = s; best = i; }
    }
    if (best < 0) return -1;
    x = best % w.w + 0.5; y = ((best / w.w) | 0) + 0.5;
  }
  const sub = sim.baseSubspecies(d.id);
  const members: number[] = [];
  for (let m = 0; m < size; m++) {
    const px = x + sim.rng.range(-1.5, 1.5), py = y + sim.rng.range(-1.5, 1.5);
    const t = w.tileAt(px, py);
    if (!w.walkable(t) || BIOMES[w.biome[t]].water) continue;
    const age = m < 2 ? d.adult + 4 : sim.rng.range(d.adult * 0.3, d.adult * 2);
    const u = sim.spawn(sub, px, py, { age, sex: m % 2 });
    members.push(u);
  }
  // couples
  const U = sim.units;
  for (let m = 0; m + 1 < members.length; m += 2) { U.spouse[members[m]] = U.uid[members[m + 1]]; U.spouse[members[m + 1]] = U.uid[members[m]]; U.family[members[m + 1]] = U.family[members[m]] = sim.rng.u32() & 0x7fffffff; }
  members.sort((a, b) => U.born[a] - U.born[b]);
  return people.formBand(sim, members, -1);
}

export { SPECIES };
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
