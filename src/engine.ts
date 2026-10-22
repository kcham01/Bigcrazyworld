// The character sheet, the boss's attack table and the damage you take. Pure functions, no DOM.
//
// Against a boss (fights as level 73, weapon skill 365) a level 70 tank (defense 350) loses 0.6% from
// each of miss, dodge, parry and block. The character sheet shows values against a level 70, so the
// uncrushable target on the sheet is 102.4% (less any "chance to hit" debuffs on the boss). Crushing
// blows are a flat 15% from a level 73 attacker; they only disappear when miss + dodge + parry + block
// fill the whole table. Numbers and formulas follow the game and wowsims/tbc (checked in tests/run.ts).
import {
  ABILITIES, BASES, BOSS_BY_ID, BUFF_BY_ID, Buff, ClassId, CONSUMABLE_BY_ID, ENCHANT_BY_ID, GEM_BY_ID, Item, ITEM_BY_ID,
  SETS, Slot, Stats, TALENTS,
} from './data';

export const R = {
  defense: 2.3654, dodge: 18.9231, parry: 23.6538, block: 7.8846, hit: 15.7692, crit: 22.0769, spellHit: 12.6154,
  res: 39.4231, exp: 3.9423, haste: 15.7692,
};
export const AGI_PER_DODGE: Record<ClassId, number> = { warrior: 30, paladin: 25, druid: 14.7059 };
export const AGI_PER_CRIT: Record<ClassId, number> = { warrior: 33, paladin: 25, druid: 25 };
export const INT_PER_SPELL_CRIT: Record<ClassId, number> = { warrior: 0, paladin: 80, druid: 79.4 };
/** the default boss: a level 73 raid boss swinging every 2 seconds */
export const BOSS = { level: 73, crush: 15, crit: 5.6, cap: 102.4, shearCap: 101.8 };

export interface GearPiece { id: number; gems?: number[]; ench?: number }
export interface Consumes { flask?: number; battle?: number; guardian?: number; food?: number; scrolls?: number[]; potion?: number }
export interface Profile {
  v?: number; id: string; name: string; cls: ClassId; race: string;
  gear: Partial<Record<Slot, GearPiece>>;
  talents: Record<string, number>;            // "tree.field" -> rank
  buffs: Record<string, number>;              // raid / world buff or boss debuff id -> 1 (on) or 2 (improved)
  cons: Consumes;
  abil: Record<string, boolean>;              // own stances and cooldowns
  opts: { uses: Record<string, boolean>; swing: number; adds: number; boss?: number };
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
  st: Stats; itemArmor: number; shield: Item | null; weapon: Item | null; ranged: Item | null; twoHand: boolean;
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
    // armor on items (and armor enchants) is "armor from items" for talents and Dire Bear Form, as in wowsims
    const st2 = { ...it.st };
    if (st2.armor) { itemArmor += st2.armor; delete st2.armor; }
    add(st, st2);
    if (it.setId) setCounts[it.setId] = (setCounts[it.setId] || 0) + 1;
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
    if (g.ench) {
      const e = ENCHANT_BY_ID.get(g.ench);
      if (e) {
        const es = { ...e.st };
        if (es.armor) { itemArmor += es.armor; delete es.armor; }
        add(st, es);
      }
    }
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
    for (const [n, text, bst] of set.b) if (setCounts[sid] >= n) { setBonuses.push({ set: set.n, count: n, text }); add(st, bst); }
  }
  const twoHand = !!(weapon && weapon.ht === '2h');
  const ranged = p.gear.ranged ? ITEM_BY_ID.get(p.gear.ranged.id) || null : null;
  return {
    st, itemArmor, shield: twoHand ? null : shield, weapon, ranged, twoHand, meta: m, colorCounts, setCounts, setBonuses,
    libramOfRepentance: ranged?.id === 29388, eternalMeta, socketsMatched, uniqueClash,
  };
}

