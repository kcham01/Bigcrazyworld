// The game data. The big tables (every TBC item, gem, enchant, consumable and raid boss) are JSON files
// in web/data, loaded once at start (tools/gen_data.py makes them). Talents and base stats are bundled.
// Buffs, debuffs and world buffs are hand-written below with their TBC numbers.
import basesJson from './data/bases.json';
import talentsJson from './data/talents.json';

export type Stats = Record<string, number>;
export type ClassId = 'warrior' | 'paladin' | 'druid';
export type Slot = 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'wrist' | 'hands' | 'waist' | 'legs' | 'feet'
  | 'finger1' | 'finger2' | 'trinket1' | 'trinket2' | 'mainhand' | 'offhand' | 'ranged';

export interface Effect { kind: 'use' | 'proc'; stat: string; amount: number; dur?: number; cd?: number; note?: string }
export interface Item {
  id: number; n: string; s: string; q: number; il: number; ph: number; st: Stats; rl?: number;
  at?: string; wt?: string; ht?: 'mh' | 'oh' | '1h' | '2h'; rt?: string; u?: number; cl?: string[];
  so?: string[]; sb?: Stats; dmg?: [number, number, number]; ic: string;
  tt?: (string[])[]; drop?: string; chance?: string; setId?: number; fx?: Effect[];
}
/** b: [pieces, text, stats when the bonus is a plain stat ('beararmor' only counts in bear form)] */
export interface ItemSet { n: string; p: number[]; b: [number, string, Stats?][] }
export interface Gem { id: number; n: string; q: number; c: string; ph: number; st: Stats; u?: number; ic?: string; tx?: string; req?: string[]; prof?: string }
/** k is the app's own key for an enchant; id is the Wowhead item id (or spell id when `spell` is set, 0 = none) */
export interface Enchant {
  k: number; id: number; n: string; sl: string[]; st: Stats; req: number; src: string; tx: string;
  ic?: string; spell?: number; cl?: string; prof?: string; rep?: string;
  eff?: number;   // the game's own enchant id (as in item links), where known
}
export interface Consumable {
  id: number; n: string; c: 'flask' | 'battle' | 'guardian' | 'food' | 'scroll' | 'potion'; q: number; ic: string;
  st: Stats; tx: string; rl: number; where?: string; g?: string; dur?: number;
}
export interface BossAbility { n: string; id?: number; d?: string }
export interface Boss { id: number; n: string; raid: string; lvl: number; swing: number; dmg: [number, number] | null; note: string; ab: BossAbility[]; dw?: number }
export interface Talent { f: string; r: number; c: number; max: number; spells: number[]; req?: [number, number]; n: string; d: string[]; ic: string }
export interface TalentTree { name: string; talents: Talent[] }
export interface Base { hp: number; str: number; agi: number; sta: number; int: number; spi: number; dodge: number; ap: number; mana: number; crit: number; scrit: number }

export let ITEMS: Item[] = [];
export let SETS: Record<string, ItemSet> = {};
export let GEMS: Gem[] = [];
export let ENCHANTS: Enchant[] = [];
export let ENCHANT_ALIAS: Record<string, number> = {};
export let CONSUMABLES: Consumable[] = [];
export let BOSSES: Boss[] = [];
export const ITEM_BY_ID = new Map<number, Item>();
export const GEM_BY_ID = new Map<number, Gem>();
export const ENCHANT_BY_ID = new Map<number, Enchant>();      // by key k
export const CONSUMABLE_BY_ID = new Map<number, Consumable>();
export const BOSS_BY_ID = new Map<number, Boss>();
export const BASES: Record<ClassId, Record<string, Base>> = basesJson as any;
export const TALENTS: Record<ClassId, TalentTree[]> = talentsJson as any;

/** loads web/data/*.json through `read` (fetch in the app, the file system in tests) */
export async function loadData(read: (name: string) => Promise<any>) {
  const [items, gems, ench, cons, bosses] = await Promise.all(['items', 'gems', 'enchants', 'consumables', 'bosses'].map(n => read(n)));
  ITEMS = items.items; SETS = items.sets; GEMS = gems; ENCHANTS = ench.list; ENCHANT_ALIAS = ench.alias; CONSUMABLES = cons; BOSSES = bosses;
  ITEM_BY_ID.clear(); for (const i of ITEMS) ITEM_BY_ID.set(i.id, i);
  GEM_BY_ID.clear(); for (const g of GEMS) GEM_BY_ID.set(g.id, g);
  ENCHANT_BY_ID.clear(); for (const e of ENCHANTS) ENCHANT_BY_ID.set(e.k, e);
  CONSUMABLE_BY_ID.clear(); for (const c of CONSUMABLES) CONSUMABLE_BY_ID.set(c.id, c);
  BOSS_BY_ID.clear(); for (const b of BOSSES) BOSS_BY_ID.set(b.id, b);
}

