// What the inspector shows for a creature, a town, a realm, a war, a person in the history books,
// a species, or a patch of land. Each view is a set of tabs rendered as HTML strings; links use
// data-go="kind:id" and are handled by the app.
import type { Sim } from '../sim/sim';
import { STATE_NAMES, JOB_NAMES, TRAIT_NAMES, TRAIT_GOOD, UF } from '../sim/units';
import { SPECIES } from '../sim/species';
import { G, GENE_NAMES } from '../sim/genetics';
import { RES_NAMES, BIOMES, ORE_NAMES, TICKS_PER_YEAR, SEASON_NAMES } from '../sim/defs';
import { BUILDINGS, GOV_NAMES } from '../sim/entities';
import { ERAS, TECHS, TECH_BY_KEY, WEAPON_NAMES, RANGED_NAMES, ARMOR_NAMES } from '../sim/tech';
import { charByUid } from '../sim/people';
import { techCost } from '../sim/kingdom';
import { esc, hex, fmt } from './dom';

export interface View { title: string; sub: string; color?: number; portrait?: string; tabs: { name: string; html: () => string }[]; actions?: { id: string; label: string; on?: boolean }[] }

const yr = (sim: Sim, tick: number) => `${1 + Math.floor(tick / TICKS_PER_YEAR)}`;
const kv = (rows: [string, string | number][]) => `<dl class="kv">${rows.filter(r => r[1] !== '' && r[1] !== undefined).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
const bar = (v: number, color = 'var(--moss)') => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v)).toFixed(0)}%;background:${color}"></i></div>`;
export const link = (kind: string, id: number | string, text: string) => `<span class="link" data-go="${kind}:${id}">${esc(text)}</span>`;
export function kLink(sim: Sim, k: number) { const kg = sim.kingdoms[k]; return kg ? `<span class="swatch" style="background:${hex(kg.color)}"></span>${link('kingdom', k, kg.name)}${kg.alive ? '' : ' <small>(fallen)</small>'}` : '—'; }
export function cLink(sim: Sim, c: number) { const ct = sim.cities[c]; return ct ? link('city', c, ct.name) + (ct.alive ? '' : ' <small>(ruins)</small>') : '—'; }
function chLink(sim: Sim, id: number) { const ch = sim.chars[id]; return ch ? link('char', id, ch.name + (ch.family ? ' ' + ch.family : '')) : '—'; }
function uidLink(sim: Sim, uid: number) {
  if (!uid) return '—';
  const u = sim.units.idx(uid);
  if (u >= 0) return link('unit', uid, sim.unitName(u));
  const ch = sim.chars.find(c => c.uid === uid);
  return ch ? chLink(sim, ch.id) + ' <small>†</small>' : '<small>unknown, long gone</small>';
}

export function eventsHtml(sim: Sim, ids: number[] | null, filter?: (e: any) => boolean, max = 80) {
  let list = ids ? ids.map(i => sim.events[i]).filter(Boolean) : sim.events;
  if (filter) list = list.filter(filter);
  list = list.slice(-max).reverse();
  if (!list.length) return '<p class="dim">Nothing has been written down yet.</p>';
  return list.map(e => `<div class="ev imp${e.imp}"><span class="y">Y${yr(sim, e.tick)}</span><span class="link" data-go="pos:${e.x.toFixed(1)},${e.y.toFixed(1)}" style="color:inherit;text-decoration:none">${esc(e.text)}</span></div>`).join('');
}

