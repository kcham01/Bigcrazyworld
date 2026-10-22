// People: citizens with jobs, homes, families and needs; wandering tribes looking for a home;
// notable characters (rulers, heroes, prophets) whose lives become history.
import type { Sim } from './sim';
import { St, UF, T, Job } from './units';
import { SPECIES } from './species';
import { G, Gene } from './genetics';
import { TICKS_PER_YEAR, TREES, ORE_RES, R, BIOMES, Tree } from './defs';
import { BT, BUILDINGS, type Character, type Band } from './entities';
import { goTo, wanderTarget, passable, Mode } from './move';
import { engage, fightStep, nearestEnemy } from './combat';
import * as civ from './city';
import * as war from './war';
import * as realm from './kingdom';
import * as faith from './culture';

const THINK = 10;

// ------------------------------------------------------------------ characters
const charIndex = new WeakMap<Sim, Map<number, Character>>();
function index(sim: Sim) { let m = charIndex.get(sim); if (!m) { m = new Map(); charIndex.set(sim, m); for (const c of sim.chars) if (c.died < 0) m.set(c.uid, c); } return m; }
export function charByUid(sim: Sim, uid: number): Character | null { return index(sim).get(uid) || null; }
export function resetCharIndex(sim: Sim) { charIndex.delete(sim); }

/** make a unit a named character whose life is recorded */
export function makeNotable(sim: Sim, u: number, title?: string): Character {
  const U = sim.units;
  const existing = charByUid(sim, U.uid[u]);
  if (existing) { if (title && !existing.titles.includes(title)) existing.titles.push(title); return existing; }
  const name = sim.unitName(u);
  const parts = name.split(' ');
  const ch: Character = {
    id: sim.chars.length, uid: U.uid[u], name: parts[0], family: parts.slice(1).join(' '), species: U.spec[u],
    culture: U.culture[u], religion: U.religion[u], female: U.sex[u] === 1, born: U.born[u], died: -1, death: '',
    kingdom: sim.unitKingdom(u), city: U.city[u], titles: title ? [title] : [], deeds: [],
    father: U.father[u], mother: U.mother[u], spouse: U.spouse[u], children: [], traits: U.traits[u], fame: 1, kills: U.kills[u], dynasty: -1,
  };
  sim.chars.push(ch);
  index(sim).set(ch.uid, ch);
  U.flags[u] |= UF.Notable;
  return ch;
}

export function characterDied(sim: Sim, u: number, cause: string, killer: number) {
  const U = sim.units;
  const ch = charByUid(sim, U.uid[u]);
  if (!ch) return;
  ch.died = sim.tick; ch.death = cause; ch.kills = U.kills[u]; ch.traits = U.traits[u];
  index(sim).delete(ch.uid);
  const age = Math.floor((sim.tick - ch.born) / TICKS_PER_YEAR);
  const by = killer >= 0 && U.alive[killer] ? ` by ${sim.unitName(killer)}` : '';
  const main = ch.titles[0] ? `${ch.titles[0]} ` : '';
  if (ch.titles.length || ch.fame > 3) {
    const e = sim.log('death', `${main}${ch.name}${ch.family ? ' ' + ch.family : ''} died at ${age} (${cause}${by}).`, U.x[u], U.y[u], { ch: ch.id, k: ch.kingdom, imp: U.flags[u] & UF.Ruler ? 2 : 1 });
    ch.deeds.push(e.id);
  }
  if (U.flags[u] & UF.Ruler) { const k = sim.unitKingdom(u); if (k >= 0) realm.rulerDied(sim, k, u, cause, killer); }
}

// ------------------------------------------------------------------ experience
export function gainXp(sim: Sim, u: number, amount: number) {
  const U = sim.units;
  if (!SPECIES[U.spec[u]].sapient && SPECIES[U.spec[u]].kind !== 'titan') return;
  U.xp[u] = Math.min(65000, U.xp[u] + amount);
  const need = Math.round(20 * Math.pow(U.level[u], 1.5));
  if (U.xp[u] >= need && U.level[u] < 12) {
    U.level[u]++; U.xp[u] -= need;
    sim.express(u);
    U.hp[u] = U.maxHp[u];
    sim.fx.push({ kind: 'level', x: U.x[u], y: U.y[u] - 0.8, t: 0, life: 30 });
    if (U.level[u] >= 4) U.setTrait(u, T.Veteran);
    // the best fighters become heroes
    if (U.level[u] >= 6 && U.kills[u] >= 8 && !(U.flags[u] & UF.Hero) && SPECIES[U.spec[u]].sapient) makeHero(sim, u);
  }
}