export const CLASSES: { id: ClassId; name: string; color: string; icon: string }[] = [
  { id: 'warrior', name: 'Warrior', color: '#C79C6E', icon: 'classicon_warrior' },
  { id: 'paladin', name: 'Paladin', color: '#F58CBA', icon: 'classicon_paladin' },
  { id: 'druid', name: 'Druid', color: '#FF7D0A', icon: 'classicon_druid' },
];
export const RACE_NAMES: Record<string, string> = {
  human: 'Human', dwarf: 'Dwarf', nightelf: 'Night Elf', gnome: 'Gnome', draenei: 'Draenei',
  orc: 'Orc', undead: 'Undead', tauren: 'Tauren', troll: 'Troll', bloodelf: 'Blood Elf',
};
export const RACE_ICON: Record<string, string> = {
  human: 'race_human_male', dwarf: 'race_dwarf_male', nightelf: 'race_nightelf_male', gnome: 'race_gnome_male', draenei: 'race_draenei_male',
  orc: 'race_orc_male', undead: 'race_scourge_male', tauren: 'race_tauren_male', troll: 'race_troll_male', bloodelf: 'race_bloodelf_male',
};

export const SLOTS: { id: Slot; label: string; item: string }[] = [
  { id: 'head', label: 'Head', item: 'head' }, { id: 'neck', label: 'Neck', item: 'neck' },
  { id: 'shoulder', label: 'Shoulder', item: 'shoulder' }, { id: 'back', label: 'Back', item: 'back' },
  { id: 'chest', label: 'Chest', item: 'chest' }, { id: 'wrist', label: 'Wrist', item: 'wrist' },
  { id: 'hands', label: 'Hands', item: 'hands' }, { id: 'waist', label: 'Waist', item: 'waist' },
  { id: 'legs', label: 'Legs', item: 'legs' }, { id: 'feet', label: 'Feet', item: 'feet' },
  { id: 'finger1', label: 'Finger', item: 'finger' }, { id: 'finger2', label: 'Finger', item: 'finger' },
  { id: 'trinket1', label: 'Trinket', item: 'trinket' }, { id: 'trinket2', label: 'Trinket', item: 'trinket' },
  { id: 'mainhand', label: 'Main Hand', item: 'weapon' }, { id: 'offhand', label: 'Off Hand', item: 'weapon' },
  { id: 'ranged', label: 'Ranged', item: 'ranged' },
];

/** which weapon / armor / relic types each class can use */
export const WEAPONS: Record<ClassId, string[]> = {
  warrior: ['axe', 'mace', 'sword', 'dagger', 'fist', 'polearm', 'staff', 'shield', 'offhand'],
  paladin: ['axe', 'mace', 'sword', 'polearm', 'shield', 'offhand'],
  druid: ['mace', 'dagger', 'fist', 'polearm', 'staff', 'offhand'],
};
export const RANGED: Record<ClassId, string[]> = {
  warrior: ['bow', 'gun', 'crossbow', 'thrown'],
  paladin: ['libram'],
  druid: ['idol'],
};
export const ARMOR: Record<ClassId, string[]> = {
  warrior: ['cloth', 'leather', 'mail', 'plate'],
  paladin: ['cloth', 'leather', 'mail', 'plate'],
  druid: ['cloth', 'leather'],
};
export const BEST_ARMOR: Record<ClassId, string> = { warrior: 'plate', paladin: 'plate', druid: 'leather' };

