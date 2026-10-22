// The Character screen, laid out like the game's character pane: equipment slots down both sides,
// the character in the middle, weapons along the bottom, and the stat panels underneath.
import {
  BEST_ARMOR, ENCHANTS, ENCHANT_BY_ID, Enchant, GEMS, GEM_BY_ID, Gem, ITEMS, ITEM_BY_ID, Item, QUALITY_COLOR,
  RACE_ICON, SLOTS, Slot, canUse, enchantProblem, enchantSlotsOf, slotAccepts,
} from '../data';
import { AGI_PER_DODGE, R, Sheet, computeSheet, gemFits, Profile, verdict } from '../engine';
import { pickFrom, PickRow } from './picker';
import { autoGear } from '../store';
import { clear, fmt, h, icon, pct } from './dom';
import { closeTop, confirmSheet, openSheet, toast } from './sheets';
import { S, classOf, commit, cur, describe, StatView } from './state';
import { enchantText, enchantTooltip, gemTooltip, itemTooltip, statText } from './tooltip';

type DollSlot = Slot | 'shirt' | 'tabard';
const LEFT: DollSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'shirt', 'tabard', 'wrist'];
const RIGHT: DollSlot[] = ['hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2'];
const BOTTOM: Slot[] = ['mainhand', 'offhand', 'ranged'];
const ARMOR_SLOTS = ['head', 'shoulder', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'];
const slotLabel = (s: DollSlot) => s === 'shirt' ? 'Shirt' : s === 'tabard' ? 'Tabard' : SLOTS.find(x => x.id === s)!.label;
const TYPE_NAME: Record<string, string> = {
  cloth: 'Cloth', leather: 'Leather', mail: 'Mail', plate: 'Plate', shield: 'Shield', offhand: 'Held In Off-hand', axe: 'Axe', mace: 'Mace', sword: 'Sword',
  dagger: 'Dagger', fist: 'Fist Weapon', polearm: 'Polearm', staff: 'Staff', bow: 'Bow', gun: 'Gun', crossbow: 'Crossbow', thrown: 'Thrown', libram: 'Libram', idol: 'Idol',
};

/** the cooldown view each class is usually judged by */
export function mainMode(p: Profile): 'passive' | 'cooldown' {
  return p.cls === 'druid' ? 'passive' : 'cooldown';
}

// ------------------------------------------------------------------------------------------ screen
export function characterView(): HTMLElement {
  const p = cur();
  const sheet = computeSheet(p, mainMode(p));
  const root = h('div', { class: 'wrap' });

  const slotEl = (s: DollSlot) => {
    if (s === 'shirt' || s === 'tabard') return h('div', { class: 'slot cosmetic', title: slotLabel(s) }, h('span', { class: 'empty' }, slotLabel(s)));
    const g = p.gear[s];
    const it = g && ITEM_BY_ID.get(g.id);
    if (!it) return h('button', { class: 'slot', onclick: () => openSlot(s), 'aria-label': slotLabel(s) }, h('span', { class: 'empty' }, slotLabel(s)));
    const dots = (it.so || []).map((c, i) => {
      const gem = g!.gems?.[i] ? GEM_BY_ID.get(g!.gems![i]) : undefined;
      return h('i', { class: gem ? 'sock-' + gem.c : 'sock-empty' });
    });
    return h('button', { class: 'slot filled bq' + it.q, onclick: () => openSlot(s), 'aria-label': it.n },
      icon(it.ic, 46, it.n), dots.length ? h('span', { class: 'gemdots' }, dots) : null, g!.ench ? h('span', { class: 'ench' }) : null);
  };

  // the middle: resistances, portrait, verdict
  const res = sheet.resist;
  const v = verdict(p, mainMode(p));
  const cd = p.cls === 'paladin' ? (sheet.holyShieldOn ? 'with Holy Shield' : 'no Holy Shield') : p.cls === 'warrior' ? (sheet.shieldBlockOn ? 'with Shield Block' : 'no Shield Block') : 'bear form';
  const model = h('div', { class: 'model' },
    h('div', { class: 'resists' }, ([['arcane', 'arcres'], ['fire', 'fireres'], ['nature', 'natres'], ['frost', 'frostres'], ['shadow', 'shadres']] as const)
      .map(([c, k]) => h('div', { class: 'r ' + c, title: c + ' resistance' }, String(res[k] || 0)))),
    h('div', { class: 'crest' },
      h('div', { class: 'center' },
        h('div', { class: 'portrait', style: { margin: '0 auto' } }, icon(RACE_ICON[p.race], 92, p.race)),
        h('div', { style: { marginTop: '8px', font: '700 13px var(--title)', color: classOf(p).color, textShadow: '0 1px 0 #000' } }, p.name),
        h('div', { class: 'small', style: { color: '#e9e2d0' } }, describe(p)))),
    h('div', { class: 'verdict ' + (v.uncrushable ? 'ok' : 'bad') },
      h('div', { class: 'big' }, v.uncrushable ? 'Uncrushable' : 'Crushable'),
      h('div', { class: 'num' }, pct(v.total)),
      h('div', { class: 'of' }, v.uncrushable ? `of ${fmt(v.cap, 1)}% · ${cd}` : `${fmt(v.short)}% short · ${cd}`)));

  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Character'),
    h('div', { class: 'doll' },
      h('div', { class: 'col' }, LEFT.map(slotEl)),
      model,
      h('div', { class: 'col' }, RIGHT.map(slotEl))),
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '8px', gap: '6px' } }, BOTTOM.map(slotEl)),
    h('div', { class: 'stats2' }, statBox(sheet, 'statL'), statBox(sheet, 'statR')),
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
      h('button', { class: 'btn dark small', onclick: () => openAutoGear() }, 'Auto-gear'),
      h('button', { class: 'btn dark small', onclick: () => confirmSheet('Unequip everything', `Take off every item ${p.name} is wearing?`, 'Unequip', () => { p.gear = {}; commit(); }) }, 'Unequip all'))));

  const notes = gearNotes(p, sheet);
  if (notes.length) root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Gear Notes'), notes));
  return root;
}

