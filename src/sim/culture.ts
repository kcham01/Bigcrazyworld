// Cultures and faiths: every people has a culture with its own language and values; cultures drift
// apart into daughter cultures (and daughter languages). Prophets found religions, priests spread them,
// traders carry them abroad, and big faiths split in schisms.
import type { Sim } from './sim';
import { UF, T, Job } from './units';
import { SPECIES } from './species';
import { G, Gene } from './genetics';
import { TICKS_PER_YEAR } from './defs';
import { BT, type Values, type Culture, type Religion } from './entities';
import type { Flavor } from './language';
import { hsl } from './kingdom';
import * as people from './people';

const BASE_VALUES: Record<string, Partial<Values>> = {
  human: { trade: 60, learn: 55, xeno: 50 }, elf: { nature: 85, learn: 70, art: 75, war: 30, xeno: 30 },
  dwarf: { honor: 80, trade: 65, war: 50, nature: 20, art: 60 }, orc: { war: 90, honor: 55, learn: 25, trade: 30, xeno: 25 },
  goblin: { trade: 70, war: 45, honor: 15, xeno: 55 }, lizard: { faith: 70, nature: 60, xeno: 30 }, avian: { art: 70, learn: 60, nature: 55 },
  undead: { war: 100, faith: 10, xeno: 0, honor: 0, art: 10, trade: 5 },
};
const TRADITIONS = ['ancestor worship', 'blood feuds', 'great feasts', 'storytelling', 'tattooing', 'horse lords', 'sea faring', 'stone carving', 'star gazing', 'duelling', 'hospitality', 'mask dances', 'sacred groves', 'iron working', 'song contests', 'hunting rites', 'trial by combat', 'silent monks', 'scholar caste', 'merchant guilds'];

export function newCulture(sim: Sim, sub: number, x: number, y: number, parent = -1): number {
  const s = sim.subs[sub];
  const d = SPECIES[s.species];
  const flavor: Flavor = (d.build as Flavor) || 'beast';
  const par = parent >= 0 ? sim.cultures[parent] : null;
  const lang = sim.langs.create(flavor, sim.rng.u32(), sim.tick, par ? sim.langs.list[par.lang] : undefined, sim.rng);
  const base = BASE_VALUES[d.key] || {};
  const v = (k: keyof Values) => {
    const from = par ? par.values[k] : (base[k] ?? 50);
    return Math.max(0, Math.min(100, Math.round(from + sim.rng.gauss() * (par ? 12 : 15))));
  };
  const values: Values = { war: v('war'), faith: v('faith'), trade: v('trade'), learn: v('learn'), art: v('art'), nature: v('nature'), xeno: v('xeno'), honor: v('honor') };
  const traditions = par ? [...par.traditions] : [];
  if (traditions.length > 2) traditions.splice(sim.rng.int(traditions.length), 1);
  while (traditions.length < 2) { const t = TRADITIONS[sim.rng.int(TRADITIONS.length)]; if (!traditions.includes(t)) traditions.push(t); }
  const id = sim.cultures.length;
  const c: Culture = { id, name: lang.name, lang: lang.id, species: s.species, values, traditions, parent, born: sim.tick, color: hsl(sim.rng.f(), 0.45, 0.6), alive: true, pop: 0, style: 0 };
  sim.cultures.push(c);
  void x; void y;
  return id;
}

// ------------------------------------------------------------------ religions
const DEITY_TYPES = ['Sun', 'Moon', 'Sky Father', 'Earth Mother', 'Storm', 'Sea', 'Fire', 'Death', 'Harvest', 'War', 'Stars', 'the Ancestors', 'the Great Tree', 'the Deep', 'the Void', 'the Forge'];
const REL_TYPES = ['cult', 'faith', 'church', 'way', 'path', 'covenant', 'order', 'mysteries'];
const TENETS = ['pilgrimage', 'fasting', 'holy war', 'pacifism', 'charity', 'human sacrifice', 'monasteries', 'sacred animals', 'ancestor shrines', 'missionaries', 'tolerance', 'purity', 'prophecy', 'ritual combat', 'feasting', 'scholarship'];
const DEITY_TITLES = ['the Radiant', 'the Silent', 'Who Watches', 'the All-Mother', 'the Undying', 'the Burning One', 'the Deep One', 'the Shepherd', 'the Hunter', 'the Weaver', 'the Judge', 'the Smith'];