export function canUse(cls: ClassId, it: Item, slot?: Slot): boolean {
  if (it.cl && !it.cl.includes(cls)) return false;
  if (it.at && !ARMOR[cls].includes(it.at)) return false;
  if (it.s === 'weapon') {
    if (it.wt && !WEAPONS[cls].includes(it.wt)) return false;
    if (slot === 'mainhand' && it.ht === 'oh') return false;
    if (slot === 'offhand') {
      if (it.ht !== 'oh' && !(it.ht === '1h' && cls === 'warrior')) return false;   // only warriors dual wield
    }
  }
  if (it.s === 'ranged' && it.rt && !RANGED[cls].includes(it.rt)) return false;
  return true;
}

export function slotAccepts(slot: Slot, it: Item): boolean {
  const def = SLOTS.find(s => s.id === slot)!;
  return def.item === it.s;
}

/** the enchant slots an item takes */
export function enchantSlotsOf(it: Item): string[] {
  if (it.s === 'weapon') {
    if (it.wt === 'shield') return ['shield'];
    if (it.wt === 'offhand') return [];
    return it.ht === '2h' ? ['weapon', '2h'] : ['weapon'];
  }
  if (it.s === 'ranged') return ['bow', 'gun', 'crossbow'].includes(it.rt || '') ? ['ranged'] : [];
  if (['neck', 'waist', 'trinket'].includes(it.s)) return [];
  return [it.s];
}

/** can this enchant go on this item? Returns null if yes, or the reason it can't. */
export function enchantProblem(e: Enchant, it: Item, cls: ClassId): string | null {
  const slots = enchantSlotsOf(it);
  if (!e.sl.some(x => slots.includes(x))) {
    if (e.sl.includes('2h') && it.s === 'weapon') return 'Two-handed weapons only';
    return 'Does not fit this item';
  }
  if (e.cl && e.cl !== cls) return `${e.cl[0].toUpperCase() + e.cl.slice(1)}s only`;
  if (e.req && it.il < e.req) return `Requires a level ${e.req} or higher item (this one is level ${it.il})`;
  return null;
}

export const QUALITY_COLOR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80'];

export const STAT_NAMES: Record<string, string> = {
  str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit', sp: 'Spell Damage', heal: 'Healing',
  mp5: 'Mana per 5 sec', hp5: 'Health per 5 sec', shit: 'Spell Hit Rating', scrit: 'Spell Crit Rating', shaste: 'Spell Haste Rating', spen: 'Spell Penetration',
  ap: 'Attack Power', hit: 'Hit Rating', crit: 'Crit Rating', haste: 'Haste Rating', arp: 'Armor Penetration', exp: 'Expertise Rating',
  armor: 'Armor', rap: 'Ranged Attack Power', rhit: 'Ranged Hit Rating', rcrit: 'Ranged Crit Rating', def: 'Defense Rating', block: 'Block Rating',
  bv: 'Block Value', dodge: 'Dodge Rating', parry: 'Parry Rating', res: 'Resilience Rating', hp: 'Health', arcres: 'Arcane Resistance',
  fireres: 'Fire Resistance', frostres: 'Frost Resistance', natres: 'Nature Resistance', shadres: 'Shadow Resistance', fap: 'Feral Attack Power',
  mana: 'Mana', arcsp: 'Arcane Spell Damage', firesp: 'Fire Spell Damage', frostsp: 'Frost Spell Damage', holysp: 'Holy Spell Damage',
  natsp: 'Nature Spell Damage', shadsp: 'Shadow Spell Damage', flat: 'Damage prevented per hit',
};

// ---------------------------------------------------------------- buffs (game numbers, checked against wowsims)
/**
 * st: flat stats (plus pseudo-stats: critpct, scritpct, hitpct, hitred, slow, apred). pct: multipliers
 * ('all' = the five primary stats, or 'str', 'sta', 'agi', 'ap', 'armor'). imp: the talented version, added
 * on top. proc: only counted in the "procs" view. excl: buffs sharing it don't stack (the largest counts).
 * flat: less damage per melee hit taken.
 */