/** buffs that are on, with "doesn't stack" groups resolved (the larger one counts) */
export function activeBuffs(p: Profile, mode: Mode): { b: Buff; imp: boolean }[] {
  const on: { b: Buff; imp: boolean }[] = [];
  const best: Record<string, { b: Buff; imp: boolean; v: number }> = {};
  for (const id in p.buffs) {
    const lvl = p.buffs[id];
    const b = BUFF_BY_ID.get(id);
    if (!b || !lvl) continue;
    if (b.proc && mode !== 'procs') continue;
    const imp = lvl === 2 && !!b.imp;
    if (b.excl) {
      const v = Object.values(b.st || {}).reduce((s, x) => s + x, 0) + Object.values(b.pct || {}).reduce((s, x) => s + x, 0) * 1000
        + (imp ? Object.values(b.imp!.st || {}).reduce((s, x) => s + x, 0) : 0);
      if (!best[b.excl] || best[b.excl].v < v) best[b.excl] = { b, imp, v };
      continue;
    }
    on.push({ b, imp });
  }
  for (const k in best) on.push({ b: best[k].b, imp: best[k].imp });
  return on;
}

/** the boss you are tanking (or a default level 73 boss), with debuffs on it */
export interface BossCtx {
  level: number; swing: number; baseSwing: number; dmg: [number, number] | null; hitRed: number; apRed: number; slow: number;
  attackers: number; name: string; dualWield: boolean; deficit: number; crush: number; critBase: number;
}
export function bossCtx(p: Profile): BossCtx {
  const boss = p.opts.boss ? BOSS_BY_ID.get(p.opts.boss) : undefined;
  let hitRed = 0, apRed = 0, slow = 0;
  for (const { b, imp } of activeBuffs(p, 'procs')) {
    const st = { ...(b.st || {}) };
    if (imp) add(st, b.imp!.st);
    hitRed += st.hitred || 0; apRed += st.apred || 0; slow += st.slow || 0;
  }
  const level = boss ? boss.lvl : BOSS.level;
  const baseSwing = boss ? boss.swing : (p.opts.swing || 2);
  const swing = baseSwing / (1 - slow / 100);
  const deficit = Math.max(0, (level * 5 - 350) * 0.04);
  return {
    level, baseSwing, swing, dmg: boss ? boss.dmg : null, hitRed, apRed, slow, attackers: 1 + (p.opts.adds || 0) + (boss?.dw ? 1 : 0),
    name: boss ? boss.n : 'a level 73 boss', dualWield: !!boss?.dw, deficit,
    crush: level - 70 >= 3 ? Math.max(0, (level * 5 - 350) * 2 - 15) : 0,
    critBase: 5 + deficit,
  };
}

export interface Breakdown { label: string; value: number }
export interface Sheet {
  cls: ClassId; race: string; bear: boolean;
  str: number; agi: number; sta: number; int: number; spi: number;
  health: number; armor: number; armorReduction: number;
  defenseSkill: number; defenseFloor: number; defRating: number;
  miss: number; dodge: number; parry: number; block: number; total: number;
  canBlock: boolean; canParry: boolean;
  blockValue: number; bvMul: number; critReduction: number; critReductionSafe: number; resilience: number;
  hit: number; expertise: number; ap: number; crit: number; haste: number;
  rap: number; rhit: number; rcrit: number; rangedSpeed: number; rangedDmg: [number, number] | null; hasRanged: boolean;
  sp: number; heal: number; shit: number; scrit: number; shaste: number; mp5: number; mana: number;
  resist: Record<string, number>;
  dmgTakenMult: number; flatReduction: number;
  parts: Record<string, Breakdown[]>;
  holyShieldOn: boolean; shieldBlockOn: boolean; redoubtOn: boolean; usesOn: string[];
  gear: GearSum;
}

export type Mode = 'passive' | 'cooldown' | 'procs';

/**
 * The character sheet. mode: 'passive' = gear, talents, buffs and consumables; 'cooldown' adds Holy Shield or
 * Shield Block if switched on; 'procs' also adds Redoubt, proc buffs, potions, on-use trinkets and cooldowns.
 */