const HERO_TITLES = ['the Brave', 'the Bold', 'Dragonslayer', 'the Unbroken', 'Ironhand', 'the Lion', 'Giantbane', 'the Fearless', 'Stormblade', 'the Red', 'Shieldbreaker', 'the Wolf'];
export function makeHero(sim: Sim, u: number) {
  const U = sim.units;
  U.flags[u] |= UF.Hero;
  sim.express(u); U.hp[u] = U.maxHp[u];
  const ch = makeNotable(sim, u, 'Hero');
  const epithet = HERO_TITLES[sim.rng.int(HERO_TITLES.length)];
  ch.hero = { abilities: ['Cleave', 'Rally', 'Mighty blow'], level: U.level[u] };
  ch.fame += 10;
  const e = sim.log('hero', `${ch.name} ${epithet} of ${cityName(sim, U.city[u])} has become a hero after ${U.kills[u]} victories.`, U.x[u], U.y[u], { ch: ch.id, k: sim.unitKingdom(u), imp: 2 });
  ch.deeds.push(e.id);
  ch.name = ch.name + ' ' + epithet;
}

function cityName(sim: Sim, c: number) { return c >= 0 ? sim.cities[c].name : 'the wilds'; }

// ------------------------------------------------------------------ disease
export function diseaseTick(sim: Sim, u: number) {
  const U = sim.units;
  const dz = sim.diseases[U.disease[u] - 1];
  if (!dz) { U.disease[u] = 0; return; }
  if (U.dtimer[u] > 0) U.dtimer[u]--;
  if ((sim.tick + u) % 10 === 0) {
    sim.damage(u, U.maxHp[u] * dz.lethality * 0.04, -1, dz.name);
    if (!U.alive[u]) return;
    // spread to neighbours
    U.near(U.x[u], U.y[u], 1.6, (j) => {
      if (j === u || U.disease[j] || (U.immune[j] & (1 << (dz.id % 32)))) return;
      if (!dz.species.includes(U.spec[j])) return;
      if (sim.rng.chance(dz.spread)) { U.disease[j] = dz.id + 1; U.dtimer[j] = dz.duration; dz.cases++; }
    });
  }
  if (U.dtimer[u] === 0) { U.disease[u] = 0; U.immune[u] |= 1 << (dz.id % 32); }
}

// ------------------------------------------------------------------ the person
export function updatePerson(sim: Sim, u: number) {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if ((sim.tick + u) % 20 === 0) {
    needs(sim, u);
    if (!U.alive[u]) return;
  }
  if (U.disease[u]) { diseaseTick(sim, u); if (!U.alive[u]) return; }
  if (U.flags[u] & UF.Possessed) { possessedStep(sim, u); return; }
  if (U.army[u] >= 0) { war.soldierStep(sim, u); return; }
  U.flags[u] &= ~UF.Asleep;
  switch (U.state[u]) {
    case St.Fight:
      if (!fightStep(sim, u)) { U.state[u] = St.Idle; U.think[u] = 0; }
      return;
    case St.Flee: case St.Move: case St.Wander: case St.Migrate: case St.Patrol: case St.Celebrate: {
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.5);
      if (r !== 0 || --U.timer[u] <= 0) {
        if (U.state[u] === St.Migrate && r === 1) arriveMigrant(sim, u);
        U.state[u] = St.Idle; U.think[u] = sim.rng.int(THINK);
      } else if ((sim.tick + u) % 8 === 0 && U.state[u] !== St.Flee) danger(sim, u);
      return;
    }
    case St.Sleep:
      U.flags[u] |= UF.Asleep;
      if (!sim.isNight() || (sim.tick + u) % 40 === 0 && danger(sim, u)) { U.state[u] = St.Idle; U.flags[u] &= ~UF.Asleep; }
      return;
    case St.Eat: {
      const c = U.city[u];
      if (c < 0) { U.state[u] = St.Idle; return; }
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.9);
      if (r === 1) {
        const city = sim.cities[c];
        const eat = Math.min(Math.floor(city.stock[R.Food]), Math.ceil(U.hunger[u] / 50));
        if (eat > 0) { city.stock[R.Food] -= eat; U.hunger[u] = Math.max(0, U.hunger[u] - eat * 50); }
        U.state[u] = St.Idle; U.think[u] = 2;
      } else if (r < 0) { U.state[u] = St.Idle; }
      return;
    }
    case St.Gather: case St.Chop: case St.Mine: case St.Farm: case St.Fish: case St.Build: case St.Work: case St.Herd: case St.Steal: case St.Trade: case St.Guard:
      workStep(sim, u);
      return;
    case St.Hunt: {
      const t = U.targetU[u];
      if (t < 0 || !U.alive[t] || U.uid[t] !== U.targetUid[u]) {
        // the prey is gone. If we killed it, carry the meat home
        if (U.task[u] === 1) { U.carry[u] = R.Food + 1; U.carryAmt[u] = 6; U.task[u] = -1; startDeliver(sim, u); return; }
        U.state[u] = St.Idle; return;
      }
      U.task[u] = 1;
      if (!fightStep(sim, u)) { U.carry[u] = R.Food + 1; U.carryAmt[u] = Math.max(3, Math.round((SPECIES[U.spec[t]]?.meat ?? 10) / 4)); U.task[u] = -1; startDeliver(sim, u); }
      if (--U.timer[u] <= 0) { U.state[u] = St.Idle; U.task[u] = -1; }
      return;
    }
    case St.Deliver: {
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.9);
      if (r === 1) {
        const c = U.city[u];
        if (c >= 0 && U.carry[u]) civ.addStock(sim, c, U.carry[u] - 1, U.carryAmt[u]);
        U.carry[u] = 0; U.carryAmt[u] = 0;
        U.state[u] = St.Idle; U.think[u] = 0;
      } else if (r < 0) { U.carry[u] = 0; U.state[u] = St.Idle; }
      return;
    }
    default:
      if (U.think[u] > 0) { U.think[u]--; return; }
      U.think[u] = THINK + sim.rng.int(4);
      decide(sim, u);
  }
}

