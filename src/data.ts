// The game data the app ships with (made by tools/gen_data.py from wowsims/tbc and oppahansi/ltc)
// plus the hand-written tables: buffs, consumables, races.
import itemsJson from './data/items.json';
import gemsJson from './data/gems.json';
import enchantsJson from './data/enchants.json';
import basesJson from './data/bases.json';
import talentsJson from './data/talents.json';

export type Stats = Record<string, number>;
export type ClassId = 'warrior' | 'paladin' | 'druid';
export type Slot = 'head' | 'neck' | 'shoulder' | 'back' | 'chest' | 'wrist' | 'hands' | 'waist' | 'legs' | 'feet'
  | 'finger1' | 'finger2' | 'trinket1' | 'trinket2' | 'mainhand' | 'offhand' | 'ranged';

export interface Effect { kind: 'use' | 'proc'; stat: string; amount: number; dur?: number; cd?: number; note?: string }
export interface Item {
  id: number; n: string; s: string; q: number; il: number; ph: number; st: Stats;
  at?: string; wt?: string; ht?: 'mh' | 'oh' | '1h' | '2h'; rt?: string; u?: number; cl?: string[];
  so?: string[]; sb?: Stats; dmg?: [number, number, number]; ic: string;
  tt?: (string[])[]; drop?: string; chance?: string; setId?: number; fx?: Effect[];
}
export interface ItemSet { n: string; p: number[]; b: [number, string][] }
export interface Gem { id: number; n: string; q: number; c: string; ph: number; st: Stats; u?: number; ic?: string; tx?: string; req?: string[] }
export interface Enchant { id: number; eff: number; n: string; s: string; q: number; st: Stats; spell?: number; cl?: string[]; shield?: number; twohand?: number; ic?: string }
export interface Talent { f: string; r: number; c: number; max: number; spells: number[]; req?: [number, number]; n: string; d: string[]; ic: string }
export interface TalentTree { name: string; talents: Talent[] }

export const ITEMS: Item[] = (itemsJson as any).items;
export const SETS: Record<string, ItemSet> = (itemsJson as any).sets;
export const GEMS: Gem[] = gemsJson as any;
// tank enchants the wowsims data leaves out (ids are the enchanting spells, for the Wowhead links)
const EXTRA_ENCHANTS: Enchant[] = [
  { id: 27946, eff: 0, n: 'Enchant Shield - Shield Block', s: 'weapon', q: 2, st: { block: 15 }, spell: 1, shield: 1 },
  { id: 27961, eff: 0, n: 'Enchant Cloak - Major Armor', s: 'back', q: 2, st: { armor: 120 }, spell: 1 },
  { id: 27962, eff: 0, n: 'Enchant Cloak - Major Resistance', s: 'back', q: 2, st: { arcres: 7, fireres: 7, frostres: 7, natres: 7, shadres: 7 }, spell: 1 },
];
export const ENCHANTS: Enchant[] = [...(enchantsJson as any as Enchant[]), ...EXTRA_ENCHANTS.filter(x => !(enchantsJson as any as Enchant[]).some(e => e.id === x.id))];
export const BASES: Record<ClassId, Record<string, { hp: number; str: number; agi: number; sta: number; int: number; spi: number; dodge: number }>> = basesJson as any;
export const TALENTS: Record<ClassId, TalentTree[]> = talentsJson as any;

