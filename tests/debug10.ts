import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN, } from '../src/sim/worldgen';
import { BIOMES } from '../src/sim/defs';
import { BUILDINGS } from '../src/sim/entities';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
for (let t = 0; t < 240 * 120; t++) sim.step();
const pf = sim.paths as any, w = sim.world;
const orig = pf.find.bind(pf);
const tally: Record<string, number> = {};
let shown = 0;
pf.find = (s: any, from: number, to: number, mode: number, k: number, max: number) => {
  const b0 = pf.budget; const r = orig(s, from, to, mode, k, max); const n = b0 - pf.budget;
  if (r === null && mode === 0) {
    const rf = w.region[from], rt = w.region[to];
    const why = rf !== rt && rf > 0 && rt > 0 ? 'island' : n >= max ? 'maxed' : n === 0 ? 'nopass' : 'enclosed';
    const tb = w.bld[to] ? BUILDINGS[sim.buildings[w.bld[to] - 1].type].key : BIOMES[w.biome[to]].key;
    const fb = w.bld[from] ? BUILDINGS[sim.buildings[w.bld[from] - 1].type].key : BIOMES[w.biome[from]].key;
    const key = why + ' from:' + fb + ' to:' + tb;
    tally[key] = (tally[key] || 0) + 1;
    if (why === 'enclosed' && shown++ < 6) console.log('enclosed', n, [from % w.w, (from / w.w) | 0], [to % w.w, (to / w.w) | 0], fb, tb);
  }
  return r;
};
for (let t = 0; t < 240; t++) sim.step();
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 20));
