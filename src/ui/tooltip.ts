// Item, gem, enchant and talent tooltips in the style of the game (and Wowhead).
import { ENCHANT_BY_ID, Enchant, Gem, GEM_BY_ID, Item, ITEM_BY_ID, QUALITY_COLOR, SETS, STAT_NAMES, Talent, enchantUrl, wowheadItemUrl, wowheadSpellUrl } from '../data';
import { GearPiece, gemFits, Profile } from '../engine';
import { h } from './dom';

const SOCKET_NAME: Record<string, string> = { red: 'Red Socket', yellow: 'Yellow Socket', blue: 'Blue Socket', meta: 'Meta Socket' };

export interface TooltipCtx { piece?: GearPiece; profile?: Profile; onItemLink?: (id: number) => void; metaActive?: boolean }

export function itemTooltip(it: Item, ctx: TooltipCtx = {}): HTMLElement {
  const box = h('div', { class: 'tt' });
  box.appendChild(h('div', { class: 'tn', style: { color: QUALITY_COLOR[it.q] } }, it.n));
  const lines = it.tt || [];
  let sockIdx = 0;
  const gems = ctx.piece?.gems || [];
  const ench = ctx.piece?.ench ? ENCHANT_BY_ID.get(ctx.piece.ench) : undefined;
  let enchDone = !ench;
  const putEnchant = () => { if (!enchDone && ench) { box.appendChild(h('div', { class: 'g' }, enchantText(ench))); enchDone = true; } };
  for (const l of lines) {
    if (!enchDone && (l[0] === 'sock' || l[0] === 'g' || /^(Requires|Classes|Socket Bonus|Durability)/.test(l[1] || ''))) putEnchant();
    if (l[0] === 'lr') { box.appendChild(h('div', { class: 'lr' }, h('span', null, l[1]), h('span', null, l[2]))); continue; }
    if (l[0] === 'sock') {
      const color = l[1];
      const gem = gems[sockIdx] ? GEM_BY_ID.get(gems[sockIdx]) : undefined;
      sockIdx++;
      if (gem) {
        const ok = gemFits(color, gem.c);
        box.appendChild(h('div', { class: 'sock' }, h('i', { class: 'sock-' + gem.c }),
          h('span', { style: { color: gem.c === 'meta' && ctx.metaActive === false ? '#9d9d9d' : '#fff' } }, gem.tx || gem.n),
          !ok ? h('span', { class: 'gr small' }, ' (wrong color)') : null));
        if (gem.c === 'meta' && gem.req) for (const r of gem.req) box.appendChild(h('div', { class: ctx.metaActive === false ? 'gr small' : 'small', style: { color: ctx.metaActive === false ? '#9d9d9d' : '#fff' } }, r));
      } else {
        box.appendChild(h('div', { class: 'sock gr' }, h('i', { class: 'sock-' + color }), SOCKET_NAME[color] || color));
      }
      continue;
    }
    let text = l[1];
    let cls = l[0] === 'g' ? 'g' : l[0] === 'q0' ? 'gr' : l[0] === 'y' ? 'y' : '';
    if (text.startsWith('Socket Bonus:') && ctx.piece) {
      const all = (it.so || []).every((s, i) => { const g = gems[i] ? GEM_BY_ID.get(gems[i]) : undefined; return g && gemFits(s, g.c); });
      cls = all ? 'g' : 'gr';
    }
    box.appendChild(h('div', { class: cls }, text));
  }
  putEnchant();
  if (it.setId && SETS[it.setId]) {
    const set = SETS[it.setId];
    const owned = new Set<number>();
    if (ctx.profile) for (const s in ctx.profile.gear) { const g = ctx.profile.gear[s as keyof Profile['gear']]; if (g && set.p.includes(g.id)) owned.add(g.id); }
    box.appendChild(h('div', { class: 'y', style: { marginTop: '8px' } }, `${set.n} (${owned.size}/${set.p.length})`));
    for (const pid of set.p) {
      const pi = ITEM_BY_ID.get(pid);
      const name = pi ? pi.n : `Item ${pid}`;
      const el = h('div', { class: 'setp gr' + (owned.has(pid) ? ' on' : ''), style: { paddingLeft: '10px', cursor: pi && ctx.onItemLink ? 'pointer' : 'default' } }, name);
      if (pi && ctx.onItemLink) el.onclick = () => ctx.onItemLink!(pid);
      box.appendChild(el);
    }
    box.appendChild(h('div', { style: { height: '6px' } }));
    for (const [n, text] of set.b) box.appendChild(h('div', { class: 'setb gr' + (owned.size >= n ? ' on' : '') }, `(${n}) Set: ${text}`));
  }
  box.appendChild(h('div', { class: 'y', style: { marginTop: '6px' } }, `Item Level ${it.il}`));
  if (it.drop) box.appendChild(h('div', { class: 'src' }, `Dropped by: ${it.drop}${it.chance ? ' (' + it.chance + ')' : ''}`));
  box.appendChild(h('div', { class: 'src' }, `Phase ${it.ph || 1} · `, h('a', { href: wowheadItemUrl(it.id), target: '_blank', rel: 'noopener' }, 'View on Wowhead')));
  return box;
}

