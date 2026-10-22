// The Saved screen: your characters (alts), new / copy / rename / delete, and sharing a character
// as a text code.
import { BASES, CLASSES, ClassId, RACE_ICON, RACE_NAMES } from '../data';
import { BOSS, Profile, verdict } from '../engine';
import { autoGear, exportCode, importCode, newProfile } from '../store';
import { mainMode } from './character';
import { clear, h, icon, pct } from './dom';
import { confirmSheet, openSheet, toast } from './sheets';
import { S, addProfile, classOf, commit, cur, describe, removeProfile, select, specText } from './state';

declare const APP_VERSION: string;

export function savedView(): HTMLElement {
  const root = h('div', { class: 'wrap' });
  const list = [...S.list].sort((a, b) => b.updated - a.updated);
  const box = h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Characters'));
  for (const p of list) {
    const v = verdict(p, mainMode(p));
    box.appendChild(h('div', { class: 'prof' + (p.id === S.curId ? ' cur' : ''), onclick: () => { select(p.id); toast(`Now showing ${p.name}`); } },
      h('div', { style: { position: 'relative' } }, icon(RACE_ICON[p.race], 44, p.race),
        h('span', { style: { position: 'absolute', right: '-6px', bottom: '-6px' } }, icon(classOf(p).icon, 22, p.cls))),
      h('div', { class: 'info' },
        h('div', { class: 'n', style: { color: classOf(p).color } }, p.name),
        h('div', { class: 'd' }, `${describe(p)} · ${specText(p)}`),
        h('div', { class: 'd', style: { color: v.uncrushable ? '#1eff00' : '#ff5a4a' } }, `${pct(v.total)} ${v.uncrushable ? 'uncrushable' : `(${pct(BOSS.cap - v.total)} short)`}`)),
      h('button', { class: 'btn dark small', onclick: (e: Event) => { e.stopPropagation(); openManage(p); } }, '···')));
  }
  box.appendChild(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
    h('button', { class: 'btn', onclick: openNew }, 'New character'),
    h('button', { class: 'btn dark', onclick: openImport }, 'Import code')));
  root.appendChild(box);

  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'About'),
    h('p', { class: 'note' }, `TBCrushCalc ${APP_VERSION}. A gear planner and crush / crit cap calculator for Burning Crusade tanks.`),
    h('p', { class: 'note' }, 'Item, gem, enchant and talent data from the wowsims/tbc and oppahansi/ltc projects. Item icons and links from Wowhead. Characters are saved on this phone only.'),
    h('p', { class: 'note' }, 'World of Warcraft and The Burning Crusade are trademarks of Blizzard Entertainment. This app is not made or endorsed by Blizzard.')));
  return root;
}

function raceChips(cls: ClassId, race: string, pick: (r: string) => void): HTMLElement {
  return h('div', { class: 'chips' }, Object.keys(BASES[cls]).sort((a, b) => RACE_NAMES[a].localeCompare(RACE_NAMES[b])).map(r =>
    h('button', { class: 'chip' + (r === race ? ' on' : ''), onclick: () => pick(r) }, RACE_NAMES[r])));
}