export function foundReligion(sim: Sim, c: number, founder: number, parent = -1): number {
  const city = sim.cities[c], U = sim.units;
  const cul = sim.cultures[city.culture];
  const lang = sim.langs.list[cul.lang];
  const par = parent >= 0 ? sim.religions[parent] : null;
  const deity = par ? par.deity : sim.langs.word(lang, 'god' + sim.rng.u32(), 2);
  const type = REL_TYPES[sim.rng.int(REL_TYPES.length)];
  const tenets = par ? [...par.tenets] : [];
  if (tenets.length) tenets.splice(sim.rng.int(tenets.length), 1);
  while (tenets.length < 3) { const t = TENETS[sim.rng.int(TENETS.length)]; if (!tenets.includes(t)) tenets.push(t); }
  if (cul.values.war > 70 && !tenets.includes('holy war') && sim.rng.chance(0.5)) tenets[0] = 'holy war';
  const id = sim.religions.length;
  const nm = par ? `${sim.langs.word(lang, 'sch' + id, 1)} ${par.name.split(' ').slice(-2).join(' ')}` : `${cap(type)} of ${deity}`;
  const r: Religion = { id, name: par ? `Reformed ${par.name.replace(/^Reformed /, '')}` : nm, deity, deityTitle: par ? par.deityTitle : `${DEITY_TYPES[sim.rng.int(DEITY_TYPES.length)]} god, ${DEITY_TITLES[sim.rng.int(DEITY_TITLES.length)]}`,
    type, tenets, founder: -1, born: sim.tick, holyCity: c, color: hsl(sim.rng.f(), 0.7, 0.55), parent, alive: true, followers: 0, symbol: sim.rng.int(12) };
  sim.religions.push(r);
  if (founder >= 0 && U.alive[founder]) {
    const ch = people.makeNotable(sim, founder, 'Prophet');
    r.founder = ch.id; ch.fame += 15; ch.religion = id;
    U.religion[founder] = id; U.setTrait(founder, T.Pious);
    const e = sim.log('religion', par
      ? `${ch.name} broke away from the ${par.name} and founded the ${r.name} in ${city.name}.`
      : `The prophet ${ch.name} of ${city.name} began to preach the ${r.name}, worship of ${deity}, ${r.deityTitle}.`, city.x, city.y, { c, ch: ch.id, r: id, imp: 2 });
    ch.deeds.push(e.id);
  }
  convertCity(sim, c, id, 0.5);
  city.religion = id;
  const k = sim.kingdoms[city.kingdom];
  if (city.capital && (k.religion < 0 || sim.rng.chance(0.5))) k.religion = id;
  return id;
}
function cap(s: string) { return s[0].toUpperCase() + s.slice(1); }

export function convertCity(sim: Sim, c: number, rel: number, share: number) {
  const city = sim.cities[c], U = sim.units;
  for (const u of city.members) if (sim.rng.chance(share) && !(U.flags[u] & UF.Undead)) U.religion[u] = rel;
}

export function preach(sim: Sim, c: number, u: number) {
  const city = sim.cities[c], U = sim.units;
  const rel = U.religion[u] >= 0 ? U.religion[u] : city.religion;
  if (rel < 0) return;
  const tol = sim.kingdoms[city.kingdom].laws.has('tolerance');
  U.near(U.x[u], U.y[u], 6, (j) => {
    if (U.city[j] !== c || U.religion[j] === rel || U.flags[j] & UF.Undead) return;
    const pious = U.genome[j * G + Gene.Piety] / 255;
    if (sim.rng.chance((U.religion[j] < 0 ? 0.25 : 0.05) * (0.5 + pious) * (tol ? 0.5 : 1))) U.religion[j] = rel;
  });
}

export function spreadAlong(sim: Sim, from: number, to: number) {
  const a = sim.cities[from], b = sim.cities[to];
  if (a.religion < 0 || a.religion === b.religion) return;
  const r = sim.religions[a.religion];
  const share = r.tenets.includes('missionaries') ? 0.08 : 0.03;
  convertCity(sim, to, a.religion, share);
}

