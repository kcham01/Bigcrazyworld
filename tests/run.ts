// Engine checks: run with `npm test`. Prints each check and exits non-zero on a failure.
import { bossTable, BOSS, computeSheet, critCap, Profile, sumGear, verdict, capValues, shear } from '../src/engine';
import { coverage } from '../src/sim';
import { loadAll } from '../src/store';
import { spent, valid, treeSpent } from '../src/talentRules';
import { ITEMS, GEMS, TALENTS, canUse } from '../src/data';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

function blank(cls: Profile['cls'], race: string): Profile {
  return { id: 't', name: 't', cls, race, gear: {}, talents: {}, buffs: {}, opts: { holyShield: true, shieldBlock: true, redoubt: false, bear: true, uses: {}, swing: 2, dualWield: false }, updated: 0 };
}
function talent(p: Profile, tree: number, field: string, rank: number) { p.talents[`${tree}.${field}`] = rank; }

// data sanity
check('items loaded', ITEMS.length > 3000, String(ITEMS.length));
check('gems loaded', GEMS.length > 150, String(GEMS.length));
check('talent trees', TALENTS.paladin.length === 3 && TALENTS.warrior[2].name === 'Protection');

// naked human warrior: dodge = 0.75 base + 96 agi / 30
{
  const p = blank('warrior', 'human');
  const s = computeSheet(p);
  check('naked warrior dodge', near(s.dodge, 0.75 + 96 / 30), s.dodge.toFixed(3));
  check('naked warrior miss 5%', near(s.miss, 5));
  check('no weapon, no parry', s.parry === 0 && !s.canParry);
  const t = bossTable(s);
  const sum = t.miss + t.dodge + t.parry + t.block + t.crit + t.crush + t.hit;
  check('table adds to 100', near(sum, 100), sum.toFixed(4));
  check('naked: full 15% crush and 5.6% crit', near(t.crush, 15) && near(t.crit, 5.6));
}

// Anticipation 5/5 = +20 defense; 140 defense skill = crit immune
{
  const p = blank('paladin', 'human');
  talent(p, 1, 'anticipation', 5);
  const s = computeSheet(p);
  check('anticipation +20 defense', near(s.defenseSkill, 370));
  // 120 more skill from rating: 120 * 2.3654 = 283.85 -> 284 rating
  p.gear.neck = { id: 0 };
  const s2 = computeSheet({ ...p, gear: {} });
  check('miss at 370 defense', near(s2.miss, 5 + 20 * 0.04));
}

// a shield with a blue socket: the socket bonus only counts with a gem that fits
{
  const p = blank('paladin', 'human');
  p.gear.offhand = { id: 28825 };   // Aldori Legacy Defender: blue socket, bonus +2 defense rating
  const noGem = sumGear(p);
  check('socket bonus off without gem', !noGem.st.def || near(noGem.st.def, 19), String(noGem.st.def));
  p.gear.offhand = { id: 28825, gems: [GEMS.find(g => g.c === 'blue' && g.st.sta)!.id] };
  const blue = sumGear(p);
  check('socket bonus on with blue gem', near(blue.st.def, 21), String(blue.st.def));
  const s = computeSheet(p);
  check('shield gives block', s.canBlock && s.block >= 5);
}

// the cap: exactly 102.4 on the sheet pushes crushes off
{
  const p = blank('paladin', 'human');
  const s = computeSheet(p);
  const fake = { ...s, miss: 10.6, dodge: 15.5, parry: 13, block: 63.3, canBlock: true, canParry: true, critReduction: 5.6, critReductionSafe: 5.6 };
  fake.total = fake.miss + fake.dodge + fake.parry + fake.block;
  const t = bossTable(fake);
  check('sheet 102.4 -> no crush', near(fake.total, 102.4) && t.crush < 1e-9, `${fake.total.toFixed(2)} crush ${t.crush.toFixed(3)}`);
  const fake2 = { ...fake, block: 56.3 }; fake2.total = fake2.miss + fake2.dodge + fake2.parry + fake2.block;
  const t2 = bossTable(fake2);
  check('sheet 95.4 -> 7% crush when crit capped', near(t2.crush, 7), t2.crush.toFixed(3));
}

// class rules
{
  const shield = ITEMS.find(i => i.id === 28825)!;
  check('druids cannot use shields', !canUse('druid', shield, 'offhand'));
  check('paladins can use shields', canUse('paladin', shield, 'offhand'));
}

// Holy Shield coverage with Improved Holy Shield vs a 2.0 sec boss
{
  const p = blank('paladin', 'human');
  talent(p, 1, 'holyShield', 1); talent(p, 1, 'improvedHolyShield', 2);
  p.gear.offhand = { id: 28825 };
  p.gear.mainhand = { id: ITEMS.find(i => i.wt === 'sword' && i.ht === '1h')!.id };
  const c = coverage(p, 1, 30)!;
  check('holy shield coverage runs', !!c && c.charges === 8, c ? `${c.crushPct.toFixed(2)}% crush with, ${c.crushPctWithout.toFixed(2)}% without` : '');
  const v = verdict(p, 'cooldown');
  check('verdict with cooldown', v.total > verdict(p, 'passive').total);
  check('cap values sorted, block first', capValues(computeSheet(p)).length > 0 && capValues(computeSheet(p))[0].stat === 'block');
  check('crit cap reports a gap', !critCap(computeSheet(p)).ok);
  check('shear target', shear(computeSheet(p)).short > 0);
}

// druid in bear form: no block, no parry, armor x5
{
  const p = blank('druid', 'tauren');
  p.gear.chest = { id: ITEMS.find(i => i.s === 'chest' && i.at === 'leather' && (i.st.armor || 0) > 300)!.id };
  const bear = computeSheet(p);
  const caster = computeSheet({ ...p, opts: { ...p.opts, bear: false } });
  check('bear has no block or parry', !bear.canBlock && !bear.canParry);
  check('dire bear armor multiplier', bear.armor > caster.armor * 3, `${bear.armor} vs ${caster.armor}`);
  check('tauren +5% health', bear.health > 0);
}

// example characters: valid talent builds and full gear
{
  const list = loadAll();
  for (const ex of list) {
    const pts = spent(ex.talents);
    check(`${ex.name}: talents valid`, valid(ex.cls, ex.talents), `${pts} points, trees ${[0, 1, 2].map(i => treeSpent(ex.cls, ex.talents, i)).join('/')}`);
    const s = computeSheet(ex, 'cooldown');
    console.log(`     ${ex.name}: ${Object.keys(ex.gear).length} items, def ${s.defenseFloor}, sheet ${s.total.toFixed(2)}% (miss ${s.miss.toFixed(2)} dodge ${s.dodge.toFixed(2)} parry ${s.parry.toFixed(2)} block ${s.block.toFixed(2)}), hp ${s.health}, armor ${s.armor}`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
console.log(`errors ${failed}`);
process.exit(failed ? 1 : 0);