export interface Buff {
  id: string; name: string; who: string; icon: string; text: string;
  st?: Stats; pct?: Record<string, number>; imp?: { name: string; st?: Stats; pct?: Record<string, number> };
  proc?: boolean; excl?: string; flat?: number;
}
export const RAID_BUFFS: Buff[] = [
  { id: 'kings', name: 'Blessing of Kings', who: 'Paladin', icon: 'spell_magic_greaterblessingofkings', pct: { all: 0.1 }, text: '+10% to all stats.' },
  { id: 'might', name: 'Blessing of Might', who: 'Paladin', icon: 'spell_holy_greaterblessingofkings', st: { ap: 220 }, imp: { name: 'Improved Blessing of Might', st: { ap: 44 } }, text: '+220 attack power (264 improved).' },
  { id: 'sanc', name: 'Blessing of Sanctuary', who: 'Paladin', icon: 'spell_holy_greaterblessingofsanctuary', flat: 80, text: 'Melee hits on you do up to 80 less damage; your blocks deal holy damage.' },
  { id: 'wisdom', name: 'Blessing of Wisdom', who: 'Paladin', icon: 'spell_holy_greaterblessingofwisdom', st: { mp5: 41 }, imp: { name: 'Improved Blessing of Wisdom', st: { mp5: 8 } }, text: '+41 mana every 5 sec.' },
  { id: 'shadowaura', name: 'Shadow Resistance Aura', who: 'Paladin', icon: 'spell_shadow_sealofkings', st: { shadres: 70 }, excl: 'shadres', text: '+70 shadow resistance. Does not stack with Shadow Protection.' },
  { id: 'frostaura', name: 'Frost Resistance Aura', who: 'Paladin', icon: 'spell_frost_wizardmark', st: { frostres: 70 }, excl: 'frostres', text: '+70 frost resistance. Does not stack with Frost Resistance Totem.' },
  { id: 'fireaura', name: 'Fire Resistance Aura', who: 'Paladin', icon: 'spell_fire_sealoffire', st: { fireres: 70 }, excl: 'fireres', text: '+70 fire resistance. Does not stack with Fire Resistance Totem.' },
  { id: 'devo', name: 'Devotion Aura', who: 'Paladin', icon: 'spell_holy_devotionaura', st: { armor: 861 }, imp: { name: 'Improved Devotion Aura', st: { armor: 344 } }, text: '+861 armor (1205 improved).' },
  { id: 'motw', name: 'Gift of the Wild', who: 'Druid', icon: 'spell_nature_giftofthewild', st: { str: 14, agi: 14, sta: 14, int: 14, spi: 14, armor: 340, arcres: 25, fireres: 25, frostres: 25, natres: 25, shadres: 25 },
    imp: { name: 'Improved Mark of the Wild', st: { str: 4, agi: 4, sta: 4, int: 4, spi: 4, armor: 119, arcres: 8, fireres: 8, frostres: 8, natres: 8, shadres: 8 } }, text: '+14 to all stats, +340 armor, +25 to all resistances (18 / 459 / 33 improved).' },
  { id: 'lotp', name: 'Leader of the Pack', who: 'Druid', icon: 'spell_nature_unyeildingstamina', st: { critpct: 5 }, text: '+5% melee and ranged crit. A feral druid with the talent gets it in form without this.' },
  { id: 'moonkin', name: 'Moonkin Aura', who: 'Druid', icon: 'spell_nature_moonglow', st: { scritpct: 5 }, text: '+5% spell crit.' },
  { id: 'fort', name: 'Prayer of Fortitude', who: 'Priest', icon: 'spell_holy_prayeroffortitude', st: { sta: 79 }, imp: { name: 'Improved Power Word: Fortitude', st: { sta: 23 } }, text: '+79 Stamina (102 improved).' },
  { id: 'spirit', name: 'Prayer of Spirit', who: 'Priest', icon: 'spell_holy_prayerofspirit', st: { spi: 50 }, text: '+50 Spirit.' },
  { id: 'shadowprot', name: 'Prayer of Shadow Protection', who: 'Priest', icon: 'spell_holy_prayerofshadowprotection', st: { shadres: 70 }, excl: 'shadres', text: '+70 shadow resistance. Does not stack with Shadow Resistance Aura.' },
  { id: 'inspiration', name: 'Inspiration', who: 'Priest', icon: 'spell_holy_layonhands', pct: { armor: 0.25 }, proc: true, excl: 'insp', text: '+25% armor for 15 sec after a critical heal on you. A proc: counted in the "procs" view.' },
  { id: 'ancfort', name: 'Ancestral Fortitude', who: 'Shaman', icon: 'spell_nature_undyingstrength', pct: { armor: 0.25 }, proc: true, excl: 'insp', text: '+25% armor for 15 sec after a critical heal on you. Does not stack with Inspiration.' },
  { id: 'cshout', name: 'Commanding Shout', who: 'Warrior', icon: 'ability_warrior_rallyingcry', st: { hp: 1080 }, imp: { name: 'Improved Commanding Shout', st: { hp: 270 } }, text: '+1080 maximum health (1350 improved).' },
  { id: 'bshout', name: 'Battle Shout', who: 'Warrior', icon: 'ability_warrior_battleshout', st: { ap: 305 }, imp: { name: 'Improved Battle Shout', st: { ap: 76 } }, text: '+305 attack power (381 improved).' },
  { id: 'bloodpact', name: 'Blood Pact', who: 'Warlock', icon: 'spell_shadow_bloodboil', st: { sta: 70 }, imp: { name: 'Improved Imp', st: { sta: 21 } }, text: '+70 Stamina from an Imp (91 improved).' },
  { id: 'goa', name: 'Grace of Air Totem', who: 'Shaman', icon: 'spell_nature_invisibilitytotem', st: { agi: 77 }, imp: { name: 'Enhancing Totems', st: { agi: 11 } }, text: '+77 Agility (88 improved).' },
  { id: 'soe', name: 'Strength of Earth Totem', who: 'Shaman', icon: 'spell_nature_earthbindtotem', st: { str: 86 }, imp: { name: 'Enhancing Totems', st: { str: 12 } }, text: '+86 Strength (98 improved).' },
  { id: 'firetotem', name: 'Fire Resistance Totem', who: 'Shaman', icon: 'spell_fireresistancetotem_01', st: { fireres: 70 }, excl: 'fireres', text: '+70 fire resistance. Does not stack with Fire Resistance Aura.' },
  { id: 'frosttotem', name: 'Frost Resistance Totem', who: 'Shaman', icon: 'spell_frostresistancetotem_01', st: { frostres: 70 }, excl: 'frostres', text: '+70 frost resistance. Does not stack with Frost Resistance Aura.' },
  { id: 'naturetotem', name: 'Nature Resistance Totem', who: 'Shaman', icon: 'spell_nature_natureresistancetotem', st: { natres: 70 }, excl: 'natres', text: '+70 nature resistance. Does not stack with Aspect of the Wild.' },
  { id: 'totemwrath', name: 'Totem of Wrath', who: 'Shaman', icon: 'spell_fire_totemofwrath', st: { scritpct: 3, shitpct: 3 }, text: '+3% spell hit and spell crit.' },
  { id: 'manaspring', name: 'Mana Spring Totem', who: 'Shaman', icon: 'spell_nature_manaregentotem', st: { mp5: 50 }, text: '+50 mana every 5 sec.' },
  { id: 'wrathair', name: 'Wrath of Air Totem', who: 'Shaman', icon: 'spell_nature_slowingtotem', st: { sp: 101, heal: 101 }, text: '+101 spell damage and healing.' },
  { id: 'urage', name: 'Unleashed Rage', who: 'Shaman', icon: 'spell_nature_unleashedrage', pct: { ap: 0.1 }, text: '+10% attack power.' },
  { id: 'aotw', name: 'Aspect of the Wild', who: 'Hunter', icon: 'spell_nature_protectionformnature', st: { natres: 70 }, excl: 'natres', text: '+70 nature resistance. Does not stack with Nature Resistance Totem.' },
  { id: 'trueshot', name: 'Trueshot Aura', who: 'Hunter', icon: 'ability_trueshot', st: { ap: 125, rap: 125 }, text: '+125 attack power.' },
  { id: 'brill', name: 'Arcane Brilliance', who: 'Mage', icon: 'spell_holy_arcaneintellect', st: { int: 40 }, text: '+40 Intellect.' },
  { id: 'heroic', name: 'Heroic Presence', who: 'Draenei', icon: 'inv_helmet_21', st: { hitpct: 1 }, text: '+1% chance to hit (party with a Draenei).' },
  { id: 'drumsbattle', name: 'Drums of Battle', who: 'Leatherworker', icon: 'inv_misc_drum_02', st: { haste: 80 }, proc: true, excl: 'drums', text: '+80 haste rating for 30 sec every 2 min. Counted in the "procs" view.' },
  { id: 'drumswar', name: 'Drums of War', who: 'Leatherworker', icon: 'inv_misc_drum_03', st: { ap: 60, rap: 60, sp: 30, heal: 30 }, proc: true, excl: 'drums', text: '+60 attack power, +30 spell damage for 30 sec every 2 min. Counted in the "procs" view.' },
  { id: 'braided', name: 'Braided Eternium Chain', who: 'Jewelcrafter', icon: 'inv_jewelry_necklace_29naxxramas', st: { crit: 28 }, text: '+28 crit rating (party).' },
];