export const ITEM_BY_ID = new Map<number, Item>(ITEMS.map(i => [i.id, i]));
export const GEM_BY_ID = new Map<number, Gem>(GEMS.map(g => [g.id, g]));
export const ENCHANT_BY_ID = new Map<number, Enchant>(ENCHANTS.map(e => [e.id, e]));

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
export const RACIAL_TEXT: Record<string, string> = {
  human: 'Perception, The Human Spirit (+10% Spirit), Sword and Mace Specialization',
  dwarf: 'Stoneform (removes bleeds and poisons, +10% armor for 8 sec), Gun Specialization, Frost Resistance',
  nightelf: 'Quickness: +1% chance to dodge. Shadowmeld, Nature Resistance',
  gnome: 'Escape Artist, Expansive Mind, Arcane Resistance',
  draenei: 'Heroic Presence (+1% hit for your party), Gift of the Naaru, Shadow Resistance',
  orc: 'Blood Fury, Hardiness (+25% stun resistance), Axe Specialization',
  undead: 'Will of the Forsaken, Cannibalize, Shadow Resistance',
  tauren: 'Endurance: +5% maximum health. War Stomp, Nature Resistance',
  troll: 'Berserking, Regeneration, Bow and Thrown Specialization',
  bloodelf: 'Arcane Torrent, Magic Resistance',
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
const WEAPONS: Record<ClassId, string[]> = {
  warrior: ['axe', 'mace', 'sword', 'dagger', 'fist', 'polearm', 'staff', 'shield', 'offhand'],
  paladin: ['axe', 'mace', 'sword', 'polearm', 'shield', 'offhand'],
  druid: ['mace', 'dagger', 'fist', 'polearm', 'staff', 'offhand'],
};
const RANGED: Record<ClassId, string[]> = {
  warrior: ['bow', 'gun', 'crossbow', 'thrown'],
  paladin: ['libram'],
  druid: ['idol'],
};
const ARMOR: Record<ClassId, string[]> = {
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
    if (slot === 'mainhand' && (it.ht === 'oh')) return false;
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

export const QUALITY_COLOR = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80'];

export const STAT_NAMES: Record<string, string> = {
  str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit', sp: 'Spell Damage', heal: 'Healing',
  mp5: 'Mana per 5 sec', shit: 'Spell Hit Rating', scrit: 'Spell Crit Rating', shaste: 'Spell Haste Rating', spen: 'Spell Penetration',
  ap: 'Attack Power', hit: 'Hit Rating', crit: 'Crit Rating', haste: 'Haste Rating', arp: 'Armor Penetration', exp: 'Expertise Rating',
  armor: 'Armor', rap: 'Ranged Attack Power', def: 'Defense Rating', block: 'Block Rating', bv: 'Block Value', dodge: 'Dodge Rating',
  parry: 'Parry Rating', res: 'Resilience Rating', hp: 'Health', arcres: 'Arcane Resistance', fireres: 'Fire Resistance',
  frostres: 'Frost Resistance', natres: 'Nature Resistance', shadres: 'Shadow Resistance', fap: 'Feral Attack Power', mana: 'Mana',
};

// ---------------------------------------------------------------- buffs and consumables
export interface Buff {
  id: string; name: string; group: 'raid' | 'flask' | 'battle' | 'guardian' | 'food' | 'other'; icon: string;
  st?: Stats; pct?: number; text: string; improved?: { name: string; st?: Stats };
}
export const BUFFS: Buff[] = [
  { id: 'kings', name: 'Blessing of Kings', group: 'raid', icon: 'spell_magic_greaterblessingofkings', pct: 0.1, text: 'Increases total stats by 10%.' },
  { id: 'motw', name: 'Gift of the Wild', group: 'raid', icon: 'spell_nature_giftofthewild', st: { str: 14, agi: 14, sta: 14, int: 14, spi: 14, armor: 340 },
    text: '+14 to all stats and +340 armor.', improved: { name: 'Improved Mark of the Wild', st: { str: 5, agi: 5, sta: 5, int: 5, spi: 5, armor: 119 } } },
  { id: 'fort', name: 'Prayer of Fortitude', group: 'raid', icon: 'spell_holy_prayeroffortitude', st: { sta: 79 }, text: '+79 Stamina.', improved: { name: 'Improved Power Word: Fortitude', st: { sta: 23 } } },
  { id: 'devo', name: 'Devotion Aura', group: 'raid', icon: 'spell_holy_devotionaura', st: { armor: 861 }, text: '+861 armor.', improved: { name: 'Improved Devotion Aura', st: { armor: 344 } } },
  { id: 'cshout', name: 'Commanding Shout', group: 'raid', icon: 'ability_warrior_rallyingcry', st: { hp: 1080 }, text: '+1080 maximum health.', improved: { name: 'Improved Commanding Shout', st: { hp: 270 } } },
  { id: 'goa', name: 'Grace of Air Totem', group: 'raid', icon: 'spell_nature_invisibilitytotem', st: { agi: 77 }, text: '+77 Agility.', improved: { name: 'Enhancing Totems', st: { agi: 11 } } },
  { id: 'soe', name: 'Strength of Earth Totem', group: 'raid', icon: 'spell_nature_earthbindtotem', st: { str: 86 }, text: '+86 Strength.', improved: { name: 'Enhancing Totems', st: { str: 12 } } },
  { id: 'bloodpact', name: 'Blood Pact', group: 'raid', icon: 'spell_shadow_bloodboil', st: { sta: 70 }, text: '+70 Stamina (Imp).', improved: { name: 'Improved Imp', st: { sta: 21 } } },
  { id: 'flaskfort', name: 'Flask of Fortification', group: 'flask', icon: 'inv_potion_119', st: { hp: 500, def: 10 }, text: '+500 health and +10 defense rating.' },
  { id: 'flaskchrom', name: 'Flask of Chromatic Wonder', group: 'flask', icon: 'inv_potion_48', st: { str: 18, agi: 18, sta: 18, int: 18, spi: 18, arcres: 35, fireres: 35, frostres: 35, natres: 35, shadres: 35 }, text: '+18 to all stats and +35 to all resistances.' },
  { id: 'majoragi', name: 'Elixir of Major Agility', group: 'battle', icon: 'inv_potion_127', st: { agi: 35, crit: 20 }, text: '+35 Agility and +20 crit rating.' },
  { id: 'mastery', name: 'Elixir of Mastery', group: 'battle', icon: 'inv_potion_111', st: { str: 15, agi: 15, sta: 15, int: 15, spi: 15 }, text: '+15 to all stats.' },
  { id: 'majordef', name: 'Elixir of Major Defense', group: 'guardian', icon: 'inv_potion_122', st: { armor: 550 }, text: '+550 armor.' },
  { id: 'ironskin', name: 'Elixir of Ironskin', group: 'guardian', icon: 'inv_potion_159', st: { res: 30 }, text: '+30 resilience rating.' },
  { id: 'majorfort', name: 'Elixir of Major Fortitude', group: 'guardian', icon: 'inv_potion_158', st: { hp: 250 }, text: '+250 health and health regeneration.' },
  { id: 'foodsta', name: 'Fisherman\'s Feast', group: 'food', icon: 'inv_misc_food_88_ravagernuggets', st: { sta: 30, spi: 20 }, text: '+30 Stamina and +20 Spirit.' },
  { id: 'foodagi', name: 'Warp Burger', group: 'food', icon: 'inv_misc_food_65', st: { agi: 20, spi: 20 }, text: '+20 Agility and +20 Spirit.' },
];
export const BUFF_GROUP_NAMES: Record<string, string> = {
  raid: 'Raid buffs', flask: 'Flask (instead of both elixirs)', battle: 'Battle elixir', guardian: 'Guardian elixir', food: 'Food', other: 'Other',
};

export function iconUrl(icon: string, size: 'small' | 'medium' | 'large' = 'large'): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${icon}.jpg`;
}
export function wowheadItemUrl(id: number) { return `https://www.wowhead.com/tbc/item=${id}`; }
export function wowheadSpellUrl(id: number) { return `https://www.wowhead.com/tbc/spell=${id}`; }