export function computeSheet(p: Profile, mode: Mode = 'procs'): Sheet {
  const cls = p.cls;
  const base = BASES[cls][p.race] || Object.values(BASES[cls])[0];
  const gear = sumGear(p);
  const parts: Record<string, Breakdown[]> = {};
  const note = (k: string, label: string, value: number) => { if (Math.abs(value) > 1e-9) (parts[k] ||= []).push({ label, value }); };
  const bear = cls === 'druid' && !!p.abil.bear;
  const T = (f: string) => talentRank(p, f);
  const ab = (id: string) => !!p.abil[id];

  // flat stats: gear, buffs, consumables
  const flat: Stats = { ...gear.st };
  const pct: Record<string, number> = {};
  const mulPct = (k: string, v: number) => { pct[k] = (1 + (pct[k] || 0)) * (1 + v) - 1; };
  let flatReduction = 0;
  for (const { b, imp } of activeBuffs(p, mode)) {
    add(flat, b.st);
    if (imp) add(flat, b.imp!.st);
    for (const k in b.pct || {}) mulPct(k, b.pct![k]);
    if (imp) for (const k in b.imp!.pct || {}) mulPct(k, b.imp!.pct![k]);
    flatReduction += b.flat || 0;
  }
  const c = p.cons || {};
  const consIds = [c.flask, c.flask ? undefined : c.battle, c.flask ? undefined : c.guardian, c.food, ...(c.scrolls || [])];
  if (mode === 'procs' && c.potion) consIds.push(c.potion);
  for (const id of consIds) {
    const x = id ? CONSUMABLE_BY_ID.get(id) : undefined;
    if (!x) continue;
    add(flat, x.st);
    flatReduction += x.st.flat || 0;
  }
  // on-use trinkets switched on (procs view)
  const usesOn: string[] = [];
  if (mode === 'procs') {
    for (const slot of ['trinket1', 'trinket2'] as Slot[]) {
      const g = p.gear[slot];
      const it = g && ITEM_BY_ID.get(g.id);
      if (!it || !it.fx || !p.opts.uses[String(it.id)]) continue;
      for (const e of it.fx) flat[e.stat] = (flat[e.stat] || 0) + e.amount;
      usesOn.push(it.n);
    }
  }

  // primary stats with % modifiers
  const mul: Record<string, number> = { str: 1, agi: 1, sta: 1, int: 1, spi: 1 };
  for (const k of ['str', 'agi', 'sta', 'int', 'spi']) mul[k] *= (1 + (pct.all || 0)) * (1 + (pct[k] || 0));
  if (cls === 'warrior') { mul.sta *= 1 + 0.01 * T('vitality'); mul.str *= 1 + 0.02 * T('vitality'); }
  if (cls === 'paladin') {
    mul.str *= 1 + 0.02 * T('divineStrength'); mul.int *= 1 + 0.02 * T('divineIntellect');
    mul.sta *= 1 + 0.03 * T('sacredDuty'); mul.sta *= 1 + 0.02 * T('combatExpertise');
  }
  if (cls === 'druid') {
    const sotf = 1 + 0.01 * T('survivalOfTheFittest');
    for (const k in mul) mul[k] *= sotf;
    mul.int *= 1 + 0.04 * T('heartOfTheWild');
    if (bear) { mul.sta *= 1 + 0.04 * T('heartOfTheWild'); mul.sta *= 1.25; }
  }
  const str = (base.str + (flat.str || 0)) * mul.str;
  const agi = (base.agi + (flat.agi || 0)) * mul.agi;
  const sta = (base.sta + (flat.sta || 0)) * mul.sta;
  const int = (base.int + (flat.int || 0)) * mul.int;
  const spi = (base.spi + (flat.spi || 0)) * mul.spi;

  // health: wowsims' base health already counts the first 20 stamina as 10 health each
  let health = base.hp + sta * 10 + (flat.hp || 0);
  if (p.race === 'tauren') health *= 1.05;
  if (mode === 'procs' && cls === 'warrior' && ab('laststand') && T('lastStand') > 0) health *= 1.3;

  // armor: items x talents (x5 in Dire Bear Form, Thick Hide on top), + 2 per agility, + buffs
  let itemArmorMul = 1;
  if (cls === 'warrior' || cls === 'paladin') itemArmorMul += 0.02 * T('toughness');
  if (cls === 'druid') itemArmorMul = (bear ? 5 : 1) * (1 + [0, 0.04, 0.07, 0.10][Math.min(3, T('thickHide'))]);
  const bonusArmor = (flat.armor || 0) + (bear ? flat.beararmor || 0 : 0);
  const armor = (gear.itemArmor * itemArmorMul + agi * 2 + bonusArmor) * (1 + (pct.armor || 0));
  const bc = bossCtx(p);
  const armorConst = 467.5 * bc.level - 22167.5;
  const armorReduction = Math.min(75, armor / (armor + armorConst) * 100);
  note('armor', 'Armor from items', gear.itemArmor * itemArmorMul); note('armor', 'Agility', agi * 2); note('armor', 'Bonus armor (buffs, set bonuses, consumables)', bonusArmor);

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

  // parry: needs a weapon; bears can't parry
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
  const holyShieldOn = cls === 'paladin' && canBlock && ab('holyShield') && T('holyShield') > 0 && mode !== 'passive';
  const shieldBlockOn = cls === 'warrior' && canBlock && ab('shieldBlock') && mode !== 'passive';
  const redoubtOn = cls === 'paladin' && canBlock && ab('redoubt') && T('redoubt') > 0 && mode === 'procs';
  if (holyShieldOn && gear.libramOfRepentance) blockRating += 42;
  if (canBlock) {
    block = 5 + blockRating / R.block + defBonus;
    note('block', 'Base', 5); note('block', gear.libramOfRepentance && holyShieldOn ? 'Block rating (incl. Libram of Repentance)' : 'Block rating', blockRating / R.block); note('block', 'Defense', defBonus);
    if (cls === 'warrior') { const s = T('shieldSpecialization'); block += s; note('block', 'Shield Specialization', s); }
    if (holyShieldOn) { block += 30; note('block', 'Holy Shield', 30); }
    if (shieldBlockOn) { block += 75; note('block', 'Shield Block', 75); }
    if (redoubtOn) { const r = 6 * T('redoubt'); block += r; note('block', 'Redoubt (proc)', r); }
  }

  // block value, as the game server works it out (cmangos Player::GetShieldBlockValue, every class with a shield):
  // (items + strength / 20 - 1) x talents and meta gem, rounded down
  let blockValue = 0, bvMul = 1;
  if (canBlock) {
    if (cls === 'warrior') bvMul += 0.1 * T('shieldMastery');
    if (cls === 'paladin') bvMul += 0.1 * T('shieldSpecialization');
    if (gear.eternalMeta) bvMul *= 1.1;            // percent modifiers multiply on the server
    blockValue = Math.max(0, Math.floor(((flat.bv || 0) + str / 20 - 1) * bvMul + 1e-9));
    note('bv', 'Shield and gear', flat.bv || 0); note('bv', 'Strength / 20 - 1', str / 20 - 1);
    if (bvMul !== 1) note('bv', `Talents and meta gem (x${bvMul.toFixed(2)})`, ((flat.bv || 0) + str / 20 - 1) * (bvMul - 1));
  }

  // crit reduction
  const resilience = flat.res || 0;
  const sotf = cls === 'druid' ? T('survivalOfTheFittest') : 0;
  const critReduction = (defenseSkill - 350) * 0.04 + resilience / R.res + sotf;
  const critReductionSafe = (defenseFloor - 350) * 0.04 + resilience / R.res + sotf;
  note('crit', 'Defense', (defenseSkill - 350) * 0.04); note('crit', 'Resilience', resilience / R.res);
  if (cls === 'druid') note('crit', 'Survival of the Fittest', sotf);

  // melee
  const precision = (cls === 'paladin' || cls === 'warrior') ? T('precision') : 0;
  const hit = (flat.hit || 0) / R.hit + precision + (flat.hitpct || 0);
  const expertise = Math.floor((flat.exp || 0) / R.exp) + (cls === 'warrior' ? 2 * T('defiance') : 0) + (cls === 'paladin' ? T('combatExpertise') : 0);
  const ownLotp = cls === 'druid' && T('leaderOfThePack') > 0 && bear && !p.buffs.lotp ? 5 : 0;
  const crit = base.crit + agi / AGI_PER_CRIT[cls] + (flat.crit || 0) / R.crit + (flat.critpct || 0) + ownLotp + (bear ? 2 * T('sharpenedClaws') : 0);
  let ap = base.ap + str * 2 + (flat.ap || 0);
  if (bear) ap += 210 + (flat.fap || 0) + 35 * T('predatoryStrikes');
  ap *= 1 + (pct.ap || 0);
  const haste = (flat.haste || 0) / R.haste;

  // ranged (warriors shoot; paladins and druids hold a relic)
  const rw = gear.ranged;
  const hasRanged = cls === 'warrior' && !!rw && !!rw.dmg;
  const rap = cls === 'warrior' ? (agi + 60 + (flat.rap || 0)) * (1 + (pct.ap || 0)) : 0;
  const rhit = ((flat.hit || 0) + (flat.rhit || 0)) / R.hit + (flat.hitpct || 0);
  const rcrit = base.crit + agi / AGI_PER_CRIT[cls] + ((flat.crit || 0) + (flat.rcrit || 0)) / R.crit + (flat.critpct || 0);

  // spells
  const sp = (flat.sp || 0);
  const heal = (flat.heal || 0);
  const shit = (flat.shit || 0) / R.spellHit + (flat.hitpct || 0) + (flat.shitpct || 0);
  const scrit = cls === 'warrior' ? 0 : base.scrit + (INT_PER_SPELL_CRIT[cls] ? int / INT_PER_SPELL_CRIT[cls] : 0) + (flat.scrit || 0) / R.crit + (flat.scritpct || 0);
  const shaste = (flat.shaste || 0) / R.haste;
  const mana = cls === 'warrior' ? 0 : base.mana + int * 15 + (flat.mana || 0);
  const mp5 = flat.mp5 || 0;

  // damage taken modifiers
  let dmgTakenMult = 1;
  if (cls === 'warrior' && ab('defstance')) dmgTakenMult *= 0.9;
  if (cls === 'paladin' && ab('rf')) dmgTakenMult *= 1 - 0.02 * T('improvedRighteousFury');
  if (mode === 'procs' && cls === 'warrior' && ab('shieldwall')) dmgTakenMult *= 0.25;

  const resist: Record<string, number> = {};
  for (const k of ['arcres', 'fireres', 'natres', 'frostres', 'shadres']) resist[k] = flat[k] || 0;

  const total = miss + dodge + parry + block;
  return {
    cls, race: p.race, bear, str, agi, sta, int, spi, health, armor, armorReduction,
    defenseSkill, defenseFloor, defRating, miss, dodge, parry, block, total, canBlock, canParry,
    blockValue, bvMul, critReduction, critReductionSafe, resilience, hit, expertise, ap, crit, haste,
    rap, rhit, rcrit, rangedSpeed: rw?.dmg ? rw.dmg[2] : 0, rangedDmg: rw?.dmg ? [rw.dmg[0], rw.dmg[1]] : null, hasRanged,
    sp, heal, shit, scrit, shaste, mp5, mana, resist, dmgTakenMult, flatReduction,
    parts, holyShieldOn, shieldBlockOn, redoubtOn, usesOn, gear,
  };
}

