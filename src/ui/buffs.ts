// The Buffs screen: your own stances and cooldowns, consumables (drop-down lists with every TBC flask,
// elixir, food, scroll and potion), raid buffs, boss debuffs and world buffs as compact icon grids, and
// the fight: which boss you're tanking (its swing speed, hit size and abilities) and extra attackers.
import {
  ABILITIES, Ability, BOSSES, BOSS_BY_ID, Boss, Buff, CONSUMABLES, CONSUMABLE_BY_ID, Consumable, DEBUFFS, ITEM_BY_ID,
  QUALITY_COLOR, RAID_BUFFS, STAT_NAMES, Slot, WORLD_BUFFS, iconUrl, wowheadNpcUrl, wowheadSearchUrl, wowheadSpellUrl,
} from '../data';
import { Consumes, Profile, talentRank } from '../engine';
import { clear, fmt, h, icon, pressable } from './dom';
import { pickFrom, PickRow, selectRow } from './picker';
import { openSheet, toast } from './sheets';
import { commit, cur } from './state';
import { statText } from './tooltip';

const WHO_ORDER = ['Paladin', 'Druid', 'Priest', 'Warrior', 'Shaman', 'Warlock', 'Hunter', 'Mage', 'Draenei', 'Leatherworker', 'Jewelcrafter'];

export function buffsView(): HTMLElement {
  const p = cur();
  const root = h('div', { class: 'wrap' });
  root.appendChild(abilitiesFrame(p));
  root.appendChild(consumablesFrame(p));
  root.appendChild(gridFrame(p, 'Raid Buffs', RAID_BUFFS, h('p', { class: 'note' }, 'Tap a buff to switch it on, tap again for the talented (improved) version. Hold a buff for details.')));
  root.appendChild(gridFrame(p, 'Boss Debuffs', DEBUFFS, h('p', { class: 'note' }, 'Debuffs on the boss: less chance to hit you, slower swings, less attack power. They change the Caps and damage numbers.')));
  root.appendChild(gridFrame(p, 'World Buffs', WORLD_BUFFS, h('p', { class: 'note' },
    'TBC Classic and Anniversary realms remove world buffs when a raid boss encounter starts, so these only count for dungeons, trash and the open world.')));
  root.appendChild(fightFrame(p));
  return root;
}

// ------------------------------------------------------------------ your abilities
function abilitiesFrame(p: Profile): HTMLElement {
  const grid = h('div', { class: 'bgrid' });
  for (const a of ABILITIES[p.cls]) grid.appendChild(abilityTile(p, a));
  for (const s of ['trinket1', 'trinket2'] as Slot[]) {
    const it = p.gear[s] && ITEM_BY_ID.get(p.gear[s]!.id);
    if (!it || !it.fx?.length) continue;
    const on = !!p.opts.uses[String(it.id)];
    const e = it.fx[0];
    const what = it.fx.map(f => `+${f.amount} ${STAT_NAMES[f.stat] || f.stat}`).join(', ');
    const text = `${e.kind === 'use' ? 'Use' : 'Proc'}: ${what}${e.dur ? ` for ${e.dur} sec` : ''}${e.cd ? `, ${e.cd >= 60 ? fmt(e.cd / 60, 0) + ' min' : e.cd + ' sec'} cooldown` : ''}${e.note ? ` (${e.note})` : ''}. Counted in the "procs" view.`;
    grid.appendChild(tile(it.ic, it.n, on ? 1 : 0, false, () => { p.opts.uses[String(it.id)] = !on; commit(); },
      () => detail(it.ic, it.n, 'Trinket', text, on ? 1 : 0, false, v => { p.opts.uses[String(it.id)] = !!v; commit(); })));
  }
  return h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Your Abilities'), grid,
    h('p', { class: 'note' }, 'Stances count all the time. Cooldowns count in the "cooldown" and "procs" views on the Caps screen; procs and trinkets only in "procs".'));
}

function abilityTile(p: Profile, a: Ability): HTMLElement {
  const needs = a.talent && talentRank(p, a.talent) <= 0 ? `Needs the ${a.name} talent` : '';
  const on = !!p.abil[a.id] && !needs;
  const text = a.text + (a.mode === 'always' ? '' : a.mode === 'cooldown' ? ' (cooldown)' : ' (proc)');
  const el = tile(a.icon, a.name, on ? 1 : 0, false, () => {
    if (needs) { toast(needs); return; }
    p.abil[a.id] = !p.abil[a.id]; commit();
  }, () => detail(a.icon, a.name, needs || 'Your ability', text, on ? 1 : 0, false, needs ? null : v => { p.abil[a.id] = !!v; commit(); }));
  if (needs) el.classList.add('locked');
  return el;
}

