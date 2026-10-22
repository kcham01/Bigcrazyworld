// Saved characters, kept on the phone (localStorage), plus export / import as a text code.
import { BASES, ClassId, CONSUMABLES, ENCHANT_ALIAS, ITEMS, canUse, SLOTS, Slot, TALENTS } from './data';
import { Profile } from './engine';

const KEY = 'tbcc.profiles.v1';
const CUR = 'tbcc.current.v1';
export const PROFILE_VERSION = 2;

const consId = (name: string) => CONSUMABLES.find(c => c.n === name)?.id;

export function defaultAbilities(cls: ClassId): Record<string, boolean> {
  if (cls === 'warrior') return { defstance: true, shieldBlock: true };
  if (cls === 'paladin') return { rf: true, holyShield: true };
  return { bear: true };
}

export function newProfile(cls: ClassId, race: string, name: string): Profile {
  return {
    v: PROFILE_VERSION, id: Math.random().toString(36).slice(2, 10), name, cls, race, gear: {}, talents: {},
    buffs: {}, cons: {}, abil: defaultAbilities(cls),
    opts: { uses: {}, swing: 2.0, adds: 0 },
    updated: Date.now(),
  };
}

export function loadAll(): Profile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Profile[];
      if (Array.isArray(list) && list.length) return list.map(fixup);
    }
  } catch { /* storage blocked or broken: start fresh */ }
  return examples();
}
export function saveAll(list: Profile[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
export function loadCurrentId(): string | null { try { return localStorage.getItem(CUR); } catch { return null; } }
export function saveCurrentId(id: string) { try { localStorage.setItem(CUR, id); } catch { /* ignore */ } }

/** brings characters saved by older versions up to date */
export function fixup(p: any): Profile {
  if (!p.v || p.v < 2) {
    // version 1: consumables were buff ids, cooldowns were options, enchants were wowsims ids
    const old = p.buffs || {};
    const cons: any = {};
    const map: Record<string, [string, string]> = {
      flaskfort: ['flask', 'Flask of Fortification'], flaskchrom: ['flask', 'Flask of Chromatic Wonder'],
      majoragi: ['battle', 'Elixir of Major Agility'], mastery: ['battle', 'Elixir of Mastery'],
      majordef: ['guardian', 'Elixir of Major Defense'], ironskin: ['guardian', 'Elixir of Ironskin'], majorfort: ['guardian', 'Elixir of Major Fortitude'],
      foodsta: ['food', "Fisherman's Feast"], foodagi: ['food', 'Warp Burger'],
    };
    const buffs: Record<string, number> = {};
    for (const k in old) {
      if (map[k]) { const id = consId(map[k][1]); if (id) cons[map[k][0]] = id; }
      else buffs[k] = old[k];
    }
    p.buffs = buffs;
    p.cons = cons;
    const o = p.opts || {};
    p.abil = { ...defaultAbilities(p.cls), holyShield: o.holyShield !== false, shieldBlock: o.shieldBlock !== false, redoubt: !!o.redoubt, bear: p.cls === 'druid' ? o.bear !== false : false };
    for (const s in p.gear || {}) {
      const g = p.gear[s];
      if (g && g.ench) g.ench = ENCHANT_ALIAS[g.ench] || undefined;
    }
    p.v = PROFILE_VERSION;
  }
  p.opts = { uses: {}, swing: 2, adds: 0, ...(p.opts || {}) };
  p.buffs ||= {}; p.talents ||= {}; p.gear ||= {}; p.cons ||= {}; p.abil ||= defaultAbilities(p.cls);
  if (!BASES[p.cls as ClassId][p.race]) p.race = Object.keys(BASES[p.cls as ClassId])[0];
  return p as Profile;
}

export function exportCode(p: Profile): string {
  const json = JSON.stringify({ ...p, id: undefined });
  return 'TBCC1:' + btoa(unescape(encodeURIComponent(json)));
}
export function importCode(code: string): Profile | null {
  try {
    const body = code.trim().replace(/^TBCC1:/, '');
    const p = JSON.parse(decodeURIComponent(escape(atob(body))));
    if (!p || !['warrior', 'paladin', 'druid'].includes(p.cls)) return null;
    p.id = Math.random().toString(36).slice(2, 10);
    p.updated = Date.now();
    return fixup(p);
  } catch { return null; }
}

/** a talent build given as tree -> field -> rank, checked against the real trees */
function build(cls: ClassId, spec: Record<number, Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  const trees = TALENTS[cls];
  for (const ti in spec) for (const f in spec[ti]) {
    const t = trees[+ti].talents.find(x => x.f === f);
    if (t) out[`${ti}.${f}`] = Math.min(t.max, spec[ti][f]);
  }
  return out;
}

/** a typical raid: Kings, Mark, Fortitude, Devotion, Flask of Fortification and Fisherman's Feast */
export function raidSetup(p: Profile) {
  p.buffs = { kings: 1, motw: 2, fort: 2, devo: 1 };
  p.cons = { flask: consId('Flask of Fortification'), food: consId("Fisherman's Feast") };
  if (p.cls === 'warrior') p.buffs.cshout = 1;
}

/** example characters so the app opens with something on it (clearly named as examples) */
function examples(): Profile[] {
  const pal = newProfile('paladin', 'human', 'Example Paladin');
  pal.talents = build('paladin', {
    0: { divineStrength: 5, divineIntellect: 5 },
    1: { redoubt: 5, precision: 3, toughness: 5, blessingOfKings: 1, improvedRighteousFury: 3, shieldSpecialization: 3, anticipation: 5,
      spellWarding: 2, blessingOfSanctuary: 1, reckoning: 2, sacredDuty: 2, oneHandedWeaponSpecialization: 5,
      holyShield: 1, improvedHolyShield: 2, ardentDefender: 5, combatExpertise: 5, avengersShield: 1 },
  });
  pal.gear = autoGear(pal, 1);
  raidSetup(pal);

  const war = newProfile('warrior', 'human', 'Example Warrior');
  war.talents = build('warrior', {
    0: { improvedHeroicStrike: 3, deflection: 5, improvedThunderClap: 3 },
    2: { tacticalMastery: 3, anticipation: 5, shieldSpecialization: 5, toughness: 5, lastStand: 1, improvedShieldBlock: 1, defiance: 3,
      improvedSunderArmor: 3, improvedShieldWall: 2, concussionBlow: 1, shieldMastery: 3, oneHandedWeaponSpecialization: 5,
      improvedDefensiveStance: 3, shieldSlam: 1, focusedRage: 3, vitality: 5, devastate: 1 },
  });
  war.gear = autoGear(war, 1);
  raidSetup(war);

  const dru = newProfile('druid', 'tauren', 'Example Bear');
  dru.talents = build('druid', {
    1: { ferocity: 5, feralInstinct: 3, thickHide: 3, feralSwiftness: 2, feralCharge: 1, sharpenedClaws: 3, shreddingAttacks: 2,
      predatoryStrikes: 3, primalFury: 2, savageFury: 2, faerieFire: 1, heartOfTheWild: 5, survivalOfTheFittest: 3, leaderOfThePack: 1,
      improvedLeaderOfThePack: 2, predatoryInstincts: 5, mangle: 1, brutalImpact: 2 },
    2: { improvedMarkOfTheWild: 5, furor: 5, naturalist: 5 },
  });
  dru.gear = autoGear(dru, 1);
  raidSetup(dru);
  return [pal, war, dru];
}

/** picks the best avoidance item per slot from a phase (level 70 gear only), used for new and example characters */
export function autoGear(p: Profile, phase: number): Profile['gear'] {
  const gear: Profile['gear'] = {};
  const used = new Set<number>();
  const druid = p.cls === 'druid';
  const score = (st: Record<string, number>) => (st.def || 0) * 0.07 + (st.dodge || 0) * 0.053 + (st.parry || 0) * 0.042 + (st.block || 0) * (druid ? 0 : 0.127)
    + (st.agi || 0) * (druid ? 0.07 : 0.035) + (st.sta || 0) * 0.03 + (st.armor || 0) * (druid ? 0.004 : 0.0005);
  for (const s of SLOTS) {
    const slot = s.id as Slot;
    if (slot === 'offhand' && druid) continue;
    const pool = ITEMS.filter(it => it.s === s.item && Math.max(1, it.ph) <= phase && it.q >= 3 && (it.rl || 0) >= 68 && canUse(p.cls, it, slot)
      && (slot !== 'offhand' || it.wt === 'shield') && (slot !== 'mainhand' || (druid ? it.ht === '2h' : it.ht !== '2h'))
      && (!it.at || it.at === (druid ? 'leather' : 'plate') || !['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'].includes(it.s))
      && !(it.u && used.has(it.id)));
    pool.sort((a, b) => score(b.st) - score(a.st));
    const best = pool[0];
    if (best) { gear[slot] = { id: best.id }; used.add(best.id); }
  }
  return gear;
}
