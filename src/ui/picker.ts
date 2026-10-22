// A searchable drop-down list in a bottom sheet: used for consumables, bosses, gems and enchants.
// Rows can be grouped under headers, and rows that can't be picked stay visible (greyed) with the reason.
import { clear, h, icon } from './dom';
import { openSheet, toast } from './sheets';

export interface PickRow<K> {
  key: K;
  name: string;
  ic?: string;
  color?: string;
  sub?: string;                     // first detail line (stats)
  sub2?: string;                    // second detail line (where it works, requirements)
  right?: string | HTMLElement;
  group?: string;
  disabled?: string;                // why it can't be picked
  search?: string;                  // extra words to match
  info?: () => HTMLElement;         // details shown from the ⓘ button
}

export interface PickOpts<K> {
  title: string;
  rows: PickRow<K>[];
  selected?: K | null;
  none?: string;                     // label of a "nothing" row at the top
  placeholder?: string;
  note?: HTMLElement | string | null;
  chips?: { label: string; on: () => boolean; toggle: () => void }[];
  filter?: (r: PickRow<K>) => boolean;
  onPick: (key: K | null) => void;
}

export function pickFrom<K>(o: PickOpts<K>) {
  const search = h('input', { type: 'search', placeholder: o.placeholder || 'Search', style: { width: '100%' } });
  const chips = h('div');
  const list = h('div', { class: 'list' });
  const body = h('div', null, search, o.note ? (typeof o.note === 'string' ? h('p', { class: 'note' }, o.note) : o.note) : null, chips, list);
  const sh = openSheet(o.title, body, { full: true });
  let q = '';
  let limit = 150;
  const draw = () => {
    clear(chips);
    if (o.chips?.length) chips.appendChild(h('div', { class: 'chips' }, o.chips.map(c =>
      h('button', { class: 'chip' + (c.on() ? ' on' : ''), onclick: () => { c.toggle(); limit = 150; draw(); } }, c.label))));
    clear(list);
    if (o.none) list.appendChild(h('div', { class: 'li' + (o.selected == null ? ' sel' : ''), onclick: () => { sh.close(); o.onPick(null); } },
      h('span', { class: 'icon', style: { width: '32px', height: '32px' } }, h('span', { class: 'icon-fallback' }, '✕')),
      h('div', { class: 'grow' }, h('div', { class: 'nm' }, o.none))));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = o.rows.filter(r => (!o.filter || o.filter(r)) && words.every(w => (r.name + ' ' + (r.sub || '') + ' ' + (r.sub2 || '') + ' ' + (r.group || '') + ' ' + (r.search || '')).toLowerCase().includes(w)));
    let group: string | undefined;
    for (const r of rows.slice(0, limit)) {
      if (r.group && r.group !== group) { group = r.group; list.appendChild(h('div', { class: 'grp' }, r.group)); }
      const infoBtn = r.info ? h('button', { class: 'info', 'aria-label': 'Details', onclick: (e: Event) => { e.stopPropagation(); openSheet(r.name, r.info!()); } }, 'i') : null;
      list.appendChild(h('div', {
        class: 'li' + (o.selected != null && r.key === o.selected ? ' sel' : '') + (r.disabled ? ' dis' : ''),
        onclick: () => { if (r.disabled) { toast(r.disabled); return; } sh.close(); o.onPick(r.key); },
      },
      r.ic !== undefined ? icon(r.ic, 32, r.name) : null,
      h('div', { class: 'grow' },
        h('div', { class: 'nm', style: r.color ? { color: r.color } : null }, r.name),
        r.sub ? h('div', { class: 'sub' }, r.sub) : null,
        r.sub2 ? h('div', { class: 'sub' }, r.sub2) : null,
        r.disabled ? h('div', { class: 'sub red' }, r.disabled) : null),
      r.right ? h('span', { class: 'score' }, r.right) : null, infoBtn));
    }
    if (!rows.length) list.appendChild(h('div', { class: 'empty-state' }, 'Nothing matches.'));
    if (rows.length > limit) list.appendChild(h('button', { class: 'btn dark', style: { marginTop: '8px' }, onclick: () => { limit += 300; draw(); } }, `Show more (${rows.length - limit})`));
  };
  let timer = 0;
  search.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(() => { q = search.value; limit = 150; draw(); }, 120); });
  draw();
  return sh;
}

/** a row on a screen that shows the current choice and opens a picker when tapped */
export function selectRow(label: string, value: { name: string; ic?: string; color?: string; sub?: string } | null, onTap: (() => void) | null, disabled?: string): HTMLElement {
  return h('div', { class: 'selrow' + (disabled ? ' dis' : ''), onclick: disabled ? () => toast(disabled) : onTap },
    h('div', { class: 'lbl' }, label),
    h('div', { class: 'val' },
      value ? icon(value.ic, 28, value.name) : h('span', { class: 'icon', style: { width: '28px', height: '28px' } }, h('span', { class: 'icon-fallback' }, '—')),
      h('div', { class: 'grow' },
        h('div', { class: 'nm', style: value?.color ? { color: value.color } : null }, disabled ? disabled : value ? value.name : 'None'),
        value?.sub && !disabled ? h('div', { class: 'sub' }, value.sub) : null),
      h('span', { class: 'caret' }, '▾')));
}
