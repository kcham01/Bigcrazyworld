// Talent tree rules as in the game: 61 points at level 70, 5 points in a tree per row to unlock the
// next row, and a talent with an arrow needs the one it points from at full rank.
import { ClassId, TALENTS, Talent } from './data';

export const MAX_POINTS = 61;
export type TalentMap = Record<string, number>;

export const key = (tree: number, t: Talent) => `${tree}.${t.f}`;
export function spent(m: TalentMap): number { let n = 0; for (const k in m) n += m[k] || 0; return n; }
export function treeSpent(cls: ClassId, m: TalentMap, tree: number): number {
  return TALENTS[cls][tree].talents.reduce((n, t) => n + (m[key(tree, t)] || 0), 0);
}
/** points spent in a tree in rows above `row` */
function spentAbove(cls: ClassId, m: TalentMap, tree: number, row: number): number {
  return TALENTS[cls][tree].talents.filter(t => t.r < row).reduce((n, t) => n + (m[key(tree, t)] || 0), 0);
}
function prereq(cls: ClassId, tree: number, t: Talent): Talent | undefined {
  if (!t.req) return undefined;
  return TALENTS[cls][tree].talents.find(x => x.r === t.req![0] && x.c === t.req![1]);
}

export function unlocked(cls: ClassId, m: TalentMap, tree: number, t: Talent): boolean {
  if (spentAbove(cls, m, tree, t.r) < t.r * 5) return false;
  const pre = prereq(cls, tree, t);
  if (pre && (m[key(tree, pre)] || 0) < pre.max) return false;
  return true;
}
export function canAdd(cls: ClassId, m: TalentMap, tree: number, t: Talent): boolean {
  return (m[key(tree, t)] || 0) < t.max && spent(m) < MAX_POINTS && unlocked(cls, m, tree, t);
}

/** every talent with points must still be unlocked */
export function valid(cls: ClassId, m: TalentMap): boolean {
  if (spent(m) > MAX_POINTS) return false;
  for (let ti = 0; ti < TALENTS[cls].length; ti++) {
    for (const t of TALENTS[cls][ti].talents) {
      const r = m[key(ti, t)] || 0;
      if (r > t.max) return false;
      if (r > 0 && !unlocked(cls, m, ti, t)) return false;
    }
  }
  return true;
}
export function canRemove(cls: ClassId, m: TalentMap, tree: number, t: Talent): boolean {
  const k = key(tree, t);
  if (!(m[k] > 0)) return false;
  const next = { ...m, [k]: m[k] - 1 };
  return valid(cls, next);
}
