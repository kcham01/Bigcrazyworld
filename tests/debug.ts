import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { STATE_NAMES, JOB_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 256, h: 256, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
const pdeaths: Record<string, number> = {};
const origKill = sim.kill.bind(sim);
sim.kill = (u: number, cause: string, killer = -1) => { if (sim.units.alive[u] && SPECIES[sim.units.spec[u]].sapient) pdeaths[cause] = (pdeaths[cause] || 0) + 1; origKill(u, cause, killer); };
for (let t = 0; t < 240 * 12; t++) {
  sim.step();
  if (t % 120 === 0) {
    const U = sim.units; let n = 0; const st: Record<string, number> = {}; let hunger = 0;
    for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].sapient) { n++; const k = STATE_NAMES[U.state[u]] + (U.city[u] >= 0 ? '/' + JOB_NAMES[U.job[u]] : '/band'); st[k] = (st[k] || 0) + 1; hunger += U.hunger[u]; }
    console.log(`t${t} y${sim.year} people=${n} hunger=${(hunger / Math.max(1, n)).toFixed(0)} bands=${sim.bands.filter(b => b.alive).length} cities=${sim.cities.filter(c => c.alive).map(c => `${c.name}:${c.pop}p f${c.stock[0].toFixed(0)} w${c.stock[1].toFixed(0)} h${c.housing} b${c.buildings.length}`).join(' ')}`);
    console.log('   ', JSON.stringify(st), JSON.stringify(pdeaths));
  }
}