// ------------------------------------------------------------------ a creature
export function unitView(sim: Sim, u: number, following: boolean): View {
  const U = sim.units, d = SPECIES[U.spec[u]];
  const sub = sim.subs[U.sub[u]];
  const ch = sim.charOf(u);
  const age = Math.floor(sim.ageYears(u));
  const c = U.city[u], k = sim.unitKingdom(u);
  const tabs: View['tabs'] = [];
  tabs.push({ name: 'About', html: () => {
    const fav = U.flags[u] & UF.Fav;
    const rows: [string, string | number][] = [
      ['Kind', d.sapient ? `${esc(sub.name)}` : link('species', sub.id, sub.name)],
      ['Age', `${age} years`],
      ['Doing', esc(STATE_NAMES[U.state[u]])],
    ];
    if (d.sapient) {
      rows.push(['Work', U.flags[u] & UF.Ruler ? 'Rules the realm' : esc(JOB_NAMES[U.job[u]])]);
      rows.push(['Home', c >= 0 ? cLink(sim, c) : U.band[u] >= 0 ? 'a wandering tribe' : 'nowhere']);
      if (k >= 0) rows.push(['Realm', kLink(sim, k)]);
      if (U.culture[u] >= 0) rows.push(['People', esc(sim.cultures[U.culture[u]].name)]);
      rows.push(['Faith', U.religion[u] >= 0 ? link('religion', U.religion[u], sim.religions[U.religion[u]].name) : 'none']);
    }
    rows.push(['Health', `${Math.ceil(U.hp[u])} / ${Math.ceil(U.maxHp[u])}`]);
    rows.push(['Attack', U.atk[u].toFixed(1)]);
    if (d.sapient) rows.push(['Level', `${U.level[u]} <small>(${U.kills[u]} kills)</small>`]);
    if (U.disease[u]) rows.push(['Sick with', esc(sim.diseases[U.disease[u] - 1]?.name || 'a disease')]);
    if (d.sapient && (U.weapon[u] || U.armor[u])) rows.push(['Gear', `${esc((U.slot[u] & 128 ? RANGED_NAMES : WEAPON_NAMES)[U.weapon[u]])}, ${esc(ARMOR_NAMES[U.armor[u]])}${U.mount[u] ? ', mounted' : ''}`]);
    let s = '';
    if (ch && ch.titles.length) s += `<div class="chips">${ch.titles.map(t => `<span class="chip good">${esc(t)}</span>`).join('')}</div>`;
    s += kv(rows);
    s += `<div class="sec">Hunger</div>${bar(100 - U.hunger[u], U.hunger[u] > 70 ? 'var(--ember)' : 'var(--moss)')}`;
    if (U.flags[u] & UF.Immortal) s += '<p><small>Blessed with immortality.</small></p>';
    if (fav) s += '<p><small>One of your favourites.</small></p>';
    s += `<p class="dim"><small>${esc(d.desc)}</small></p>`;
    return s;
  } });
  tabs.push({ name: 'Traits', html: () => {
    let s = '<div class="chips">';
    for (let t = 0; t < 32; t++) if (U.traits[u] & (1 << t)) s += `<span class="chip ${TRAIT_GOOD.has(t) ? 'good' : 'bad'}">${esc(TRAIT_NAMES[t])}</span>`;
    s += '</div><div class="sec">Genes</div><div class="genes">';
    for (let g = 0; g < G; g++) { const v = U.genome[u * G + g]; s += `<span>${esc(GENE_NAMES[g])}</span><span class="gbar"><i style="width:${(v / 2.55).toFixed(0)}%"></i></span><span>${v}</span>`; }
    s += '</div>';
    return s;
  } });
  if (d.sapient) tabs.push({ name: 'Family', html: () => {
    const rows: [string, string][] = [['Father', uidLink(sim, U.father[u])], ['Mother', uidLink(sim, U.mother[u])], ['Spouse', uidLink(sim, U.spouse[u])]];
    let s = kv(rows);
    const kids: string[] = [];
    const uid = U.uid[u];
    for (let j = 0; j < U.hi && kids.length < 30; j++) if (U.alive[j] && (U.father[j] === uid || U.mother[j] === uid)) kids.push(link('unit', U.uid[j], sim.unitName(j)));
    s += `<div class="sec">Children</div><p>${kids.length ? kids.join(', ') : 'None living.'}</p>`;
    if (ch && ch.dynasty >= 0) { const dy = sim.dynasties[ch.dynasty]; s += `<div class="sec">House</div><p>House ${esc(dy.name)}, ${dy.rulers} ruler${dy.rulers === 1 ? '' : 's'} since year ${yr(sim, dy.born)}.</p>`; }
    return s;
  } });
  if (ch) tabs.push({ name: 'Life', html: () => eventsHtml(sim, ch.deeds) });
  return {
    title: sim.unitName(u), sub: d.sapient ? `${d.name}${U.sex[u] ? ', female' : ', male'}` : sub.latin,
    color: k >= 0 ? sim.kingdoms[k].color : undefined, tabs,
    actions: [{ id: 'follow', label: following ? 'Stop following' : 'Follow', on: following }, { id: 'fav', label: U.flags[u] & UF.Fav ? 'Unfavourite' : 'Favourite', on: !!(U.flags[u] & UF.Fav) }],
  };
}

