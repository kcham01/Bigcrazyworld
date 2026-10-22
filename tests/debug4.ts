import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { STATE_NAMES, JOB_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 256, h: 256, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
for (let t = 0; t < 240 * 30; t++) sim.step();
const U = sim.units;
let target = -1;
for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].sapient && U.hunger[u] >= 90 && U.city[u] >= 0 && sim.cities[U.city[u]].stock[0] > 30) { target = u; break; }
console.log('target', target);
for (let k = 0; k < 300 && target >= 0 && U.alive[target]; k++) {
  sim.step();
  const u = target, c = sim.cities[U.city[u]];
  if (k % 5 === 0) console.log(`t${sim.tick} st=${STATE_NAMES[U.state[u]]} job=${JOB_NAMES[U.job[u]]} h=${U.hunger[u].toFixed(0)} hp=${U.hp[u].toFixed(0)} pos ${U.x[u].toFixed(1)},${U.y[u].toFixed(1)} t ${U.tx[u].toFixed(1)},${U.ty[u].toFixed(1)} think ${U.think[u]} timer ${U.timer[u]} city f${c.stock[0].toFixed(0)} ${c.x},${c.y} path ${U.path[u]?.length} pp ${U.pathPos[u]} dest ${U.dest[u]}`);
}
