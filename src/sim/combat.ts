// Fighting: melee and ranged attacks, projectiles for the renderer, morale and experience.
import type { Sim } from './sim';
import { St, UF, T } from './units';
import { SPECIES } from './species';
import { goTo } from './move';

export function engage(sim: Sim, u: number, t: number) {
  const U = sim.units;
  if (t < 0 || !U.alive[t] || t === u) return;
  U.targetU[u] = t; U.targetUid[u] = U.uid[t];
  U.state[u] = St.Fight; U.timer[u] = 0;
}

/** the weapon look for projectiles */
function shotKind(sim: Sim, u: number): string {
  const U = sim.units, d = SPECIES[U.spec[u]];
  if (d.key === 'dragon') return 'fire';
  if (d.key === 'alien') return 'laser';
  if (U.traits[u] & (1 << T.Mage)) return 'fireball';
  const w = U.weapon[u];
  if (w >= 8) return 'laser';
  if (w >= 4) return 'bullet';
  return 'arrow';
}

/** one tick of fighting. Returns false when the fight is over. */
export function fightStep(sim: Sim, u: number): boolean {
  const U = sim.units;
  let t = U.targetU[u];
  if (t < 0 || !U.alive[t] || U.uid[t] !== U.targetUid[u]) { U.targetU[u] = -1; return false; }
  const dx = U.x[t] - U.x[u], dy = U.y[t] - U.y[u];
  const dist = hyp(dx, dy);
  const range = U.range[u];
  if (dist > 14) { U.targetU[u] = -1; return false; }   // got away
  if (dist > range) {
    const r = goTo(sim, u, U.x[t], U.y[t], range * 0.9);
    if (r < 0) { U.targetU[u] = -1; return false; }
    return true;
  }
  if (Math.abs(dx) > 0.01) U.facing[u] = dx > 0 ? 1 : -1;
  if (U.cd[u] > 0) { U.cd[u]--; return true; }
  const d = SPECIES[U.spec[u]], dt = SPECIES[U.spec[t]];
  let dmg = U.atk[u] * (0.75 + 0.5 * sim.rng.f());
  if (U.traits[u] & (1 << T.Mage)) dmg += 6 + U.level[u];
  if (U.traits[u] & (1 << T.Lucky) && sim.rng.chance(0.1)) dmg *= 2;
  if (U.morale[u] < 40) dmg *= 0.7;
  // cavalry charge and mounted bonus against foot
  if (U.mount[u] && !U.mount[t]) dmg *= 1.15;
  dmg = Math.max(0.5, dmg - U.def[t] * 0.6);
  if (range > 1.5) {
    const kind = shotKind(sim, u);
    sim.fx.push({ kind, x: U.x[u], y: U.y[u] - 0.3, x2: U.x[t], y2: U.y[t] - 0.3, t: 0, life: Math.max(4, Math.min(16, Math.round(dist * 2))) });
    if (kind === 'fire') { // dragon breath sets the ground alight
      const ti = sim.world.tileAt(U.x[t], U.y[t]);
      if (!sim.world.isWater(ti)) sim.world.fire[ti] = Math.max(sim.world.fire[ti], 60), sim.world.markDirty(ti);
    }
  } else {
    sim.fx.push({ kind: 'hit', x: U.x[t], y: U.y[t] - 0.3, t: 0, life: 6 });
  }
  // heroes have special moves
  if (U.flags[u] & UF.Hero && sim.rng.chance(0.15)) heroMove(sim, u, t);
  sim.damage(t, dmg, u, d.sapient && dt.sapient ? 'battle' : d.sapient ? 'hunted' : 'eaten');
  U.cd[u] = d.kind === 'titan' ? 16 : 10 + (range > 1.5 ? 6 : 0);
  // the victim fights back or runs
  if (U.alive[t] && U.targetU[t] < 0 && U.state[t] !== St.Flee) {
    if (dt.atk > 0 && (U.morale[t] > 30 || dt.hostile)) engage(sim, t, u);
  }
  // morale falls when hurt
  if (U.alive[t]) U.morale[t] = Math.max(0, U.morale[t] - Math.round(dmg / Math.max(1, U.maxHp[t]) * 60));
  return true;
}

function heroMove(sim: Sim, u: number, t: number) {
  const U = sim.units;
  const r = sim.rng.int(3);
  if (r === 0) {   // cleave: hit everyone around
    sim.fx.push({ kind: 'ring', x: U.x[u], y: U.y[u], t: 0, life: 10, color: 0xffd25a, size: 2 });
    U.near(U.x[u], U.y[u], 1.8, (j) => { if (j !== u && sim.hostile(u, j)) sim.damage(j, U.atk[u] * 0.8, u); });
  } else if (r === 1) { // rally: heal and steady nearby friends
    sim.fx.push({ kind: 'ring', x: U.x[u], y: U.y[u], t: 0, life: 12, color: 0x6fe08a, size: 3 });
    U.near(U.x[u], U.y[u], 4, (j) => { if (!sim.hostile(u, j) && SPECIES[U.spec[j]].sapient) { U.hp[j] = Math.min(U.maxHp[j], U.hp[j] + 6); U.morale[j] = Math.min(100, U.morale[j] + 25); } });
  } else { // mighty blow
    sim.damage(t, U.atk[u] * 1.5, u);
  }
}

/** nearest enemy within r tiles, or -1 */
export function nearestEnemy(sim: Sim, u: number, r: number): number {
  const U = sim.units;
  if (!sim.maybeDanger(u, r)) return -1;
  let best = -1, bd = 1e9;
  const x = U.x[u], y = U.y[u];
  U.near(x, y, r, (j) => {
    if (j === u || !sim.hostile(u, j)) return;
    const d = (U.x[j] - x) ** 2 + (U.y[j] - y) ** 2;
    if (d < bd) { bd = d; best = j; }
  });
  return best;
}

export function gainXpFight(sim: Sim, u: number) { /* handled in people.gainXp */ }
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