/** hunger, age, healing, cold */
function needs(sim: Sim, u: number) {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if (!(U.flags[u] & UF.Undead) && sim.laws.hunger && d.diet !== 'none') {
    U.hunger[u] += 20 * 100 / (TICKS_PER_YEAR * 1.5);
    if (U.hunger[u] >= 100) {
      U.hunger[u] = 100;
      sim.damage(u, U.maxHp[u] * 0.06, -1, 'starvation');
      if (!U.alive[u]) return;
    }
    // drop what you're doing and eat
    const s = U.state[u];
    if (U.hunger[u] > 65 && s !== St.Eat && s !== St.Fight && s !== St.Flee && s !== St.Gather && s !== St.Hunt && U.army[u] < 0) {
      if (s === St.Deliver && U.carry[u] === R.Food + 1) { /* bringing food home anyway */ }
      else { U.state[u] = St.Idle; U.think[u] = 0; }
    }
  }
  if (sim.laws.oldAge && !(U.flags[u] & UF.Undead) && !(U.flags[u] & UF.Immortal)) {
    let life = d.life * (0.7 + 0.6 * U.genome[u * G + Gene.Lifespan] / 255);
    if (U.traits[u] & (1 << T.Longlived)) life *= 1.3;
    const k = U.city[u] >= 0 ? sim.kingdoms[sim.cities[U.city[u]].kingdom] : null;
    if (k && k.techs.has('medicine')) life *= 1.1;
    if (k && k.techs.has('antibiotics')) life *= 1.15;
    if (sim.ageYears(u) > life && sim.rng.chance(0.12)) { sim.kill(u, 'old age'); return; }
  }
  if (U.hp[u] < U.maxHp[u] && U.state[u] !== St.Fight && sim.tick - U.lastHit[u] > 60) U.hp[u] = Math.min(U.maxHp[u], U.hp[u] + U.maxHp[u] * (U.house[u] >= 0 ? 0.04 : 0.02));
  if (U.morale[u] < 100) U.morale[u] = Math.min(100, U.morale[u] + 4);
}

/** is there danger close by? fight or flee. Returns true if it reacted. */
function danger(sim: Sim, u: number): boolean {
  const U = sim.units;
  const e = nearestEnemy(sim, u, 6);
  if (e < 0) return false;
  const job = U.job[u];
  const brave = (U.traits[u] & (1 << T.Brave)) !== 0;
  const adult = sim.ageYears(u) >= SPECIES[U.spec[u]].adult;
  const fighter = job === Job.Soldier || job === Job.Guard || job === Job.Hunter || (U.flags[u] & UF.Hero) || (U.flags[u] & UF.Undead) || (U.flags[u] & UF.Bandit);
  const enemyStrength = U.atk[e] * U.hp[e], mine = U.atk[u] * U.hp[u];
  if (adult && (fighter || (brave && mine > enemyStrength * 0.6) || mine > enemyStrength * 2.5)) { engage(sim, u, e); return true; }
  // run toward home if it is away from the danger, else just away
  const c = U.city[u];
  let tx = U.x[u] + (U.x[u] - U.x[e]) * 2, ty = U.y[u] + (U.y[u] - U.y[e]) * 2;
  if (c >= 0) {
    const city = sim.cities[c];
    const dHome = hyp(city.x - U.x[e], city.y - U.y[e]);
    if (dHome > 5) { tx = city.x + 0.5; ty = city.y + 0.5; }
  }
  const [fx, fy] = wanderTarget(sim, u, tx, ty, 1.5);
  U.tx[u] = fx; U.ty[u] = fy; U.state[u] = St.Flee; U.timer[u] = 80;
  return true;
}

