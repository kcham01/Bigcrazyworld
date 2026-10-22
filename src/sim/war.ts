// War: declarations with goals, allies called to arms, armies that gather, march in formation,
// sail across the sea, besiege walls with siege engines, fight battles and take towns.
// Wars end at a peace table (towns ceded, vassals, tribute, conversion) or in a white peace.
// Rebellions and wars of independence split realms apart.
import type { Sim } from './sim';
import { St, UF, T, Job } from './units';
import { SPECIES } from './species';
import { TICKS_PER_YEAR, R } from './defs';
import { BT, BUILDINGS, type War, type Army, type City, Gov } from './entities';
import { goTo, wanderTarget, passable, Mode } from './move';
import { engage, fightStep, nearestEnemy } from './combat';
import * as realm from './kingdom';
import * as civ from './city';
import * as people from './people';
import * as faith from './culture';

// ------------------------------------------------------------------ gear
export function equip(sim: Sim, u: number) {
  const U = sim.units;
  const c = U.city[u];
  if (c < 0) return;
  const city = sim.cities[c], k = sim.kingdoms[city.kingdom];
  const era = k.era;
  const kit = city.equip;
  U.weapon[u] = Math.max(0, Math.min(8, era + (kit > 0.6 ? 1 : 0) - (kit < 0.15 && era > 0 ? 1 : 0)));
  U.armor[u] = Math.max(0, Math.min(8, era - (kit < 0.3 ? 1 : 0)));
  const d = SPECIES[U.spec[u]];
  // archers: elves and avians mostly, others once they know archery; gunners later on
  const ranged = d.key === 'elf' ? 0.65 : d.key === 'avian' ? 0.5 : k.techs.has('gunpowder') ? 0.7 : k.techs.has('archery') ? 0.35 : 0.12;
  if ((U.uid[u] % 100) / 100 < ranged) U.slot[u] |= 128; else U.slot[u] &= ~128;
  // riders when the town keeps horses
  U.mount[u] = 0;
  if (k.techs.has('riding') && (civ.hasBuilding(sim, city, BT.Stable) || city.tame > 2) && !(U.slot[u] & 128) && (U.uid[u] % 3 === 0) && d.size <= 1.1 && !d.fly) U.mount[u] = d.key === 'orc' ? 2 : 1;
  if (k.techs.has('combustion')) U.mount[u] = U.mount[u] ? 3 : 0;   // tanks and trucks
  sim.express(u);
}

// ------------------------------------------------------------------ declaring and ending wars
const WAR_NAMES = ['War of {a}', '{a}-{b} War', 'War of the {x}', '{x} War', 'Great War of {a}', '{n} Years\' War', 'War for {c}'];
const WAR_X = ['Crowns', 'Roses', 'Ravens', 'Iron', 'Ashes', 'Two Rivers', 'Broken Oath', 'Black Banners', 'Salt', 'Bones', 'Stars', 'Thorns', 'Spears', 'Wolves', 'Gold'];

export function declare(sim: Sim, a: number, b: number, goal: string, cause: string): number {
  const ka = sim.kingdoms[a], kb = sim.kingdoms[b];
  if (!ka?.alive || !kb?.alive || a === b || sim.atWar(a, b)) return -1;
  const target = nearestCityOf(sim, kb, sim.cities[ka.capital]);
  const id = sim.wars.length;
  const tpl = WAR_NAMES[sim.rng.int(WAR_NAMES.length)];
  const name = tpl.replace('{a}', ka.short).replace('{b}', kb.short).replace('{x}', WAR_X[sim.rng.int(WAR_X.length)]).replace('{c}', target >= 0 ? sim.cities[target].name : kb.short).replace('{n}', '');
  const w: War = { id, name: name.replace("War of the  Years' War", 'Long War'), attacker: a, defender: b, attackers: [a], defenders: [b], goal, target, started: sim.tick, ended: -1, active: true, score: 0, battles: 0, deaths: [0, 0], winner: -1, cause };
  if (tpl.includes('{n}')) w.name = `War of ${ka.short} and ${kb.short}`;
  sim.wars.push(w);
  realm.setStatus(sim, a, b, 'war');
  ka.wars.push(id); kb.wars.push(id);
  realm.opinion(sim, a, b, -40);
  const cap = sim.cities[ka.capital];
  sim.log('war', `${ka.name} declared war on ${kb.name} (${goal}, ${cause}). The ${w.name} has begun!`, cap?.x ?? 0, cap?.y ?? 0, { k: a, k2: b, w: id, imp: 2 });
  // allies are called to arms
  for (const [o, r] of kb.relations) if (r.status === 'alliance' && sim.kingdoms[o].alive && sim.rng.chance(0.75) && !sim.atWar(o, a)) join(sim, id, o, 'defender');
  for (const [o, r] of kb.relations) if (r.status === 'overlord' && sim.kingdoms[o].alive && !sim.atWar(o, a)) join(sim, id, o, 'defender');
  for (const [o, r] of ka.relations) if (r.status === 'alliance' && sim.kingdoms[o].alive && sim.rng.chance(0.5) && !sim.atWar(o, b)) join(sim, id, o, 'attacker');
  return id;
}

