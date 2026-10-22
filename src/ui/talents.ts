// The Talents screen, like the game's talent frame: one tree at a time, 4 columns, arrows for
// prerequisites, rank badges, and the tree tabs along the bottom.
import { TALENTS, Talent } from '../data';
import { treePoints } from '../engine';
import { MAX_POINTS, canAdd, canRemove, key, spent, unlocked } from '../talentRules';
import { clear, h } from './dom';
import { confirmSheet, openSheet } from './sheets';
import { S, commit, cur } from './state';
import { talentTooltip } from './tooltip';

const PITCH = 64;          // 50px icon + 14px gap
const TREE_TINT: Record<string, string> = {
  Arms: '#5a3a1e', Fury: '#6a1d12', Protection: '#2b3a52', Holy: '#5d5220', Retribution: '#5a2020',
  Balance: '#25304f', 'Feral Combat': '#4a3216', Restoration: '#1f4a25',
};

export function talentsView(): HTMLElement {
  const p = cur();
  const trees = TALENTS[p.cls];
  const pts = treePoints(p);
  if (S.tree < 0 || S.tree >= trees.length) S.tree = pts.indexOf(Math.max(...pts));
  const ti = S.tree;
  const tree = trees[ti];
  const left = MAX_POINTS - spent(p.talents);
  const root = h('div', { class: 'wrap' });

  const grid = h('div', { class: 'tgrid', style: { gridTemplateRows: `repeat(9, 50px)` } });
  // arrows first so the icons sit on top of them
  for (const t of tree.talents) {
    if (!t.req) continue;
    const [pr, pc] = t.req;
    const pre = tree.talents.find(x => x.r === pr && x.c === pc);
    const on = !!pre && (p.talents[key(ti, pre)] || 0) >= pre.max;
    if (pc === t.c) {
      grid.appendChild(h('div', { class: 'arrow' + (on ? ' on' : ''), style: {
        left: `calc(${(t.c + 0.5) * 25}% - 3px)`, top: `${pr * PITCH + 52}px`, height: `${(t.r - pr) * PITCH - 60}px` } }));
    } else {
      const a = Math.min(pc, t.c), b = Math.max(pc, t.c);
      grid.appendChild(h('div', { class: 'arrow h ' + (t.c < pc ? 'left' : 'right') + (on ? ' on' : ''), style: {
        top: `${t.r * PITCH + 22}px`, left: `calc(${(a + 0.5) * 25}% + 28px)`, width: `calc(${(b - a) * 25}% - 64px)` } }));
    }
  }
  for (const t of tree.talents) {
    const rank = p.talents[key(ti, t)] || 0;
    const open = unlocked(p.cls, p.talents, ti, t);
    const state = rank >= t.max ? 'maxed' : open && left > 0 ? 'avail' : rank > 0 ? 'avail' : 'locked';
    grid.appendChild(h('button', {
      class: 'tal ' + state, style: { gridRow: String(t.r + 1), gridColumn: String(t.c + 1) }, 'aria-label': t.n,
      onclick: () => openTalent(ti, t),
    }, h('img', { src: `talents/${t.ic}.jpg`, alt: '', draggable: 'false' }), (rank > 0 || open) ? h('span', { class: 'rk' }, `${rank}/${t.max}`) : null));
  }

  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Talents'),
    h('div', { class: 'tpts' }, h('span', null, `${tree.name}: ${pts[ti]}`), h('span', { style: { color: left ? '#1eff00' : '#ffd100' } }, `Points left: ${left}`)),
    h('div', { class: 'tree inset', style: { background: `radial-gradient(ellipse at 50% 0%, ${TREE_TINT[tree.name] || '#333'}aa, transparent 70%), rgba(0,0,0,.5)` } }, grid),
    h('div', { class: 'treetabs' }, trees.map((t, i) => h('button', { class: 'tab' + (i === ti ? ' on' : ''), onclick: () => { S.tree = i; commit(); } }, t.name, h('small', null, String(pts[i]))))),
    h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '12px' } },
      h('button', { class: 'btn dark small', onclick: () => confirmSheet('Reset tree', `Remove all points from ${tree.name}?`, 'Reset', () => resetTree(ti)) }, 'Reset tree'),
      h('button', { class: 'btn dark small', onclick: () => confirmSheet('Reset talents', 'Remove every talent point?', 'Reset', () => { p.talents = {}; commit(); }) }, 'Reset all'))));
  root.appendChild(h('p', { class: 'note center' }, `${p.name}: ${pts.join(' / ')}. Tap a talent to see it and add or remove points.`));
  return root;
}

function resetTree(ti: number) {
  const p = cur();
  for (const k of Object.keys(p.talents)) if (k.startsWith(ti + '.')) delete p.talents[k];
  commit();
}

function openTalent(ti: number, t: Talent) {
  const p = cur();
  const tree = TALENTS[p.cls][ti];
  const body = h('div');
  openSheet(t.n, body);
  const fill = () => {
    clear(body);
    const k = key(ti, t);
    const rank = p.talents[k] || 0;
    const req: string[] = [];
    const above = tree.talents.filter(x => x.r < t.r).reduce((n, x) => n + (p.talents[key(ti, x)] || 0), 0);
    if (above < t.r * 5) req.push(`Requires ${t.r * 5} points in ${tree.name} Talents`);
    if (t.req) {
      const pre = tree.talents.find(x => x.r === t.req![0] && x.c === t.req![1]);
      if (pre && (p.talents[key(ti, pre)] || 0) < pre.max) req.push(`Requires ${pre.max} point${pre.max > 1 ? 's' : ''} in ${pre.n}`);
    }
    body.appendChild(h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
      h('img', { src: `talents/${t.ic}.jpg`, alt: '', style: { width: '48px', height: '48px', borderRadius: '5px', boxShadow: '0 0 0 1px #000, 0 0 0 2px #7a6a52' } }),
      h('div', { class: 'grow' }, talentTooltip(t, rank, tree.name, req))));
    const minus = h('button', { class: 'btn dark', disabled: !canRemove(p.cls, p.talents, ti, t), onclick: () => {
      if (!canRemove(p.cls, p.talents, ti, t)) return;
      p.talents[k] = rank - 1; if (!p.talents[k]) delete p.talents[k]; commit(); fill();
    } }, '− Remove point');
    const plus = h('button', { class: 'btn', disabled: !canAdd(p.cls, p.talents, ti, t), onclick: () => {
      if (!canAdd(p.cls, p.talents, ti, t)) return;
      p.talents[k] = rank + 1; commit(); fill();
    } }, '+ Add point');
    body.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '12px' } }, minus, plus));
    if (rank > 0 && !canRemove(p.cls, p.talents, ti, t)) body.appendChild(h('p', { class: 'note' }, 'Other talents depend on this one, so its points can\'t come out yet.'));
    if (spent(p.talents) >= MAX_POINTS && rank < t.max) body.appendChild(h('p', { class: 'note' }, 'All 61 points are spent.'));
  };
  fill();
}