function decide(sim: Sim, u: number) {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if (danger(sim, u)) return;
  const c = U.city[u];
  if (c < 0 || !sim.cities[c]?.alive) {
    U.city[u] = -1; U.house[u] = -1;
    if (U.band[u] >= 0) { bandMemberDecide(sim, u); return; }
    homeless(sim, u);
    return;
  }
  const city = sim.cities[c];
  const age = sim.ageYears(u);
  // undead do not eat or sleep; bandits live rough
  const undead = (U.flags[u] & UF.Undead) !== 0;
  if (!undead && U.hunger[u] > 55) {
    if (city.stock[R.Food] >= 1) {
      const [sx, sy] = civ.storageOf(sim, c, U.x[u], U.y[u]);
      U.tx[u] = sx; U.ty[u] = sy; U.state[u] = St.Eat; return;
    }
    // famine: go find something to eat
    if (startForage(sim, u)) return;
  }
  if (!undead && sim.isNight() && U.job[u] !== Job.Guard && !(U.job[u] === Job.Soldier && sim.rng.chance(0.3))) {
    if (U.house[u] < 0 || !sim.buildings[U.house[u]]?.alive) U.house[u] = civ.findHome(sim, c);
    if (U.house[u] >= 0) {
      const b = sim.buildings[U.house[u]];
      const r = goTo(sim, u, b.x + b.w / 2, b.y + b.h - 0.3, 0.8);
      if (r === 1) { U.state[u] = St.Sleep; return; }
      if (r === 0) { U.state[u] = St.Move; U.tx[u] = b.x + b.w / 2; U.ty[u] = b.y + b.h - 0.3; U.timer[u] = 200; return; }
    }
  }
  if (city.festival > 0 && sim.rng.chance(0.5)) {
    const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, 3);
    U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Celebrate; U.timer[u] = 60;
    if (sim.rng.chance(0.2)) sim.fx.push({ kind: 'confetti', x: U.x[u], y: U.y[u] - 0.5, t: 0, life: 20 });
    return;
  }
  if (age < d.adult) { // children play near home
    const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, 6);
    U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Wander; U.timer[u] = 100; return;
  }
  if (!startJob(sim, u)) {
    const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, 7);
    U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Wander; U.timer[u] = 100;
  }
}