export function join(sim: Sim, wid: number, k: number, side: 'attacker' | 'defender') {
  const w = sim.wars[wid];
  if (!w.active || w.attackers.includes(k) || w.defenders.includes(k)) return;
  const enemies = side === 'attacker' ? w.defenders : w.attackers;
  (side === 'attacker' ? w.attackers : w.defenders).push(k);
  sim.kingdoms[k].wars.push(wid);
  for (const e of enemies) { realm.meet(sim, k, e); realm.setStatus(sim, k, e, 'war'); }
  const kk = sim.kingdoms[k];
  sim.log('war', `${kk.name} joined the ${w.name} on the side of ${sim.kingdoms[side === 'attacker' ? w.attacker : w.defender].name}.`, sim.cities[kk.capital]?.x ?? 0, sim.cities[kk.capital]?.y ?? 0, { k, w: wid, imp: 1 });
}

export function endWar(sim: Sim, wid: number, winner: number, how: string) {
  const w = sim.wars[wid];
  if (!w.active) return;
  w.active = false; w.ended = sim.tick; w.winner = winner; w.peace = how;
  for (const a of w.attackers) for (const d of w.defenders) {
    if (!sim.kingdoms[a].alive || !sim.kingdoms[d].alive) continue;
    // still at war in another war?
    const other = sim.wars.some(o => o.active && o.id !== wid && ((o.attackers.includes(a) && o.defenders.includes(d)) || (o.attackers.includes(d) && o.defenders.includes(a))));
    if (other) continue;
    realm.setStatus(sim, a, d, 'truce');
    realm.rel(sim, a, d).truce = TICKS_PER_YEAR * 10; realm.rel(sim, d, a).truce = TICKS_PER_YEAR * 10;
  }
  for (const k of [...w.attackers, ...w.defenders]) { const kg = sim.kingdoms[k]; kg.wars = kg.wars.filter(x => x !== wid); }
  for (const a of sim.armies) if (a.war === wid && a.state !== 'disband') a.state = 'home';
  const years = Math.max(1, Math.round((sim.tick - w.started) / TICKS_PER_YEAR));
  const c = sim.cities[sim.kingdoms[w.attacker].capital];
  sim.log('peace', `The ${w.name} ended after ${years} year${years > 1 ? 's' : ''}: ${how}.`, c?.x ?? 0, c?.y ?? 0, { w: wid, k: w.attacker, k2: w.defender, imp: 2 });
}

/** a peace conference: the winner sets terms based on the war goal and how badly the loser lost */
function peaceTalks(sim: Sim, w: War) {
  const att = sim.kingdoms[w.attacker], def = sim.kingdoms[w.defender];
  const years = (sim.tick - w.started) / TICKS_PER_YEAR;
  const s = w.score;           // >0 attacker winning
  const decisive = Math.abs(s) > 60;
  const tired = att.weariness > 60 || def.weariness > 60 || years > 25;
  if (!decisive && !tired && years < 6) return;
  if (!decisive && !tired && !sim.rng.chance(0.08)) return;
  const winner = s > 15 ? att : s < -15 ? def : null;
  const loser = winner === att ? def : winner === def ? att : null;
  if (!winner || !loser) { endWar(sim, w.id, -1, 'a white peace: nobody won'); return; }
  let terms = '';
  if (winner === att && w.goal === 'vassalage' && loser.alive && loser.overlord < 0) {
    loser.overlord = winner.id; realm.setStatus(sim, loser.id, winner.id, 'vassal');
    terms = `${loser.name} became a vassal of ${winner.name}`;
  } else if (winner === att && w.goal === 'holy war' && winner.religion >= 0) {
    loser.religion = winner.religion;
    for (const c of loser.cities) faith.convertCity(sim, c, winner.religion, 0.5);
    terms = `${loser.name} must follow the faith of ${sim.religions[winner.religion].name}`;
  } else if (w.goal === 'independence' && winner === att) {
    terms = `${att.name} won its freedom`;
  } else {
    // towns already taken are kept; plus tribute
    const gold = Math.round(loser.gold * 0.5);
    loser.gold -= gold; winner.gold += gold;
    terms = `${winner.name} won${gold > 5 ? ` and took ${gold} gold in tribute` : ''}`;
    // a large defeat may cede a border town
    if (decisive && loser.cities.length > 1) {
      const town = nearestCityOf(sim, loser, sim.cities[winner.capital]);
      if (town >= 0 && !sim.cities[town].capital) { capture(sim, town, winner.id, 'ceded'); terms += `, and ${sim.cities[town].name} was handed over`; }
    }
  }
  winner.prestige += 20;
  endWar(sim, w.id, winner.id, terms);
}

