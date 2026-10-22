// Realms: founding, rulers and succession, dynasties, government and laws, research and eras,
// first contact (the AI only knows realms it has met), opinions, alliances, war decisions, coalitions,
// golden ages, collapse.
import type { Sim } from './sim';
import { UF, T, Job } from './units';
import { SPECIES } from './species';
import { TICKS_PER_YEAR, R } from './defs';
import { TECHS, TECH_BY_KEY, ERAS } from './tech';
import { Gov, GOV_NAMES, type Kingdom, type Relation, BT } from './entities';
import * as people from './people';
import * as war from './war';
import * as faith from './culture';

export const PALETTE = [
  0xe0453a, 0x3a7be0, 0xf2c230, 0x3fb04f, 0x9b4fd0, 0xf0862e, 0x2fc1c9, 0xe05aa8, 0x8a5a32, 0xd8d8d8, 0x4a4a8f, 0xa6d63a,
  0xb52a5c, 0x1e8f7a, 0xc9a06a, 0x5d6fd6, 0xd6603a, 0x7ad6b0, 0x8f2a2a, 0x2a5d2a, 0xd6c6f0, 0xffe08a, 0x5ab0ff, 0xff9ad0,
];

function pickColor(sim: Sim): number {
  const used = new Set(sim.kingdoms.filter(k => k.alive).map(k => k.color));
  const free = PALETTE.filter(c => !used.has(c));
  if (free.length) return free[sim.rng.int(free.length)];
  const h = sim.rng.f();
  return hsl(h, 0.6, 0.5);
}
export function hsl(h: number, s: number, l: number): number {
  const f = (n: number) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

const RULER_TITLES: Record<number, [string, string]> = {
  [Gov.Tribe]: ['Elder', 'Elder'], [Gov.Chiefdom]: ['Chief', 'Chieftess'], [Gov.Monarchy]: ['King', 'Queen'], [Gov.Empire]: ['Emperor', 'Empress'],
  [Gov.Republic]: ['Consul', 'Consul'], [Gov.Theocracy]: ['High Priest', 'High Priestess'], [Gov.Horde]: ['Warlord', 'Warlord'],
  [Gov.Democracy]: ['President', 'President'], [Gov.Dictatorship]: ['Dictator', 'Dictator'], [Gov.Federation]: ['Chancellor', 'Chancellor'], [Gov.Necrocracy]: ['Lich King', 'Lich Queen'],
};
export function rulerTitle(k: Kingdom, female: boolean) { const t = RULER_TITLES[k.gov] || ['Ruler', 'Ruler']; return female ? t[1] : t[0]; }

const GOV_FORMS: Record<number, string[]> = {
  [Gov.Tribe]: ['Tribe of {p}', '{p} Clans', '{p} Folk'], [Gov.Chiefdom]: ['Chiefdom of {p}', '{p} Confederacy'],
  [Gov.Monarchy]: ['Kingdom of {p}', 'Realm of {p}', '{p} Crown'], [Gov.Empire]: ['{p} Empire', 'Empire of {p}'],
  [Gov.Republic]: ['Republic of {p}', '{p} League'], [Gov.Theocracy]: ['Holy {p}', 'Theocracy of {p}', 'Sacred {p}'],
  [Gov.Horde]: ['{p} Horde', 'Horde of {p}'], [Gov.Democracy]: ['Commonwealth of {p}', 'Free State of {p}'],
  [Gov.Dictatorship]: ['{p} Regime', 'State of {p}'], [Gov.Federation]: ['United {p}', '{p} Federation'], [Gov.Necrocracy]: ['Dread {p}', 'Dominion of {p}'],
};
export function kingdomName(sim: Sim, k: Kingdom) {
  const forms = GOV_FORMS[k.gov] || ['{p}'];
  return forms[(k.id * 7 + k.short.length) % forms.length].replace('{p}', k.short);
}

export function newKingdom(sim: Sim, capital: number, leader: number): number {
  const U = sim.units, city = sim.cities[capital];
  const d = SPECIES[city.species];
  const id = sim.kingdoms.length;
  const cul = sim.cultures[city.culture];
  const lang = sim.langs.list[cul.lang];
  const short = sim.langs.word(lang, 'realm' + sim.rng.u32(), 2);
  const gov = d.key === 'undead' ? Gov.Necrocracy : d.key === 'orc' ? Gov.Horde : Gov.Tribe;
  const color = pickColor(sim);
  const k: Kingdom = {
    id, name: '', short, color, color2: hsl(sim.rng.f(), 0.5, 0.75), banner: [sim.rng.int(8), sim.rng.int(12), sim.rng.int(6)],
    capital, cities: [capital], founded: sim.tick, fell: -1, alive: true, ruler: 0, heir: 0, dynasty: -1, gov, laws: new Set(),
    culture: city.culture, religion: city.religion, species: city.species,
    techs: new Set(['fire']), research: 0, researching: '', era: 0, gold: 10, relations: new Map(), contacts: new Set(),
    wars: [], overlord: -1, stability: 70, weariness: 0, prestige: 0, pop: 0, soldiers: 0, strength: 0, peakPop: 0, peakCities: 1,
    favored: false, history: [], age: 0, goldenAge: 0, capitalMoved: 0, ambition: 'expand',
  };
  // undead start knowing how to raise the dead and fight; awakened animals know nothing
  if (d.key === 'undead') { k.techs.add('stonetools'); k.techs.add('mysticism'); }
  if (d.key === 'dwarf') k.techs.add('stonetools');
  if (d.key === 'elf') k.techs.add('foraging');
  k.name = kingdomName(sim, k);
  sim.kingdoms.push(k);
  pickAmbition(sim, k);
  if (leader >= 0 && U.alive[leader]) crown(sim, k, leader, 'founder');
  nextResearch(sim, k);
  return id;
}

// ------------------------------------------------------------------ rulers
export function crown(sim: Sim, k: Kingdom, u: number, how: 'founder' | 'heir' | 'elected' | 'usurper' | 'conqueror' | 'prophet') {
  const U = sim.units;
  const old = U.idx(k.ruler);
  if (old >= 0 && U.alive[old]) U.flags[old] &= ~UF.Ruler;
  const ch = people.makeNotable(sim, u);
  const title = rulerTitle(k, U.sex[u] === 1);
  if (!ch.titles.includes(title)) ch.titles.unshift(title);
  ch.kingdom = k.id;
  ch.fame += 5;
  U.flags[u] |= UF.Ruler; U.flags[u] &= ~UF.Heir;
  U.job[u] = Job.Noble;
  k.ruler = U.uid[u];
  // dynasties: a new family on the throne founds one
  if (k.dynasty < 0 || how === 'usurper' || how === 'founder' || how === 'elected' || (ch.dynasty !== k.dynasty)) {
    let dyn = sim.dynasties.find(dy => dy.name === ch.family && dy.kingdom === k.id);
    if (!dyn) {
      dyn = { id: sim.dynasties.length, name: ch.family || ch.name, founder: ch.id, kingdom: k.id, members: [ch.id], born: sim.tick, rulers: 0 };
      sim.dynasties.push(dyn);
    }
    k.dynasty = dyn.id; ch.dynasty = dyn.id;
  }
  sim.dynasties[k.dynasty].rulers++;
  const verb = how === 'founder' ? 'founded' : how === 'heir' ? 'inherited the throne of' : how === 'elected' ? 'was chosen to lead' : how === 'usurper' ? 'seized power in' : how === 'prophet' ? 'leads the faithful of' : 'conquered and now rules';
  if (how !== 'founder' || sim.tick > 0) {
    const e = sim.log('ruler', `${title} ${ch.name}${ch.family ? ' ' + ch.family : ''} ${verb} ${k.name}.`, U.x[u], U.y[u], { k: k.id, ch: ch.id, imp: how === 'founder' ? 1 : 1 });
    ch.deeds.push(e.id); k.history.push(e.id);
  }
  pickHeir(sim, k);
}

function pickHeir(sim: Sim, k: Kingdom) {
  const U = sim.units;
  const r = U.idx(k.ruler);
  k.heir = 0;
  if (r < 0) return;
  const elective = k.gov === Gov.Republic || k.gov === Gov.Democracy || k.gov === Gov.Federation || k.gov === Gov.Theocracy;
  if (elective) return;
  // eldest child alive in the realm
  let best = -1, born = 1e12;
  const ruid = U.uid[r];
  for (const c of k.cities) for (const u of sim.cities[c].members) {
    if ((U.father[u] === ruid || U.mother[u] === ruid) && U.born[u] < born) { born = U.born[u]; best = u; }
  }
  if (best >= 0) { k.heir = U.uid[best]; U.flags[best] |= UF.Heir; people.makeNotable(sim, best, 'Heir'); }
}

export function rulerDied(sim: Sim, kid: number, u: number, cause: string, killer: number) {
  const k = sim.kingdoms[kid];
  if (!k || !k.alive || k.ruler !== sim.units.uid[u]) return;
  k.ruler = 0;
  k.stability -= 10;
  // was it murder? a rival may take the throne
  const U = sim.units;
  if (killer >= 0 && U.alive[killer] && sim.unitKingdom(killer) === kid && SPECIES[U.spec[killer]].sapient) {
    crown(sim, k, killer, 'usurper'); k.stability -= 15; return;
  }
  succession(sim, k);
}

function succession(sim: Sim, k: Kingdom) {
  const U = sim.units;
  let h = k.heir ? U.idx(k.heir) : -1;
  if (h >= 0 && U.alive[h] && sim.unitKingdom(h) === k.id) { crown(sim, k, h, 'heir'); return; }
  // choose the most respected adult of the capital (or any city)
  const cands: number[] = [];
  const cities = [k.capital, ...k.cities.filter(c => c !== k.capital)];
  for (const c of cities) {
    const city = sim.cities[c];
    if (!city || !city.alive) continue;
    for (const u of city.members) if (sim.ageYears(u) >= SPECIES[U.spec[u]].adult && U.alive[u]) cands.push(u);
    if (cands.length > 20) break;
  }
  if (!cands.length) return;
  let best = cands[0], bs = -1e9;
  for (const u of cands) {
    let s = U.level[u] * 3 + U.kills[u] + (U.flags[u] & UF.Notable ? 10 : 0) + (U.flags[u] & UF.Hero ? 20 : 0) + sim.rng.f() * 10;
    if (U.traits[u] & (1 << T.Charismatic)) s += 10;
    if (U.traits[u] & (1 << T.Ambitious)) s += 5;
    if (s > bs) { bs = s; best = u; }
  }
  const elective = k.gov === Gov.Republic || k.gov === Gov.Democracy || k.gov === Gov.Federation;
  crown(sim, k, best, elective ? 'elected' : 'heir');
  // no clear heir in a monarchy: rivals may rise up
  if (!elective && k.cities.length >= 3 && sim.rng.chance(0.35) && sim.laws.rebellion) {
    const rebel = k.cities.filter(c => c !== k.capital).sort((a, b) => sim.cities[b].pop - sim.cities[a].pop)[0];
    if (rebel !== undefined) {
      sim.log('crisis', `With no heir, ${k.name} falls into a war of succession!`, sim.cities[rebel].x, sim.cities[rebel].y, { k: k.id, imp: 2 });
      war.rebellion(sim, rebel, 'succession');
    }
  }
}

// ------------------------------------------------------------------ research and eras
function nextResearch(sim: Sim, k: Kingdom) {
  const cul = sim.cultures[k.culture];
  const v = cul ? cul.values : null;
  const opts = TECHS.filter(t => !k.techs.has(t.key) && t.needs.every(n => k.techs.has(n)));
  if (!opts.length) { k.researching = ''; return; }
  const weights = opts.map(t => {
    let w = 1 / (1 + t.era);
    if (v) {
      if (/bronze|iron|steel|archery|riding|chivalry|gunpowder|rifling|fission|rocketry/.test(t.key)) w *= 1 + v.war / 60;
      if (/writing|math|philosophy|astronomy|printing|physics|computers|ai/.test(t.key)) w *= 1 + v.learn / 60;
      if (/trade|currency|banking|navigation|seafaring/.test(t.key)) w *= 1 + v.trade / 60;
      if (/mysticism|theology|calendar/.test(t.key)) w *= 1 + v.faith / 60;
    }
    return w;
  });
  k.researching = sim.rng.weighted(opts, weights).key;
}

export function techCost(sim: Sim, key: string) { return TECH_BY_KEY[key].cost; }

function learn(sim: Sim, k: Kingdom, key: string, how = '') {
  if (k.techs.has(key)) return;
  k.techs.add(key);
  const t = TECH_BY_KEY[key];
  const cap = sim.cities[k.capital];
  if (t.era >= 2 || key === 'agriculture' || key === 'writing') {
    const e = sim.log('tech', `${k.name} ${how || 'discovered'} ${t.name}.`, cap ? cap.x : 0, cap ? cap.y : 0, { k: k.id, imp: t.era >= 6 ? 1 : 0 });
    k.history.push(e.id);
  }
  // a new era?
  const era = eraOf(k);
  if (era > k.era) {
    k.era = era;
    const e = sim.log('era', `${k.name} entered the ${ERAS[era]}!`, cap ? cap.x : 0, cap ? cap.y : 0, { k: k.id, imp: era >= 4 ? 2 : 1 });
    k.history.push(e.id);
    // re-equip the army
    for (const c of k.cities) for (const u of sim.cities[c].members) if (sim.units.job[u] === Job.Soldier || sim.units.job[u] === Job.Guard) war.equip(sim, u);
  }
  updateGov(sim, k);
  if (key === k.researching) nextResearch(sim, k);
}

function eraOf(k: Kingdom): number {
  let era = 0;
  for (let e = 1; e < ERAS.length; e++) {
    const all = TECHS.filter(t => t.era === e);
    const have = all.filter(t => k.techs.has(t.key)).length;
    if (have >= Math.ceil(all.length * 0.5)) era = e; else break;
  }
  return era;
}

export function inspiration(sim: Sim, kid: number, u: number) {
  const k = sim.kingdoms[kid];
  if (!k.researching) return;
  k.research += techCost(sim, k.researching) * 0.5;
  const ch = people.makeNotable(sim, u, 'Sage');
  ch.fame += 3;
  if (sim.rng.chance(0.3)) {
    const e = sim.log('genius', `The sage ${ch.name} of ${sim.cities[sim.units.city[u]]?.name ?? k.name} had a brilliant idea about ${TECH_BY_KEY[k.researching].name.toLowerCase()}.`, sim.units.x[u], sim.units.y[u], { k: kid, ch: ch.id, imp: 0 });
    ch.deeds.push(e.id);
  }
}

export function shareTech(sim: Sim, from: number, to: number) {
  const a = sim.kingdoms[from], b = sim.kingdoms[to];
  if (!a || !b) return;
  const opts = [...a.techs].filter(t => !b.techs.has(t) && TECH_BY_KEY[t].needs.every(n => b.techs.has(n)));
  if (!opts.length) return;
  learn(sim, b, opts[sim.rng.int(opts.length)], 'learned from ' + a.short + ':');
}

// ------------------------------------------------------------------ government
function updateGov(sim: Sim, k: Kingdom) {
  const d = SPECIES[k.species];
  if (k.gov === Gov.Necrocracy) return;
  const cul = sim.cultures[k.culture];
  const v = cul?.values;
  let g = k.gov;
  const n = k.cities.length;
  if (g === Gov.Tribe && (k.pop > 40 || n >= 2)) g = Gov.Chiefdom;
  if ((g === Gov.Chiefdom || g === Gov.Horde && n >= 6) && (k.techs.has('writing') || n >= 4)) {
    if (v && v.faith > 70 && k.religion >= 0) g = Gov.Theocracy;
    else if (v && v.trade > 65 && k.techs.has('philosophy')) g = Gov.Republic;
    else if (d.key !== 'orc' || n >= 6) g = Gov.Monarchy;
  }
  if (g === Gov.Monarchy && n >= 7) g = Gov.Empire;
  if ((g === Gov.Monarchy || g === Gov.Empire || g === Gov.Republic) && k.techs.has('printing') && v && v.learn + v.trade > 110 && sim.rng.chance(0.3)) g = Gov.Democracy;
  if (g === Gov.Democracy && k.techs.has('computers') && n >= 8) g = Gov.Federation;
  if (g !== k.gov) setGov(sim, k, g);
}

export function setGov(sim: Sim, k: Kingdom, g: Gov, why = '') {
  const old = k.gov;
  k.gov = g;
  const oldName = k.name;
  k.name = kingdomName(sim, k);
  const cap = sim.cities[k.capital];
  const e = sim.log('gov', `${oldName} became the ${k.name} (${GOV_NAMES[old]} → ${GOV_NAMES[g]})${why ? ' ' + why : ''}.`, cap?.x ?? 0, cap?.y ?? 0, { k: k.id, imp: 1 });
  k.history.push(e.id);
  // the ruler gets a new title
  const r = sim.units.idx(k.ruler);
  if (r >= 0) { const ch = sim.charOf(r); if (ch) { ch.titles[0] = rulerTitle(k, ch.female); } }
  // laws follow the government
  k.laws.clear();
  if (g === Gov.Horde || g === Gov.Dictatorship || g === Gov.Necrocracy) k.laws.add('conscription');
  if (g === Gov.Theocracy) k.laws.add('state faith');
  if (g === Gov.Republic || g === Gov.Democracy || g === Gov.Federation) { k.laws.add('elections'); k.laws.add('free trade'); }
  if (g === Gov.Monarchy || g === Gov.Empire) k.laws.add('nobility');
  if (g === Gov.Democracy || g === Gov.Federation) k.laws.add('tolerance');
}

function pickAmbition(sim: Sim, k: Kingdom) {
  const v = sim.cultures[k.culture]?.values;
  if (!v) return;
  const opts: Kingdom['ambition'][] = ['expand', 'consolidate', 'conquer', 'faith', 'trade', 'learn'];
  const w = [40 + (k.cities.length < 4 ? 40 : 0), 20 + k.weariness, v.war, v.faith * 0.6, v.trade * 0.7, v.learn * 0.7];
  if (SPECIES[k.species].key === 'orc' || SPECIES[k.species].key === 'undead') w[2] += 60;
  k.ambition = sim.rng.weighted(opts, w);
}

// ------------------------------------------------------------------ diplomacy
export function rel(sim: Sim, a: number, b: number): Relation {
  const ka = sim.kingdoms[a];
  let r = ka.relations.get(b);
  if (!r) { r = { opinion: 0, status: 'peace', since: sim.tick, truce: 0, trade: false, marriage: false, grievances: 0 }; ka.relations.set(b, r); }
  return r;
}
export function opinion(sim: Sim, a: number, b: number, delta: number, _why = '') {
  if (a === b || a < 0 || b < 0) return;
  const r1 = rel(sim, a, b), r2 = rel(sim, b, a);
  r1.opinion = Math.max(-100, Math.min(100, r1.opinion + delta));
  r2.opinion = Math.max(-100, Math.min(100, r2.opinion + delta * 0.8));
}
export function setStatus(sim: Sim, a: number, b: number, s: Relation['status']) {
  const r1 = rel(sim, a, b), r2 = rel(sim, b, a);
  r1.status = s; r1.since = sim.tick;
  r2.status = s === 'vassal' ? 'overlord' : s === 'overlord' ? 'vassal' : s; r2.since = sim.tick;
}

export function meet(sim: Sim, a: number, b: number) {
  if (a === b || a < 0 || b < 0) return;
  const ka = sim.kingdoms[a], kb = sim.kingdoms[b];
  if (ka.contacts.has(b)) return;
  ka.contacts.add(b); kb.contacts.add(a);
  // first impressions
  let o = 0;
  if (ka.species === kb.species) o += 15; else o -= 10;
  if (ka.religion >= 0 && ka.religion === kb.religion) o += 15;
  const va = sim.cultures[ka.culture]?.values, vb = sim.cultures[kb.culture]?.values;
  if (va && vb) o += (va.xeno + vb.xeno) / 10 - 8;
  if (SPECIES[ka.species].key === 'undead' || SPECIES[kb.species].key === 'undead') o = -100;
  if ((SPECIES[ka.species].key === 'elf' && SPECIES[kb.species].key === 'orc') || (SPECIES[ka.species].key === 'orc' && SPECIES[kb.species].key === 'elf')) o -= 25;
  if ((SPECIES[ka.species].key === 'dwarf' && SPECIES[kb.species].key === 'goblin') || (SPECIES[ka.species].key === 'goblin' && SPECIES[kb.species].key === 'dwarf')) o -= 20;
  rel(sim, a, b).opinion = o; rel(sim, b, a).opinion = o;
  const ca = sim.cities[ka.capital];
  if (sim.tick > 10) sim.log('contact', `${ka.name} made contact with ${kb.name}.`, ca?.x ?? 0, ca?.y ?? 0, { k: a, k2: b, imp: 0 });
}

/** kingdoms meet when their land is close */
function discover(sim: Sim, k: Kingdom) {
  for (const c of k.cities) {
    const city = sim.cities[c];
    for (const o of sim.cities) {
      if (!o.alive || o.kingdom === k.id || k.contacts.has(o.kingdom)) continue;
      const r = city.radius + o.radius + 12 + (k.techs.has('seafaring') ? 20 : 0) + (k.techs.has('navigation') ? 40 : 0) + (k.techs.has('radio') ? 400 : 0);
      if ((o.x - city.x) ** 2 + (o.y - city.y) ** 2 < r * r) meet(sim, k.id, o.kingdom);
    }
  }
}

export function power(sim: Sim, k: Kingdom): number {
  return k.soldiers * (1 + k.era * 0.6) + k.pop * 0.15 + (k.overlord >= 0 ? 0 : 0);
}
function sharesBorder(sim: Sim, a: Kingdom, b: Kingdom): number {
  let best = 1e9;
  for (const c of a.cities) for (const d of b.cities) {
    const ca = sim.cities[c], cb = sim.cities[d];
    const dd = hyp(ca.x - cb.x, ca.y - cb.y) - ca.radius - cb.radius;
    if (dd < best) best = dd;
  }
  return best;
}

function diplomacy(sim: Sim, k: Kingdom) {
  if (!sim.laws.diplomacy) return;
  const va = sim.cultures[k.culture]?.values;
  for (const o of k.contacts) {
    const ko = sim.kingdoms[o];
    if (!ko || !ko.alive) { k.contacts.delete(o); continue; }
    const r = rel(sim, k.id, o);
    // drift
    const near = sharesBorder(sim, k, ko);
    let drift = 0;
    if (near < 4) drift -= 0.6;                         // borders rub
    if (ko.species === k.species) drift += 0.2;
    if (ko.religion >= 0 && ko.religion === k.religion) drift += 0.3; else if (k.religion >= 0 && ko.religion >= 0) drift -= 0.2;
    if (r.trade) drift += 0.3;
    if (r.status === 'alliance') drift += 0.2;
    if (ko.ambition === 'conquer') drift -= 0.2;
    drift -= r.grievances * 0.05;
    r.opinion = Math.max(-100, Math.min(100, r.opinion + drift - r.opinion * 0.01));
    r.grievances = Math.max(0, r.grievances - 0.05);
    if (r.truce > 0) r.truce = Math.max(0, r.truce - 20);
    if (r.status === 'truce' && r.truce === 0) r.status = 'peace';
    // alliances
    if (r.status === 'peace' && r.opinion > 50 && sim.rng.chance(0.02) && ko.overlord < 0 && k.overlord < 0) {
      setStatus(sim, k.id, o, 'alliance');
      sim.log('alliance', `${k.name} and ${ko.name} formed an alliance.`, sim.cities[k.capital]?.x ?? 0, sim.cities[k.capital]?.y ?? 0, { k: k.id, k2: o, imp: 1 });
    }
    if (r.status === 'alliance' && r.opinion < 10 && sim.rng.chance(0.05)) {
      setStatus(sim, k.id, o, 'peace');
      sim.log('alliance', `The alliance between ${k.name} and ${ko.name} broke apart.`, sim.cities[k.capital]?.x ?? 0, sim.cities[k.capital]?.y ?? 0, { k: k.id, k2: o, imp: 0 });
    }
    // royal marriages between friendly monarchies
    if (!r.marriage && r.opinion > 35 && (k.gov === Gov.Monarchy || k.gov === Gov.Empire) && (ko.gov === Gov.Monarchy || ko.gov === Gov.Empire) && sim.rng.chance(0.01)) {
      r.marriage = true; rel(sim, o, k.id).marriage = true; opinion(sim, k.id, o, 20);
      sim.log('marriage', `A royal marriage joined the houses of ${k.name} and ${ko.name}.`, sim.cities[k.capital]?.x ?? 0, sim.cities[k.capital]?.y ?? 0, { k: k.id, k2: o, imp: 0 });
    }
    // war?
    if (!sim.laws.wars || sim.laws.peace) continue;
    if (r.status !== 'peace') continue;
    if (k.overlord === o || ko.overlord === k.id) continue;
    if (k.wars.length >= 2) continue;
    if (sim.tick - k.founded < TICKS_PER_YEAR * 10 && SPECIES[k.species].key !== 'undead') continue;
    const mine = power(sim, k), theirs = power(sim, ko) + allyPower(sim, ko);
    let want = -r.opinion / 100;                       // hate
    if (k.ambition === 'conquer') want += 0.4;
    if (va) want += (va.war - 50) / 120;
    if (near > 30) want -= 0.6;
    if (mine < theirs * 0.9) want -= 0.5; else if (mine > theirs * 1.8) want += 0.3;
    want -= k.weariness / 80;
    if (SPECIES[k.species].key === 'undead') want = 1;
    if (k.favored) want -= 0.15;
    if (want > 0.45 && sim.rng.chance(0.04 + want * 0.05)) {
      const goal = SPECIES[k.species].key === 'undead' ? 'extermination' : k.religion >= 0 && ko.religion !== k.religion && va && va.faith > 65 ? 'holy war' : mine > theirs * 2.5 && sim.rng.chance(0.4) ? 'vassalage' : 'conquest';
      war.declare(sim, k.id, o, goal, r.opinion < -40 ? 'old hatreds' : k.ambition === 'conquer' ? 'ambition' : 'border disputes');
    }
  }
}

function allyPower(sim: Sim, k: Kingdom) {
  let p = 0;
  for (const [o, r] of k.relations) if (r.status === 'alliance' && sim.kingdoms[o].alive) p += power(sim, sim.kingdoms[o]) * 0.6;
  return p;
}

/** others band together against a realm that grows too strong */
function coalitions(sim: Sim) {
  if (!sim.laws.coalitions || !sim.laws.wars || sim.laws.peace) return;
  const alive = sim.kingdoms.filter(k => k.alive);
  if (alive.length < 4) return;
  const avg = alive.reduce((s, k) => s + k.cities.length, 0) / alive.length;
  for (const big of alive) {
    if (big.cities.length < 7 || big.cities.length < avg * 3) continue;
    if (!sim.rng.chance(0.15)) continue;
    const members = [...big.contacts].map(o => sim.kingdoms[o]).filter(o => o.alive && o.overlord < 0 && rel(sim, o.id, big.id).opinion < 20 && rel(sim, o.id, big.id).status === 'peace');
    if (members.length < 2) continue;
    const lead = members.sort((a, b) => power(sim, b) - power(sim, a))[0];
    const w = war.declare(sim, lead.id, big.id, 'coalition', `fear of the might of ${big.name}`);
    if (w < 0) continue;
    for (const m of members.slice(1, 5)) war.join(sim, w, m.id, 'attacker');
    sim.wars[w].name = `War of the ${members.length > 3 ? 'Grand ' : ''}Coalition against ${big.short}`;
    sim.log('coalition', `${members.length} realms formed a coalition against the mighty ${big.name}!`, sim.cities[big.capital]?.x ?? 0, sim.cities[big.capital]?.y ?? 0, { k: big.id, w, imp: 2 });
    return;
  }
}

// ------------------------------------------------------------------ capital and collapse
export function moveCapital(sim: Sim, kid: number) {
  const k = sim.kingdoms[kid];
  const alive = k.cities.filter(c => sim.cities[c].alive);
  if (!alive.length) return;
  const best = alive.sort((a, b) => sim.cities[b].pop - sim.cities[a].pop)[0];
  if (sim.cities[k.capital]) sim.cities[k.capital].capital = false;
  k.capital = best; sim.cities[best].capital = true; k.capitalMoved = sim.tick;
  k.stability -= 10;
}

export function fall(sim: Sim, kid: number, cause: string) {
  const k = sim.kingdoms[kid];
  if (!k.alive) return;
  k.alive = false; k.fell = sim.tick;
  for (const w of [...k.wars]) war.endWar(sim, w, -1, 'the fall of ' + k.name);
  for (const a of sim.armies) if (a.kingdom === kid) a.state = 'disband';
  for (const o of sim.kingdoms) { if (o.contacts.has(kid)) o.contacts.delete(kid); if (o.overlord === kid) o.overlord = -1; }
  const years = Math.round((sim.tick - k.founded) / TICKS_PER_YEAR);
  const cap = sim.cities[k.capital];
  const e = sim.log('fall', `${k.name} has fallen (${cause}) after ${years} years.`, cap?.x ?? 0, cap?.y ?? 0, { k: kid, imp: 2 });
  k.history.push(e.id);
}

// ------------------------------------------------------------------ the loop (every 20 ticks)
export function stepKingdoms(sim: Sim) {
  for (const k of sim.kingdoms) {
    if (!k.alive) continue;
    k.cities = k.cities.filter(c => sim.cities[c]?.alive && sim.cities[c].kingdom === k.id);
    if (!k.cities.length) { fall(sim, k.id, 'no towns left'); continue; }
    if (!sim.cities[k.capital]?.alive || sim.cities[k.capital].kingdom !== k.id) moveCapital(sim, k.id);
    // tallies
    let pop = 0, sol = 0;
    for (const c of k.cities) { pop += sim.cities[c].pop; sol += sim.cities[c].soldiers; }
    k.pop = pop; k.soldiers = sol; k.strength = power(sim, k);
    if (pop > k.peakPop) k.peakPop = pop;
    if (k.cities.length > k.peakCities) k.peakCities = k.cities.length;
    // research
    if (k.researching) {
      k.research += (0.25 + Math.sqrt(pop) * 0.12) * sim.laws.techSpeed * (k.goldenAge > sim.tick ? 1.5 : 1);
      const cost = techCost(sim, k.researching);
      if (k.research >= cost) { k.research -= cost; learn(sim, k, k.researching); }
    } else nextResearch(sim, k);
    // ruler
    if (k.ruler === 0 || sim.units.idx(k.ruler) < 0) succession(sim, k);
    // a staggered slower think
    if ((k.id + sim.tick / 20) % 6 === 0) {
      discover(sim, k);
      diplomacy(sim, k);
      stability(sim, k);
    }
  }
  if (sim.tick % (TICKS_PER_YEAR * 2) === 0) coalitions(sim);
}

function stability(sim: Sim, k: Kingdom) {
  let s = 60;
  let happy = 0;
  for (const c of k.cities) happy += sim.cities[c].happy;
  happy /= k.cities.length;
  s += (happy - 50) * 0.6;
  s -= Math.max(0, k.cities.length - 6) * 1.5;           // big realms are hard to hold
  if (k.gov === Gov.Empire || k.gov === Gov.Federation) s += 8;
  if (k.gov === Gov.Tribe) s += 10;
  s -= k.weariness * 0.4;
  if (sim.tick - k.capitalMoved < TICKS_PER_YEAR * 5) s -= 10;
  const r = sim.units.idx(k.ruler);
  if (r >= 0) {
    const tr = sim.units.traits[r];
    if (tr & (1 << T.Charismatic)) s += 8;
    if (tr & (1 << T.Cruel)) s -= 6;
    if (tr & (1 << T.Kind)) s += 4;
    if (tr & (1 << T.Mad)) s -= 15;
  } else s -= 20;
  if (hasPalace(sim, k)) s += 6;
  k.stability = Math.max(0, Math.min(100, k.stability * 0.8 + s * 0.2));
  // unhappy, far away towns rebel
  if (sim.laws.rebellion && k.cities.length >= 3 && k.stability < 35) {
    for (const c of k.cities) {
      const city = sim.cities[c];
      if (city.capital) continue;
      city.loyalty += (k.stability - 45) * 0.1 + (city.happy - 45) * 0.1;
      city.loyalty = Math.max(0, Math.min(100, city.loyalty));
      if (city.loyalty < 15 && sim.rng.chance(0.08)) { war.rebellion(sim, c, 'unrest'); break; }
    }
  } else for (const c of k.cities) sim.cities[c].loyalty = Math.min(100, sim.cities[c].loyalty + 0.5);
}

function hasPalace(sim: Sim, k: Kingdom) {
  const cap = sim.cities[k.capital];
  if (!cap) return false;
  return cap.buildings.some(b => sim.buildings[b].type === BT.Palace && sim.buildings[b].alive && sim.buildings[b].built >= 1);
}

export function yearly(sim: Sim) {
  for (const k of sim.kingdoms) {
    if (!k.alive) continue;
    k.age++;
    k.weariness = Math.max(0, k.weariness - (k.wars.length ? -2 : 4));
    if (k.age % 25 === 0) pickAmbition(sim, k);
    // golden ages
    if (k.goldenAge < sim.tick && k.stability > 75 && k.wars.length === 0 && k.pop > 80 && sim.rng.chance(0.03)) {
      k.goldenAge = sim.tick + TICKS_PER_YEAR * (10 + sim.rng.int(20));
      const cap = sim.cities[k.capital];
      sim.log('golden', `A golden age begins in ${k.name}: arts and learning flourish.`, cap.x, cap.y, { k: k.id, imp: 1 });
    }
    // vassals pay tribute and may break free
    if (k.overlord >= 0) {
      const ov = sim.kingdoms[k.overlord];
      if (!ov || !ov.alive) k.overlord = -1;
      else {
        const t = k.gold * 0.2; k.gold -= t; ov.gold += t;
        if (power(sim, k) > power(sim, ov) * 0.8 && sim.rng.chance(0.15) && sim.laws.wars) {
          const o = k.overlord; k.overlord = -1; setStatus(sim, k.id, o, 'peace');
          war.declare(sim, k.id, o, 'independence', 'throwing off the yoke');
        }
      }
    }
    updateGov(sim, k);
    // gold buys things for the capital
    const cap = sim.cities[k.capital];
    if (cap && k.gold > 40) { const g = k.gold * 0.3; k.gold -= g; cap.stock[R.Gold] += g; }
  }
}
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
