// The character sheet and the attack table against a raid boss. Pure functions, no DOM.
//
// Against a level 73 boss (weapon skill 365) a level 70 tank (defense 350) loses 0.6% from each of
// miss, dodge, parry and block. The character sheet shows the values against a level 70, so the
// uncrushable target on the sheet is 102.4%. Crushing blows are a flat 15% (defense does not shrink
// them); they only disappear when miss + dodge + parry + block fill the whole table.
import { BASES, BUFFS, ClassId, ENCHANT_BY_ID, GEM_BY_ID, Item, ITEM_BY_ID, SETS, Slot, Stats, TALENTS } from './data';

export const R = {
  defense: 2.3654, dodge: 18.9231, parry: 23.6538, block: 7.8846, hit: 15.7692, crit: 22.0769,
  res: 39.4231, exp: 3.9423, haste: 15.7692,
};
export const AGI_PER_DODGE: Record<ClassId, number> = { warrior: 30, paladin: 25, druid: 14.7059 };
export const AGI_PER_CRIT: Record<ClassId, number> = { warrior: 33, paladin: 25, druid: 25 };
export const BOSS = { skill: 365, perComponent: 0.6, crush: 15, crit: 5.6, cap: 102.4, shearCap: 101.8 };

export interface GearPiece { id: number; gems?: number[]; ench?: number }
export interface Profile {
  id: string; name: string; cls: ClassId; race: string;
  gear: Partial<Record<Slot, GearPiece>>;
  talents: Record<string, number>;            // "tree.field" -> rank
  buffs: Record<string, number>;              // buff id -> 1 (on) or 2 (on, improved)
  opts: { holyShield: boolean; shieldBlock: boolean; redoubt: boolean; bear: boolean; uses: Record<string, boolean>; swing: number; dualWield: boolean; adds?: number };
  updated: number;
}

export function talentRank(p: Profile, field: string): number {
  let r = 0;
  for (const k in p.talents) if (k.endsWith('.' + field)) r += p.talents[k];
  return r;
}

const add = (a: Stats, b: Stats | undefined, k = 1) => { if (b) for (const s in b) a[s] = (a[s] || 0) + b[s] * k; };

/** gem colours that fit a socket */
export function gemFits(socket: string, gemColor: string): boolean {
  if (socket === 'meta') return gemColor === 'meta';
  if (gemColor === 'meta') return false;
  if (gemColor === 'prismatic') return true;
  const map: Record<string, string[]> = { red: ['red', 'orange', 'purple'], yellow: ['yellow', 'orange', 'green'], blue: ['blue', 'purple', 'green'] };
  return (map[socket] || []).includes(gemColor);
}
const COLOR_PARTS: Record<string, string[]> = {
  red: ['red'], yellow: ['yellow'], blue: ['blue'], orange: ['red', 'yellow'], purple: ['red', 'blue'], green: ['yellow', 'blue'], prismatic: ['red', 'yellow', 'blue'],
};

/** do the gems you wear meet a meta gem's requirement? */
export function metaActive(req: string[] | undefined, counts: Record<string, number>): boolean {
  if (!req) return true;
  for (const r of req) {
    let m = r.match(/at least (\d+) (\w+) gems?/i);
    if (m) { if ((counts[m[2].toLowerCase()] || 0) < +m[1]) return false; continue; }
    m = r.match(/more (\w+) gems than (\w+) gems/i);
    if (m) { if ((counts[m[1].toLowerCase()] || 0) <= (counts[m[2].toLowerCase()] || 0)) return false; continue; }
    m = r.match(/exactly (\d+) (\w+) gems?/i);
    if (m) { if ((counts[m[2].toLowerCase()] || 0) !== +m[1]) return false; continue; }
  }
  return true;
}

export interface GearSum {
  st: Stats; itemArmor: number; shield: Item | null; weapon: Item | null; twoHand: boolean;
  meta: { gem: number; active: boolean; req?: string[] } | null; colorCounts: Record<string, number>;
  setCounts: Record<string, number>; setBonuses: { set: string; count: number; text: string }[];
  libramOfRepentance: boolean; eternalMeta: boolean; socketsMatched: Record<string, boolean>; uniqueClash: string[];
}