/** pick up work for the unit's job. Returns false if there is nothing to do. */
function startJob(sim: Sim, u: number): boolean {
  const U = sim.units, c = U.city[u], city = sim.cities[c], w = sim.world;
  const job = U.job[u];
  const set = (st: St, tx: number, ty: number, task: number, timer = 400) => { U.state[u] = st; U.tx[u] = tx; U.ty[u] = ty; U.task[u] = task; U.timer[u] = timer; return true; };
  switch (job) {
    case Job.Builder: {
      const b = civ.siteToBuild(sim, c, U.x[u], U.y[u]);
      if (b >= 0) { const bd = sim.buildings[b]; return set(St.Build, bd.x + bd.w / 2, bd.y + bd.h + 0.2, b); }
      return startGatherWood(sim, u);
    }
    case Job.Farmer: {
      const f = civ.fieldToWork(sim, c, U.x[u], U.y[u]);
      if (f >= 0) return set(St.Farm, f % w.w + 0.5, ((f / w.w) | 0) + 0.5, f);
      return startForage(sim, u);
    }
    case Job.Woodcutter: return startGatherWood(sim, u);
    case Job.Miner: {
      const t = civ.findOre(sim, c, U.x[u], U.y[u]);
      if (t >= 0) return set(St.Mine, t % w.w + 0.5, ((t / w.w) | 0) + 0.5, t);
      return startGatherWood(sim, u);
    }
    case Job.Hunter: case Job.Gatherer: case Job.None: {
      if (job === Job.Hunter || sim.rng.chance(0.3)) {
        const prey = civ.findGame(sim, u, 14);
        if (prey >= 0) { engage(sim, u, prey); U.state[u] = St.Hunt; U.timer[u] = 300; U.task[u] = -1; return true; }
      }
      return startForage(sim, u);
    }
    case Job.Fisher: {
      const t = civ.findShore(sim, c, U.x[u], U.y[u]);
      if (t >= 0) return set(St.Fish, t % w.w + 0.5, ((t / w.w) | 0) + 0.5, t);
      return startForage(sim, u);
    }
    case Job.Herder: {
      const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, 8);
      return set(St.Herd, tx, ty, -1, 200);
    }
    case Job.Soldier: case Job.Guard: {
      const ruler = civ.rulerUnit(sim, city.kingdom);
      if (job === Job.Guard && ruler >= 0 && U.city[ruler] === c && sim.rng.chance(0.6)) {
        const [tx, ty] = wanderTarget(sim, u, U.x[ruler], U.y[ruler], 2);       // bodyguard
        return set(St.Guard, tx, ty, -1, 120);
      }
      const r = 4 + Math.sqrt(city.tiles) * 0.6;
      const [tx, ty] = wanderTarget(sim, u, city.x + 1, city.y + 1, r);
      return set(St.Patrol, tx, ty, -1, 200);
    }
    case Job.Scholar: case Job.Priest: case Job.Smith: case Job.Mage: case Job.Healer: case Job.Merchant: case Job.Noble: case Job.Sailor: {
      const b = civ.workplace(sim, c, job);
      if (b >= 0) {
        const bd = sim.buildings[b];
        // merchants sometimes travel with a caravan to a trading partner
        if (job === Job.Merchant && sim.rng.chance(0.35)) {
          const p = civ.tradePartner(sim, c);
          if (p >= 0) { const pc = sim.cities[p]; return set(St.Trade, pc.x + 1, pc.y + 1, p, 1500); }
        }
        return set(St.Work, bd.x + bd.w / 2, bd.y + bd.h - 0.2, b, 600);
      }
      return startGatherWood(sim, u);
    }
    case Job.Thief: {
      const target = civ.thiefTarget(sim, c);
      if (target >= 0) { const tc = sim.cities[target]; return set(St.Steal, tc.x + 1, tc.y + 1, target, 900); }
      return false;
    }
    default:
      return false;
  }
}

function startGatherWood(sim: Sim, u: number): boolean {
  const U = sim.units, w = sim.world;
  const t = civ.findTree(sim, U.city[u], U.x[u], U.y[u]);
  if (t < 0) return false;
  U.state[u] = St.Chop; U.tx[u] = t % w.w + 0.5; U.ty[u] = ((t / w.w) | 0) + 0.5; U.task[u] = t; U.timer[u] = 400;
  return true;
}

function startForage(sim: Sim, u: number): boolean {
  const U = sim.units, w = sim.world;
  const x = U.x[u] | 0, y = U.y[u] | 0;
  let best = -1, bv = 60;
  for (let k = 0; k < 14; k++) {
    const nx = x + sim.rng.irange(-8, 8), ny = y + sim.rng.irange(-8, 8);
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (w.isWater(i) || w.bld[i]) continue;
    const v = w.veg[i] + (w.tree[i] ? TREES[w.tree[i]].fruit * 30 : 0);
    if (v > bv) { bv = v; best = i; }
  }
  if (best < 0) return false;
  U.state[u] = St.Gather; U.tx[u] = best % w.w + 0.5; U.ty[u] = ((best / w.w) | 0) + 0.5; U.task[u] = best; U.timer[u] = 300;
  return true;
}

function startDeliver(sim: Sim, u: number) {
  const U = sim.units, c = U.city[u];
  // the hungry eat some of what they found first
  if (U.carry[u] === R.Food + 1 && U.hunger[u] > 60 && !(U.flags[u] & UF.Undead)) {
    const eat = Math.min(U.carryAmt[u], Math.ceil((U.hunger[u] - 20) / 25));
    U.carryAmt[u] -= eat; U.hunger[u] = Math.max(0, U.hunger[u] - eat * 25);
    if (U.carryAmt[u] <= 0) { U.carry[u] = 0; U.state[u] = St.Idle; return; }
  }
  if (c < 0) { // tribes eat what they gather
    if (U.carry[u] === R.Food + 1) U.hunger[u] = Math.max(0, U.hunger[u] - U.carryAmt[u] * 25);
    U.carry[u] = 0; U.carryAmt[u] = 0; U.state[u] = St.Idle; return;
  }
  const [sx, sy] = civ.storageOf(sim, c, U.x[u], U.y[u]);
  U.tx[u] = sx; U.ty[u] = sy; U.state[u] = St.Deliver; U.timer[u] = 600;
}