function openNew() {
  let cls: ClassId = 'paladin', race = 'human', gear = true;
  const name = h('input', { type: 'text', placeholder: 'Name', maxlength: '24', style: { width: '100%' } });
  const body = h('div');
  const sh = openSheet('New character', body);
  const draw = () => {
    const keep = name.value;
    clear(body);
    if (!BASES[cls][race]) race = Object.keys(BASES[cls])[0];
    body.appendChild(name); name.value = keep;
    body.appendChild(h('h3', { class: 'sec' }, 'Class'));
    body.appendChild(h('div', { class: 'seg' }, CLASSES.map(c => h('button', { class: 'chip' + (c.id === cls ? ' on' : ''), onclick: () => { cls = c.id; draw(); } }, c.name))));
    body.appendChild(h('h3', { class: 'sec' }, 'Race'));
    body.appendChild(raceChips(cls, race, r => { race = r; draw(); }));
    body.appendChild(h('div', { class: 'tog ' + (gear ? 'on' : 'off'), onclick: () => { gear = !gear; draw(); } }, h('span', { class: 'box' }),
      h('div', { class: 'txt' }, h('div', { class: 'n' }, 'Start in phase 1 gear'), h('div', { class: 'd' }, 'Fills every slot with high-avoidance phase 1 items. Change them on the Character screen.'))));
    body.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
      h('button', { class: 'btn dark', onclick: () => sh.close() }, 'Cancel'),
      h('button', { class: 'btn', onclick: () => {
        const p = newProfile(cls, race, name.value.trim() || `${RACE_NAMES[race]} ${CLASSES.find(c => c.id === cls)!.name}`);
        if (gear) p.gear = autoGear(p, 1);
        p.buffs = { kings: 1, motw: 1, fort: 1, flaskfort: 1, foodsta: 1 };
        sh.close(); addProfile(p); S.tab = 'talents'; commit(); toast('Now spend your talent points');
      } }, 'Create')));
  };
  draw();
}

function openManage(p: Profile) {
  const body = h('div');
  const sh = openSheet(p.name, body);
  const name = h('input', { type: 'text', value: p.name, maxlength: '24', style: { width: '100%' } });
  const draw = () => {
    clear(body);
    body.appendChild(h('h3', { class: 'sec' }, 'Name'));
    body.appendChild(h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, name,
      h('button', { class: 'btn small', onclick: () => { p.name = name.value.trim() || p.name; commit(); sh.setTitle(p.name); toast('Renamed'); } }, 'Save')));
    body.appendChild(h('h3', { class: 'sec' }, 'Race'));
    body.appendChild(raceChips(p.cls, p.race, r => { p.race = r; commit(); draw(); }));
    const code = exportCode(p);
    const ta = h('textarea', { readonly: true, rows: '3', style: { width: '100%', fontSize: '11px' } }, code);
    body.appendChild(h('h3', { class: 'sec' }, 'Share code'));
    body.appendChild(ta);
    body.appendChild(h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '10px' } },
      h('button', { class: 'btn dark small', onclick: () => copy(code, ta) }, 'Copy code'),
      h('div', { class: 'row' },
        h('button', { class: 'btn dark small', onclick: () => {
          const c = JSON.parse(JSON.stringify(p)) as Profile;
          c.id = Math.random().toString(36).slice(2, 10); c.name = `${p.name} copy`; c.updated = Date.now();
          sh.close(); addProfile(c); toast('Copied');
        } }, 'Duplicate'),
        h('button', { class: 'btn small', onclick: () => confirmSheet('Delete character', `Delete ${p.name}? This can't be undone.`, 'Delete', () => { sh.close(); removeProfile(p.id); }) }, 'Delete'))));
  };
  draw();
}

function copy(text: string, ta: HTMLTextAreaElement) {
  const done = () => toast('Code copied');
  const fallback = () => { ta.select(); try { document.execCommand('copy'); done(); } catch { toast('Select the code and copy it'); } };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}

function openImport() {
  const ta = h('textarea', { rows: '4', placeholder: 'Paste a TBCC1: code', style: { width: '100%' } });
  const body = h('div', null, h('p', { class: 'note' }, 'Paste a code shared from TBCrushCalc to add that character.'), ta);
  const sh = openSheet('Import', body);
  body.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
    h('button', { class: 'btn dark', onclick: () => sh.close() }, 'Cancel'),
    h('button', { class: 'btn', onclick: () => {
      const p = importCode(ta.value);
      if (!p) { toast('That code didn\'t work'); return; }
      sh.close(); addProfile(p); toast(`Imported ${p.name}`);
    } }, 'Import')));
  void cur;
}