// ------------------------------------------------------------------ a town
export function cityView(sim: Sim, c: number): View {
  const city = sim.cities[c];
  const k = sim.kingdoms[city.kingdom];
  return {
    title: city.name, sub: `${city.capital ? 'Capital of ' : 'Town of '}${k ? k.name : '—'}${city.alive ? '' : ' (ruins)'}`, color: k?.color,
    tabs: [
      { name: 'Town', html: () => {
        let s = kv([
          ['Realm', kLink(sim, city.kingdom)],
          ['People', `${city.pop} <small>(${city.kids} children)</small>`], ['Homes for', city.housing], ['Soldiers', city.soldiers],
          ['Founded', `year ${yr(sim, city.founded)}`], ['People', esc(sim.cultures[city.culture]?.name ?? '—')],
          ['Faith', city.religion >= 0 ? link('religion', city.religion, sim.religions[city.religion].name) : 'none'],
          ['Land', `${city.tiles} tiles`], ['Fields', city.fields.length], ['Tame animals', city.tame],
        ]);
        s += `<div class="sec">Happiness ${city.happy.toFixed(0)}</div>${bar(city.happy)}`;
        s += `<div class="sec">Loyalty ${city.loyalty.toFixed(0)}</div>${bar(city.loyalty, 'var(--sky)')}`;
        if (city.crime > 5) s += `<div class="sec">Crime ${city.crime.toFixed(0)}</div>${bar(city.crime, 'var(--ember)')}`;
        if (city.famine > 3) s += '<p style="color:var(--ember)">The stores are empty. People are going hungry.</p>';
        if (city.plague > 0) s += '<p style="color:var(--ember)">Plague is spreading here.</p>';
        if (city.siege > 0) s += '<p style="color:var(--ember)">Under siege!</p>';
        s += '<div class="sec">Stores</div>' + kv(RES_NAMES.map((n, i) => [n, fmt(city.stock[i])] as [string, string]).filter(r => r[1] !== '0'));
        return s;
      } },
      { name: 'Buildings', html: () => {
        const counts = new Map<number, { n: number; site: number }>();
        for (const b of city.buildings) { const bd = sim.buildings[b]; if (!bd.alive) continue; const e = counts.get(bd.type) || { n: 0, site: 0 }; if (bd.built >= 1) e.n++; else e.site++; counts.set(bd.type, e); }
        const rows = [...counts].sort((a, b) => a[0] - b[0]).map(([t, e]) => [BUILDINGS[t].name, `${e.n}${e.site ? ` <small>+${e.site} building</small>` : ''}`] as [string, string]);
        return rows.length ? kv(rows) : '<p>No buildings yet.</p>';
      } },
      { name: 'Work', html: () => {
        const rows: [string, string][] = [];
        for (let j = 0; j < JOB_NAMES.length; j++) if (city.jobsHave[j] || city.jobsWant[j]) rows.push([JOB_NAMES[j], `${city.jobsHave[j]}<small> / ${city.jobsWant[j]} wanted</small>`]);
        return kv(rows);
      } },
      { name: 'History', html: () => eventsHtml(sim, city.history) },
    ],
  };
}