/** walk to the job and do it */
function workStep(sim: Sim, u: number) {
  const U = sim.units, w = sim.world, st = U.state[u];
  if (U.timer[u] > 0) U.timer[u]--; else { U.state[u] = St.Idle; return; }
  const reach = st === St.Build ? 1.6 : st === St.Fish ? 0.6 : st === St.Work || st === St.Trade || st === St.Steal ? 1.2 : 0.6;
  const r = goTo(sim, u, U.tx[u], U.ty[u], reach);
  if (r < 0) { U.state[u] = St.Idle; U.think[u] = 0; if (st === St.Farm || st === St.Chop || st === St.Mine) civ.badTarget(sim, U.city[u], U.task[u]); return; }
  if (r === 0) { if ((sim.tick + u) % 10 === 0) danger(sim, u); return; }
  // arrived: work a while (task progress uses the low byte of 'cd')
  U.cd[u]++;
  const c = U.city[u];
  const city = c >= 0 ? sim.cities[c] : null;
  const skill = 1 + (U.traits[u] & (1 << T.Diligent) ? 0.3 : 0) - (U.traits[u] & (1 << T.Lazy) ? 0.3 : 0);
  switch (st) {
    case St.Chop: {
      if (U.cd[u] < 26) return;
      const t = U.task[u];
      const tr = w.tree[t];
      if (tr) {
        w.tree[t] = 0; w.markDirty(t);
        U.carry[u] = R.Wood + 1; U.carryAmt[u] = Math.max(1, Math.round(TREES[tr].wood * (city && sim.kingdoms[city.kingdom].techs.has('bronze') ? 1.4 : 1)));
        // dwarves and humans replant less than elves: elves leave a sapling behind
        if (SPECIES[U.spec[u]].key === 'elf' && sim.rng.chance(0.7)) civ.plantLater(sim, t, tr);
        U.cd[u] = 0; startDeliver(sim, u);
      } else { U.cd[u] = 0; U.state[u] = St.Idle; }
      return;
    }
    case St.Mine: {
      const dwarf = SPECIES[U.spec[u]].key === 'dwarf';
      if (U.cd[u] < (dwarf ? 18 : 34)) return;
      const t = U.task[u];
      const ore = w.ore[t] || (BIOMES[w.biome[t]].move >= 1.2 && !w.isWater(t) ? 1 : 0);   // quarrying rocky ground
      if (ore) {
        const res = ORE_RES[ore];
        const amt = Math.max(1, Math.round((ore === 1 ? 4 : ore >= 5 ? 1.5 : 2.5) * (dwarf ? 1.8 : 1) * skill));
        U.carry[u] = res + 1; U.carryAmt[u] = amt;
        if (w.ore[t]) { w.oreAmt[t] = Math.max(0, w.oreAmt[t] - amt); if (w.oreAmt[t] === 0) { w.ore[t] = 0; w.markDirty(t); } }
        U.cd[u] = 0; startDeliver(sim, u);
      } else { U.cd[u] = 0; U.state[u] = St.Idle; }
      return;
    }
    case St.Farm: {
      if (U.cd[u] < 16) return;
      U.cd[u] = 0;
      const t = U.task[u];
      if (!w.field[t]) {
        // plough a new field here
        if (!w.bld[t] && !w.isWater(t) && !w.river[t]) { w.field[t] = 2; w.tree[t] = 0; w.markDirty(t); if (city) city.fields.push(t); }
        U.state[u] = St.Idle; return;
      }
      if (w.field[t] >= 240) {
        // harvest
        const fert = BIOMES[w.biome[t]].fert;
        let yieldAmt = 5 + 6 * fert;
        if (city) {
          const k = sim.kingdoms[city.kingdom];
          if (k.techs.has('calendar')) yieldAmt *= 1.2;
          if (k.techs.has('industry')) yieldAmt *= 1.4;
          if (k.techs.has('genetics')) yieldAmt *= 1.3;
        }
        w.field[t] = 2; w.markDirty(t);
        U.carry[u] = R.Food + 1; U.carryAmt[u] = Math.max(1, Math.round(yieldAmt * skill));
        startDeliver(sim, u);
      } else {
        w.field[t] = Math.min(255, w.field[t] + 50);
        if (w.field[t] % 3 === 0) w.markDirty(t);
        U.state[u] = St.Idle; U.think[u] = 1;
      }
      return;
    }
    case St.Gather: {
      if (U.cd[u] < 20) return;
      U.cd[u] = 0;
      const t = U.task[u];
      const v = w.veg[t];
      const fruit = w.tree[t] ? TREES[w.tree[t]].fruit : 0;
      const got = Math.round(v / 45 + fruit * 1.5 + (city && sim.kingdoms[city.kingdom].techs.has('foraging') ? 1 : 0));
      w.veg[t] = Math.max(0, v - 90);
      if (got > 0) { U.carry[u] = R.Food + 1; U.carryAmt[u] = got; startDeliver(sim, u); }
      else U.state[u] = St.Idle;
      return;
    }
    case St.Fish: {
      if (U.cd[u] < 36) return;
      U.cd[u] = 0;
      const k = city ? sim.kingdoms[city.kingdom] : null;
      const boat = city && city.port >= 0;
      U.carry[u] = R.Food + 1; U.carryAmt[u] = Math.round((boat ? 4 : 2) * (k && k.techs.has('seafaring') ? 1.4 : 1) * skill);
      if (sim.rng.chance(0.3)) sim.fx.push({ kind: 'splash', x: U.tx[u], y: U.ty[u], t: 0, life: 10 });
      startDeliver(sim, u);
      return;
    }
    case St.Build: {
      const b = U.task[u];
      const bd = sim.buildings[b];
      if (!bd || !bd.alive || bd.built >= 1) { U.state[u] = St.Idle; U.cd[u] = 0; return; }
      if (U.cd[u] % 6 === 0) {
        bd.built = Math.min(1, bd.built + 6 * skill / BUILDINGS[bd.type].work / 3);
        if ((sim.tick & 15) === 0) sim.fx.push({ kind: 'dust', x: bd.x + sim.rng.range(0, bd.w), y: bd.y + sim.rng.range(0, bd.h), t: 0, life: 10 });
        if (bd.built >= 1) { civ.finishBuilding(sim, b); U.state[u] = St.Idle; U.cd[u] = 0; gainXp(sim, u, 1); }
      }
      if (U.cd[u] > 240) { U.cd[u] = 0; U.state[u] = St.Idle; }
      return;
    }
    case St.Work: {
      if (U.cd[u] < 50) return;
      U.cd[u] = 0;
      if (city) civ.produce(sim, c, U.job[u], u);
      U.state[u] = St.Idle; U.think[u] = 2;
      return;
    }
    case St.Herd: {
      if (U.cd[u] < 30) return;
      U.cd[u] = 0;
      if (city) civ.addStock(sim, c, R.Food, 1.2 * skill);
      U.state[u] = St.Idle;
      return;
    }
    case St.Trade: {
      if (U.cd[u] < 20) return;
      U.cd[u] = 0;
      if (city) civ.tradeArrive(sim, c, U.task[u], u);
      U.state[u] = St.Idle;
      return;
    }
    case St.Steal: {
      if (U.cd[u] < 30) return;
      U.cd[u] = 0;
      if (city) civ.steal(sim, c, U.task[u], u);
      if (U.alive[u]) { const [tx, ty] = wanderTarget(sim, u, city!.x + 1, city!.y + 1, 2); U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Flee; U.timer[u] = 300; }
      return;
    }
    case St.Guard: {
      U.cd[u] = 0; U.state[u] = St.Idle;
      return;
    }
  }
}