// ------------------------------------------------------------------ rebellion
export function rebellion(sim: Sim, c: number, why: string) {
  const city = sim.cities[c];
  if (!city.alive) return;
  const old = sim.kingdoms[city.kingdom];
  if (old.cities.length < 2) return;
  const U = sim.units;
  // the most ambitious local becomes the leader
  let leader = -1, bs = -1;
  for (const u of city.members) {
    const s = U.level[u] * 2 + (U.traits[u] & (1 << T.Ambitious) ? 10 : 0) + (U.traits[u] & (1 << T.Charismatic) ? 6 : 0) + sim.rng.f() * 5;
    if (sim.ageYears(u) >= SPECIES[U.spec[u]].adult && s > bs) { bs = s; leader = u; }
  }
  if (leader < 0) return;
  old.cities = old.cities.filter(x => x !== c);
  city.capital = false;
  const nk = realm.newKingdom(sim, c, -1);
  const k = sim.kingdoms[nk];
  city.kingdom = nk; city.capital = true; k.capital = c;
  k.techs = new Set(old.techs); k.era = old.era; k.gov = old.gov === Gov.Necrocracy ? Gov.Necrocracy : old.gov === Gov.Tribe ? Gov.Tribe : Gov.Chiefdom;
  k.religion = city.religion; k.culture = city.culture;
  k.name = realm.kingdomName(sim, k);
  realm.crown(sim, k, leader, 'usurper');
  city.loyalty = 80;
  // nearby disloyal towns join
  for (const o of [...old.cities]) {
    const oc = sim.cities[o];
    if (!oc.capital && oc.loyalty < 40 && hyp(oc.x - city.x, oc.y - city.y) < 40 && sim.rng.chance(0.6)) {
      old.cities = old.cities.filter(x => x !== o); oc.kingdom = nk; k.cities.push(o); oc.loyalty = 70;
      sim.world.markAll();
    }
  }
  for (const u of city.members) if (U.army[u] >= 0) leaveArmy(sim, u);
  realm.meet(sim, nk, old.id);
  for (const o of old.contacts) realm.meet(sim, nk, o);
  sim.world.markAll();
  const e = sim.log('rebel', `${city.name} rose up against ${old.name} (${why}) and declared itself the ${k.name}!`, city.x, city.y, { k: nk, k2: old.id, c, imp: 2 });
  k.history.push(e.id);
  if (sim.laws.wars && !sim.laws.peace) declare(sim, old.id, nk, 'reconquest', 'rebellion');
}

// ------------------------------------------------------------------ capturing towns
export function capture(sim: Sim, c: number, k: number, how: string) {
  const city = sim.cities[c];
  const old = sim.kingdoms[city.kingdom];
  const nk = sim.kingdoms[k];
  if (city.kingdom === k) return;
  const U = sim.units;
  old.cities = old.cities.filter(x => x !== c);
  const wasCapital = city.capital;
  city.capital = false;
  city.kingdom = k; nk.cities.push(c);
  city.conquered = sim.tick; city.loyalty = 25; city.walls = city.walls; city.siege = 0;
  for (const u of city.members) { if (U.army[u] >= 0) leaveArmy(sim, u); if (U.job[u] === Job.Soldier) civ.setJob(sim, u, Job.None); if (U.flags[u] & UF.Ruler && wasCapital) { /* the old ruler is now a captive */ } }
  for (const b of city.buildings) sim.buildings[b].era = Math.max(sim.buildings[b].era, 0);
  sim.world.markAll();
  const e = sim.log('capture', `${nk.name} ${how === 'ceded' ? 'was given' : 'captured'} ${city.name} from ${old.name}.`, city.x, city.y, { c, k, k2: old.id, imp: wasCapital ? 2 : 1 });
  city.history.push(e.id);
  if (wasCapital) {
    old.stability -= 25;
    // the old ruler is put to the sword
    const r = U.idx(old.ruler);
    if (r >= 0 && U.city[r] === c && sim.rng.chance(0.6)) sim.kill(r, 'executed by the conquerors');
    realm.moveCapital(sim, old.id);
  }
  if (!old.cities.length) realm.fall(sim, old.id, `conquered by ${nk.name}`);
}

