import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { STATE_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
const pf = sim.paths as any, w = sim.world;
const orig = pf.find.bind(pf);
let calls = 0, nodes = 0, nulls = 0, fails = 0;
const modes = [0, 0, 0, 0];
pf.find = (s: any, from: number, to: number, mode: number, k: number, max: number) => {
  const b0 = pf.budget; const r = orig(s, from, to, mode, k, max); const n = b0 - pf.budget; nodes += n; calls++; if (r === null) { nulls++; if (n >= max) fails++; } modes[mode] += n; return r;
};
for (let y = 0; y < 130; y++) {
  const t0 = Date.now();
  for (let t = 0; t < 240; t++) sim.step();
  if (y % 10 === 9) { console.log(`y${sim.year} ms/yr ${Date.now() - t0} units ${sim.units.count} calls/t ${(calls / 240).toFixed(1)} nodes/t ${(nodes / 240).toFixed(0)} nulls ${nulls} maxfails ${fails} byMode ${modes.map(m => (m / 240).toFixed(0)).join(',')}`); }
  calls = nodes = nulls = fails = 0; modes.fill(0);
}
