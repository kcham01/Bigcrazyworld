import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { BIOMES } from '../src/sim/defs';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START });
for (let t = 0; t < 240 * 125; t++) sim.step();
const pf = sim.paths as any, w = sim.world;
const orig = pf.find.bind(pf);
const big: any[] = []; let total = 0, bigNodes = 0;
pf.find = (s: any, from: number, to: number, mode: number, k: number, max: number) => {
  const b0 = pf.budget; const r = orig(s, from, to, mode, k, max); const n = b0 - pf.budget; total += n;
  if (n > 1500) { bigNodes += n; big.push({ n, ok: r ? r.length : r, mode, from: [from % w.w, (from / w.w) | 0], to: [to % w.w, (to / w.w) | 0], rf: w.region[from], rt: w.region[to], tb: BIOMES[w.biome[to]].name, bld: w.bld[to] ? sim.buildings[w.bld[to] - 1].type : -1, max }); }
  return r;
};
for (let t = 0; t < 240; t++) sim.step();
console.log('total nodes', total, 'big', big.length, bigNodes);
console.log(big.slice(0, 25).map(b => JSON.stringify(b)).join('\n'));
