import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
const sim = newWorld({ ...DEFAULT_GEN, w: 256, h: 256, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
const pdeaths: Record<string, number> = {}; let births = 0;
const origKill = sim.kill.bind(sim);
sim.kill = (u: number, cause: string, killer = -1) => { if (sim.units.alive[u] && SPECIES[sim.units.spec[u]].sapient) pdeaths[cause] = (pdeaths[cause] || 0) + 1; origKill(u, cause, killer); };
const os = sim.spawn.bind(sim);
sim.spawn = (s: number, x: number, y: number, o: any = {}) => { const u = os(s, x, y, o); if (SPECIES[sim.units.spec[u]].sapient && o.city !== undefined) births++; return u; };
for (let y = 0; y < 60; y++) {
  for (let t = 0; t < 240; t++) sim.step();
  if (y % 5 === 4) {
    const fam = sim.cities.filter(c => c.alive).map(c => `${c.name.slice(0,5)}:${c.pop}/${c.housing} f${c.stock[0].toFixed(0)} fam${c.famine} h${c.happy.toFixed(0)}`).join(' ');
    console.log(`y${sim.year} births ${births} deaths ${JSON.stringify(pdeaths)}\n   ${fam}`);
  }
}
