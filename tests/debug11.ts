import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START });
const d: Record<string, number> = {}; let births = 0;
const ok = sim.kill.bind(sim);
sim.kill = (u: number, cause: string, killer = -1) => { if (sim.units.alive[u] && !SPECIES[sim.units.spec[u]].sapient) { const k = cause + (killer >= 0 && sim.units.alive[killer] ? '/' + (SPECIES[sim.units.spec[killer]].sapient ? 'person' : SPECIES[sim.units.spec[killer]].key) : ''); d[k] = (d[k] || 0) + 1; } ok(u, cause, killer); };
for (let y = 0; y < 80; y++) {
  for (let t = 0; t < 240; t++) sim.step();
  if (y % 10 === 9) {
    const by: Record<string, number> = {};
    for (const s of sim.subs) if (!s.sapient && s.pop > 0) by[SPECIES[s.species].key] = (by[SPECIES[s.species].key] || 0) + s.pop;
    console.log(`y${sim.year} animals ${sim.units.count - sim.peopleCount}`, JSON.stringify(by));
    console.log('   deaths', JSON.stringify(Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, 10)));
    for (const k in d) delete d[k];
  }
}