// ------------------------------------------------------------------ icon grids
function tile(ic: string, name: string, state: number, hasImp: boolean, onTap: () => void, onHold: () => void): HTMLElement {
  const el = h('button', { class: 'bt ' + (state === 2 ? 'imp' : state ? 'on' : 'off'), 'aria-label': name, 'aria-pressed': state ? 'true' : 'false' },
    icon(ic, 40, name),
    state === 2 ? h('span', { class: 'badge' }, '+') : hasImp && state === 1 ? h('span', { class: 'badge dim' }, '+') : null,
    h('span', { class: 'bn' }, name));
  pressable(el, onTap, onHold);
  return el;
}

function detail(ic: string, name: string, who: string, text: string, state: number, imp: string | false, set: ((v: number) => void) | null) {
  const body = h('div', null,
    h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, icon(ic, 44, name),
      h('div', { class: 'grow' }, h('div', { class: 'gold', style: { fontWeight: '700' } }, name), h('div', { class: 'small' }, who), h('p', { class: 'note', style: { margin: '6px 0 0' } }, text))));
  const s = openSheet(name, body);
  if (set) {
    const opts: [number, string][] = [[0, 'Off'], [1, 'On']];
    if (imp) opts.push([2, imp]);
    body.appendChild(h('div', { class: 'seg', style: { gridTemplateColumns: `repeat(${opts.length},1fr)`, marginTop: '12px' } },
      opts.map(([v, l]) => h('button', { class: 'chip' + (state === v ? ' on' : ''), onclick: () => { s.close(); set(v); } }, l))));
  }
  body.appendChild(h('div', { class: 'src', style: { marginTop: '10px' } }, h('a', { href: wowheadSearchUrl(name), target: '_blank', rel: 'noopener' }, 'Search Wowhead')));
}

function setBuff(p: Profile, b: Buff, v: number) {
  if (!v) { delete p.buffs[b.id]; return; }
  if (b.excl) {
    const replaced: string[] = [];
    for (const o of [...RAID_BUFFS, ...DEBUFFS, ...WORLD_BUFFS]) if (o.id !== b.id && o.excl === b.excl && p.buffs[o.id]) { delete p.buffs[o.id]; replaced.push(o.name); }
    if (replaced.length) toast(`Replaces ${replaced.join(', ')} (they don't stack)`);
  }
  p.buffs[b.id] = v === 2 && b.imp ? 2 : 1;
}

function gridFrame(p: Profile, title: string, list: Buff[], note: HTMLElement): HTMLElement {
  const groups = new Map<string, Buff[]>();
  for (const b of list) { const k = b.who; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(b); }
  const keys = [...groups.keys()].sort((a, b) => (WHO_ORDER.indexOf(a) + 1 || 99) - (WHO_ORDER.indexOf(b) + 1 || 99));
  const ownLotp = p.cls === 'druid' && talentRank(p, 'leaderOfThePack') > 0 && !!p.abil.bear;
  const count = list.filter(b => p.buffs[b.id]).length;
  const box = h('div', { class: 'frame rock' }, h('div', { class: 'title' }, title + (count ? ` (${count})` : '')), note);
  const byWho = list === WORLD_BUFFS ? [['', list] as [string, Buff[]]] : keys.map(k => [k, groups.get(k)!] as [string, Buff[]]);
  for (const [who, bs] of byWho) {
    if (who) box.appendChild(h('div', { class: 'grp' }, who));
    box.appendChild(h('div', { class: 'bgrid' }, bs.map(b => {
      const state = p.buffs[b.id] || 0;
      const next = state === 0 ? 1 : state === 1 && b.imp ? 2 : 0;
      const el = tile(b.icon, b.name, state, !!b.imp, () => { setBuff(p, b, next); commit(); },
        () => detail(b.icon, b.name, b.who + (b.imp ? ` · improved: ${b.imp.name}` : ''), b.text, state, b.imp ? 'Improved' : false, v => { setBuff(p, b, v); commit(); }));
      if (b.id === 'lotp' && ownLotp && !state) el.classList.add('auto');
      return el;
    })));
  }
  if (list === RAID_BUFFS && ownLotp) box.appendChild(h('p', { class: 'note' }, 'You have Leader of the Pack yourself: it counts in bear form without switching it on here.'));
  return box;
}

// ------------------------------------------------------------------ consumables
const CAT_TITLE: Record<string, string> = { flask: 'Flask', battle: 'Battle Elixir', guardian: 'Guardian Elixir', food: 'Food', potion: 'Potion' };