export interface Table { miss: number; dodge: number; parry: number; block: number; crit: number; crush: number; hit: number }

/** one white swing from the boss: the slices of the single roll, in order */
export function bossTable(s: Sheet, bc: BossCtx): Table {
  const d = bc.deficit;
  let left = 100;
  const take = (v: number) => { const x = Math.max(0, Math.min(left, v)); left -= x; return x; };
  const miss = take(s.miss - d + bc.hitRed);
  const dodge = take(s.dodge - d);
  const parry = s.canParry ? take(s.parry - d) : 0;
  const block = s.canBlock ? take(s.block - d) : 0;
  const crit = take(Math.max(0, bc.critBase - s.critReduction));
  const crush = take(bc.crush);
  const hit = left;
  return { miss, dodge, parry, block, crit, crush, hit };
}

/** the sheet total you need so crushing blows (or, without crushes, normal hits) are off the table */
export function capFor(s: Sheet, bc: BossCtx): number {
  const comps = 2 + (s.canParry ? 1 : 0) + (s.canBlock ? 1 : 0);
  return 100 + bc.deficit * comps - bc.hitRed;
}

export interface Verdict { mode: Mode; total: number; cap: number; short: number; uncrushable: boolean; table: Table; crushes: boolean }
export function verdict(p: Profile, mode: Mode): Verdict {
  const s = computeSheet(p, mode);
  const bc = bossCtx(p);
  const t = bossTable(s, bc);
  const cap = capFor(s, bc);
  return { mode, total: s.total, cap, short: Math.max(0, cap - s.total), uncrushable: s.total >= cap - 1e-9, table: t, crushes: bc.crush > 0 };
}

