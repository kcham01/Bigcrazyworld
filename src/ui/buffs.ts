// The Buffs screen: raid buffs and consumables (with the game's flask / elixir rules), your own
// cooldowns and procs, trinkets you press, and how fast the boss swings.
import { BUFFS, BUFF_GROUP_NAMES, Buff, ITEM_BY_ID, STAT_NAMES, Slot } from '../data';
import { talentRank } from '../engine';
import { fmt, h, icon } from './dom';
import { commit, cur } from './state';

const EXCLUSIVE = ['flask', 'battle', 'guardian', 'food'];

function toggle(on: boolean, ic: HTMLElement | null, name: string, desc: string, onclick: () => void, extra?: HTMLElement | null, disabled = false): HTMLElement {
  return h('div', { class: 'tog ' + (on ? 'on' : 'off'), style: disabled ? { opacity: '.5' } : null, onclick: disabled ? null : onclick },
    h('span', { class: 'box' }), ic, h('div', { class: 'txt' }, h('div', { class: 'n' }, name), h('div', { class: 'd' }, desc)), extra || null);
}

export function buffsView(): HTMLElement {
  const p = cur();
  const root = h('div', { class: 'wrap' });

  // your abilities
  const mine: HTMLElement[] = [];
  if (p.cls === 'paladin') {
    const hs = talentRank(p, 'holyShield') > 0;
    const charges = 4 + 2 * talentRank(p, 'improvedHolyShield');
    mine.push(toggle(p.opts.holyShield && hs, icon('spell_holy_blessingofprotection', 32, 'HS'), 'Holy Shield',
      hs ? `+30% block for 10 sec, ${charges} charges. Counted in the "cooldown" and "procs" views.` : 'Needs the Holy Shield talent.',
      () => { p.opts.holyShield = !p.opts.holyShield; commit(); }, null, !hs));
    const rd = talentRank(p, 'redoubt');
    mine.push(toggle(p.opts.redoubt && rd > 0, icon('ability_defend', 32, 'Rd'), 'Redoubt',
      rd ? `Hits on you have a 10% chance to give +${6 * rd}% block for 10 sec or 5 blocks. A proc: only counted in the "procs" view.` : 'Needs the Redoubt talent.',
      () => { p.opts.redoubt = !p.opts.redoubt; commit(); }, null, !rd));
  }
  if (p.cls === 'warrior') {
    const isb = talentRank(p, 'improvedShieldBlock');
    mine.push(toggle(p.opts.shieldBlock, icon('ability_defend', 32, 'SB'), 'Shield Block',
      `+75% block for ${5 + isb} sec, ${1 + isb} charge${isb ? 's' : ''}, 5 sec cooldown. Counted in the "cooldown" and "procs" views.`,
      () => { p.opts.shieldBlock = !p.opts.shieldBlock; commit(); }));
  }
  if (p.cls === 'druid') {
    mine.push(toggle(p.opts.bear, icon('ability_racial_bearform', 32, 'B'), 'Dire Bear Form',
      '+400% armor from items, +25% stamina. Bears can\'t block or parry.', () => { p.opts.bear = !p.opts.bear; commit(); }));
  }
  for (const s of ['trinket1', 'trinket2'] as Slot[]) {
    const it = p.gear[s] && ITEM_BY_ID.get(p.gear[s]!.id);
    if (!it || !it.fx?.length) continue;
    const e = it.fx[0];
    const what = it.fx.map(f => `+${f.amount} ${STAT_NAMES[f.stat] || f.stat}`).join(', ');
    mine.push(toggle(!!p.opts.uses[String(it.id)], icon(it.ic, 32, it.n), it.n,
      `${e.kind === 'use' ? 'Use' : 'Proc'}: ${what}${e.dur ? ` for ${e.dur} sec` : ''}${e.cd ? `, ${e.cd >= 60 ? fmt(e.cd / 60, 0) + ' min' : e.cd + ' sec'} cooldown` : ''}. Counted in the "procs" view.`,
      () => { p.opts.uses[String(it.id)] = !p.opts.uses[String(it.id)]; commit(); }));
  }
  if (!mine.length) mine.push(h('p', { class: 'note' }, 'Nothing to switch on: equip a shield, or a trinket you can use.'));
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Your Abilities'), mine));

  // buffs and consumables
  const groups = ['raid', 'flask', 'battle', 'guardian', 'food'];
  for (const g of groups) {
    const list = BUFFS.filter(b => b.group === g);
    const box = h('div', { class: 'frame rock' }, h('div', { class: 'title' }, BUFF_GROUP_NAMES[g]));
    for (const b of list) box.appendChild(buffRow(b));
    if (g === 'battle' || g === 'guardian') box.appendChild(h('p', { class: 'note' }, 'A flask takes the place of both a battle and a guardian elixir.'));
    root.appendChild(box);
  }

  // the fight
  const swing = h('input', { type: 'range', min: '1', max: '3', step: '0.1', value: String(p.opts.swing || 2) });
  const swingLabel = h('span', { class: 'gold' }, `${fmt(p.opts.swing || 2, 1)} sec`);
  swing.oninput = () => { swingLabel.textContent = `${fmt(+swing.value, 1)} sec`; };
  swing.onchange = () => { p.opts.swing = +swing.value; commit(); };
  const adds = p.opts.adds || 0;
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'The Fight'),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Boss swing speed'), swingLabel), swing,
    h('p', { class: 'note' }, 'Most raid bosses swing every 2.0 seconds. Faster bosses use up Holy Shield and Shield Block charges sooner.'),
    h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'grow' }, 'Extra attackers on you'),
      h('div', { class: 'chips', style: { margin: '0' } }, [0, 1, 2, 3].map(n => h('button', { class: 'chip' + (adds === n ? ' on' : ''), onclick: () => { p.opts.adds = n; commit(); } }, String(n))))),
    h('p', { class: 'note' }, 'Adds hitting you also use up block charges, which leaves more of the boss\'s swings uncovered (see Caps).')));
  return root;
}

function buffRow(b: Buff): HTMLElement {
  const p = cur();
  const on = p.buffs[b.id] || 0;
  const flip = () => {
    if (on) delete p.buffs[b.id];
    else {
      if (EXCLUSIVE.includes(b.group)) {
        for (const o of BUFFS) if (o.group === b.group) delete p.buffs[o.id];
        if (b.group === 'flask') for (const o of BUFFS) if (o.group === 'battle' || o.group === 'guardian') delete p.buffs[o.id];
        if (b.group === 'battle' || b.group === 'guardian') for (const o of BUFFS) if (o.group === 'flask') delete p.buffs[o.id];
      }
      p.buffs[b.id] = 1;
    }
    commit();
  };
  const imp = b.improved ? h('button', { class: 'chip imp' + (on === 2 ? ' on' : ''), onclick: (e: Event) => {
    e.stopPropagation();
    p.buffs[b.id] = on === 2 ? 1 : 2;
    commit();
  }, title: b.improved.name }, 'Improved') : null;
  return toggle(!!on, icon(b.icon, 32, b.name), b.name, b.text + (on === 2 && b.improved ? ` ${b.improved.name}.` : ''), flip, imp);
}
