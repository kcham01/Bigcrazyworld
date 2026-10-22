// Animals and monsters: grazing, hunting, fleeing, herding, breeding, ageing, evolving.
import type { Sim } from './sim';
import { St, UF } from './units';
import { SPECIES } from './species';
import { G, Gene, distance } from './genetics';
import { BIOMES, TICKS_PER_YEAR, B } from './defs';
import { goTo, wanderTarget, modeOf, Mode, passable } from './move';
import { engage, fightStep, nearestEnemy } from './combat';
import * as people from './people';

const THINK = 12;

export function updateCreature(sim: Sim, u: number) {
  const U = sim.units, d = SPECIES[U.spec[u]];
  // metabolism and ageing every 20 ticks (spread over units)
  if ((sim.tick + u) % 20 === 0) {
    if (d.diet !== 'none' && sim.laws.hunger) {
      U.hunger[u] += 20 * 100 / (TICKS_PER_YEAR * (d.kind === 'titan' ? 3 : d.diet === 'carn' ? 2.2 : 1.3));
      if (U.hunger[u] > 100) { U.hunger[u] = 100; sim.damage(u, U.maxHp[u] * 0.08, -1, 'starvation'); if (!U.alive[u]) return; }
    }
    if (sim.laws.oldAge && !d.noBreed && !(U.flags[u] & UF.Immortal)) {
      const age = sim.ageYears(u), lifespan = d.life * (0.6 + 0.8 * U.genome[u * G + Gene.Lifespan] / 255);
      if (age > lifespan && sim.rng.chance(0.15)) { sim.kill(u, 'old age'); return; }
    }
    if (U.hp[u] < U.maxHp[u] && U.state[u] !== St.Fight) U.hp[u] = Math.min(U.maxHp[u], U.hp[u] + U.maxHp[u] * 0.02);
    if (U.morale[u] < 100) U.morale[u] = Math.min(100, U.morale[u] + 5);
    climate(sim, u);
    if (!U.alive[u]) return;
  }
  if (U.disease[u]) { people.diseaseTick(sim, u); if (!U.alive[u]) return; }

  switch (U.state[u]) {
    case St.Fight:
      if (!fightStep(sim, u)) { U.state[u] = St.Idle; U.think[u] = 0; }
      return;
    case St.Flee: {
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.6);
      if (r !== 0 || --U.timer[u] <= 0) { U.state[u] = St.Idle; U.think[u] = 0; }
      return;
    }
    case St.Graze: {
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.5);
      if (r === 1) {
        const t = sim.world.tileAt(U.x[u], U.y[u]);
        if (sim.world.isWater(t)) { U.hunger[u] = Math.max(0, U.hunger[u] - 45); U.state[u] = St.Idle; U.think[u] = 6; return; }   // plankton and weed
        const v = sim.world.veg[t];
        const bite = Math.min(v, 50);
        sim.world.veg[t] = v - bite;
        if (v > 40 && bite > 20 && (sim.tick & 7) === 0) sim.world.markDirty(t);
        U.hunger[u] = Math.max(0, U.hunger[u] - bite * 0.9 - (sim.world.tree[t] ? 6 : 0));
        U.state[u] = St.Idle; U.think[u] = 6;
      } else if (r < 0) { U.state[u] = St.Idle; U.think[u] = 0; }
      return;
    }
    case St.Hunt: {
      const t = U.targetU[u];
      if (t < 0 || !U.alive[t] || U.uid[t] !== U.targetUid[u]) { U.state[u] = St.Idle; U.think[u] = 0; return; }
      if (!fightStep(sim, u)) {
        // the prey died: eat
        U.hunger[u] = Math.max(0, U.hunger[u] - 70);
        U.state[u] = St.Idle; U.think[u] = 20;
      }
      if (--U.timer[u] <= 0) { U.state[u] = St.Idle; U.think[u] = 0; }  // gave up the chase
      return;
    }
    case St.Mate: {
      const t = U.targetU[u];
      if (t < 0 || !U.alive[t] || U.uid[t] !== U.targetUid[u]) { U.state[u] = St.Idle; return; }
      const r = goTo(sim, u, U.x[t], U.y[t], 0.8);
      if (r === 1) { breed(sim, u, t); U.state[u] = St.Idle; U.think[u] = 30; }
      else if (r < 0 || --U.timer[u] <= 0) U.state[u] = St.Idle;
      return;
    }
    case St.Wander: case St.Move: {
      const r = goTo(sim, u, U.tx[u], U.ty[u], 0.5);
      if (r !== 0 || --U.timer[u] <= 0) { U.state[u] = St.Idle; U.think[u] = sim.rng.int(THINK); }
      if (U.think[u] > 0) U.think[u]--; else if ((sim.tick + u) % 6 === 0) { if (threatCheck(sim, u)) return; }
      return;
    }
    default: {
      if (U.think[u] > 0) { U.think[u]--; return; }
      U.think[u] = THINK;
      decide(sim, u);
    }
  }
}