/** what one point of each rating adds toward the cap for this character */
export function capValues(s: Sheet, bc: BossCtx): { stat: string; label: string; perPoint: number; needed: number }[] {
  const short = Math.max(0, capFor(s, bc) - s.total);
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
export function critCap(s: Sheet, bc: BossCtx): CritCap {
  const need = bc.critBase;
  const ok = s.critReductionSafe >= need - 1e-9;
  const rounding = !ok && s.critReduction >= need - 1e-9;
  const gap = Math.max(0, need - s.critReductionSafe);
  const sotf = s.cls === 'druid' ? (s.parts.crit || []).find(x => x.label === 'Survival of the Fittest')?.value || 0 : 0;
  return {
    reduction: s.critReductionSafe, needed: need, ok, rounding,
    defSkillNeeded: Math.ceil(350 + (need - sotf) / 0.04 - 1e-9),
    defRatingShort: Math.ceil(gap / 0.04 * R.defense), resShort: Math.ceil(gap * R.res),
  };
}

/** attacks that can't miss (Illidan's Shear): only dodge, parry and block count */
export function shear(s: Sheet, bc: BossCtx) {
  const comps = 1 + (s.canParry ? 1 : 0) + (s.canBlock ? 1 : 0);
  const cap = 100 + bc.deficit * comps;
  const v = s.dodge + (s.canParry ? s.parry : 0) + (s.canBlock ? s.block : 0);
  return { value: v, cap, ok: v >= cap - 1e-9, short: Math.max(0, cap - v) };
}

export interface Intake {
  raw: [number, number] | null; perHit: number; perSwing: number; perSecond: number; crushHit: number; critHit: number; blockedHit: number;
  hitsToKill: number; effectiveHealth: number; swing: number;
}
/**
 * Melee damage from the boss: its hit range (cmangos data) less attack power debuffs, then your armor and
 * damage reduction, averaged over the attack table. Without boss data, per 10,000 damage before armor.
 */
export function intake(s: Sheet, bc: BossCtx, t: Table): Intake {
  const raw: [number, number] | null = bc.dmg;
  const avgRaw = raw ? (raw[0] + raw[1]) / 2 : 10000;
  const apLoss = bc.apRed / 14 * bc.baseSwing;
  const unmit = Math.max(0, avgRaw - apLoss);
  const mit = (1 - s.armorReduction / 100) * s.dmgTakenMult;
  const perHit = Math.max(0, unmit * mit - s.flatReduction);
  const critHit = Math.max(0, unmit * 2 * mit - s.flatReduction);
  const crushHit = Math.max(0, unmit * 1.5 * mit - s.flatReduction);
  const blockedHit = Math.max(0, perHit - s.blockValue);
  const perSwing = (t.hit * perHit + t.crit * critHit + t.crush * crushHit + t.block * blockedHit) / 100;
  const perSecond = perSwing / bc.swing * (bc.dualWield ? 1.5 : 1);
  return {
    raw, perHit, perSwing, perSecond, crushHit, critHit, blockedHit, swing: bc.swing,
    hitsToKill: perHit > 0 ? Math.ceil(s.health / perHit) : Infinity,
    effectiveHealth: s.health / mit,
  };
}

/** talent points spent per tree */
export function treePoints(p: Profile): number[] {
  const trees = TALENTS[p.cls];
  return trees.map((t, i) => t.talents.reduce((n, tl) => n + (p.talents[`${i}.${tl.f}`] || 0), 0));
}

export function abilitiesFor(p: Profile) { return ABILITIES[p.cls]; }