export function sumGear(p: Profile): GearSum {
  const st: Stats = {};
  let itemArmor = 0;
  const colorCounts: Record<string, number> = { red: 0, yellow: 0, blue: 0 };
  const setCounts: Record<string, number> = {};
  const socketsMatched: Record<string, boolean> = {};
  let meta: GearSum['meta'] = null;
  let shield: Item | null = null, weapon: Item | null = null;
  const seenUnique = new Set<number>();
  const uniqueClash: string[] = [];
  for (const slot in p.gear) {
    const g = p.gear[slot as Slot];
    if (!g) continue;
    const it = ITEM_BY_ID.get(g.id);
    if (!it) continue;
    if (it.u) { if (seenUnique.has(it.id)) uniqueClash.push(it.n); seenUnique.add(it.id); }
    if (slot === 'offhand' && it.wt === 'shield') shield = it;
    if (slot === 'mainhand') weapon = it;
    // base armor of armor pieces and shields counts as "armor from items" for talents and Dire Bear Form
    const st2 = { ...it.st };
    if (st2.armor) { itemArmor += st2.armor; delete st2.armor; }
    add(st, st2);
    if (it.setId) setCounts[it.setId] = (setCounts[it.setId] || 0) + 1;
    // gems
    let matched = !!(it.so && it.so.length);
    (it.so || []).forEach((sock, i) => {
      const gid = g.gems?.[i];
      const gem = gid ? GEM_BY_ID.get(gid) : undefined;
      if (!gem) { matched = false; return; }
      if (gem.c === 'meta') { meta = { gem: gem.id, active: true, req: gem.req }; }
      else { for (const c of COLOR_PARTS[gem.c] || []) colorCounts[c]++; add(st, gem.st); }
      if (!gemFits(sock, gem.c)) matched = false;
    });
    socketsMatched[slot] = matched;
    if (matched && it.sb) add(st, it.sb);
    if (g.ench) { const e = ENCHANT_BY_ID.get(g.ench); if (e) add(st, e.st); }
  }
  const m = meta as GearSum['meta'];
  let eternalMeta = false;
  if (m) {
    m.active = metaActive(m.req, colorCounts);
    const gem = GEM_BY_ID.get(m.gem)!;
    if (m.active) { add(st, gem.st); if (/Shield Block Value/i.test(gem.tx || '')) eternalMeta = true; }
  }
  const setBonuses: GearSum['setBonuses'] = [];
  for (const sid in setCounts) {
    const set = SETS[sid];
    if (!set) continue;
    for (const [n, text] of set.b) if (setCounts[sid] >= n) setBonuses.push({ set: set.n, count: n, text });
  }
  const off = p.gear.offhand ? ITEM_BY_ID.get(p.gear.offhand.id) : undefined;
  const twoHand = !!(weapon && weapon.ht === '2h');
  const ranged = p.gear.ranged ? ITEM_BY_ID.get(p.gear.ranged.id) : undefined;
  return {
    st, itemArmor, shield: twoHand ? null : shield, weapon, twoHand, meta: m, colorCounts, setCounts, setBonuses,
    libramOfRepentance: ranged?.id === 29388, eternalMeta, socketsMatched, uniqueClash,
  };
  void off;
}

export interface Breakdown { label: string; value: number }
export interface Sheet {
  cls: ClassId; race: string; bear: boolean;
  str: number; agi: number; sta: number; int: number; spi: number;
  health: number; armor: number; armorReduction: number;
  defenseSkill: number; defenseFloor: number; defRating: number;
  miss: number; dodge: number; parry: number; block: number; total: number;
  canBlock: boolean; canParry: boolean;
  blockValue: number; critReduction: number; critReductionSafe: number; resilience: number;
  hit: number; expertise: number; ap: number; crit: number;
  parts: Record<string, Breakdown[]>;
  holyShieldOn: boolean; shieldBlockOn: boolean; redoubtOn: boolean; usesOn: string[];
  gear: GearSum;
}

export type Mode = 'passive' | 'cooldown' | 'procs';

/**
 * The character sheet. mode: 'passive' = gear, talents and buffs only; 'cooldown' adds Holy Shield
 * or Shield Block if switched on; 'procs' also adds Redoubt and on-use trinkets that are switched on.
 */
