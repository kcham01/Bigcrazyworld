// The app's state: saved characters, which one is open, which screen is showing.
import { CLASSES, RACE_NAMES } from '../data';
import { Profile, treePoints } from '../engine';
import { loadAll, loadCurrentId, saveAll, saveCurrentId } from '../store';

export type StatView = 'base' | 'def' | 'melee' | 'ranged' | 'spell';
export type TabId = 'char' | 'talents' | 'buffs' | 'caps' | 'saved';

export const S = {
  list: [] as Profile[],
  curId: '' as string,
  tab: 'char' as TabId,
  tree: -1,                // talent tree on screen (-1 = the tree with most points)
  capMode: 'cooldown' as 'passive' | 'cooldown' | 'procs',
  statL: 'base' as StatView,
  statR: 'def' as StatView,
  phase: 5,
  armorOnly: true,
  minLevel: 0,             // item picker: lowest required level shown
};

let renderFn: () => void = () => {};
export function onRender(fn: () => void) { renderFn = fn; }
export function render() { renderFn(); }

export function init() {
  S.list = loadAll();
  const id = loadCurrentId();
  S.curId = S.list.find(p => p.id === id)?.id || S.list[0].id;
}

export function cur(): Profile {
  return S.list.find(p => p.id === S.curId) || S.list[0];
}

/** save after a change and redraw */
export function commit() {
  const p = cur();
  p.updated = Date.now();
  saveAll(S.list);
  render();
}

export function select(id: string) {
  S.curId = id;
  S.tree = -1;
  saveCurrentId(id);
  render();
}

export function addProfile(p: Profile) {
  S.list.push(p);
  saveAll(S.list);
  select(p.id);
}

export function removeProfile(id: string) {
  S.list = S.list.filter(p => p.id !== id);
  if (!S.list.length) S.list = loadAll();          // never empty: bring back the examples
  saveAll(S.list);
  if (S.curId === id) select(S.list[0].id); else render();
}

export const classOf = (p: Profile) => CLASSES.find(c => c.id === p.cls)!;
export const describe = (p: Profile) => `Level 70 ${RACE_NAMES[p.race] || p.race} ${classOf(p).name}`;
export const specText = (p: Profile) => treePoints(p).join(' / ');