function possessedStep(sim: Sim, u: number) {
  const U = sim.units;
  if (U.state[u] === St.Fight) { if (!fightStep(sim, u)) U.state[u] = St.Possessed; return; }
  goTo(sim, u, U.tx[u], U.ty[u], 0.2);
}

// ------------------------------------------------------------------ the homeless and the wandering tribes
export function nearestCity(sim: Sim, x: number, y: number, r: number, filter?: (c: number) => boolean): number {
  let best = -1, bd = r * r;
  for (const c of sim.cities) {
    if (!c.alive || (filter && !filter(c.id))) continue;
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bd) { bd = d; best = c.id; }
  }
  return best;
}

function homeless(sim: Sim, u: number) {
  const U = sim.units;
  // join a friendly town of the same people nearby
  const c = nearestCity(sim, U.x[u], U.y[u], 40, (cid) => sim.cities[cid].species === U.spec[u] && (U.culture[u] < 0 || sim.cities[cid].culture === U.culture[u] || sim.rng.chance(0.3)));
  if (c >= 0) {
    const city = sim.cities[c];
    U.tx[u] = city.x + 1; U.ty[u] = city.y + 1; U.state[u] = St.Migrate; U.timer[u] = 1500; U.task[u] = c;
    return;
  }
  // otherwise start a new band (or join one close by)
  let band = -1;
  for (const b of sim.bands) if (b.alive && b.sub === U.sub[u] && hyp(sim.units.x[b.leader] - U.x[u], sim.units.y[b.leader] - U.y[u]) < 15) { band = b.id; break; }
  if (band >= 0) { U.band[u] = band; return; }
  formBand(sim, [u], -1);
}