export const DEBUFFS: Buff[] = [
  { id: 'insect', name: 'Insect Swarm', who: 'Druid', icon: 'spell_nature_insectswarm', st: { hitred: 2 }, excl: 'hitred', text: 'The boss has 2% less chance to hit: counts like 2% more miss on your table.' },
  { id: 'scorpid', name: 'Scorpid Sting', who: 'Hunter', icon: 'ability_hunter_criticalshot', st: { hitred: 5 }, excl: 'hitred', text: 'The boss has 5% less chance to hit. Does not stack with Insect Swarm.' },
  { id: 'tclap', name: 'Thunder Clap', who: 'Warrior', icon: 'spell_nature_thunderclap', st: { slow: 10 }, imp: { name: 'Improved Thunder Clap (3/3)', st: { slow: 10 } }, text: 'The boss attacks 10% slower (20% with 3/3 Improved Thunder Clap).' },
  { id: 'demoshout', name: 'Demoralizing Shout', who: 'Warrior', icon: 'ability_warrior_warcry', st: { apred: 300 }, imp: { name: 'Improved Demoralizing Shout', st: { apred: 120 } }, excl: 'demo', text: 'The boss has 300 less attack power (420 improved).' },
  { id: 'demoroar', name: 'Demoralizing Roar', who: 'Druid', icon: 'ability_druid_demoralizingroar', st: { apred: 248 }, imp: { name: 'Feral Aggression (5/5)', st: { apred: 99 } }, excl: 'demo', text: 'The boss has 248 less attack power (347 improved). Does not stack with Demoralizing Shout.' },
  { id: 'cow', name: 'Curse of Weakness', who: 'Warlock', icon: 'spell_shadow_curseofmannoroth', st: { apred: 350 }, imp: { name: 'Improved Curse of Weakness (2/2)', st: { apred: 70 } }, text: 'The boss has 350 less attack power (420 improved). Stacks with Demoralizing Shout.' },
];

