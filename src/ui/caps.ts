// The Caps screen: the boss you're tanking, crush cap, crit cap, how much damage you take, how well block
// cooldowns really cover you, Illidan's Shear, what closes the gap, and where every percent comes from.
import { BOSS_BY_ID, STAT_NAMES } from '../data';
import { Mode, R, Sheet, bossCtx, bossTable, capFor, capValues, computeSheet, critCap, intake, shear } from '../engine';
import { coverage } from '../sim';
import { pickBoss } from './buffs';
import { fmt, h, pct } from './dom';
import { S, commit, cur } from './state';

const MODE_NAME: Record<Mode, string> = { passive: 'Gear only', cooldown: 'Cooldown', procs: 'Procs too' };
const SLICES: [keyof ReturnType<typeof bossTable>, string, string][] = [
  ['miss', 'Miss', 'tb-miss'], ['dodge', 'Dodge', 'tb-dodge'], ['parry', 'Parry', 'tb-parry'], ['block', 'Block', 'tb-block'],
  ['crit', 'Crit', 'tb-crit'], ['crush', 'Crush', 'tb-crush'], ['hit', 'Hit', 'tb-hit'],
];
const num = (n: number) => Math.round(n).toLocaleString();

export function capsView(): HTMLElement {
  const p = cur();
  const root = h('div', { class: 'wrap' });
  const modes: Mode[] = ['passive', 'cooldown', 'procs'];
  const sheets = Object.fromEntries(modes.map(m => [m, computeSheet(p, m)])) as Record<Mode, Sheet>;
  const mode = S.capMode;
  const s = sheets[mode];
  const bc = bossCtx(p);
  const t = bossTable(s, bc);
  const cap = capFor(s, bc);
  const ok = s.total >= cap - 1e-9;
  const boss = p.opts.boss ? BOSS_BY_ID.get(p.opts.boss) : undefined;
  const cov = coverage(p);

  // ---- who you're tanking
  const debuffs: string[] = [];
  if (bc.hitRed) debuffs.push(`${fmt(bc.hitRed, 0)}% less chance to hit`);
  if (bc.slow) debuffs.push(`${fmt(bc.slow, 0)}% slower swings`);
  if (bc.apRed) debuffs.push(`${num(bc.apRed)} less attack power`);
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'The Boss'),
    h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
      h('div', { class: 'grow' },
        h('div', { class: 'gold', style: { fontWeight: '700' } }, boss ? boss.n : 'Any level 73 boss'),
        h('div', { class: 'small' }, [boss?.raid, `level ${bc.level}`, `swings every ${fmt(bc.swing, 2)} sec${bc.slow ? ` (${fmt(bc.baseSwing, 1)} before slows)` : ''}`, bc.dualWield ? 'two weapons' : '',
          p.opts.adds ? `+${p.opts.adds} add${p.opts.adds > 1 ? 's' : ''} on you` : ''].filter(Boolean).join(' · ')),
        debuffs.length ? h('div', { class: 'small green' }, 'Debuffs: ' + debuffs.join(', ')) : null),
      h('button', { class: 'btn dark small', onclick: () => pickBoss(p) }, 'Change'))));

  // ---- crush cap
  const cdName = p.cls === 'paladin' ? 'Holy Shield' : p.cls === 'warrior' ? 'Shield Block' : 'nothing for bears';
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Crush Cap'),
    h('div', { class: 'card3' }, modes.map(m => {
      const v = sheets[m].total;
      const c = capFor(sheets[m], bc);
      const good = v >= c - 1e-9;
      return h('button', { class: 'mini ' + (good ? 'ok' : 'bad'), style: { border: '0', cursor: 'pointer', outline: m === mode ? '2px solid #ffd100' : 'none' },
        onclick: () => { S.capMode = m; commit(); } },
      h('div', { class: 'l' }, MODE_NAME[m]), h('div', { class: 'n' }, pct(v, 1)), h('div', { class: 's' }, good ? 'Uncrushable' : `${fmt(c - v)}% short`));
    })),
    h('p', { class: 'note' }, mode === 'passive' ? 'Gear, talents, buffs and consumables only: what you have every second.'
      : mode === 'cooldown' ? `Adds ${cdName} while it is up (switch it on or off in Buffs).`
        : 'Adds the procs, potion and trinkets switched on in Buffs: what you have at your best moment.'),
    h('div', { class: 'verdict ' + (ok ? 'ok' : 'bad'), style: { margin: '8px 0' } },
      h('div', { class: 'big' }, !bc.crush ? (ok ? 'Unhittable' : 'No crushing blows') : ok ? 'Uncrushable' : 'Crushable'),
      h('div', { class: 'of' }, !bc.crush ? `This boss is below level 73, so it can't land crushing blows. ${pct(s.total)} of ${fmt(cap, 1)}% fills the table.`
        : ok ? `${pct(s.total)} on the sheet, ${fmt(cap, 1)}% needed. Crushing blows are off the table.`
          : `${pct(s.total)} on the sheet, ${fmt(cap, 1)}% needed. ${pct(t.crush)} of the boss's swings crush.`)),
    cov && mode !== 'passive' && ok && cov.crushPct > 0.05 && bc.crush ? h('p', { class: 'note red' },
      `But ${cov.ability} runs out of charges against ${boss ? boss.n : 'this many swings'}: over a fight about ${pct(cov.crushPct, 1)} of the boss's swings still crush. See ${cov.ability} Charges below.`) : null,
    h('div', { class: 'tablebar' }, SLICES.map(([k, , c]) => t[k] > 0 ? h('span', { class: c, style: { width: t[k] + '%' } }) : null)),
    h('div', { class: 'legend' }, SLICES.map(([k, n, c]) => h('span', null, h('i', { class: c }), `${n} ${fmt(t[k], 1)}%`))),
    h('p', { class: 'note' }, `One swing from a level ${bc.level} boss. Your sheet shows numbers against a level 70; each of miss, dodge, parry and block is ${fmt(bc.deficit, 1)}% lower against this boss${bc.hitRed ? `, and debuffs add ${fmt(bc.hitRed, 0)}% to its misses` : ''}.`)));

  // ---- what closes the gap
  if (!ok) {
    const rows = capValues(s, bc);
    root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'What Closes The Gap'),
      h('p', { class: 'note' }, `You are ${fmt(cap - s.total)}% short. Any one of these would close it on its own:`),
      h('div', { class: 'kv' }, rows.map(r => [h('span', { class: 'k' }, r.label), h('span', { class: 'v' }, `${r.needed}  (${fmt(r.perPoint, 3)}% each)`)])),
      p.cls === 'druid' ? h('p', { class: 'note' }, 'Bears can\'t block or parry, so the crush cap is out of reach: bears soak crushing blows with armor and health instead.') : null));
  }

  // ---- damage taken
  const dm = intake(s, bc, t);
  const hasDmg = !!dm.raw;
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Damage Taken'),
    h('div', { class: 'card3' },
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Armor cuts'), h('div', { class: 'n' }, pct(s.armorReduction, 1)), h('div', { class: 's' }, `${num(s.armor)} armor`)),
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Effective health'), h('div', { class: 'n' }, num(dm.effectiveHealth)), h('div', { class: 's' }, 'vs. physical hits')),
      h('div', { class: 'mini' }, h('div', { class: 'l' }, hasDmg ? 'Per second' : 'Per swing'), h('div', { class: 'n' }, hasDmg ? num(dm.perSecond) : pct(dm.perSwing / 100, 1)), h('div', { class: 's' }, hasDmg ? 'average' : 'of a raw hit'))),
    hasDmg ? h('div', { class: 'kv' },
      h('span', { class: 'k' }, 'Boss hit before armor'), h('span', { class: 'v' }, `${num(dm.raw![0])}–${num(dm.raw![1])}`),
      h('span', { class: 'k' }, 'Normal hit on you'), h('span', { class: 'v' }, num(dm.perHit)),
      h('span', { class: 'k' }, 'Blocked hit'), s.canBlock ? h('span', { class: 'v' }, `${num(dm.blockedHit)} (block value ${s.blockValue})`) : h('span', { class: 'v' }, '—'),
      h('span', { class: 'k' }, 'Crushing blow'), h('span', { class: 'v' + (t.crush > 0 ? ' red' : '') }, t.crush > 0 ? num(dm.crushHit) : `${num(dm.crushHit)} (off the table)`),
      h('span', { class: 'k' }, 'Critical hit'), h('span', { class: 'v' + (t.crit > 0 ? ' red' : '') }, t.crit > 0 ? num(dm.critHit) : `${num(dm.critHit)} (off the table)`),
      h('span', { class: 'k' }, 'Average per swing'), h('span', { class: 'v' }, num(dm.perSwing)),
      h('span', { class: 'k' }, 'Normal hits to kill you'), h('span', { class: 'v' }, String(dm.hitsToKill)),
      h('span', { class: 'k' }, 'Crushes to kill you'), h('span', { class: 'v' }, String(dm.crushHit > 0 ? Math.ceil(s.health / dm.crushHit) : '∞'))) :
      h('p', { class: 'note' }, 'Pick a boss in Buffs → The Fight to see how hard it hits you.'),
    h('p', { class: 'note' }, [
      hasDmg ? 'Boss hit sizes come from the cmangos TBC server data; attack power debuffs take 1 damage per 14 attack power per second of swing time.' : '',
      s.dmgTakenMult < 1 ? `You take ${pct((1 - s.dmgTakenMult) * 100, 0)} less damage from stances and talents.` : '',
      s.flatReduction ? `Blessing of Sanctuary takes ${s.flatReduction} off every hit.` : '',
      'Averaged over the attack table above.'].filter(Boolean).join(' '))));

  // ---- crit cap
  const cc = critCap(s, bc);
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Crit Cap'),
    h('div', { class: 'card3' },
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Defense'), h('div', { class: 'n' }, String(s.defenseFloor)), h('div', { class: 's' }, `${cc.defSkillNeeded} alone`)),
      h('div', { class: 'mini' }, h('div', { class: 'l' }, 'Crit cut'), h('div', { class: 'n' }, pct(cc.reduction)), h('div', { class: 's' }, `${fmt(cc.needed, 1)}% needed`)),
      h('div', { class: 'mini ' + (cc.ok ? 'ok' : 'bad') }, h('div', { class: 'l' }, 'Status'), h('div', { class: 'n' }, cc.ok ? '✓' : '✗'), h('div', { class: 's' }, cc.ok ? 'Uncrittable' : 'Crittable'))),
    h('p', { class: 'note' }, cc.ok ? 'Crits are off the table.'
      : cc.rounding ? `You are right on the line: with fractional defense you reach ${fmt(cc.needed, 1)}%, but the game counts whole defense points. One more point of defense (${Math.ceil(R.defense)} rating) makes it certain.`
        : `Short by ${cc.defRatingShort} defense rating, or ${cc.resShort} resilience rating.`
          + (p.cls === 'druid' ? ' Survival of the Fittest counts 1% per rank.' : '')),
    h('p', { class: 'note' }, `Each point of defense above 350 removes 0.04% crit chance; resilience works too (${fmt(R.res, 1)} rating per 1%).`)));

  // ---- block charges
  if (cov) {
    root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, `${cov.ability} Charges`),
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, 'Charges / duration'), h('span', { class: 'v' }, `${cov.charges} / ${cov.duration} sec`),
        h('span', { class: 'k' }, 'Swings on you per use'), h('span', { class: 'v' }, fmt(cov.hitsPerCast, 1)),
        h('span', { class: 'k' }, 'Charges used per use'), h('span', { class: 'v' }, fmt(cov.blocksPerCast, 1)),
        h('span', { class: 'k' }, 'Boss swings that crush'), h('span', { class: 'v' + (cov.crushPct > 0.05 ? ' red' : ' green') }, pct(cov.crushPct)),
        h('span', { class: 'k' }, 'Without it'), h('span', { class: 'v' }, pct(cov.crushPctWithout)),
        h('span', { class: 'k' }, 'Boss swings that crit'), h('span', { class: 'v' }, pct(cov.critPct))),
      h('p', { class: 'note' }, cov.note),
      h('p', { class: 'note' }, `An hour of ${boss ? boss.n : 'a boss'} swinging every ${fmt(cov.swing, 2)} sec${bc.dualWield ? ' with two weapons' : ''}${p.opts.adds ? ` and ${p.opts.adds} add${p.opts.adds > 1 ? 's' : ''}` : ''}, with ${cov.ability} pressed every time it is ready.`)));
  }

  // ---- Shear
  const sh = shear(s, bc);
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Illidan\'s Shear'),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, 'Dodge + parry + block'), h('b', { class: sh.ok ? 'green' : 'red' }, `${pct(sh.value)} / ${fmt(sh.cap, 1)}%`)),
    h('p', { class: 'note' }, sh.ok ? 'Shear can always be avoided or blocked.' : `Shear can't miss, so only dodge, parry and block count: ${fmt(sh.short)}% short.`)));

  // ---- breakdown
  const part = (k: string, name: string, total: number, show: boolean, unit = '%') => show ? h('div', { style: { marginBottom: '8px' } },
    h('div', { class: 'row' }, h('b', { class: 'gold grow' }, name), h('b', { class: 'white' }, unit === '%' ? pct(total) : num(total))),
    h('div', { class: 'kv', style: { paddingLeft: '10px' } }, (s.parts[k] || []).map(b => [h('span', { class: 'small' }, b.label), h('span', { class: 'v small' }, (b.value >= 0 ? '+' : '') + (unit === '%' ? fmt(b.value) : num(b.value)))]))) : null;
  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'Where It Comes From'),
    part('miss', 'Miss', s.miss, true), part('dodge', 'Dodge', s.dodge, true), part('parry', 'Parry', s.parry, s.canParry),
    part('block', 'Block', s.block, s.canBlock), part('crit', 'Crit reduction', s.critReduction, true),
    part('armor', 'Armor', s.armor, true, ''), part('bv', 'Block value', s.blockValue, s.canBlock, ''),
    h('div', { class: 'kv', style: { marginTop: '6px' } },
      h('span', { class: 'k' }, 'Defense skill'), h('span', { class: 'v' }, `${fmt(s.defenseSkill, 1)} (${num(s.defRating)} rating)`),
      h('span', { class: 'k' }, 'Health'), h('span', { class: 'v' }, num(s.health)),
      s.usesOn.length ? [h('span', { class: 'k' }, 'Trinkets on'), h('span', { class: 'v' }, s.usesOn.join(', '))] : null)));

  root.appendChild(h('div', { class: 'frame rock' }, h('div', { class: 'title' }, 'How It Works'),
    h('details', { class: 'explain' }, h('summary', null, 'The attack table'),
      h('p', null, 'Every boss swing is one roll of a 100-sided die, read in order: miss, dodge, parry, block, crit, crushing blow, then a normal hit. Whatever is left after the earlier slices goes to the later ones.'),
      h('p', null, 'A level 73 boss has 15 more weapon skill than your 350 defense, which takes 0.6% off each of miss, dodge, parry and block. Crushing blows (150% damage) take a flat 15%. Push miss + dodge + parry + block to 100% against the boss (102.4% on your sheet) and there is no room left for crushes. "Chance to hit" debuffs like Scorpid Sting lower that target.')),
    h('details', { class: 'explain' }, h('summary', null, 'Crits'),
      h('p', null, 'A level 73 boss crits 5.6% of the time. Each point of defense skill above 350 removes 0.04%, so 490 defense (415 for a druid with 3/3 Survival of the Fittest) makes you uncrittable. Resilience counts too.')),
    h('details', { class: 'explain' }, h('summary', null, 'Damage'),
      h('p', null, 'Armor cuts physical damage by armor / (armor + 467.5 × boss level − 22,167.5), up to 75%. Blocks take your block value off a hit, Blessing of Sanctuary takes 80 off every hit, and Defensive Stance and Improved Righteous Fury cut what is left. Crushing blows do 150%, crits 200%.')),
    h('details', { class: 'explain' }, h('summary', null, 'Block charges'),
      h('p', null, 'Holy Shield and Shield Block only last for a few blocks. If the boss (or adds) use them up before they run out, the rest of their duration gives no extra block, and those swings can crush.')),
    h('details', { class: 'explain' }, h('summary', null, 'Stats in the app'),
      h('p', null, `Ratings at level 70: ${['def', 'dodge', 'parry', 'block'].map(k => STAT_NAMES[k]).join(', ')} are 2.37, 18.9, 23.7 and 7.88 per point or percent. Agility per 1% dodge: warrior 30, paladin 25, druid 14.7. Block value follows the game server: (shield and gear + Strength / 20 − 1) × talents.`)),
    h('details', { class: 'explain' }, h('summary', null, 'Checked against'),
      h('p', null, 'The engine is tested against the wowsims/tbc reference tanks (feral druid, protection warrior and paladin: strength, agility, stamina, intellect, health, armor, defense, dodge, parry, block, block value and attack power all match) and the in-game naked character values. Block value and the boss data follow the cmangos TBC server.'))));
  return root;
}