function arriveMigrant(sim: Sim, u: number) {
  const U = sim.units, c = U.task[u];
  if (c < 0 || !sim.cities[c]?.alive) return;
  civ.joinCity(sim, c, u);
}

export function formBand(sim: Sim, members: number[], kingdom: number, colonyOf = -1): number {
  const U = sim.units;
  members = members.filter(m => U.alive[m]);
  if (!members.length) return -1;
  const leader = members[0];
  let culture = U.culture[leader];
  if (culture < 0) culture = faith.newCulture(sim, U.sub[leader], U.x[leader], U.y[leader]);
  const b: Band = { id: sim.bands.length, sub: U.sub[leader], culture, leader, kingdom, members: members.length, tx: U.x[leader], ty: U.y[leader], age: 0, alive: true, colonyOf };
  sim.bands.push(b);
  for (const m of members) {
    U.band[m] = b.id; U.culture[m] = culture; U.city[m] = -1; U.house[m] = -1;
    if (U.family[m] < 0) U.family[m] = sim.rng.u32() & 0x7fffffff;
    U.state[m] = St.Idle;
  }
  pickSettleSpot(sim, b);
  return b.id;
}

function pickSettleSpot(sim: Sim, b: Band) {
  const U = sim.units;
  const lx = U.x[b.leader], ly = U.y[b.leader];
  let best: [number, number] | null = null, bs = -1e9;
  const range = b.colonyOf >= 0 ? 28 : 22;
  for (let k = 0; k < 40; k++) {
    const x = Math.round(lx + sim.rng.range(-range, range)), y = Math.round(ly + sim.rng.range(-range, range));
    const s = civ.settleScore(sim, x, y, U.spec[b.leader], b.leader);
    if (s > bs) { bs = s; best = [x, y]; }
  }
  if (best && bs > -50) { b.tx = best[0] + 0.5; b.ty = best[1] + 0.5; }
}

function bandMemberDecide(sim: Sim, u: number) {
  const U = sim.units, b = sim.bands[U.band[u]];
  if (!b || !b.alive) { U.band[u] = -1; return; }
  if (!U.alive[b.leader] || U.band[b.leader] !== b.id) b.leader = u;
  if (U.hunger[u] > 55 && startForage(sim, u)) return;
  if (U.hunger[u] > 70) { const prey = civ.findGame(sim, u, 10); if (prey >= 0) { engage(sim, u, prey); U.state[u] = St.Hunt; U.timer[u] = 200; return; } }
  if (b.leader === u) {
    U.tx[u] = b.tx; U.ty[u] = b.ty; U.state[u] = St.Move; U.timer[u] = 200;
  } else {
    const [tx, ty] = wanderTarget(sim, u, U.x[b.leader], U.y[b.leader], 2.5);
    U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Move; U.timer[u] = 60;
  }
}

/** every 30 ticks: tribes move on, settle when they reach a good place */
export function stepBands(sim: Sim) {
  const U = sim.units;
  const count = new Map<number, number>();
  for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.band[u] >= 0) count.set(U.band[u], (count.get(U.band[u]) || 0) + 1);
  for (const b of sim.bands) {
    if (!b.alive) continue;
    b.members = count.get(b.id) || 0;
    if (b.members === 0) { b.alive = false; continue; }
    b.age += 30;
    if (!U.alive[b.leader] || U.band[b.leader] !== b.id) {
      for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.band[u] === b.id) { b.leader = u; break; }
    }
    const lx = U.x[b.leader], ly = U.y[b.leader];
    const near = hyp(lx - b.tx, ly - b.ty) < 2.5;
    const tired = b.age > TICKS_PER_YEAR * 4;
    if (near || tired) {
      const x = Math.floor(near ? b.tx : lx), y = Math.floor(near ? b.ty : ly);
      if (civ.settleScore(sim, x, y, U.spec[b.leader], b.leader) > -50) { civ.foundCity(sim, b, x, y); continue; }
      pickSettleSpot(sim, b);
      if (b.age > TICKS_PER_YEAR * 8) { civ.foundCity(sim, b, Math.floor(lx), Math.floor(ly)); }
    } else if (b.age % (TICKS_PER_YEAR) < 30) pickSettleSpot(sim, b);
  }
}

export function yearly(sim: Sim) {
  // heroes level, character fame, etc. are event driven; nothing heavy here yet
  let pc = 0;
  for (const s of sim.subs) if (s.sapient) pc += Math.max(0, s.pop);
  sim.peopleCount = pc;
}
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