/** world buffs: TBC Classic and Anniversary remove these when a raid boss encounter starts */
export const WORLD_BUFFS: Buff[] = [
  { id: 'w_ony', name: 'Rallying Cry of the Dragonslayer', who: 'Onyxia or Nefarian head', icon: 'inv_misc_head_dragon_01', st: { ap: 140, rap: 140, critpct: 5, scritpct: 10 }, text: '+140 attack power, +5% crit, +10% spell crit.' },
  { id: 'w_rend', name: "Warchief's Blessing", who: 'Rend head (Horde)', icon: 'spell_arcane_teleportorgrimmar', st: { hp: 300, mp5: 10 }, text: '+300 health, +15% melee haste, +10 mana every 5 sec.' },
  { id: 'w_zg', name: 'Spirit of Zandalar', who: 'Heart of Hakkar', icon: 'ability_creature_poison_05', pct: { all: 0.15 }, text: '+15% to all stats, +10% movement speed.' },
  { id: 'w_song', name: 'Songflower Serenade', who: 'Felwood', icon: 'spell_holy_mindvision', st: { str: 15, agi: 15, sta: 15, int: 15, spi: 15, critpct: 5, scritpct: 5 }, text: '+15 to all stats, +5% crit and spell crit.' },
  { id: 'w_fengus', name: "Fengus' Ferocity", who: 'Dire Maul tribute', icon: 'spell_nature_undyingstrength', st: { ap: 200, rap: 200 }, text: '+200 attack power.' },
  { id: 'w_moldar', name: "Mol'dar's Moxie", who: 'Dire Maul tribute', icon: 'spell_nature_massteleport', pct: { sta: 0.15 }, text: '+15% Stamina.' },
  { id: 'w_slipkik', name: "Slip'kik's Savvy", who: 'Dire Maul tribute', icon: 'spell_holy_lesserheal02', st: { scritpct: 3 }, text: '+3% spell crit.' },
  { id: 'w_dmf_sta', name: "Sayge's Dark Fortune of Stamina", who: 'Darkmoon Faire', icon: 'inv_misc_orb_02', pct: { sta: 0.1 }, excl: 'dmf', text: '+10% Stamina.' },
  { id: 'w_dmf_agi', name: "Sayge's Dark Fortune of Agility", who: 'Darkmoon Faire', icon: 'inv_misc_orb_02', pct: { agi: 0.1 }, excl: 'dmf', text: '+10% Agility.' },
  { id: 'w_dmf_str', name: "Sayge's Dark Fortune of Strength", who: 'Darkmoon Faire', icon: 'inv_misc_orb_02', pct: { str: 0.1 }, excl: 'dmf', text: '+10% Strength.' },
  { id: 'w_dmf_armor', name: "Sayge's Dark Fortune of Armor", who: 'Darkmoon Faire', icon: 'inv_misc_orb_02', pct: { armor: 0.1 }, excl: 'dmf', text: '+10% armor.' },
  { id: 'w_dmf_res', name: "Sayge's Dark Fortune of Resistance", who: 'Darkmoon Faire', icon: 'inv_misc_orb_02', st: { arcres: 25, fireres: 25, frostres: 25, natres: 25, shadres: 25 }, excl: 'dmf', text: '+25 to all resistances.' },
];
export const ALL_BUFFS: Buff[] = [...RAID_BUFFS, ...DEBUFFS, ...WORLD_BUFFS];
export const BUFF_BY_ID = new Map(ALL_BUFFS.map(b => [b.id, b]));