/** the town is burned instead of taken (orcs and undead love this) */
function raze(sim: Sim, c: number, k: number) {
  const city = sim.cities[c];
  sim.log('raze', `${sim.kingdoms[k].name} burned ${city.name} to the ground!`, city.x, city.y, { c, k, imp: 2 });
  const w = sim.world;
  for (const b of city.buildings) { const bd = sim.buildings[b]; const i = bd.y * w.w + bd.x; w.fire[i] = 200; w.markDirty(i); }
  civ.destroyCity(sim, c, 'razed');
}

// ------------------------------------------------------------------ armies
function nearestCityOf(sim: Sim, k: { cities: number[] }, from: City | undefined): number {
  if (!from) return k.cities[0] ?? -1;
  let best = -1, bd = 1e12;
  for (const c of k.cities) {
    const o = sim.cities[c];
    if (!o.alive) continue;
    const d = (o.x - from.x) ** 2 + (o.y - from.y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function enemiesOf(sim: Sim, k: number): number[] {
  const out: number[] = [];
  for (const wid of sim.kingdoms[k].wars) {
    const w = sim.wars[wid];
    if (!w.active) continue;
    const side = w.attackers.includes(k) ? w.defenders : w.attackers;
    for (const e of side) if (sim.kingdoms[e].alive && !out.includes(e)) out.push(e);
  }
  return out;
}

function warBetween(sim: Sim, a: number, b: number): War | null {
  for (const wid of sim.kingdoms[a].wars) {
    const w = sim.wars[wid];
    if (w.active && ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)))) return w;
  }
  return null;
}

function raiseArmy(sim: Sim, c: number, targetCity: number, wid: number) {
  const city = sim.cities[c], U = sim.units;
  const members: number[] = [];
  const keep = Math.max(1, Math.floor(city.soldiers * 0.25));   // a garrison stays home
  let kept = 0;
  for (const u of city.members) {
    if (U.job[u] !== Job.Soldier || U.army[u] >= 0 || !U.alive[u]) continue;
    if (kept < keep) { kept++; continue; }
    members.push(u);
  }
  // conscription: farmers too
  if (sim.kingdoms[city.kingdom].laws.has('conscription')) for (const u of city.members) if (members.length < 30 && U.job[u] === Job.Farmer && sim.rng.chance(0.25) && U.sex[u] === 0) { civ.setJob(sim, u, Job.Soldier); members.push(u); }
  if (members.length < 4) return -1;
  const id = sim.armies.length;
  const t = sim.cities[targetCity];
  const naval = sim.world.region[sim.world.tileAt(city.x, city.y)] !== sim.world.region[sim.world.tileAt(t.x, t.y)] && !SPECIES[city.species].fly;
  if (naval && city.port < 0) return -1;
  const a: Army = { id, kingdom: city.kingdom, war: wid, general: -1, members, target: targetCity, x: city.x + 1, y: city.y + 1, state: 'gather', path: null, pathPos: 0, born: sim.tick, strength: 0, tx: t.x + 1, ty: t.y + 1, stuck: 0, naval };
  sim.armies.push(a);
  let best = -1, bs = -1;
  for (const [i, u] of members.entries()) { U.army[u] = id; U.slot[u] = (U.slot[u] & 128) | (i & 127); U.state[u] = St.Idle; const s = U.level[u] * 10 + U.kills[u] + (U.flags[u] & UF.Hero ? 100 : 0); if (s > bs) { bs = s; best = u; } }
  a.general = best;
  const gch = people.makeNotable(sim, best, 'General');
  a.strength = members.length;
  // rally outside the town, toward the enemy
  const dx = t.x - city.x, dy = t.y - city.y, d = hyp(dx, dy) || 1;
  a.x = city.x + 1 + dx / d * Math.min(8, city.radius); a.y = city.y + 1 + dy / d * Math.min(8, city.radius);
  // the rally point must be dry land the soldiers can reach
  const w = sim.world, home = w.region[w.tileAt(city.x + 1, city.y + 2)];
  for (let k = 0; k < 12; k++) {
    const t = w.tileAt(a.x, a.y);
    if (w.walkable(t) && !w.isWater(t) && w.region[t] === home) break;
    a.x += (city.x + 1 - a.x) * 0.3; a.y += (city.y + 1 - a.y) * 0.3;
  }
  if (members.length >= 12) sim.log('army', `General ${gch.name} leads ${members.length} soldiers of ${city.name} against ${t.name}.`, a.x, a.y, { k: city.kingdom, c: targetCity, w: wid, imp: 0 });
  return id;
}

export function leaveArmy(sim: Sim, u: number) {
  const U = sim.units;
  const a = sim.armies[U.army[u]];
  U.army[u] = -1;
  U.flags[u] &= ~UF.OnBoat;
  if (!a) return;
  const i = a.members.indexOf(u);
  if (i >= 0) a.members.splice(i, 1);
  if (a.general === u) a.general = a.members[0] ?? -1;
}