function consRows(list: Consumable[]): PickRow<number>[] {
  return list.map(c => ({
    key: c.id, name: c.n, ic: c.ic, color: QUALITY_COLOR[c.q] || '#fff',
    sub: statText(c.st) || c.tx, sub2: [c.where, c.rl > 1 ? `Requires level ${c.rl}` : ''].filter(Boolean).join(' · ') || undefined,
    group: c.c === 'flask' ? (c.where ? (/Unstable/.test(c.where) ? 'Unstable flasks' : 'Shattrath flasks') : 'Flasks') : undefined,
    search: c.tx,
    info: () => h('div', { class: 'tt' }, h('div', { class: 'tn', style: { color: QUALITY_COLOR[c.q] } }, c.n), h('div', { class: 'g' }, 'Use: ' + c.tx),
      c.where ? h('div', { class: 'y' }, c.where) : null,
      h('div', { class: 'src' }, h('a', { href: `https://www.wowhead.com/tbc/item=${c.id}`, target: '_blank', rel: 'noopener' }, 'View on Wowhead'))),
  }));
}

/** a rough "how useful is this to a tank" order for the lists: survival stats first, then the rest */
function tankValue(c: Consumable): number {
  const s = c.st;
  return (s.sta || 0) * 1.5 + (s.hp || 0) * 0.15 + (s.def || 0) * 2 + (s.armor || 0) * 0.08 + (s.agi || 0) * 1.2 + (s.dodge || 0) * 1.5
    + (s.block || 0) + (s.bv || 0) * 0.5 + (s.str || 0) * 0.5 + (s.hit || 0) + (s.exp || 0) + (s.ap || 0) * 0.2 + (s.res || 0);
}

function consumablesFrame(p: Profile): HTMLElement {
  const c = p.cons;
  const box = h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Consumables'));
  const row = (cat: keyof Consumes & ('flask' | 'battle' | 'guardian' | 'food' | 'potion'), disabled?: string) => {
    const id = c[cat] as number | undefined;
    const sel = id ? CONSUMABLE_BY_ID.get(id) : undefined;
    const pool = CONSUMABLES.filter(x => x.c === cat).sort((a, b) => (cat === 'flask' ? +!!a.where - +!!b.where : 0) || tankValue(b) - tankValue(a) || a.n.localeCompare(b.n));
    return selectRow(CAT_TITLE[cat], sel ? { name: sel.n, ic: sel.ic, color: QUALITY_COLOR[sel.q], sub: statText(sel.st) || sel.tx } : null, () => pickFrom({
      title: CAT_TITLE[cat], rows: consRows(pool), selected: id ?? null, none: `No ${CAT_TITLE[cat].toLowerCase()}`,
      placeholder: `Search ${pool.length} ${cat === 'food' ? 'foods' : CAT_TITLE[cat].toLowerCase() + 's'}`,
      note: cat === 'potion' ? 'Potions last seconds, not hours: they only count in the "procs" view.' : null,
      onPick: k => {
        if (k == null) delete c[cat]; else (c as any)[cat] = k;
        if (cat === 'flask' && k != null && (c.battle || c.guardian)) { delete c.battle; delete c.guardian; toast('Elixirs removed'); }
        commit();
      },
    }), disabled);
  };
  box.appendChild(row('flask'));
  box.appendChild(row('battle', c.flask ? 'Flask active' : undefined));
  box.appendChild(row('guardian', c.flask ? 'Flask active' : undefined));
  box.appendChild(row('food'));
  // scrolls: one of each kind (scrolls of different kinds stack)
  const groups = [...new Set(CONSUMABLES.filter(x => x.c === 'scroll').map(x => x.g!))].sort();
  for (const g of groups) {
    const pool = CONSUMABLES.filter(x => x.c === 'scroll' && x.g === g).sort((a, b) => b.rl - a.rl);
    const selId = (c.scrolls || []).find(id => CONSUMABLE_BY_ID.get(id)?.g === g);
    const sel = selId ? CONSUMABLE_BY_ID.get(selId) : undefined;
    box.appendChild(selectRow(g.replace('Scroll of ', 'Scroll: '), sel ? { name: sel.n, ic: sel.ic, color: QUALITY_COLOR[sel.q], sub: statText(sel.st) } : null, () => pickFrom({
      title: g, rows: consRows(pool), selected: selId ?? null, none: 'None',
      onPick: k => {
        const rest = (c.scrolls || []).filter(id => CONSUMABLE_BY_ID.get(id)?.g !== g);
        c.scrolls = k == null ? rest : [...rest, k];
        if (!c.scrolls.length) delete c.scrolls;
        commit();
      },
    })));
  }
  box.appendChild(row('potion'));
  box.appendChild(h('p', { class: 'note' }, 'Scrolls of different kinds stack.'));
  return box;
}

