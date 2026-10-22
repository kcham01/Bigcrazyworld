import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { STATE_NAMES, JOB_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 256, h: 256, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
const U = sim.units;
const hist: Record<string, number> = {};
for (let y = 0; y < 50; y++) for (let t = 0; t < 240; t++) {
  sim.step();
  if (t % 20 === 0 && y > 20) for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].sapient && U.hunger[u] >= 100 && U.city[u] >= 0 && sim.cities[U.city[u]].stock[0] > 20) {
    const k = `${STATE_NAMES[U.state[u]]}/${JOB_NAMES[U.job[u]]}/army${U.army[u] >= 0 ? 1 : 0}/age${sim.ageYears(u) < SPECIES[U.spec[u]].adult ? 'kid' : 'ad'}`;
    hist[k] = (hist[k] || 0) + 1;
  }
}
console.log(Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 25));