/** formation: rows across the direction of march */
function slotPos(sim: Sim, a: Army, u: number): [number, number] {
  const U = sim.units;
  const i = U.slot[u] & 127;
  const n = a.members.length;
  const width = Math.max(3, Math.ceil(Math.sqrt(n) * 1.4));
  const row = Math.floor(i / width), col = i % width - (width - 1) / 2;
  const dx = a.tx - a.x, dy = a.ty - a.y, d = hyp(dx, dy) || 1;
  const fx = dx / d, fy = dy / d;      // forward
  const px = -fy, py = fx;              // right
  const ranged = U.slot[u] & 128 ? 1.2 : 0;  // archers walk behind
  return [a.x + px * col * 0.85 - fx * (row * 0.9 + ranged), a.y + py * col * 0.85 - fy * (row * 0.9 + ranged)];
}

/** one tick for a soldier in an army */
export function soldierStep(sim: Sim, u: number) {
  const U = sim.units;
  const a = sim.armies[U.army[u]];
  if (!a || a.state === 'disband') { leaveArmy(sim, u); return; }
  if (U.state[u] === St.Fight) {
    if (!fightStep(sim, u)) { U.state[u] = St.March; }
    return;
  }
  // look for enemies (more often in battle)
  if ((sim.tick + u) % (a.state === 'siege' || a.state === 'battle' ? 3 : 8) === 0 && !(U.flags[u] & UF.OnBoat)) {
    const e = nearestEnemy(sim, u, a.state === 'march' ? 5 : 8);
    if (e >= 0) { engage(sim, u, e); if (a.state === 'march') a.state = 'battle'; return; }
  }
  const city = sim.cities[a.target];
  if (a.state === 'siege' && city) {
    // attack buildings: walls first if they are in the way
    if ((sim.tick + u) % 12 === 0) siegeHit(sim, u, a, city);
    if (U.task[u] >= 0) return;
    const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, 3);
    const r = goTo(sim, u, U.x[u] + (tx - U.x[u]) * 0.3, U.y[u] + (ty - U.y[u]) * 0.3, 0.5);
    if (r < 0) U.task[u] = -2;
    return;
  }
  // naval: board at the docks, sail, land
  if (a.naval && (a.state === 'march' || a.state === 'home')) { navalStep(sim, u, a); return; }
  const [sx, sy] = u === a.general ? [a.tx, a.ty] : slotPos(sim, a, u);
  const r = goTo(sim, u, sx, sy, u === a.general ? 1 : 0.5);
  if (r < 0 && u === a.general) a.stuck++;
  U.state[u] = St.March;
}

function navalStep(sim: Sim, u: number, a: Army) {
  const U = sim.units, w = sim.world;
  const home = sim.cities[sim.units.city[u]];
  const tgt = sim.cities[a.target];
  if (!(U.flags[u] & UF.OnBoat)) {
    // walk to the dock and board
    const port = home && home.port >= 0 ? sim.buildings[home.port] : null;
    const onLand = w.region[w.tileAt(U.x[u], U.y[u])];
    const tgtRegion = a.state === 'home' && home ? w.region[w.tileAt(home.x, home.y)] : tgt ? w.region[w.tileAt(tgt.x, tgt.y)] : 0;
    if (onLand === tgtRegion) { // already across: march normally
      const [sx, sy] = slotPos(sim, a, u); goTo(sim, u, a.state === 'home' && home ? home.x + 1 : sx, a.state === 'home' && home ? home.y + 1 : sy, 0.6); return;
    }
    if (!port || !port.alive) { leaveArmy(sim, u); return; }
    const r = goTo(sim, u, port.x + port.w / 2, port.y + port.h / 2, 1.6);
    if (r === 1 || r < 0) {
      // step into the water next to the dock
      const sea = adjacentWater(sim, port.x, port.y, port.w, port.h);
      if (sea >= 0) { U.flags[u] |= UF.OnBoat; U.x[u] = sea % w.w + 0.5; U.y[u] = ((sea / w.w) | 0) + 0.5; U.dest[u] = -1; U.path[u] = null; }
    }
    return;
  }
  // sailing: head for the water next to the target's coast
  const goalCity = a.state === 'home' ? home : tgt;
  if (!goalCity) { U.flags[u] &= ~UF.OnBoat; return; }
  let land = U.task[u];
  if (land < 0 || !w.isWater(land)) { land = coastNear(sim, goalCity.x + 1, goalCity.y + 1, 18); U.task[u] = land; }
  if (land < 0) { leaveArmy(sim, u); return; }
  const r = goTo(sim, u, land % w.w + 0.5, ((land / w.w) | 0) + 0.5, 0.7);
  if (r === 1 || r < 0) {
    // land on the shore
    const lx = land % w.w, ly = (land / w.w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = lx + [1, -1, 0, 0, 1, 1, -1, -1][d], ny = ly + [0, 0, 1, -1, 1, -1, 1, -1][d];
      if (w.inb(nx, ny) && w.walkable(ny * w.w + nx) && !w.isWater(ny * w.w + nx)) { U.flags[u] &= ~UF.OnBoat; U.x[u] = nx + 0.5; U.y[u] = ny + 0.5; U.task[u] = -1; U.dest[u] = -1; U.path[u] = null; return; }
    }
    U.task[u] = -1;
  }
}