export function computeSheet(p: Profile, mode: Mode = 'procs'): Sheet {
  const cls = p.cls;
  const base = BASES[cls][p.race] || Object.values(BASES[cls])[0];
  const gear = sumGear(p);
  const parts: Record<string, Breakdown[]> = {};
  const note = (k: string, label: string, value: number) => { if (Math.abs(value) > 1e-9) (parts[k] ||= []).push({ label, value }); };
  const bear = cls === 'druid' && p.opts.bear;
  const T = (f: string) => talentRank(p, f);

  // flat stats from gear and buffs
  const flat: Stats = { ...gear.st };
  const buffStats: Stats = {};
  for (const b of BUFFS) {
    const on = p.buffs[b.id];
    if (!on) continue;
    add(buffStats, b.st);
    if (on === 2 && b.improved) add(buffStats, b.improved.st);
  }
  add(flat, buffStats);
  // on-use and proc effects switched on (procs mode only)
  const usesOn: string[] = [];
  if (mode === 'procs') {
    for (const slot of ['trinket1', 'trinket2'] as Slot[]) {
      const g = p.gear[slot];
      const it = g && ITEM_BY_ID.get(g.id);
      if (!it || !it.fx || !p.opts.uses[String(it.id)]) continue;
      for (const e of it.fx) { flat[e.stat] = (flat[e.stat] || 0) + e.amount; }
      usesOn.push(it.n);
    }
  }

  // primary stats with % modifiers
  let strMul = 1, agiMul = 1, staMul = 1, intMul = 1, spiMul = 1;
  if (p.buffs.kings) { strMul *= 1.1; agiMul *= 1.1; staMul *= 1.1; intMul *= 1.1; spiMul *= 1.1; }
  if (cls === 'warrior') { staMul *= 1 + 0.01 * T('vitality'); strMul *= 1 + 0.02 * T('vitality'); }
  if (cls === 'paladin') {
    strMul *= 1 + 0.02 * T('divineStrength'); intMul *= 1 + 0.02 * T('divineIntellect');
    staMul *= 1 + 0.03 * T('sacredDuty'); staMul *= 1 + 0.02 * T('combatExpertise');
  }
  if (cls === 'druid') {
    const sotf = 1 + 0.01 * T('survivalOfTheFittest');
    strMul *= sotf; agiMul *= sotf; staMul *= sotf; intMul *= sotf; spiMul *= sotf;
    intMul *= 1 + 0.04 * T('heartOfTheWild');
    if (bear) { staMul *= 1 + 0.04 * T('heartOfTheWild'); staMul *= 1.25; }
  }
  const str = Math.floor((base.str + (flat.str || 0)) * strMul);
  const agi = Math.floor((base.agi + (flat.agi || 0)) * agiMul);
  const sta = Math.floor((base.sta + (flat.sta || 0)) * staMul);
  const int = Math.floor((base.int + (flat.int || 0)) * intMul);
  const spi = Math.floor((base.spi + (flat.spi || 0)) * spiMul);

  // health
  let health = base.hp + Math.min(20, sta) + Math.max(0, sta - 20) * 10 + (flat.hp || 0);
  if (p.race === 'tauren') health = Math.floor(health * 1.05);

  // armor
  let itemArmorMul = 1;
  if (cls === 'warrior' || cls === 'paladin') itemArmorMul += 0.02 * T('toughness');
  if (cls === 'druid') itemArmorMul += (0.1 / 3) * T('thickHide');
  if (bear) itemArmorMul += 4;     // Dire Bear Form: +400% armor from items
  const itemArmor = gear.itemArmor * itemArmorMul;
  const armor = Math.round(itemArmor + agi * 2 + (flat.armor || 0));
  const armorReduction = Math.min(75, armor / (armor + 11960) * 100);   // vs a level 73 attacker: 467.5 * 73 - 22167.5

  // defense
  const defRating = flat.def || 0;
  const talentDef = (cls === 'warrior' || cls === 'paladin') ? 4 * T('anticipation') : 0;
  const defenseSkill = 350 + talentDef + defRating / R.defense;
  const defenseFloor = 350 + talentDef + Math.floor(defRating / R.defense);
  const defBonus = (defenseSkill - 350) * 0.04;

  // miss
  const miss = 5 + defBonus;
  note('miss', 'Base', 5); note('miss', 'Defense', defBonus);

  // dodge
  let dodge = base.dodge + agi / AGI_PER_DODGE[cls] + (flat.dodge || 0) / R.dodge + defBonus;
  note('dodge', 'Base', base.dodge); note('dodge', 'Agility', agi / AGI_PER_DODGE[cls]);
  note('dodge', 'Dodge rating', (flat.dodge || 0) / R.dodge); note('dodge', 'Defense', defBonus);
  if (p.race === 'nightelf') { dodge += 1; note('dodge', 'Quickness (Night Elf)', 1); }
  if (cls === 'druid' && bear) { dodge += 2 * T('feralSwiftness'); note('dodge', 'Feral Swiftness', 2 * T('feralSwiftness')); }

  // parry: needs a weapon you can parry with; bears can't parry
  const canParry = !bear && !!gear.weapon;
  let parry = 0;
  if (canParry) {
    const defl = T('deflection');
    parry = 5 + (flat.parry || 0) / R.parry + defl + defBonus;
    note('parry', 'Base', 5); note('parry', 'Parry rating', (flat.parry || 0) / R.parry); note('parry', 'Deflection', defl); note('parry', 'Defense', defBonus);
  }

  // block: needs a shield
  const canBlock = !!gear.shield && cls !== 'druid';
  let block = 0;
  let blockRating = flat.block || 0;
  const holyShieldOn = cls === 'paladin' && canBlock && p.opts.holyShield && T('holyShield') > 0 && mode !== 'passive';
  const shieldBlockOn = cls === 'warrior' && canBlock && p.opts.shieldBlock && mode !== 'passive';
  const redoubtOn = cls === 'paladin' && canBlock && p.opts.redoubt && T('redoubt') > 0 && mode === 'procs';
  if (holyShieldOn && gear.libramOfRepentance) blockRating += 42;
  if (canBlock) {
    block = 5 + blockRating / R.block + defBonus;
    note('block', 'Base', 5); note('block', 'Block rating', blockRating / R.block); note('block', 'Defense', defBonus);
    if (cls === 'warrior') { const s = T('shieldSpecialization'); block += s; note('block', 'Shield Specialization', s); }
    if (holyShieldOn) { block += 30; note('block', 'Holy Shield', 30); if (gear.libramOfRepentance) parts.block.find(b => b.label === 'Block rating')!.label = 'Block rating (incl. Libram of Repentance)'; }
    if (shieldBlockOn) { block += 75; note('block', 'Shield Block', 75); }
    if (redoubtOn) { const r = 6 * T('redoubt'); block += r; note('block', 'Redoubt (proc)', r); }
  }

  // block value: shield + items + strength/20, then multipliers
  let blockValue = 0;
  if (canBlock) {
    let bvMul = 1;
    if (cls === 'warrior') bvMul += 0.1 * T('shieldMastery');
    if (cls === 'paladin') bvMul += 0.1 * T('shieldSpecialization');
    if (gear.eternalMeta) bvMul += 0.1;
    blockValue = Math.floor(((flat.bv || 0) + str / 20) * bvMul);
  }

  // crit reduction
  const resilience = flat.res || 0;
  const critReduction = (defenseSkill - 350) * 0.04 + resilience / R.res + (cls === 'druid' ? T('survivalOfTheFittest') : 0);
  const critReductionSafe = (defenseFloor - 350) * 0.04 + resilience / R.res + (cls === 'druid' ? T('survivalOfTheFittest') : 0);
  note('crit', 'Defense', (defenseSkill - 350) * 0.04); note('crit', 'Resilience', resilience / R.res);
  if (cls === 'druid') note('crit', 'Survival of the Fittest', T('survivalOfTheFittest'));

  // a few offensive numbers for threat
  const hit = (flat.hit || 0) / R.hit + (cls === 'paladin' ? T('precision') : 0) + (cls === 'warrior' ? T('precision') : 0);
  const expertise = Math.floor((flat.exp || 0) / R.exp) + (cls === 'warrior' ? 2 * T('defiance') : 0) + (cls === 'paladin' ? T('combatExpertise') : 0);
  const ap = str * 2 + (flat.ap || 0) + (bear ? 210 + (flat.fap || 0) + 35 * T('predatoryStrikes') : 0);
  const crit = (flat.crit || 0) / R.crit + agi / AGI_PER_CRIT[cls];

  const total = miss + dodge + parry + block;
  return {
    cls, race: p.race, bear, str, agi, sta, int, spi, health, armor, armorReduction,
    defenseSkill, defenseFloor, defRating, miss, dodge, parry, block, total, canBlock, canParry,
    blockValue, critReduction, critReductionSafe, resilience, hit, expertise, ap, crit, parts,
    holyShieldOn, shieldBlockOn, redoubtOn, usesOn, gear,
  };
}

