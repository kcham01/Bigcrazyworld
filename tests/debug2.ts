import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { STATE_NAMES, JOB_NAMES } from '../src/sim/units';
const sim = newWorld({ ...DEFAULT_GEN, w: 256, h: 256, seed: 'a' }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
let births = 0; const ob = sim.spawn.bind(sim);
for (let t = 0; t < 1200; t++) sim.step();
const U = sim.units;
for (let k = 0; k < 40; k++) {
  sim.step();
  for (let u = 0; u < U.hi; u++) if (U.alive[u] && SPECIES[U.spec[u]].sapient && U.hunger[u] >= 95 && (sim.tick % 10 === 0)) {
    const c = U.city[u]; const city = c >= 0 ? sim.cities[c] : null;
    console.log(`u${u} ${SPECIES[U.spec[u]].key} age ${sim.ageYears(u).toFixed(0)} st=${STATE_NAMES[U.state[u]]} job=${JOB_NAMES[U.job[u]]} pos ${U.x[u].toFixed(1)},${U.y[u].toFixed(1)} t ${U.tx[u].toFixed(1)},${U.ty[u].toFixed(1)} city ${city ? city.name + ' f' + city.stock[0].toFixed(0) + ' at ' + city.x + ',' + city.y : '-'} timer ${U.timer[u]} think ${U.think[u]} carry ${U.carry[u]}:${U.carryAmt[u]}`);
  }
}
for (const c of sim.cities) if (c.alive) console.log(c.name, 'famine', c.famine, 'happy', c.happy.toFixed(0), 'pop', c.pop, 'housing', c.housing, 'mothers', c.members.filter(u => U.sex[u] === 1 && sim.ageYears(u) >= SPECIES[U.spec[u]].adult).length);