const VIEW_NAME: Record<StatView, string> = { base: 'Base Stats', def: 'Defenses', melee: 'Melee', ranged: 'Ranged', spell: 'Spell' };
export function statViews(cls: string): StatView[] {
  return cls === 'warrior' ? ['base', 'def', 'melee', 'ranged'] : ['base', 'def', 'melee', 'spell'];
}

function statBox(s: Sheet, which: 'statL' | 'statR'): HTMLElement {
  const views = statViews(s.cls);
  const view = views.includes(S[which]) ? S[which] : which === 'statL' ? 'base' : 'def';
  const sel = h('select', { 'aria-label': 'Stat panel' }, views.map(v => h('option', { value: v, selected: v === view }, VIEW_NAME[v])));
  sel.onchange = () => { S[which] = sel.value as StatView; commit(); };
  const line = (k: string, v: string, up = false) => h('div', { class: 'statline' }, h('span', { class: 'k' }, k), h('span', { class: 'v' + (up ? ' up' : '') }, v));
  const n = (x: number) => String(Math.floor(x + 1e-9));
  let lines: HTMLElement[] = [];
  if (view === 'base') lines = [line('Strength', n(s.str)), line('Agility', n(s.agi)), line('Stamina', n(s.sta)), line('Intellect', n(s.int)), line('Spirit', n(s.spi)), line('Armor', n(s.armor), true)];
  if (view === 'def') lines = [
    line('Health', Math.round(s.health).toLocaleString()), line('Armor', n(s.armor), true),
    line('Defense', `${s.defenseFloor}`, s.defenseFloor > 350), line('Dodge', pct(s.dodge)),
    line('Parry', s.canParry ? pct(s.parry) : '—'), line('Block', s.canBlock ? pct(s.block) : '—'),
    line('Block Value', s.canBlock ? String(s.blockValue) : '—'), line('Resilience', n(s.resilience)),
  ];
  if (view === 'melee') lines = [line('Attack Power', n(s.ap)), line('Hit', pct(s.hit)), line('Crit', pct(s.crit)), line('Expertise', String(s.expertise)),
    line('Haste', pct(s.haste)), line('Damage cut', pct(s.armorReduction))];
  if (view === 'ranged') lines = s.hasRanged ? [
    line('Weapon', s.rangedDmg ? `${n(s.rangedDmg[0])}–${n(s.rangedDmg[1])}` : '—'), line('Speed', fmt(s.rangedSpeed)),
    line('Attack Power', n(s.rap)), line('Hit', pct(s.rhit)), line('Crit', pct(s.rcrit)),
  ] : [line('Ranged weapon', 'none'), line('Attack Power', n(s.rap)), line('Hit', pct(s.rhit)), line('Crit', pct(s.rcrit))];
  if (view === 'spell') lines = [line('Bonus Damage', n(s.sp)), line('Bonus Healing', n(s.heal)), line('Hit', pct(s.shit)), line('Crit', pct(s.scrit)),
    line('Haste', pct(s.shaste)), line('Mana', n(s.mana)), line('Mana per 5 sec', n(s.mp5))];
  return h('div', { class: 'statbox inset' }, sel, lines);
}