export interface Table { miss: number; dodge: number; parry: number; block: number; crit: number; crush: number; hit: number }

/** one white swing from a level 73 boss: the slices of the single roll, in order */
export function bossTable(s: Sheet): Table {
  const d = BOSS.perComponent;
  let left = 100;
  const take = (v: number) => { const x = Math.max(0, Math.min(left, v)); left -= x; return x; };
  const miss = take(s.miss - d);
  const dodge = take(s.dodge - d);
  const parry = s.canParry ? take(s.parry - d) : 0;
  const block = s.canBlock ? take(s.block - d) : 0;
  const crit = take(Math.max(0, BOSS.crit - s.critReduction));
  const crush = take(BOSS.crush);
  const hit = left;
  return { miss, dodge, parry, block, crit, crush, hit };
}

export interface Verdict {
  mode: Mode; total: number; short: number; uncrushable: boolean; table: Table;
}
export function verdict(p: Profile, mode: Mode): Verdict {
  const s = computeSheet(p, mode);
  const t = bossTable(s);
  return { mode, total: s.total, short: Math.max(0, BOSS.cap - s.total), uncrushable: s.total >= BOSS.cap - 1e-9, table: t };
}

/** what one point of each rating adds toward the cap for this character */
export function capValues(s: Sheet): { stat: string; label: string; perPoint: number; needed: number }[] {
  const short = Math.max(0, BOSS.cap - s.total);
  const comps = 2 + (s.canParry ? 1 : 0) + (s.canBlock ? 1 : 0);
  const rows = [
    { stat: 'block', label: 'Block rating', perPoint: s.canBlock ? 1 / R.block : 0 },
    { stat: 'def', label: 'Defense rating', perPoint: 0.04 * comps / R.defense },
    { stat: 'dodge', label: 'Dodge rating', perPoint: 1 / R.dodge },
    { stat: 'parry', label: 'Parry rating', perPoint: s.canParry ? 1 / R.parry : 0 },
    { stat: 'agi', label: 'Agility', perPoint: 1 / AGI_PER_DODGE[s.cls] },
  ].filter(r => r.perPoint > 0);
  return rows.map(r => ({ ...r, needed: short > 0 ? Math.ceil(short / r.perPoint) : 0 })).sort((a, b) => b.perPoint - a.perPoint);
}

