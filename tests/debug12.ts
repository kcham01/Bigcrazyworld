import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { STATE_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed: 'a' }, { ...DEFAULT_START });
const d: Record<string, number> = {};
const ok = sim.kill.bind(sim);
sim.kill = (u: number, cause: string, killer = -1) => { if (sim.units.alive[u] && !SPECIES[sim.units.spec[u]].sapient) { const k = SPECIES[sim.units.spec[u]].key + ':' + cause + (killer >= 0 && sim.units.alive[killer] ? '/' + SPECIES[sim.units.spec[killer]].key : ''); d[k] = (d[k] || 0) + 1; } ok(u, cause, killer); };
const U = sim.units;
for (let t = 0; t < 240 * 3; t++) {
  sim.step();
  if (t === 300) { let n = 0; for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].key === 'sheep' && n++ < 6) { const ti = sim.world.tileAt(U.x[u], U.y[u]); console.log('sheep', STATE_NAMES[U.state[u]], 'hunger', U.hunger[u].toFixed(0), 'veg', sim.world.veg[ti], 'biome', sim.world.biome[ti], 'season', sim.season); } }
}
console.log(Object.entries(d).filter(([k]) => !k.startsWith('fish') && !k.startsWith('rabbit')).sort((a, b) => b[1] - a[1]).slice(0, 25));