function gearNotes(p: Profile, s: Sheet): HTMLElement[] {
  const out: HTMLElement[] = [];
  const g = s.gear;
  for (const b of g.setBonuses) out.push(h('div', { class: 'small green' }, `${b.set} (${b.count}): ${b.text}`));
  if (g.meta && !g.meta.active) out.push(h('div', { class: 'small red' }, `Meta gem inactive: ${(g.meta.req || []).join('; ')}`));
  for (const n of g.uniqueClash) out.push(h('div', { class: 'small red' }, `${n} is unique: you can only wear one.`));
  let emptySockets = 0, noEnchant: string[] = [];
  for (const sl of SLOTS) {
    const piece = p.gear[sl.id];
    const it = piece && ITEM_BY_ID.get(piece.id);
    if (!it) continue;
    (it.so || []).forEach((_, i) => { if (!piece!.gems?.[i]) emptySockets++; });
    if (enchantable(it, sl.id) && !piece!.ench && sl.item !== 'finger') noEnchant.push(sl.label);
  }
  if (emptySockets) out.push(h('div', { class: 'small', style: { color: '#ffd100' } }, `${emptySockets} empty socket${emptySockets > 1 ? 's' : ''}.`));
  if (noEnchant.length) out.push(h('div', { class: 'small', style: { color: '#ffd100' } }, `Not enchanted: ${noEnchant.join(', ')}.`));
  if (p.cls !== 'druid' && !s.canBlock) out.push(h('div', { class: 'small red' }, 'No shield: you can\'t block, so you can\'t push crushing blows off the table.'));
  if (p.cls !== 'druid' && !g.weapon) out.push(h('div', { class: 'small red' }, 'No weapon: you can\'t parry without one.'));
  return out;
}

