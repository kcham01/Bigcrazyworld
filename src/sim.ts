// How well Holy Shield or Shield Block actually cover you: they only block a limited number of hits,
// so a fast boss (or adds, or a second weapon) can use up the charges and land crushing blows. A small,
// repeatable simulation of an hour of swings against the passive sheet plus the cooldown.
import { bossCtx, computeSheet, Profile, talentRank } from './engine';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface Coverage {
  ability: string; charges: number; duration: number; cooldown: number; swing: number; attackers: number;
  crushPct: number; critPct: number; crushPctWithout: number; blocksPerCast: number; hitsPerCast: number; note: string;
}

/** `minutes` of the boss (and any extra attackers) hitting the tank while the cooldown is used whenever it is ready */
export function coverage(p: Profile, minutes = 60): Coverage | null {
  const passive = computeSheet(p, 'passive');
  if (!passive.canBlock) return null;
  let ability = '', charges = 0, duration = 0, cooldown = 0, bonus = 0;
  if (p.cls === 'paladin' && talentRank(p, 'holyShield') > 0) {
    ability = 'Holy Shield'; charges = 4 + 2 * talentRank(p, 'improvedHolyShield'); duration = 10; cooldown = 10; bonus = 30;
    if (passive.gear.libramOfRepentance) bonus += 42 / 7.8846;
  } else if (p.cls === 'warrior') {
    ability = 'Shield Block'; charges = 1 + talentRank(p, 'improvedShieldBlock'); duration = 5 + talentRank(p, 'improvedShieldBlock'); cooldown = 5; bonus = 75;
  } else return null;
  const bc = bossCtx(p);
  const swing = bc.swing;
  const attackers = bc.attackers;
  const d = bc.deficit;
  const avoid = (passive.miss - d + bc.hitRed) + (passive.dodge - d) + (passive.canParry ? passive.parry - d : 0);
  const blockBase = passive.block - d;
  const critSlice = Math.max(0, bc.critBase - passive.critReduction);
  const rand = rng(1234);
  let nextCast = 0, castAt = -999, left = 0;
  let bossSwings = 0, crushes = 0, crits = 0, blocksInCasts = 0, casts = 0;
  const end = minutes * 60;
  const events: { t: number; boss: boolean }[] = [];
  for (let a = 0; a < attackers; a++) for (let x = a * swing / attackers; x < end; x += swing) events.push({ t: x, boss: a === 0 });
  events.sort((a, b) => a.t - b.t);
  for (const e of events) {
    while (nextCast <= e.t) { castAt = nextCast; left = charges; nextCast += cooldown; casts++; }
    const active = e.t - castAt < duration && left > 0;
    const block = blockBase + (active ? bonus : 0);
    const r = rand() * 100;
    let outcome = 'hit';
    if (r < avoid) outcome = 'avoid';
    else if (r < avoid + block) outcome = 'block';
    else if (r < avoid + block + critSlice) outcome = 'crit';
    else if (r < avoid + block + critSlice + bc.crush) outcome = 'crush';
    if (outcome === 'block' && active) { left--; blocksInCasts++; }
    if (e.boss) {
      bossSwings++;
      if (outcome === 'crush') crushes++;
      if (outcome === 'crit') crits++;
    }
  }
  const withoutTotal = avoid + blockBase + critSlice;
  const crushPctWithout = Math.max(0, Math.min(bc.crush, 100 - withoutTotal));
  const blocksPerCast = blocksInCasts / Math.max(1, casts);
  const hitsPerCast = (duration / swing) * attackers;
  const note = charges >= hitsPerCast ? `${ability} has more charges (${charges}) than the swings it meets in ${duration} seconds (${hitsPerCast.toFixed(1)}).`
    : `${ability} meets about ${hitsPerCast.toFixed(1)} swings per use but only has ${charges} charge${charges === 1 ? '' : 's'}: once they are used up, later swings in the window are not covered.`;
  return {
    ability, charges, duration, cooldown, swing, attackers,
    crushPct: crushes / Math.max(1, bossSwings) * 100, critPct: crits / Math.max(1, bossSwings) * 100,
    crushPctWithout, blocksPerCast, hitsPerCast, note,
  };
}