// ------------------------------------------------------------------ a realm
export function kingdomView(sim: Sim, kid: number): View {
  const k = sim.kingdoms[kid];
  return {
    title: k.name, sub: `${GOV_NAMES[k.gov]} of ${SPECIES[k.species].plural.toLowerCase()}${k.alive ? '' : `, fell in year ${yr(sim, k.fell)}`}`, color: k.color,
    actions: [{ id: 'patron', label: k.favored ? 'Your realm' : 'Watch over', on: k.favored }],
    tabs: [
      { name: 'Realm', html: () => {
        const r = sim.units.idx(k.ruler);
        const heir = k.heir ? sim.units.idx(k.heir) : -1;
        let s = kv([
          ['Ruler', r >= 0 ? link('unit', k.ruler, sim.unitName(r)) : 'none'], ['Heir', heir >= 0 ? link('unit', k.heir, sim.unitName(heir)) : '—'],
          ['House', k.dynasty >= 0 ? esc(sim.dynasties[k.dynasty].name) : '—'], ['Age', ERAS[k.era]], ['People', fmt(k.pop)], ['Soldiers', k.soldiers],
          ['Towns', k.cities.length], ['Capital', cLink(sim, k.capital)], ['Founded', `year ${yr(sim, k.founded)}`],
          ['Faith', k.religion >= 0 ? link('religion', k.religion, sim.religions[k.religion].name) : 'none'], ['Treasury', `${fmt(k.gold)} gold`],
          ['Aims to', k.ambition], ['Overlord', k.overlord >= 0 ? kLink(sim, k.overlord) : ''], ['Laws', [...k.laws].join(', ') || 'custom'],
        ]);
        s += `<div class="sec">Stability ${k.stability.toFixed(0)}</div>${bar(k.stability, 'var(--sky)')}`;
        if (k.goldenAge > sim.tick) s += '<p style="color:var(--brass)">A golden age!</p>';
        s += `<div class="sec">Towns</div><p>${k.cities.map(c => cLink(sim, c) + ` <small>${sim.cities[c].pop}</small>`).join(', ')}</p>`;
        return s;
      } },
      { name: 'Others', html: () => {
        const list = [...k.relations].filter(([o]) => k.contacts.has(o) && sim.kingdoms[o].alive).sort((a, b) => b[1].opinion - a[1].opinion);
        if (!list.length) return '<p>They have not met anyone yet.</p>';
        return list.map(([o, r]) => `<div class="ev"><span style="flex:1">${kLink(sim, o)}</span><span>${r.status === 'peace' ? '' : `<b style="color:${r.status === 'war' ? 'var(--ember)' : 'var(--moss)'}">${r.status}</b> `}<small>${r.opinion > 0 ? '+' : ''}${r.opinion.toFixed(0)}</small></span></div>`).join('');
      } },
      { name: 'Wars', html: () => {
        const ws = sim.wars.filter(w => w.attackers.includes(kid) || w.defenders.includes(kid)).slice(-30).reverse();
        return ws.length ? ws.map(w => `<div class="ev"><span class="y">Y${yr(sim, w.started)}</span><span>${link('war', w.id, w.name)} ${w.active ? '<b style="color:var(--ember)">ongoing</b>' : `<small>${esc(w.peace || '')}</small>`}</span></div>`).join('') : '<p>Never fought a war.</p>';
      } },
      { name: 'Ideas', html: () => {
        let s = '';
        if (k.researching) { const t = TECH_BY_KEY[k.researching]; s += `<div class="sec">Working on ${esc(t.name)}</div>${bar(k.research / techCost(sim, t.key) * 100, 'var(--sky)')}<p><small>${esc(t.desc)}</small></p>`; }
        for (let e = 0; e < ERAS.length; e++) {
          const ts = TECHS.filter(t => t.era === e);
          const have = ts.filter(t => k.techs.has(t.key));
          if (!have.length && e > k.era + 1) break;
          s += `<div class="sec">${esc(ERAS[e])} <small>${have.length}/${ts.length}</small></div><div class="chips">${ts.map(t => `<span class="chip ${k.techs.has(t.key) ? 'good' : ''}" style="${k.techs.has(t.key) ? '' : 'opacity:.45'}">${esc(t.name)}</span>`).join('')}</div>`;
        }
        return s;
      } },
      { name: 'History', html: () => eventsHtml(sim, null, e => e.k === kid || e.k2 === kid) },
    ],
  };
}

export function warView(sim: Sim, wid: number): View {
  const w = sim.wars[wid];
  return {
    title: w.name, sub: w.active ? `Ongoing, since year ${yr(sim, w.started)}` : `Year ${yr(sim, w.started)} to ${yr(sim, w.ended)}`,
    tabs: [{ name: 'War', html: () => kv([
      ['Attackers', w.attackers.map(k => kLink(sim, k)).join('<br>')], ['Defenders', w.defenders.map(k => kLink(sim, k)).join('<br>')],
      ['Goal', esc(w.goal)], ['Cause', esc(w.cause)], ['Fallen', `${w.deaths[0]} attackers, ${w.deaths[1]} defenders`],
      ['Who is winning', Math.abs(w.score) < 10 ? 'nobody yet' : w.score > 0 ? 'the attackers' : 'the defenders'], ['Peace', esc(w.peace || (w.active ? '—' : ''))],
    ]) }, { name: 'Events', html: () => eventsHtml(sim, null, e => e.w === wid) }],
  };
}

