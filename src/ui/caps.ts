// The Caps screen: crush cap, crit cap, how well block cooldowns really cover you, Illidan's Shear,
// what closes the gap, and where every percent comes from.
import { STAT_NAMES } from '../data';
import { BOSS, Mode, bossTable, capValues, computeSheet, critCap, shear } from '../engine';
import { coverage } from '../sim';
import { fmt, h, pct } from './dom';
import { S, commit, cur } from './state';

const MODE_NAME: Record<Mode, string> = { passive: 'Gear only', cooldown: 'Cooldown', procs: 'Procs too' };
const SLICES: [keyof ReturnType<typeof bossTable>, string, string][] = [
  ['miss', 'Miss', 'tb-miss'], ['dodge', 'Dodge', 'tb-dodge'], ['parry', 'Parry', 'tb-parry'], ['block', 'Block', 'tb-block'],
  ['crit', 'Crit', 'tb-crit'], ['crush', 'Crush', 'tb-crush'], ['hit', 'Hit', 'tb-hit'],
];

export function capsView(): HTMLElement {
  const p = cur();
  const root = h('div', { class: 'wrap' });
  const modes: Mode[] = ['passive', 'cooldown', 'procs'];
  const sheets = Object.fromEntries(modes.map(m => [m, computeSheet(p, m)])) as Record<Mode, ReturnType<typeof computeSheet>>;
  const mode = S.capMode;
  const s = sheets[mode];
  const t = bossTable(s);
  const ok = s.total >= BOSS.cap - 1e-9;

  // ---- crush cap
  const cdName = p.cls === 'paladin' ? 'Holy Shield' : p.cls === 'warrior' ? 'Shield Block' : 'nothing for bears';
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Crush Cap'),
    h('div', { class: 'card3' }, modes.map(m => {
      const v = sheets[m].total;
      const good = v >= BOSS.cap - 1e-9;
      return h('button', { class: 'mini ' + (good ? 'ok' : 'bad'), style: { border: '0', cursor: 'pointer', outline: m === mode ? '2px solid #ffd100' : 'none' },
        onclick: () => { S.capMode = m; commit(); } },
      h('div', { class: 'l' }, MODE_NAME[m]), h('div', { class: 'n' }, pct(v, 1)), h('div', { class: 's' }, good ? 'Uncrushable' : `${fmt(BOSS.cap - v)}% short`));
    })),
    h('p', { class: 'note' }, mode === 'passive' ? 'Gear, talents and buffs only: what you have every second.'
      : mode === 'cooldown' ? `Adds ${cdName} while it is up (switch it on or off in Buffs).`
        : 'Adds the procs and trinkets switched on in Buffs: what you have at your best moment.'),
    h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad'), style: { margin: '8px 0' } },
      h('div', { class: 'big' }, ok ? 'Uncrushable' : 'Crushable'),
      h('div', { class: 'of' }, ok ? `${pct(s.total)} on the sheet, ${BOSS.cap}% needed. Crushing blows are off the table.`
        : `${pct(s.total)} on the sheet, ${BOSS.cap}% needed. ${pct(t.crush)} of the boss's swings crush.`)),
    h('div', { class: 'tablebar' }, SLICES.map(([k, , c]) => t[k] > 0 ? h('span', { class: c, style: { width: t[k] + '%' } }) : null)),
    h('div', { class: 'legend' }, SLICES.map(([k, n, c]) => h('span', null, h('i', { class: c }), `${n} ${fmt(t[k], 1)}%`))),
    h('p', { class: 'note' }, 'One swing from a level 73 boss. The sheet shows your numbers against a level 70; each of miss, dodge, parry and block is 0.6% lower against the boss.')));

  // ---- what closes the gap
  if (!ok) {
    const rows = capValues(s);
    root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'What Closes The Gap'),
      h('p', { class: 'note' }, `You are ${fmt(BOSS.cap - s.total)}% short. Any one of these would close it on its own:`),
      h('div', { class: 'kv' }, rows.map(r => [h('span', { class: 'k' }, r.label), h('span', { class: 'v' }, `${r.needed}  (${fmt(r.perPoint, 3)}% each)`)])),
      p.cls === 'druid' ? h('p', { class: 'note' }, 'Bears can\'t block or parry, so the crush cap is out of reach: bears soak crushing blows with armor and health instead.') : null));
  }

  // ---- crit cap
  const cc = critCap(s);
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Crit Cap'),
    h('div', { class: 'card3' },
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Defense'), h('div', { class: 'n' }, String(s.defenseFloor)), h('div', { class: 's' }, `${cc.defSkillNeeded} alone`)),
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Crit cut'), h('div', { class: 'n' }, pct(cc.reduction)), h('div', { class: 's' }, `${BOSS.crit}% needed`)),
      h('div', { class: 'mini ' + (cc.ok ? 'ok' : 'bad') }, h('div', { class: 'l' }, 'Status'), h('div', { class: 'n' }, cc.ok ? '✓' : '✗'), h('div', { class: 's' }, cc.ok ? 'Uncrittable' : 'Crittable'))),
    h('p', { class: 'note' }, cc.ok ? 'Crits are off the table.'
      : cc.rounding ? `You are right on the line: with fractional defense you reach ${BOSS.crit}%, but the game may count whole defense points only. One more point of defense (${Math.ceil(2.3654)} rating) makes it certain.`
        : `Short by ${cc.defRatingShort} defense rating, or ${cc.resShort} resilience rating.`
          + (p.cls === 'druid' ? ' Survival of the Fittest counts 1% per rank.' : '')),
    h('p', { class: 'note' }, 'Each point of defense above 350 removes 0.04% crit chance; resilience works too (39.4 rating per 1%).')));

  // ---- block charges
  const attackers = 1 + (p.opts.adds || 0);
  const cov = coverage(p, attackers);
  if (cov) {
    const swingsPer = cov.duration / cov.swing * attackers;
    root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, `${cov.ability} Charges`),
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, 'Charges / duration'), h('span', { class: 'v' }, `${cov.charges} / ${cov.duration} sec`),
        h('span', { class: 'k' }, 'Swings on you per use'), h('span', { class: 'v' }, fmt(swingsPer, 1)),
        h('span', { class: 'k' }, 'Charges used per use'), h('span', { class: 'v' }, fmt(cov.blocksPerCast, 1)),
        h('span', { class: 'k' }, 'Boss swings that crush'), h('span', { class: 'v' + (cov.crushPct > 0.05 ? ' red' : ' green') }, pct(cov.crushPct)),
        h('span', { class: 'k' }, 'Without it'), h('span', { class: 'v' }, pct(cov.crushPctWithout)),
        h('span', { class: 'k' }, 'Boss swings that crit'), h('span', { class: 'v' }, pct(cov.critPct))),
      h('p', { class: 'note' }, cov.note),
      h('p', { class: 'note' }, `An hour of a boss swinging every ${fmt(cov.swing, 1)} sec${attackers > 1 ? ` with ${attackers - 1} add${attackers > 2 ? 's' : ''}` : ''}, with ${cov.ability} pressed every time it is ready. Change the swing speed and adds in Buffs.`)));
  }

  // ---- Shear
  const sh = shear(s);
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Illidan\'s Shear'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, 'Dodge + parry + block'), h('b', { class: sh.ok ? 'green' : 'red' }, `${pct(sh.value)} / ${BOSS.shearCap}%`)),
    h('p', { class: 'note' }, sh.ok ? 'Shear can always be avoided or blocked.' : `Shear can't miss, so only dodge, parry and block count: ${fmt(sh.short)}% short.`)));

  // ---- breakdown
  const part = (k: string, name: string, total: number, show: boolean) => show ? h('div', { style: { marginBottom: '8px' } },
    h('div', { class: 'row' }, h('b', { class: 'gold grow' }, name), h('b', { class: 'white' }, pct(total))),
    h('div', { class: 'kv', style: { paddingLeft: '10px' } }, (s.parts[k] || []).map(b => [h('span', { class: 'small' }, b.label), h('span', { class: 'v small' }, (b.value >= 0 ? '+' : '') + fmt(b.value))]))) : null;
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Where It Comes From'),
    part('miss', 'Miss', s.miss, true), part('dodge', 'Dodge', s.dodge, true), part('parry', 'Parry', s.parry, s.canParry),
    part('block', 'Block', s.block, s.canBlock), part('crit', 'Crit reduction', s.critReduction, true),
    h('div', { class: 'kv', style: { marginTop: '6px' } },
      h('span', { class: 'k' }, 'Defense skill'), h('span', { class: 'v' }, `${fmt(s.defenseSkill, 1)} (${s.defRating} rating)`),
      h('span', { class: 'k' }, 'Armor'), h('span', { class: 'v' }, `${s.armor} (${pct(s.armorReduction)} less damage)`),
      h('span', { class: 'k' }, 'Health'), h('span', { class: 'v' }, s.health.toLocaleString()),
      s.canBlock ? [h('span', { class: 'k' }, 'Block value'), h('span', { class: 'v' }, String(s.blockValue))] : null,
      s.usesOn.length ? [h('span', { class: 'k' }, 'Trinkets on'), h('span', { class: 'v' }, s.usesOn.join(', '))] : null)));

  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'How It Works'),
    h('details', { class: 'explain' }, h('summary', null, 'The attack table'),
      h('p', null, 'Every boss swing is one roll of a 100-sided die, read in order: miss, dodge, parry, block, crit, crushing blow, then a normal hit. Whatever is left after the earlier slices goes to the later ones.'),
      h('p', null, 'A level 73 boss has 15 more weapon skill than your 350 defense, which takes 0.6% off each of miss, dodge, parry and block. Crushing blows (150% damage) take a flat 15%. Push miss + dodge + parry + block to 100% against the boss (102.4% on your sheet) and there is no room left for crushes.')),
    h('details', { class: 'explain' }, h('summary', null, 'Crits'),
      h('p', null, `The boss crits 5.6% of the time. Each point of defense skill above 350 removes 0.04%, so 490 defense (415 for a druid with 3/3 Survival of the Fittest) makes you uncrittable. Resilience counts too.`)),
    h('details', { class: 'explain' }, h('summary', null, 'Block charges'),
      h('p', null, 'Holy Shield and Shield Block only last for a few blocks. If the boss (or adds) use them up before they run out, the rest of their duration gives no extra block, and those swings can crush.')),
    h('details', { class: 'explain' }, h('summary', null, 'Stats in the app'),
      h('p', null, `Ratings at level 70: ${['def', 'dodge', 'parry', 'block'].map(k => STAT_NAMES[k]).join(', ')} are 2.37, 18.9, 23.7 and 7.88 per point or percent. Agility per 1% dodge: warrior 30, paladin 25, druid 14.7.`))));
  return root;
}