/** your own stances and cooldowns, per class */
export interface Ability { id: string; name: string; icon: string; text: string; mode: 'always' | 'cooldown' | 'procs'; talent?: string }
export const ABILITIES: Record<ClassId, Ability[]> = {
  warrior: [
    { id: 'defstance', name: 'Defensive Stance', icon: 'ability_warrior_defensivestance', text: '10% less damage taken.', mode: 'always' },
    { id: 'shieldBlock', name: 'Shield Block', icon: 'ability_defend', text: '+75% block for 5 sec, 1 block (2 blocks and 6 sec with Improved Shield Block). "Cooldown" and "procs" views.', mode: 'cooldown' },
    { id: 'laststand', name: 'Last Stand', icon: 'spell_holy_ashestoashes', text: '+30% maximum health for 20 sec. "Procs" view.', mode: 'procs', talent: 'lastStand' },
    { id: 'shieldwall', name: 'Shield Wall', icon: 'ability_warrior_shieldwall', text: '75% less damage taken for 10 sec. "Procs" view.', mode: 'procs' },
  ],
  paladin: [
    { id: 'rf', name: 'Righteous Fury', icon: 'spell_holy_sealoffury', text: 'With Improved Righteous Fury: 2% less damage taken per rank.', mode: 'always' },
    { id: 'holyShield', name: 'Holy Shield', icon: 'spell_holy_blessingofprotection', text: '+30% block for 10 sec, 4 blocks (+2 per Improved Holy Shield rank). "Cooldown" and "procs" views.', mode: 'cooldown', talent: 'holyShield' },
    { id: 'redoubt', name: 'Redoubt', icon: 'ability_defend', text: 'Hits on you have a 10% chance to give +6% block per rank for 10 sec or 5 blocks. "Procs" view.', mode: 'procs', talent: 'redoubt' },
  ],
  druid: [
    { id: 'bear', name: 'Dire Bear Form', icon: 'ability_racial_bearform', text: '+400% armor from items, +25% Stamina. Bears can\'t block or parry.', mode: 'always' },
  ],
};

export function iconUrl(icon: string, size: 'small' | 'medium' | 'large' = 'large'): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon}.jpg`;
}
export function wowheadItemUrl(id: number) { return `https://www.wowhead.com/tbc/item=${id}`; }
export function wowheadSpellUrl(id: number) { return `https://www.wowhead.com/tbc/spell=${id}`; }
export function wowheadSearchUrl(q: string) { return `https://www.wowhead.com/tbc/search?q=${encodeURIComponent(q)}`; }
export function wowheadNpcUrl(id: number) { return `https://www.wowhead.com/tbc/npc=${id}`; }
export function enchantUrl(e: Enchant) { return e.id ? (e.spell ? wowheadSpellUrl(e.id) : wowheadItemUrl(e.id)) : wowheadSearchUrl(e.n); }