// ------------------------------------------------------------------------------------------ slot panel
function openSlot(slot: Slot) {
  const p = cur();
  if (!p.gear[slot]) { openPicker(slot); return; }
  const body = h('div');
  const sh = openSheet(slotLabel(slot), body);
  const fill = () => {
    clear(body);
    const piece = p.gear[slot];
    const it = piece && ITEM_BY_ID.get(piece.id);
    if (!it || !piece) { sh.close(); return; }
    const s = computeSheet(p, 'passive');
    body.appendChild(itemTooltip(it, { piece, profile: p, metaActive: s.gear.meta ? s.gear.meta.active : undefined, onItemLink: id => viewItem(id) }));
    const rows = h('div', { class: 'list', style: { marginTop: '10px' } });
    (it.so || []).forEach((color, i) => {
      const gem = piece.gems?.[i] ? GEM_BY_ID.get(piece.gems[i]) : undefined;
      rows.appendChild(h('div', { class: 'li', onclick: () => openGemPicker(slot, i, fill) },
        gem ? icon(gem.ic, 30, gem.n) : h('span', { class: 'icon', style: { width: '30px', height: '30px' } }, h('span', { class: 'icon-fallback sock-' + color })),
        h('div', { class: 'grow' }, h('div', { class: 'nm', style: { color: gem ? QUALITY_COLOR[gem.q] : '#9d9d9d' } }, gem ? gem.n : `Empty ${color[0].toUpperCase() + color.slice(1)} Socket`),
          h('div', { class: 'sub' }, gem ? (gem.tx || statText(gem.st)) : 'Tap to choose a gem')),
        h('span', { class: 'score' }, gem ? (gemFits(color, gem.c) ? '✓ matches' : 'no bonus') : '')));
    });
    if (enchantable(it, slot)) {
      const e = piece.ench ? ENCHANT_BY_ID.get(piece.ench) : undefined;
      rows.appendChild(h('div', { class: 'li', onclick: () => openEnchantPicker(slot, fill) },
        icon(e?.ic || 'inv_misc_note_01', 30, 'E'),
        h('div', { class: 'grow' }, h('div', { class: 'nm', style: { color: e ? '#1eff00' : '#9d9d9d' } }, e ? e.n : 'Not enchanted'), h('div', { class: 'sub' }, e ? enchantText(e) : 'Tap to choose an enchant'))));
    }
    body.appendChild(rows);
    body.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
      h('button', { class: 'btn dark', onclick: () => { delete p.gear[slot]; commit(); sh.close(); } }, 'Remove'),
      h('button', { class: 'btn', onclick: () => openPicker(slot, fill) }, 'Change item')));
  };
  fill();
}

function viewItem(id: number) {
  const it = ITEM_BY_ID.get(id);
  if (!it) return;
  openSheet(it.n, h('div', null, itemTooltip(it, { profile: cur(), onItemLink: viewItem })));
}

// ------------------------------------------------------------------------------------------ item picker
type SortKey = 'avoid' | 'sta' | 'ilvl' | 'name';

/** roughly how much avoidance one item adds for this character (before sockets and enchants) */
export function itemAvoidance(p: Profile, s: Sheet, it: Item): number {
  const st = it.st;
  const comps = 2 + (s.canParry ? 1 : 0) + (s.canBlock ? 1 : 0);
  const kings = p.buffs.kings ? 1.1 : 1;
  return (st.def || 0) / R.defense * 0.04 * comps + (st.dodge || 0) / R.dodge + (st.agi || 0) * kings / AGI_PER_DODGE[p.cls]
    + (s.canParry ? (st.parry || 0) / R.parry : 0) + (s.canBlock || it.wt === 'shield' ? (st.block || 0) / R.block : 0);
}