export interface CritCap { reduction: number; needed: number; ok: boolean; rounding: boolean; defSkillNeeded: number; defRatingShort: number; resShort: number }
/** crit immunity uses whole defense points only, to be safe: the game may round fractional defense down */
export function critCap(s: Sheet): CritCap {
  const ok = s.critReductionSafe >= BOSS.crit - 1e-9;
  const rounding = !ok && s.critReduction >= BOSS.crit - 1e-9;
  const gap = Math.max(0, BOSS.crit - s.critReductionSafe);
  return {
    reduction: s.critReductionSafe, needed: BOSS.crit, ok, rounding,
    defSkillNeeded: s.cls === 'druid' ? 415 : 490,
    defRatingShort: Math.ceil(gap / 0.04 * R.defense), resShort: Math.ceil(gap * R.res),
  };
}

/** Illidan's Shear can't miss: only dodge, parry and block count */
export function shear(s: Sheet) {
  const v = s.dodge + (s.canParry ? s.parry : 0) + (s.canBlock ? s.block : 0);
  return { value: v, ok: v >= BOSS.shearCap - 1e-9, short: Math.max(0, BOSS.shearCap - v) };
}

/** talent points spent per tree */
export function treePoints(p: Profile): number[] {
  const trees = TALENTS[p.cls];
  return trees.map((t, i) => t.talents.reduce((n, tl) => n + (p.talents[`${i}.${tl.f}`] || 0), 0));
}