/** react to danger first: flee, or fight if hostile */
function threatCheck(sim: Sim, u: number): boolean {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if (d.hostile || d.kind === 'titan' || d.diet === 'carn') {
    const e = nearestEnemy(sim, u, d.kind === 'titan' ? 9 : 6);
    if (e >= 0 && (d.kind === 'titan' || d.hostile || U.hunger[u] > 60)) { engage(sim, u, e); return true; }
  }
  if (d.prey || d.diet === 'herb') {
    let threat = -1;
    U.near(U.x[u], U.y[u], 5, (j) => {
      if (j === u) return;
      const dj = SPECIES[U.spec[j]];
      if ((dj.diet === 'carn' && !dj.sapient && dj.hp > d.hp * 0.4 && dj.key !== d.key) || dj.hostile || (U.state[j] === St.Hunt && U.targetU[j] === u)) { threat = j; return true; }
    });
    if (threat >= 0 && !(U.flags[u] & UF.Tame)) {
      const dx = U.x[u] - U.x[threat], dy = U.y[u] - U.y[threat], dd = hyp(dx, dy) || 1;
      const [tx, ty] = wanderTarget(sim, u, U.x[u] + dx / dd * 6, U.y[u] + dy / dd * 6, 1.5);
      U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Flee; U.timer[u] = 60;
      return true;
    }
  }
  return false;
}

function decide(sim: Sim, u: number) {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if (threatCheck(sim, u)) return;
  const x = U.x[u], y = U.y[u];
  // monsters and titans go looking for trouble near towns
  if ((d.kind === 'titan' || d.kind === 'monster') && d.hostile && sim.rng.chance(0.08)) {
    const c = people.nearestCity(sim, x, y, d.kind === 'titan' ? 60 : 30);
    if (c >= 0) { U.tx[u] = sim.cities[c].x + 0.5; U.ty[u] = sim.cities[c].y + 0.5; U.state[u] = St.Wander; U.timer[u] = 400; return; }
  }
  // grazers nibble wherever they stand
  if ((d.diet === 'herb' || d.diet === 'omni') && U.hunger[u] > 15 && d.kind !== 'sea') {
    const t = sim.world.tileAt(x, y);
    const v = sim.world.veg[t];
    if (v > 20) { const bite = Math.min(v, 30); sim.world.veg[t] = v - bite; U.hunger[u] = Math.max(0, U.hunger[u] - bite * 0.8); }
  } else if (d.kind === 'sea' && d.diet !== 'carn' && sim.world.isWater(sim.world.tileAt(x, y))) U.hunger[u] = Math.max(0, U.hunger[u] - 20);
  // hungry: graze or hunt
  if (U.hunger[u] > 50 && d.diet !== 'none') {
    if (d.diet === 'herb' || (d.diet === 'omni' && sim.rng.chance(0.6))) {
      const t = findForage(sim, u, U.hunger[u] > 75 ? 10 : 6);
      if (t >= 0) { U.tx[u] = t % sim.world.w + 0.5; U.ty[u] = ((t / sim.world.w) | 0) + 0.5; U.state[u] = St.Graze; return; }
    }
    if (d.diet === 'carn' || (d.diet === 'omni' && d.hp >= 40)) {
      const prey = findPrey(sim, u, 9);
      if (prey >= 0) { engage(sim, u, prey); U.state[u] = St.Hunt; U.timer[u] = 160; return; }
    }
  }
  // breed
  if (sim.laws.births && !d.noBreed && U.sex[u] === 1 && U.hunger[u] < 65 && sim.ageYears(u) >= d.adult && !(U.flags[u] & UF.Tame && sim.rng.chance(0.5))) {
    const p = d.breed * THINK / TICKS_PER_YEAR * 2;
    if (sim.rng.chance(p) && roomToBreed(sim, u)) {
      let mate = -1;
      U.near(x, y, 10, (j) => { if (j !== u && U.sub[j] === U.sub[u] && U.sex[j] === 0 && sim.ageYears(j) >= d.adult) { mate = j; return true; } });
      if (mate >= 0 || d.kind === 'sea') { breed(sim, u, mate >= 0 ? mate : u); U.think[u] = THINK * 2; return; }
    }
  }
  // tame animals stay near their town
  if (U.flags[u] & UF.Tame && U.city[u] >= 0) {
    const c = sim.cities[U.city[u]];
    if (c && c.alive) {
      const [tx, ty] = wanderTarget(sim, u, c.x + 0.5, c.y + 0.5, 7);
      U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Wander; U.timer[u] = 120; return;
    }
    U.flags[u] &= ~UF.Tame; U.city[u] = -1;
  }
  // wander, drifting toward others of the herd
  let cx = x, cy = y;
  if (d.kind !== 'titan') {
    let n = 0, sx = 0, sy = 0;
    U.near(x, y, 8, (j) => { if (U.spec[j] === U.spec[u]) { sx += U.x[j]; sy += U.y[j]; n++; } });
    if (n > 1) { cx = x * 0.5 + (sx / n) * 0.5; cy = y * 0.5 + (sy / n) * 0.5; }
  }
  const r = d.kind === 'titan' ? 12 : d.fly ? 10 : 5;
  const [tx, ty] = wanderTarget(sim, u, cx, cy, r);
  U.tx[u] = tx; U.ty[u] = ty; U.state[u] = St.Wander; U.timer[u] = 160;
}

