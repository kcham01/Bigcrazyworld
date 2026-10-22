import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { JOB_NAMES, STATE_NAMES } from '../src/sim/units';
import * as civ from '../src/sim/city';
const seed = process.argv[2] || 'a';
const sim = newWorld({ ...DEFAULT_GEN, w: 192, h: 192, seed }, { ...DEFAULT_START });
const U = sim.units;
for (let y = 0; y < 40; y++) {
  const before = sim.cities.map(c => c.stock[0]);
  const st: Record<string, number> = {};
  for (let t = 0; t < 240; t++) { sim.step(); if (t % 40 === 0) for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].sapient && U.city[u] >= 0) { const k = STATE_NAMES[U.state[u]]; st[k] = (st[k] || 0) + 1; } }
  if (y % 5 === 4) {
    const tot = Object.values(st).reduce((a, b) => a + b, 0);
    console.log(`y${sim.year} people ${sim.peopleCount} towns ${sim.cities.filter(c => c.alive).length} bands ${sim.bands.filter(b => b.alive).length}`);
    console.log('  states%', Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${(v / tot * 100).toFixed(0)}`).join(' '));
    for (const c of sim.cities.filter(c => c.alive).sort((a, b) => b.pop - a.pop).slice(0, 4)) console.log(`  ${c.name.padEnd(14)} pop ${c.pop} kids ${c.kids} house ${c.housing} food ${c.stock[0].toFixed(0)} wood ${c.stock[1].toFixed(0)} stone ${c.stock[2].toFixed(0)} fam ${c.famine} happy ${c.happy.toFixed(0)} bld ${c.buildings.length} jobs ${JOB_NAMES.map((n, i) => c.jobsHave[i] ? n.slice(0, 4) + c.jobsHave[i] : '').filter(Boolean).join(' ')}`);
  }
}
