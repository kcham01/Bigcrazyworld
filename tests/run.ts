// Simulation soak test: build a world, run it for many years, print what happened and how fast.
// node build/tests/run.js [years] [size] [seed]
import { newWorld, DEFAULT_START } from '../src/sim/setup';
import { DEFAULT_GEN } from '../src/sim/worldgen';
import { SPECIES } from '../src/sim/species';
import { ERAS } from '../src/sim/tech';
import { TICKS_PER_YEAR } from '../src/sim/defs';
import { GOV_NAMES } from '../src/sim/entities';

const years = +(process.argv[2] || 200), size = +(process.argv[3] || 256), seed = process.argv[4] || 'test1';
const t0 = Date.now();
const sim = newWorld({ ...DEFAULT_GEN, w: size, h: size, seed }, { ...DEFAULT_START, races: ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard'] });
console.log(`world ${size}x${size} seed=${seed}: ${sim.units.count} creatures, gen ${Date.now() - t0} ms`);
let last = Date.now(), errors = 0;
const evCount: Record<string, number> = {};
sim.onEvent = (e) => { evCount[e.kind] = (evCount[e.kind] || 0) + 1; if (e.imp >= 2 && process.env.V) console.log(`  y${sim.year} [${e.kind}] ${e.text}`); };
for (let y = 0; y < years; y++) {
  try { for (let t = 0; t < TICKS_PER_YEAR; t++) sim.step(); }
  catch (err) { errors++; console.error('ERROR at year', sim.year, err); if (errors > 3) break; }
  if ((y + 1) % 20 === 0 || y === years - 1) {
    const now = Date.now();
    const ks = sim.kingdoms.filter(k => k.alive);
    const people = sim.subs.filter(s => s.sapient).reduce((a, s) => a + Math.max(0, s.pop), 0);
    const maxEra = Math.max(0, ...ks.map(k => k.era));
    const top = ks.sort((a, b) => b.pop - a.pop).slice(0, 4).map(k => `${k.name}[${SPECIES[k.species].key} ${k.cities.length}c ${k.pop}p ${ERAS[k.era].split(' ')[0]} ${GOV_NAMES[k.gov]} t${k.techs.size}]`).join(' ');
    console.log(`y${sim.year} units=${sim.units.count} people=${people} cities=${sim.cities.filter(c => c.alive).length} kingdoms=${ks.length} wars=${sim.wars.filter(w => w.active).length} bld=${sim.buildings.filter(b => b.alive).length} maxEra=${ERAS[maxEra]} ${((now - last) / 20).toFixed(0)}ms/yr`);
    console.log('   ', top);
    last = now;
  }
}
console.log('events:', JSON.stringify(evCount));
console.log('deaths:', JSON.stringify(Object.fromEntries(Object.entries(sim.deaths).sort((a, b) => b[1] - a[1]).slice(0, 12))));
const cities = sim.cities.filter(c => c.alive).sort((a, b) => b.pop - a.pop).slice(0, 6);
for (const c of cities) console.log(`  ${c.name}: pop ${c.pop} housing ${c.housing} bld ${c.buildings.length} food ${c.stock[0].toFixed(0)} wood ${c.stock[1].toFixed(0)} stone ${c.stock[2].toFixed(0)} metal ${c.stock[3].toFixed(0)} gold ${c.stock[4].toFixed(0)} happy ${c.happy.toFixed(0)} fields ${c.fields.length} jobs ${Array.from(c.jobsHave).join(',')}`);
console.log(`total ${(Date.now() - t0) / 1000}s, errors ${errors}`);

// save, load, and keep going: the loaded world must carry on without errors
import { serialize, deserialize } from '../src/sim/save';
{
  const t1 = Date.now();
  const { data, meta } = serialize(sim, 'test');
  const loaded = deserialize(data);
  console.log(`save ${(data.length / 1e6).toFixed(1)} MB in ${Date.now() - t1} ms; loaded year ${loaded.year} (was ${sim.year}), ${loaded.units.count} creatures (was ${sim.units.count}), ${meta.kingdoms} realms`);
  let ok = loaded.year === sim.year && loaded.units.count === sim.units.count;
  try { for (let t = 0; t < TICKS_PER_YEAR * 5; t++) loaded.step(); } catch (e) { ok = false; console.error('ERROR after load', e); }
  console.log(`after load +5 years: ${loaded.peopleCount} people, ${loaded.cities.filter(c => c.alive).length} towns. load test ${ok ? 'passed' : 'FAILED'}`);
  if (!ok) errors++;
  console.log(`errors ${errors}`);
}