function findForage(sim: Sim, u: number, r: number): number {
  const U = sim.units, w = sim.world, mode = modeOf(sim, u);
  let best = -1, bv = 18;
  const x = U.x[u] | 0, y = U.y[u] | 0;
  for (let k = 0; k < 14; k++) {
    const nx = x + sim.rng.irange(-r, r), ny = y + sim.rng.irange(-r, r);
    if (!w.inb(nx, ny)) continue;
    const i = ny * w.w + nx;
    if (mode === Mode.Sea) { if (w.isWater(i)) return i; continue; }
    if (!passable(sim, i, mode)) continue;
    const v = w.veg[i] + (w.tree[i] ? 30 : 0) + (w.field[i] ? 80 : 0);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

function findPrey(sim: Sim, u: number, r: number): number {
  const U = sim.units, d = SPECIES[U.spec[u]];
  let best = -1, bd = 1e9;
  const x = U.x[u], y = U.y[u];
  U.near(x, y, r, (j) => {
    if (j === u) return;
    const dj = SPECIES[U.spec[j]];
    if (U.spec[j] === U.spec[u]) return;
    const prey = dj.prey || (d.hostile && dj.sapient && !dj.undead);
    if (!prey) return;
    if (dj.hp > d.hp * 2.2 && d.kind !== 'titan') return;            // too big to take on
    if (dj.sapient && !d.hostile) return;
    const dd = (U.x[j] - x) ** 2 + (U.y[j] - y) ** 2;
    if (dd < bd) { bd = dd; best = j; }
  });
  return best;
}

function roomToBreed(sim: Sim, u: number): boolean {
  const U = sim.units;
  const animals = U.count - sim.peopleCount;
  if (animals > sim.laws.maxUnits * 0.45) return false;
  if (sim.subs[U.sub[u]].pop > sim.laws.maxUnits * (SPECIES[U.spec[u]].kind === 'sea' ? 0.06 : SPECIES[U.spec[u]].fly ? 0.012 : 0.08)) return false;
  let n = 0;
  U.near(U.x[u], U.y[u], 7, (j) => { if (U.spec[j] === U.spec[u]) n++; return n > 14; });
  return n <= 14;
}

export function breed(sim: Sim, mother: number, father: number) {
  const U = sim.units, d = SPECIES[U.spec[mother]];
  const n = Math.max(1, sim.rng.irange(1, d.litter));
  const mode = modeOf(sim, mother);
  for (let k = 0; k < n; k++) {
    const x = U.x[mother] + sim.rng.range(-0.6, 0.6), y = U.y[mother] + sim.rng.range(-0.6, 0.6);
    if (!sim.world.inb(x | 0, y | 0) || !passable(sim, sim.world.tileAt(x, y), mode)) continue;
    const c = sim.spawn(U.sub[mother], x, y, { age: 0, mother, father });
    if (U.flags[mother] & UF.Tame) { U.flags[c] |= UF.Tame; U.city[c] = U.city[mother]; }
  }
  sim.totalBirths += n;
}

/** cold and heat stress: natural selection on the Cold and Heat genes */
function climate(sim: Sim, u: number) {
  const U = sim.units, w = sim.world, d = SPECIES[U.spec[u]];
  if (d.kind === 'sea' || d.undead || d.kind === 'titan') return;
  const t = w.tileAt(U.x[u], U.y[u]);
  let temp = w.temp[t] + (sim.season === 3 ? -12 : sim.season === 1 ? 6 : 0);
  if (sim.ageName === 'Age of Ice') temp -= 15;
  if (sim.ageName === 'Age of Sun') temp += 8;
  const cold = U.genome[u * G + Gene.Cold], heat = U.genome[u * G + Gene.Heat];
  const lizard = d.key === 'lizard' || d.key === 'croc' || d.key === 'raptor';
  if (temp < (lizard ? 8 : -5)) {
    const harm = (1 - cold / 255) * Math.min(1, ((lizard ? 8 : -5) - temp) / 20);
    if (harm > 0.25 && !(U.house[u] >= 0 && sim.isNight())) sim.damage(u, U.maxHp[u] * harm * 0.05, -1, 'cold');
  } else if (temp > 32) {
    const harm = (1 - heat / 255) * Math.min(1, (temp - 32) / 15);
    if (harm > 0.25) U.hunger[u] += harm * 4;
  }
}

/** once a year: subspecies averages, speciation on isolated islands, and minds awakening */
export function yearly(sim: Sim) {
  const U = sim.units, w = sim.world;
  if (w.regionsStale) w.computeRegions();
  // group members by subspecies and by land region / water body
  const groups = new Map<number, Map<number, number[]>>();
  for (let u = 0; u < U.hi; u++) {
    if (!U.alive[u]) continue;
    const s = U.sub[u];
    let g = groups.get(s); if (!g) groups.set(s, g = new Map());
    const reg = w.region[w.tileAt(U.x[u], U.y[u])];
    let list = g.get(reg); if (!list) g.set(reg, list = []);
    list.push(u);
  }
  for (const [sid, regions] of groups) {
    const sub = sim.subs[sid];
    // update the average genome
    const mean = new Float32Array(G); let total = 0;
    for (const list of regions.values()) for (const u of list) { for (let g = 0; g < G; g++) mean[g] += U.genome[u * G + g]; total++; }
    if (!total) continue;
    for (let g = 0; g < G; g++) mean[g] /= total;
    sub.genome.set(mean); sub.hue = mean[Gene.Hue];
    if (!sim.laws.evolution) continue;
    // isolated groups that drifted far enough become a new subspecies
    if (regions.size > 1 && total >= 30) {
      for (const [reg, list] of regions) {
        if (list.length < 12 || list.length > total * 0.7) continue;
        const gm = new Float32Array(G);
        for (const u of list) for (let g = 0; g < G; g++) gm[g] += U.genome[u * G + g];
        for (let g = 0; g < G; g++) gm[g] /= list.length;
        if (distance(gm, 0, mean, 0) > 16) {
          const id = sim.newSubspecies(sid, gm, reg);
          for (const u of list) { U.sub[u] = id; sub.pop--; sim.subs[id].pop++; }
          sim.subs[id].peak = sim.subs[id].pop;
          const ns = sim.subs[id];
          sim.log('species', `A new subspecies appeared: the ${ns.name} (${ns.latin}), split from the ${sub.name}.`, U.x[list[0]], U.y[list[0]], { s: id, imp: 1 });
        }
      }
    }
    // a clever enough animal population wakes up and becomes a thinking people
    const def = SPECIES[sub.species];
    if (!sub.sapient && sim.laws.sapience && (def.kind === 'animal') && mean[Gene.Intel] > 205 && total >= 16) {
      awaken(sim, sid, regions);
    }
  }
}

/** an animal subspecies becomes sapient and forms its first tribe */
export function awaken(sim: Sim, sid: number, regions?: Map<number, number[]>) {
  const U = sim.units, sub = sim.subs[sid];
  sub.sapient = true; sub.uplifted = true;
  const def = SPECIES[sub.species];
  sub.name = 'Wise ' + def.plural.toLowerCase();
  sub.notes.push(`Became a thinking people in year ${sim.year}.`);
  let members: number[] = [];
  if (regions) for (const l of regions.values()) members.push(...l);
  else for (let u = 0; u < U.hi; u++) if (U.alive[u] && U.sub[u] === sid) members.push(u);
  members = members.filter(u => sim.ageYears(u) >= def.adult);
  if (!members.length) return;
  const x = U.x[members[0]], y = U.y[members[0]];
  sim.log('awaken', `The ${def.plural.toLowerCase()} near here have learned to think, speak and make tools. A new people is born: the ${sub.name}!`, x, y, { s: sid, imp: 3 });
  people.formBand(sim, members.slice(0, 14), -1);
}

export function isAquaticHome(b: B) { return BIOMES[b].water === true; }
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