const PCT_STATS: Record<string, string> = { critpct: '% crit', scritpct: '% spell crit', hitpct: '% hit', shitpct: '% spell hit', hitred: '% boss miss chance', slow: '% slower boss swings' };
export function statText(st: Record<string, number>): string {
  const keys = Object.keys(st);
  // "+80 to Arcane, Holy and Nature spell damage" style lists read better merged
  const out: string[] = [];
  const done = new Set<string>();
  const res = ['arcres', 'fireres', 'frostres', 'natres', 'shadres'];
  if (res.every(k => st[k] && st[k] === st.arcres)) { out.push(`+${st.arcres} All Resistances`); res.forEach(k => done.add(k)); }
  if (st.sp && st.heal && st.sp === st.heal) { out.push(`+${st.sp} Spell Damage and Healing`); done.add('sp'); done.add('heal'); }
  if (st.ap && st.rap && st.ap === st.rap) done.add('rap');
  for (const k of keys) {
    if (done.has(k)) continue;
    const v = st[k];
    if (PCT_STATS[k]) out.push(`${v > 0 ? '+' : ''}${v}${PCT_STATS[k]}`);
    else if (k === 'apred') out.push(`-${v} boss attack power`);
    else out.push(`${v >= 0 ? '+' : ''}${v} ${STAT_NAMES[k] || k}`);
  }
  return out.join(', ');
}
export function enchantText(e: Enchant): string {
  const s = statText(e.st);
  return s ? `${e.n.replace(/^Enchant [^-]+ - /, '')} (${s})` : e.n;
}

export function gemTooltip(g: Gem): HTMLElement {
  return h('div', { class: 'tt' },
    h('div', { class: 'tn', style: { color: QUALITY_COLOR[g.q] } }, g.n),
    h('div', null, g.tx || statText(g.st)),
    (g.req || []).map(r => h('div', { class: 'gr small' }, r)),
    h('div', { class: 'gr small' }, g.c === 'meta' ? '"Only fits in a meta gem slot."' : `"Matches a ${colorWords(g.c)} socket."`),
    h('div', { class: 'src' }, h('a', { href: wowheadItemUrl(g.id), target: '_blank', rel: 'noopener' }, 'View on Wowhead')));
}
function colorWords(c: string) {
  const m: Record<string, string> = { red: 'Red', yellow: 'Yellow', blue: 'Blue', orange: 'Red or Yellow', purple: 'Red or Blue', green: 'Yellow or Blue', prismatic: 'Red, Yellow or Blue' };
  return m[c] || c;
}

export function enchantTooltip(e: Enchant): HTMLElement {
  return h('div', { class: 'tt' },
    h('div', { class: 'tn', style: { color: '#1eff00' } }, e.n),
    h('div', { class: 'g' }, e.tx),
    statText(e.st) ? h('div', null, 'Stats: ' + statText(e.st)) : null,
    e.req ? h('div', { class: 'y' }, `Requires a level ${e.req} or higher item`) : null,
    e.prof ? h('div', { class: 'small' }, `Requires ${e.prof}`) : null,
    e.rep ? h('div', { class: 'small' }, `Formula from ${e.rep}`) : null,
    e.cl ? h('div', { class: 'small' }, `${e.cl[0].toUpperCase() + e.cl.slice(1)}s only`) : null,
    h('div', { class: 'src' }, h('a', { href: enchantUrl(e), target: '_blank', rel: 'noopener' }, e.id ? 'View on Wowhead' : 'Search Wowhead')));
}

export function talentTooltip(t: Talent, rank: number, treeName: string, reqText: string[]): HTMLElement {
  const box = h('div', { class: 'tt' },
    h('div', { class: 'tn', style: { color: '#fff' } }, t.n),
    h('div', null, `Rank ${rank}/${t.max}`));
  for (const r of reqText) box.appendChild(h('div', { class: 'red' }, r));
  if (rank > 0) box.appendChild(h('div', { class: 'y', style: { marginTop: '4px' } }, t.d[rank - 1] || ''));
  if (rank < t.max) {
    if (rank > 0) box.appendChild(h('div', { style: { marginTop: '8px' } }, 'Next rank:'));
    box.appendChild(h('div', { class: 'y' }, t.d[rank] || t.d[0] || ''));
  }
  const spell = t.spells[Math.max(0, Math.min(t.spells.length - 1, rank - 1))];
  if (spell) box.appendChild(h('div', { class: 'src' }, treeName + ' · ', h('a', { href: wowheadSpellUrl(spell), target: '_blank', rel: 'noopener' }, 'View on Wowhead')));
  return box;
}