function adjacentWater(sim: Sim, x: number, y: number, bw: number, bh: number): number {
  const w = sim.world;
  for (let dy = -1; dy <= bh; dy++) for (let dx = -1; dx <= bw; dx++) {
    const nx = x + dx, ny = y + dy;
    if (w.inb(nx, ny) && w.isWater(ny * w.w + nx)) return ny * w.w + nx;
  }
  return -1;
}

function coastNear(sim: Sim, x: number, y: number, r: number): number {
  const w = sim.world;
  let best = -1, bd = 1e9;
  for (let k = 0; k < 120; k++) {
    const nx = Math.floor(x + sim.rng.range(-r, r)), ny = Math.floor(y + sim.rng.range(-r, r));
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (!w.isWater(i)) continue;
    let coast = false;
    for (let d = 0; d < 4 && !coast; d++) { const ax = nx + [1, -1, 0, 0][d], ay = ny + [0, 0, 1, -1][d]; if (w.inb(ax, ay) && !w.isWater(ay * w.w + ax) && w.walkable(ay * w.w + ax)) coast = true; }
    if (!coast) continue;
    const d = (nx - x) ** 2 + (ny - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** hit the nearest enemy building: siege engines and cannons hit walls much harder */
function siegeHit(sim: Sim, u: number, a: Army, city: City) {
  const U = sim.units, w = sim.world;
  const k = sim.kingdoms[a.kingdom];
  let best = -1, bd = 1e9;
  const x = U.x[u], y = U.y[u];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = Math.floor(x) + dx, ny = Math.floor(y) + dy;
    if (!w.inb(nx, ny)) continue;
    const bi = w.bld[ny * w.w + nx] - 1;
    if (bi < 0) continue;
    const b = sim.buildings[bi];
    if (!b.alive || sim.cityKingdom(b.city) === a.kingdom || !sim.atWar(a.kingdom, sim.cityKingdom(b.city))) continue;
    const d = dx * dx + dy * dy - (b.type === BT.Gate ? 3 : 0);
    if (d < bd) { bd = d; best = bi; }
  }
  if (best < 0) { U.task[u] = -1; return; }
  U.task[u] = best;
  const b = sim.buildings[best];
  let dmg = U.atk[u] * 1.2;
  const wall = b.type === BT.Wall || b.type === BT.Gate || b.type === BT.Tower || b.type === BT.Castle;
  if (wall) dmg *= k.techs.has('gunpowder') ? 6 : k.techs.has('engineering') ? 4 : 0.6;
  b.hp -= dmg;
  sim.fx.push({ kind: k.techs.has('gunpowder') ? 'boom' : wall && k.techs.has('engineering') ? 'boulder' : 'hit', x: b.x + b.w / 2, y: b.y + b.h / 2, x2: x, y2: y, t: 0, life: 10 });
  if (b.hp <= 0) civ.destroyBuilding(sim, best, 'destroyed in a siege');
  city.lastAttacked = sim.tick; city.siege = 30;
}

/** towers and castles shoot at enemies near the walls */
function towersShoot(sim: Sim) {
  const U = sim.units;
  for (const b of sim.buildings) {
    if (!b.alive || b.built < 1 || (b.type !== BT.Tower && b.type !== BT.Castle)) continue;
    const city = sim.cities[b.city];
    if (!city || !city.alive || !sim.kingdoms[city.kingdom].wars.length) continue;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let target = -1;
    U.near(cx, cy, 6, (j) => { const kj = sim.unitKingdom(j); if (kj >= 0 && sim.atWar(kj, city.kingdom)) { target = j; return true; } });
    if (target < 0) continue;
    const k = sim.kingdoms[city.kingdom];
    sim.fx.push({ kind: k.techs.has('gunpowder') ? 'bullet' : 'arrow', x: cx, y: cy - 1, x2: U.x[target], y2: U.y[target], t: 0, life: 8 });
    sim.damage(target, 6 + k.era * 3, -1, 'shot from the walls');
  }
}

function armyCenter(sim: Sim, a: Army) {
  const U = sim.units;
  let sx = 0, sy = 0, n = 0;
  for (const u of a.members) if (U.alive[u] && !(U.flags[u] & UF.OnBoat)) { sx += U.x[u]; sy += U.y[u]; n++; }
  return n ? [sx / n, sy / n, n] : [a.x, a.y, 0];
}

/** every 5 ticks */
export function stepArmies(sim: Sim) {
  const U = sim.units;
  // raise new armies for wars (each kingdom thinks every 40 ticks)
  for (const k of sim.kingdoms) {
    if (!k.alive || !k.wars.length || (k.id + sim.tick / 5) % 8 !== 0) continue;
    const enemies = enemiesOf(sim, k.id);
    if (!enemies.length) continue;
    const mine = sim.armies.filter(a => a.kingdom === k.id && a.state !== 'disband' && a.state !== 'home').length;
    if (mine >= Math.max(1, Math.ceil(k.cities.length / 3))) continue;
    // best target: a near enemy town, weaker ones preferred
    let best = -1, bestCity = -1, bs = -1e9;
    for (const c of k.cities) {
      const from = sim.cities[c];
      if (from.soldiers < 5) continue;
      for (const e of enemies) {
        const t = nearestCityOf(sim, sim.kingdoms[e], from);
        if (t < 0) continue;
        const tc = sim.cities[t];
        const d = hyp(tc.x - from.x, tc.y - from.y);
        const s = from.soldiers * 2 - tc.soldiers * 1.5 - d * 0.3 - (tc.walls ? 10 : 0) + (tc.capital ? 5 : 0);
        if (s > bs) { bs = s; best = c; bestCity = t; }
      }
    }
    if (best >= 0 && bs > -30) {
      const w = warBetween(sim, k.id, sim.cities[bestCity].kingdom);
      if (w) raiseArmy(sim, best, bestCity, w.id);
    }
  }
  // move armies
  for (const a of sim.armies) {
    if (a.state === 'disband') continue;
    a.members = a.members.filter(u => U.alive[u] && U.army[u] === a.id);
    if (!a.members.length) { a.state = 'disband'; continue; }
    if (!U.alive[a.general] || U.army[a.general] !== a.id) a.general = a.members[0];
    const [cx, cy, n] = armyCenter(sim, a);
    const tgt = sim.cities[a.target];
    const k = sim.kingdoms[a.kingdom];
    if (!k.alive) { disband(sim, a); continue; }
    // the war is over or the target changed hands
    const stillEnemy = tgt && tgt.alive && sim.atWar(a.kingdom, tgt.kingdom);
    if (a.state !== 'home' && !stillEnemy) {
      // find another target in the same war
      const enemies = enemiesOf(sim, a.kingdom);
      let nt = -1, nd = 1e12;
      for (const e of enemies) for (const c of sim.kingdoms[e].cities) { const o = sim.cities[c]; const d = (o.x - cx) ** 2 + (o.y - cy) ** 2; if (d < nd && Math.sqrt(d) < 60) { nd = d; nt = c; } }
      if (nt >= 0 && !a.naval) { a.target = nt; a.tx = sim.cities[nt].x + 1; a.ty = sim.cities[nt].y + 1; a.state = 'march'; }
      else a.state = 'home';
    }
    switch (a.state) {
      case 'gather': {
        // wait until most have arrived at the rally point
        let near = 0;
        for (const u of a.members) if (hyp(U.x[u] - a.x, U.y[u] - a.y) < 5) near++;
        if (near >= a.members.length * 0.7 || sim.tick - a.born > 200) { a.state = 'march'; a.strength = a.members.length; }
        // during gather the formation centre is the rally point
        a.tx = tgt ? tgt.x + 1 : a.x; a.ty = tgt ? tgt.y + 1 : a.y;
        break;
      }
      case 'march': case 'battle': {
        if (n > 0) { a.x = a.x * 0.6 + (U.x[a.general] ?? cx) * 0.4; a.y = a.y * 0.6 + (U.y[a.general] ?? cy) * 0.4; }
        if (tgt && hyp(tgt.x + 1 - a.x, tgt.y + 1 - a.y) < Math.max(5, tgt.radius * 0.6)) { a.state = 'siege'; for (const u of a.members) U.task[u] = -1; }
        if (a.state === 'battle') {
          let fighting = 0;
          for (const u of a.members) if (U.state[u] === St.Fight) fighting++;
          if (fighting === 0) a.state = 'march';
        }
        if (a.stuck > 40) { a.state = 'home'; a.stuck = 0; }
        break;
      }
      case 'siege': {
        if (!tgt) { a.state = 'home'; break; }
        // defenders left?
        let defenders = 0;
        U.near(tgt.x + 1, tgt.y + 1, Math.max(6, tgt.radius), (j) => { const kj = sim.unitKingdom(j); if (kj === tgt.kingdom && (U.job[j] === Job.Soldier || U.job[j] === Job.Guard) && sim.ageYears(j) >= SPECIES[U.spec[j]].adult) defenders++; });
        let inside = 0;
        for (const u of a.members) if (hyp(U.x[u] - tgt.x - 1, U.y[u] - tgt.y - 1) < 4.5) inside++;
        if (defenders === 0 && inside >= Math.min(3, a.members.length)) {
          const w = sim.wars[a.war];
          if (w) { const att = w.attackers.includes(a.kingdom); w.score += (att ? 1 : -1) * (tgt.capital ? 35 : 20); }
          const kd = SPECIES[k.species].key;
          if ((kd === 'undead' || (kd === 'orc' && sim.rng.chance(0.4)) || (w && w.goal === 'extermination')) && tgt.kingdom !== a.kingdom) raze(sim, tgt.id, a.kingdom);
          else capture(sim, tgt.id, a.kingdom, 'captured');
          a.state = 'home';
        }
        break;
      }
      case 'home': {
        const home = sim.cities[sim.units.city[a.general]];
        if (!home || !home.alive) { disband(sim, a); break; }
        a.tx = home.x + 1; a.ty = home.y + 1;
        a.x = a.x * 0.6 + (U.x[a.general] ?? cx) * 0.4; a.y = a.y * 0.6 + (U.y[a.general] ?? cy) * 0.4;
        if (hyp(a.x - a.tx, a.y - a.ty) < 6 || sim.tick - a.born > TICKS_PER_YEAR * 6) disband(sim, a);
        break;
      }
    }
    // a beaten army retreats
    if ((a.state === 'march' || a.state === 'siege' || a.state === 'battle') && a.members.length < a.strength * 0.3) {
      a.state = 'home';
      const w = sim.wars[a.war];
      if (w) { const att = w.attackers.includes(a.kingdom); w.score += att ? -8 : 8; w.battles++; }
    }
  }
  if (sim.tick % 10 === 0) towersShoot(sim);
  // drop old disbanded armies from the list now and then
  if (sim.armies.length > 400 && sim.tick % 500 === 0) {
    const live = sim.armies.filter(a => a.state !== 'disband');
    if (live.length < 200) { /* keep ids stable: soldiers refer to them */ }
  }
}

function disband(sim: Sim, a: Army) {
  const U = sim.units;
  for (const u of [...a.members]) { U.army[u] = -1; U.flags[u] &= ~UF.OnBoat; U.state[u] = St.Idle; }
  a.members = [];
  a.state = 'disband';
}

/** count battle deaths for the war score */
export function battleDeath(sim: Sim, victimKingdom: number, killerKingdom: number) {
  if (victimKingdom < 0 || killerKingdom < 0) return;
  const w = warBetween(sim, victimKingdom, killerKingdom);
  if (!w) return;
  const victimAtt = w.attackers.includes(victimKingdom);
  w.deaths[victimAtt ? 0 : 1]++;
  w.score += victimAtt ? -0.6 : 0.6;
  sim.kingdoms[victimKingdom].weariness += 0.3;
}

export function yearly(sim: Sim) {
  for (const w of sim.wars) {
    if (!w.active) continue;
    const a = sim.kingdoms[w.attacker], d = sim.kingdoms[w.defender];
    if (!a.alive || !d.alive) { endWar(sim, w.id, a.alive ? a.id : d.alive ? d.id : -1, a.alive ? `${d.name} is no more` : `${a.name} is no more`); continue; }
    a.weariness += 2; d.weariness += 2;
    peaceTalks(sim, w);
  }
  // bandits and pirates appear in unhappy lands
  if (sim.laws.crime) for (const c of sim.cities) {
    if (!c.alive || c.happy > 30 || c.pop < 25 || !sim.rng.chance(0.15)) continue;
    const U = sim.units;
    const outlaws = c.members.filter(u => U.job[u] === Job.Thief || (U.traits[u] & (1 << T.Cruel) && sim.rng.chance(0.3))).slice(0, 8);
    if (outlaws.length < 3) continue;
    for (const u of outlaws) { U.flags[u] |= UF.Bandit; U.city[u] = -1; U.job[u] = Job.None; }
    people.formBand(sim, outlaws, -1);
    sim.log('bandits', `Outlaws fled ${c.name} and took to the wilds as bandits.`, c.x, c.y, { c: c.id, imp: 0 });
  }
}

export { R, BUILDINGS, passable, Mode };
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
