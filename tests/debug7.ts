import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { STATE_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START });
for (let t = 0; t < 240 * 125; t++) sim.step();
const pf = sim.paths as any;
const orig = pf.find.bind(pf);
let calls = 0, nulls = 0, und = 0, nodes = 0, lens = 0; const byState: Record<string, [number, number]> = {};
let cur = -1;
pf.find = (s: any, from: number, to: number, mode: number, k: number, max: number) => {
  const b0 = pf.budget; const r = orig(s, from, to, mode, k, max); calls++; nodes += b0 - pf.budget;
  if (r === null) nulls++; else if (r === undefined) und++; else lens += r.length;
  const st = cur >= 0 ? STATE_NAMES[sim.units.state[cur]] : '?'; const e = byState[st] || [0, 0]; e[0]++; e[1] += b0 - pf.budget; if (r === null) e[1] += 0; byState[st] = e; return r;
};
const U = sim.units;
// hook to know which unit: wrap step loop manually is hard; sample states via a proxy on goTo is not exported; approximate by counting per tick
for (let t = 0; t < 240 * 2; t++) sim.step();
console.log({ calls, perTick: calls / 480, nulls, und, avgNodes: nodes / calls, avgLen: lens / Math.max(1, calls - nulls - und), units: U.count });
