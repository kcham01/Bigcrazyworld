// TBCrushCalc: the app shell. A top bar with the open character, the screen, and tabs along the bottom.
import { loadData } from './data';
import { verdict } from './engine';
import { buffsView } from './ui/buffs';
import { capsView } from './ui/caps';
import { characterView, mainMode } from './ui/character';
import { clear, h, icon, pct } from './ui/dom';
import { savedView } from './ui/saved';
import { closeAll, closeTop } from './ui/sheets';
import { S, TabId, classOf, cur, describe, init, onRender, specText } from './ui/state';
import { talentsView } from './ui/talents';

const TABS: [TabId, string][] = [['char', 'Character'], ['talents', 'Talents'], ['buffs', 'Buffs'], ['caps', 'Caps'], ['saved', 'Saved']];

const top = h('div', { id: 'top', class: 'rock' });
const view = h('div', { id: 'view' });
const tabs = h('div', { id: 'tabs' });
const app = h('div', { id: 'app', class: 'rock' }, top, view, tabs);

let lastTab: TabId | null = null;
let lastId = '';

function draw() {
  const p = cur();
  // keep the scroll position when the same screen redraws after a change
  const keep = lastTab === S.tab && lastId === p.id ? view.scrollTop : 0;
  lastTab = S.tab; lastId = p.id;

  clear(top);
  const v = verdict(p, mainMode(p));
  top.appendChild(h('button', { style: { border: '0', padding: '0', background: 'none', cursor: 'pointer' }, onclick: () => go('saved'), 'aria-label': 'Characters' },
    icon(classOf(p).icon, 40, p.cls)));
  top.appendChild(h('div', { class: 'who' },
    h('div', { class: 'nm', style: { color: classOf(p).color } }, p.name),
    h('div', { class: 'sub' }, `${describe(p)} · ${specText(p)}`)));
  top.appendChild(h('button', { class: 'verdict ' + (v.uncrushable ? 'ok' : 'bad'), style: { border: '0', cursor: 'pointer', padding: '4px 8px', minWidth: '78px' }, onclick: () => go('caps') },
    h('div', { style: { font: '700 15px var(--body)', color: '#fff' } }, pct(v.total, 1)),
    h('div', { style: { font: '700 9.5px var(--title)', color: v.uncrushable ? '#1eff00' : '#ff5a4a' } }, v.uncrushable ? 'UNCRUSHABLE' : `${pct(v.short, 1)} SHORT`)));

  clear(tabs);
  for (const [id, name] of TABS) tabs.appendChild(h('button', { class: 'tab' + (S.tab === id ? ' on' : ''), onclick: () => go(id) }, name));

  clear(view);
  const screen = S.tab === 'char' ? characterView() : S.tab === 'talents' ? talentsView() : S.tab === 'buffs' ? buffsView() : S.tab === 'caps' ? capsView() : savedView();
  view.appendChild(screen);
  view.scrollTop = keep;
}

function go(tab: TabId) {
  closeAll();
  S.tab = tab;
  draw();
}

// the Android Back button: close a panel, else go back to the Character screen, else leave the app
(window as any).onBack = () => {
  if (closeTop()) return true;
  if (S.tab !== 'char') { go('char'); return true; }
  return false;
};

async function start() {
  const splash = h('div', { class: 'splash' }, h('div', { class: 'logo' }, 'TBCrushCalc'), h('div', { class: 'small' }, 'Loading every item in Outland…'));
  document.body.appendChild(splash);
  try {
    await loadData(name => fetch(`data/${name}.json`).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); }));
  } catch (e) {
    splash.appendChild(h('div', { class: 'red small', style: { marginTop: '12px' } }, `Couldn't load the game data (${String(e)}). Close and reopen the app.`));
    return;
  }
  splash.remove();
  init();
  onRender(draw);
  document.body.appendChild(app);
  draw();
  // external links (Wowhead) are plain target=_blank anchors: the Android app hands them to the browser
  (window as any).__ready = true;
}
start();