export function charView(sim: Sim, id: number): View {
  const ch = sim.chars[id];
  return {
    title: ch.name + (ch.family ? ' ' + ch.family : ''), sub: `${SPECIES[ch.species].name}, ${ch.died >= 0 ? `year ${yr(sim, ch.born)} to ${yr(sim, ch.died)}` : `born year ${yr(sim, ch.born)}`}`,
    tabs: [{ name: 'Life', html: () => (ch.titles.length ? `<div class="chips">${ch.titles.map(t => `<span class="chip good">${esc(t)}</span>`).join('')}</div>` : '') + kv([
      ['Realm', ch.kingdom >= 0 ? kLink(sim, ch.kingdom) : '—'], ['Death', ch.died >= 0 ? esc(ch.death) : 'still alive'], ['Kills', ch.kills],
      ['House', ch.dynasty >= 0 ? esc(sim.dynasties[ch.dynasty].name) : '—'],
    ]) + `<div class="sec">Deeds</div>` + eventsHtml(sim, ch.deeds) }],
  };
}

export function speciesView(sim: Sim, sid: number): View {
  const s = sim.subs[sid], d = SPECIES[s.species];
  return {
    title: s.name, sub: s.latin,
    tabs: [{ name: 'Species', html: () => {
      let h = kv([['Alive', fmt(Math.max(0, s.pop))], ['Most ever', fmt(s.peak)], ['Appeared', `year ${yr(sim, s.born)}`], ['Descended from', s.parent >= 0 ? link('species', s.parent, sim.subs[s.parent].name) : '—'], ['Extinct', s.died >= 0 ? `year ${yr(sim, s.died)}` : '']]);
      h += `<p><small>${esc(d.desc)}</small></p>`;
      if (d.perks) h += `<div class="chips">${d.perks.map(p => `<span class="chip good">${esc(p)}</span>`).join('')}</div>`;
      h += '<div class="sec">Average genes</div><div class="genes">';
      for (let g = 0; g < G; g++) { const v = Math.round(s.genome[g]); h += `<span>${esc(GENE_NAMES[g])}</span><span class="gbar"><i style="width:${(v / 2.55).toFixed(0)}%"></i></span><span>${v}</span>`; }
      h += '</div>';
      const kids = sim.subs.filter(x => x.parent === sid);
      if (kids.length) h += `<div class="sec">Branches</div><p>${kids.map(x => link('species', x.id, x.name)).join(', ')}</p>`;
      if (s.notes.length) h += `<p>${s.notes.map(esc).join('<br>')}</p>`;
      return h;
    } }],
  };
}

export function religionView(sim: Sim, rid: number): View {
  const r = sim.religions[rid];
  return {
    title: r.name, sub: `Worship of ${r.deity}, ${r.deityTitle}`,
    tabs: [{ name: 'Faith', html: () => kv([
      ['Followers', fmt(r.followers)], ['Founded', `year ${yr(sim, r.born)}`], ['Prophet', r.founder >= 0 ? chLink(sim, r.founder) : 'unknown'],
      ['Holy city', cLink(sim, r.holyCity)], ['Split from', r.parent >= 0 ? link('religion', r.parent, sim.religions[r.parent].name) : ''],
      ['Teachings', r.tenets.map(esc).join(', ')],
    ]) + eventsHtml(sim, null, e => e.r === rid) }],
  };
}

export function tileView(sim: Sim, i: number): View {
  const w = sim.world;
  const b = BIOMES[w.biome[i]];
  const x = i % w.w, y = (i / w.w) | 0;
  return {
    title: b.name, sub: `${x}, ${y}`,
    tabs: [{ name: 'Land', html: () => kv([
      ['Height', (w.height[i] * 1000).toFixed(0) + ' m'], ['Temperature', `${w.temp[i] + (sim.season === 3 ? -12 : sim.season === 1 ? 6 : 0)} °C`], ['Rain', (w.moist[i] / 2.55).toFixed(0) + '%'],
      ['Grass', (w.veg[i] / 2.55).toFixed(0) + '%'], ['Fertility', (b.fert * 100).toFixed(0) + '%'], ['River', w.river[i] ? 'yes' : ''],
      ['Ore', w.ore[i] ? ORE_NAMES[w.ore[i]] : ''], ['Owner', w.owner[i] ? cLink(sim, w.owner[i] - 1) : 'nobody'], ['Season', SEASON_NAMES[sim.season]],
    ]) }],
  };
}

export { charByUid };