// ------------------------------------------------------------------ the fight
function hitText(b: Boss): string {
  return b.dmg ? `${b.dmg[0].toLocaleString()}–${b.dmg[1].toLocaleString()} per hit` : 'no melee to speak of';
}

export function bossRows(): PickRow<number>[] {
  return BOSSES.map(b => ({
    key: b.id, name: b.n, group: b.raid, ic: undefined,
    sub: `Level ${b.lvl} · ${fmt(b.swing, 1)} sec swing${b.dw ? ' · two weapons' : ''} · ${hitText(b)}`,
    sub2: b.note,
    search: b.ab.map(a => a.n).join(' '),
    info: () => bossCard(b),
  }));
}

export function bossCard(b: Boss): HTMLElement {
  return h('div', { class: 'tt' },
    h('div', { class: 'tn', style: { color: '#ffd100' } }, b.n),
    h('div', { class: 'small' }, `${b.raid} · Level ${b.lvl} (boss)`),
    h('div', { class: 'lr' }, h('span', null, 'Swing'), h('span', null, `${fmt(b.swing, 1)} sec${b.dw ? ', two weapons' : ''}`)),
    h('div', { class: 'lr' }, h('span', null, 'Melee hit (before armor)'), h('span', null, b.dmg ? `${b.dmg[0].toLocaleString()}–${b.dmg[1].toLocaleString()}` : '—')),
    h('p', { class: 'note' }, b.note),
    b.ab.length ? h('div', { class: 'y', style: { marginTop: '6px' } }, 'Abilities') : null,
    b.ab.map(a => h('div', { class: 'abl' }, h('a', { href: a.id ? wowheadSpellUrl(a.id) : wowheadSearchUrl(a.n), target: '_blank', rel: 'noopener' }, a.n), a.d ? h('span', { class: 'small' }, ` · ${a.d}`) : null)),
    h('div', { class: 'src' }, 'Hit sizes from the cmangos TBC server data (base damage and attack power for the boss\'s level). ',
      h('a', { href: wowheadNpcUrl(b.id), target: '_blank', rel: 'noopener' }, 'View on Wowhead')));
}

export function pickBoss(p: Profile) {
  pickFrom({
    title: 'Boss', rows: bossRows(), selected: p.opts.boss ?? null, none: 'Any level 73 boss (set the swing speed yourself)',
    placeholder: `Search ${BOSSES.length} bosses, raids or abilities`,
    onPick: k => { if (k == null) delete p.opts.boss; else p.opts.boss = k; commit(); },
  });
}

function fightFrame(p: Profile): HTMLElement {
  const box = h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'The Fight'));
  const b = p.opts.boss ? BOSS_BY_ID.get(p.opts.boss) : undefined;
  box.appendChild(selectRow('Boss', b ? { name: b.n, ic: 'inv_misc_bone_humanskull_01', sub: `${b.raid} · ${fmt(b.swing, 1)} sec${b.dw ? ' · two weapons' : ''}` } : { name: 'Any level 73 boss', ic: 'inv_misc_head_dragon_01' }, () => pickBoss(p)));
  if (b) {
    box.appendChild(bossCard(b));
  } else {
    const swing = h('input', { type: 'range', min: '1', max: '3.5', step: '0.1', value: String(p.opts.swing || 2), 'aria-label': 'Boss swing speed' });
    const label = h('span', { class: 'gold' }, `${fmt(p.opts.swing || 2, 1)} sec`);
    swing.oninput = () => { label.textContent = `${fmt(+swing.value, 1)} sec`; };
    swing.onchange = () => { p.opts.swing = +swing.value; commit(); };
    box.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'grow' }, 'Swing speed'), label));
    box.appendChild(swing);
    box.appendChild(h('p', { class: 'note' }, 'Pick a boss above for its real swing speed, hit size and abilities. Most raid bosses swing every 2.0 seconds.'));
  }
  const adds = p.opts.adds || 0;
  box.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'grow' }, 'Extra attackers on you'),
    h('div', { class: 'chips', style: { margin: '0' } }, [0, 1, 2, 3, 4].map(n => h('button', { class: 'chip' + (adds === n ? ' on' : ''), onclick: () => { p.opts.adds = n; commit(); } }, String(n))))));
  box.appendChild(h('p', { class: 'note' }, 'Adds hitting you use up Holy Shield and Shield Block charges too, which leaves more of the boss\'s swings uncovered (see Caps).'));
  return box;
}

void iconUrl; void clear;