// ------------------------------------------------------------------ seasons and years
export function seasonal(sim: Sim) {
  // a holy day: pious towns celebrate
  if (sim.season === 0) for (const c of sim.cities) {
    if (!c.alive || c.religion < 0 || c.pop < 20) continue;
    if (c.fervor > 40 && sim.rng.chance(0.3)) { c.festival = Math.max(c.festival, 40); c.fervor -= 20; }
  }
}

export function yearly(sim: Sim) {
  const U = sim.units;
  for (const c of sim.cultures) c.pop = 0;
  for (const r of sim.religions) r.followers = 0;
  for (let u = 0; u < U.hi; u++) {
    if (!U.alive[u] || !SPECIES[U.spec[u]].sapient) continue;
    if (U.culture[u] >= 0) sim.cultures[U.culture[u]].pop++;
    if (U.religion[u] >= 0) sim.religions[U.religion[u]].followers++;
  }
  for (const c of sim.cultures) if (c.alive && c.pop === 0 && sim.tick - c.born > TICKS_PER_YEAR * 5) c.alive = false;
  for (const r of sim.religions) if (r.alive && r.followers === 0 && sim.tick - r.born > TICKS_PER_YEAR * 2) {
    r.alive = false;
    sim.log('religion', `The last follower of the ${r.name} is gone. The faith is forgotten.`, sim.cities[r.holyCity]?.x ?? 0, sim.cities[r.holyCity]?.y ?? 0, { r: r.id, imp: 0 });
  }
  for (const city of sim.cities) {
    if (!city.alive || !city.members.length) continue;
    // majority faith and culture
    const fc = new Map<number, number>(), cc = new Map<number, number>();
    for (const u of city.members) { fc.set(U.religion[u], (fc.get(U.religion[u]) || 0) + 1); cc.set(U.culture[u], (cc.get(U.culture[u]) || 0) + 1); }
    city.faithShare = new Map([...fc].filter(([r]) => r >= 0).map(([r, n]) => [r, n / city.members.length]));
    let bestR = city.religion, bn = 0;
    for (const [r, n] of fc) if (r >= 0 && n > bn) { bn = n; bestR = r; }
    if (bn > city.members.length * 0.4) city.religion = bestR;
    let bestC = city.culture; bn = 0;
    for (const [c, n] of cc) if (c >= 0 && n > bn) { bn = n; bestC = c; }
    city.culture = bestC;
    // new faiths: a pious soul in a town with a shrine or temple
    const k = sim.kingdoms[city.kingdom];
    if (k.techs.has('mysticism') && SPECIES[city.species].key !== 'undead') {
      const holy = city.buildings.some(b => { const t = sim.buildings[b].type; return (t === BT.Shrine || t === BT.Temple) && sim.buildings[b].built >= 1; });
      const pRel = city.religion < 0 ? 0.08 : 0.004;
      if (holy && sim.rng.chance(pRel)) {
        let prophet = -1;
        for (const u of city.members) if ((U.traits[u] & (1 << T.Pious) || U.job[u] === Job.Priest) && sim.ageYears(u) >= SPECIES[U.spec[u]].adult) { prophet = u; break; }
        if (prophet >= 0) foundReligion(sim, city.id, prophet, city.religion >= 0 && sim.religions[city.religion].followers > 150 ? city.religion : -1);
      }
    }
    // the realm's faith follows its capital
    if (city.capital && city.religion >= 0 && k.religion !== city.religion) k.religion = city.religion;
    // cultures drift apart in far-off towns
    if (!city.capital && sim.tick - city.founded > TICKS_PER_YEAR * 60 && sim.rng.chance(0.006)) {
      const cap = sim.cities[k.capital];
      if (cap && hyp(cap.x - city.x, cap.y - city.y) > 30) {
        const nc = newCulture(sim, U.sub[city.members[0]], city.x, city.y, city.culture);
        for (const u of city.members) if (sim.rng.chance(0.8)) U.culture[u] = nc;
        city.culture = nc;
        sim.log('culture', `The people of ${city.name} now see themselves as a people of their own: the ${sim.cultures[nc].name}.`, city.x, city.y, { c: city.id, imp: 0 });
      }
    }
  }
}
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