function openPicker(slot: Slot, after?: () => void) {
  const p = cur();
  const s = computeSheet(p, 'passive');
  let q = '', sort: SortKey = 'avoid', limit = 80;
  const search = h('input', { type: 'search', placeholder: 'Search items or bosses', style: { width: '100%' } });
  const chips = h('div');
  const count = h('div', { class: 'small muted', style: { margin: '2px 0 4px' } });
  const list = h('div', { class: 'list' });
  const body = h('div', null, search, chips, count, list);
  const sh = openSheet(slotLabel(slot), body, { full: true });
  const isArmor = ARMOR_SLOTS.includes(slot);

  const pool = ITEMS.filter(it => slotAccepts(slot, it) && canUse(p.cls, it, slot));
  const draw = () => {
    clear(chips);
    const chip = (label: string, on: boolean, fn: () => void) => h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => { fn(); limit = 80; draw(); } }, label);
    chips.appendChild(h('div', { class: 'chips' },
      [1, 2, 3, 4, 5].map(n => chip(n === 5 ? 'All phases' : `Up to P${n}`, S.phase === n, () => { S.phase = n; })),
      isArmor ? chip(`${BEST_ARMOR[p.cls] === 'plate' ? 'Plate' : 'Leather'} only`, S.armorOnly, () => { S.armorOnly = !S.armorOnly; }) : null));
    chips.appendChild(h('div', { class: 'chips', style: { marginTop: '0' } }, h('span', { class: 'small gold', style: { alignSelf: 'center' } }, 'Level:'),
      ([[0, 'Any'], [60, '60+'], [70, '70']] as [number, string][]).map(([n, l]) => chip(l, S.minLevel === n, () => { S.minLevel = n; }))));
    chips.appendChild(h('div', { class: 'chips', style: { marginTop: '0' } }, h('span', { class: 'small gold', style: { alignSelf: 'center' } }, 'Sort:'),
      ([['avoid', 'Avoidance'], ['sta', 'Stamina'], ['ilvl', 'Item level'], ['name', 'Name']] as [SortKey, string][]).map(([k, n]) => chip(n, sort === k, () => { sort = k; }))));

    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const items = pool.filter(it => Math.max(1, it.ph) <= S.phase && (it.rl || 1) >= S.minLevel
      && (!isArmor || !S.armorOnly || !it.at || it.at === BEST_ARMOR[p.cls])
      && words.every(w => it.n.toLowerCase().includes(w) || (it.drop || '').toLowerCase().includes(w)));
    const av = new Map(items.map(it => [it.id, itemAvoidance(p, s, it)]));
    items.sort((a, b) => sort === 'avoid' ? (av.get(b.id)! - av.get(a.id)!) || ((b.st.sta || 0) - (a.st.sta || 0)) || b.il - a.il
      : sort === 'sta' ? (b.st.sta || 0) - (a.st.sta || 0) : sort === 'ilvl' ? b.il - a.il : a.n.localeCompare(b.n));
    count.textContent = `${items.length.toLocaleString()} of ${pool.length.toLocaleString()} items for this slot`;
    clear(list);
    if (!items.length) { list.appendChild(h('div', { class: 'empty-state' }, 'No items match. Try "All phases", "Any" level, or turn off the armor filter.')); return; }
    const curId = p.gear[slot]?.id;
    for (const it of items.slice(0, limit)) {
      const type = TYPE_NAME[it.at || it.wt || it.rt || ''] || '';
      list.appendChild(h('div', { class: 'li' + (it.id === curId ? ' sel' : ''), onclick: () => preview(it) },
        h('span', { class: 'slot filled bq' + it.q, style: { '--slot': '38px' } as any }, icon(it.ic, 38, it.n)),
        h('div', { class: 'grow' },
          h('div', { class: 'nm', style: { color: QUALITY_COLOR[it.q] } }, it.n),
          h('div', { class: 'sub' }, [it.rl ? `Req. level ${it.rl}` : '', `ilvl ${it.il}`, type, `P${Math.max(1, it.ph)}`, it.so?.length ? `${it.so.length} socket${it.so.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')),
          it.drop ? h('div', { class: 'sub' }, it.drop) : null),
        h('div', { class: 'score' }, h('div', null, `+${fmt(av.get(it.id)!)}%`), h('div', { class: 'small', style: { color: '#fff' } }, `${it.st.sta || 0} sta`))));
    }
    if (items.length > limit) list.appendChild(h('button', { class: 'btn dark', style: { marginTop: '8px' }, onclick: () => { limit += 150; draw(); } }, `Show more (${items.length - limit})`));
  };
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => { q = search.value; limit = 80; draw(); }, 150); });
  draw();

  function preview(it: Item) {
    const box = h('div', null, itemTooltip(it, { profile: p, onItemLink: viewItem }));
    const ps = openSheet('Equip?', box);
    box.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } },
      h('button', { class: 'btn dark', onclick: () => ps.close() }, 'Back'),
      h('button', { class: 'btn', onclick: () => { if (equip(p, slot, it)) { ps.close(); sh.close(); after?.(); } } }, 'Equip')));
  }
}

function equip(p: Profile, slot: Slot, it: Item): boolean {
  if (it.u) {
    for (const other of SLOTS) if (other.id !== slot && p.gear[other.id]?.id === it.id) { toast(`${it.n} is unique and already equipped`); return false; }
  }
  const old = p.gear[slot];
  const oldE = old?.ench ? ENCHANT_BY_ID.get(old.ench) : undefined;
  const keepEnch = oldE && !enchantProblem(oldE, it, p.cls) ? oldE.k : undefined;
  if (oldE && !keepEnch) toast(`${oldE.n} doesn't fit the new item and was taken off`);
  const keepGems = old && old.id === it.id ? old.gems : undefined;
  p.gear[slot] = { id: it.id, ...(keepGems ? { gems: keepGems } : {}), ...(keepEnch ? { ench: keepEnch } : {}) };
  if (slot === 'mainhand' && it.ht === '2h' && p.gear.offhand) { delete p.gear.offhand; toast('Off hand removed: two-handed weapon'); }
  if (slot === 'offhand') {
    const mh = p.gear.mainhand && ITEM_BY_ID.get(p.gear.mainhand.id);
    if (mh && mh.ht === '2h') { delete p.gear.mainhand; toast('Two-handed weapon removed'); }
  }
  commit();
  return true;
}

// ------------------------------------------------------------------------------------------ gems
const GEM_FILTERS: [string, string][] = [['sta', 'Stamina'], ['def', 'Defense'], ['dodge', 'Dodge'], ['agi', 'Agility'], ['block', 'Block'], ['parry', 'Parry'], ['bv', 'Block value'], ['res', 'Resilience'], ['str', 'Strength'], ['hit', 'Hit'], ['exp', 'Expertise']];
const COLOR_NAME: Record<string, string> = { red: 'Red', yellow: 'Yellow', blue: 'Blue', orange: 'Orange', purple: 'Purple', green: 'Green', prismatic: 'Prismatic', meta: 'Meta' };

function openGemPicker(slot: Slot, idx: number, after: () => void) {
  const p = cur();
  const piece = p.gear[slot]!;
  const it = ITEM_BY_ID.get(piece.id)!;
  const color = it.so![idx];
  let stat = '', fitsOnly = false;
  const pool = GEMS.filter(g => (color === 'meta') === (g.c === 'meta'));
  const rows: PickRow<number>[] = pool.map(g => ({
    key: g.id, name: g.n, ic: g.ic || '', color: QUALITY_COLOR[g.q], sub: g.tx || statText(g.st),
    sub2: [color === 'meta' ? '' : `${COLOR_NAME[g.c]}${gemFits(color, g.c) ? ' · matches this socket' : ''}`, (g.req || []).join('; '), g.prof ? `Requires ${g.prof}` : '', g.u ? 'Unique' : '', `P${Math.max(1, g.ph)}`].filter(Boolean).join(' · '),
    group: color === 'meta' ? undefined : gemFits(color, g.c) ? 'Matches the socket (counts for the socket bonus)' : 'Other colours (no socket bonus)',
    search: COLOR_NAME[g.c],
    info: () => gemTooltip(g),
  }));
  const sortRows = () => rows.sort((a, b) => {
    const ga = GEM_BY_ID.get(a.key)!, gb = GEM_BY_ID.get(b.key)!;
    return (+gemFits(color, gb.c) - +gemFits(color, ga.c)) || (stat ? (gb.st[stat] || 0) - (ga.st[stat] || 0) : 0) || gb.q - ga.q || ga.n.localeCompare(gb.n);
  });
  sortRows();
  pickFrom({
    title: `${COLOR_NAME[color]} Socket`, rows, selected: piece.gems?.[idx] || null, none: piece.gems?.[idx] ? 'Remove gem' : undefined,
    placeholder: `Search ${pool.length} gems`,
    chips: color === 'meta' ? [] : [
      { label: 'Matching colour only', on: () => fitsOnly, toggle: () => { fitsOnly = !fitsOnly; } },
      ...GEM_FILTERS.map(([k, n]) => ({ label: n, on: () => stat === k, toggle: () => { stat = stat === k ? '' : k; sortRows(); } })),
    ],
    filter: r => { const g = GEM_BY_ID.get(r.key)!; return (!fitsOnly || gemFits(color, g.c)) && (!stat || (g.st[stat] || 0) > 0); },
    onPick: k => {
      const g: Gem | undefined = k ? GEM_BY_ID.get(k) : undefined;
      if (g?.u && SLOTS.some(sl => (p.gear[sl.id]?.gems || []).some((x, i) => x === g.id && !(sl.id === slot && i === idx)))) { toast(`${g.n} is unique: you already wear one`); return; }
      const gems = [...(piece.gems || [])];
      while (gems.length < (it.so || []).length) gems.push(0);
      gems[idx] = g ? g.id : 0;
      piece.gems = gems.some(Boolean) ? gems : undefined;
      commit(); after();
    },
  });
}

// ------------------------------------------------------------------------------------------ enchants
export function enchantable(it: Item, _slot?: Slot): boolean {
  return enchantSlotsOf(it).length > 0;
}

/** survival first, for sorting the enchant list */
const tankish = (e: Enchant) => (e.st.def || 0) * 1.2 + (e.st.dodge || 0) * 1.1 + (e.st.sta || 0) + (e.st.agi || 0) + (e.st.block || 0) * 1.3 + (e.st.parry || 0)
  + (e.st.armor || 0) / 20 + (e.st.hp || 0) / 10 + (e.st.res || 0) + (e.st.bv || 0) * 0.5 + (e.st.hit || 0) * 0.5 + (e.st.str || 0) * 0.3 + (e.st.exp || 0) * 0.5;

function openEnchantPicker(slot: Slot, after: () => void) {
  const p = cur();
  const piece = p.gear[slot]!;
  const it = ITEM_BY_ID.get(piece.id)!;
  // everything for this kind of slot: two-hander enchants show on one-handers too, greyed with the reason
  const kinds = new Set(enchantSlotsOf(it));
  if (kinds.has('weapon')) kinds.add('2h');
  const pool = ENCHANTS.filter(e => e.sl.some(x => kinds.has(x)));
  const rows: PickRow<number>[] = pool.map(e => {
    const why = enchantProblem(e, it, p.cls);
    return {
      key: e.k, name: e.n, ic: e.ic || 'inv_misc_note_01', color: why ? '#9d9d9d' : '#1eff00',
      sub: statText(e.st) || e.tx,
      sub2: [e.req ? `Item level ${e.req}+` : '', e.prof ? `Requires ${e.prof}` : '', e.rep ? e.rep : '', e.cl ? `${e.cl[0].toUpperCase() + e.cl.slice(1)}s only` : '',
        e.src === 'trainer' ? 'Enchanting trainer' : ''].filter(Boolean).join(' · ') || undefined,
      disabled: why || undefined,
      search: e.tx,
      info: () => enchantTooltip(e),
    };
  });
  rows.sort((a, b) => (+!!a.disabled - +!!b.disabled) || tankish(ENCHANT_BY_ID.get(b.key)!) - tankish(ENCHANT_BY_ID.get(a.key)!) || a.name.localeCompare(b.name));
  const usable = rows.filter(r => !r.disabled).length;
  pickFrom({
    title: 'Enchant', rows, selected: piece.ench ?? null, none: piece.ench ? 'Remove enchant' : undefined,
    placeholder: `Search ${rows.length} enchants`,
    note: `${usable} of ${rows.length} fit ${it.n} (item level ${it.il}).` + (it.s === 'finger' ? ' Ring enchants are for enchanters only.' : ''),
    onPick: k => { if (k == null) delete piece.ench; else piece.ench = k; commit(); after(); },
  });
}

// ------------------------------------------------------------------------------------------ auto-gear
function openAutoGear() {
  const p = cur();
  const body = h('div', null, h('p', { class: 'note' }, `Puts the highest-avoidance item from the chosen phase in every slot (no gems or enchants). This replaces what ${p.name} is wearing now.`));
  const sh = openSheet('Auto-gear', body);
  body.appendChild(h('div', { class: 'seg', style: { gridTemplateColumns: 'repeat(5,1fr)' } }, [1, 2, 3, 4, 5].map(n =>
    h('button', { class: 'chip', onclick: () => { p.gear = autoGear(p, n); commit(); sh.close(); toast(`Geared from phase ${n}`); } }, `P${n}`))));
}

export { closeTop };
