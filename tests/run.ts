// Engine and data checks: npm test. Prints each check, "errors N" at the end, and exits non-zero on a failure.
// Includes the three wowsims/tbc reference tanks (tests/fixtures/wowsims.json), rebuilt here and compared
// stat by stat with the final stats wowsims computed for them.
import * as fs from 'fs';
import * as path from 'path';
import {
  ABILITIES, BOSSES, BUFF_BY_ID, CONSUMABLES, CONSUMABLE_BY_ID, ENCHANTS, ENCHANT_ALIAS, ENCHANT_BY_ID, GEMS, ITEMS, ITEM_BY_ID,
  TALENTS, canUse, enchantProblem, loadData, SLOTS,
} from '../src/data';
import { bossCtx, bossTable, capFor, capValues, computeSheet, critCap, intake, Profile, R, shear, verdict } from '../src/engine';
import { coverage } from '../src/sim';
import { defaultAbilities, fixup, loadAll } from '../src/store';
import { spent, treeSpent, valid } from '../src/talentRules';

declare const __dirname: string;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const root = path.resolve(__dirname, '..', '..');

function blank(cls: Profile['cls'], race: string): Profile {
  return { v: 2, id: 't', name: 't', cls, race, gear: {}, talents: {}, buffs: {}, cons: {}, abil: defaultAbilities(cls), opts: { uses: {}, swing: 2, adds: 0 }, updated: 0 };
}
function talent(p: Profile, field: string, rank: number) {
  TALENTS[p.cls].forEach((t, i) => { if (t.talents.some(x => x.f === field)) p.talents[`${i}.${field}`] = rank; });
}
const cons = (name: string) => {
  const c = CONSUMABLES.find(x => x.n === name);
  if (!c) { check(`consumable "${name}" exists`, false); return 0; }
  return c.id;
};

async function main() {
  await loadData(async n => JSON.parse(fs.readFileSync(path.join(root, 'web', 'data', n + '.json'), 'utf8')));

  // ------------------------------------------------------------------ data
  check('items loaded (every TBC item a tank can wear)', ITEMS.length > 10000, String(ITEMS.length));
  check('all TBC gems', GEMS.length >= 230, String(GEMS.length));
  check('enchants', ENCHANTS.length > 250, String(ENCHANTS.length));
  check('consumables', CONSUMABLES.length > 150, String(CONSUMABLES.length));
  check('raid bosses', BOSSES.length >= 60, String(BOSSES.length));
  check('talent trees', TALENTS.paladin.length === 3 && TALENTS.warrior[2].name === 'Protection');
  {
    const wb = ITEM_BY_ID.get(29011)!;   // Warbringer Greathelm, checked against its Wowhead tooltip
    check('Warbringer Greathelm stats', !!wb && wb.st.armor === 1227 && wb.st.def === 24 && wb.st.block === 19 && wb.st.bv === 39 && wb.st.sta === 53 && wb.st.str === 15 && wb.st.agi === 17,
      JSON.stringify(wb?.st));
    check('Warbringer Greathelm sockets and bonus', JSON.stringify(wb?.so) === '["meta","yellow"]' && wb.sb?.block === 4, JSON.stringify([wb?.so, wb?.sb]));
    const shield = ITEM_BY_ID.get(30882)!; // Bastion of Light
    check('shield block value from the "N Block" line', !!shield && shield.st.bv! > 100 && shield.wt === 'shield', JSON.stringify(shield?.st));
    const ew = ITEM_BY_ID.get(29171)!;    // Earthwarden
    check('Earthwarden: feral attack power, defense, expertise', !!ew && ew.st.fap === 712 && ew.st.def === 27 && ew.st.exp === 24 && ew.ht === '2h', JSON.stringify(ew?.st));
    check('low-level gear is in the database', !!ITEMS.find(i => i.il < 10 && i.s === 'chest'));
    const ma = ENCHANTS.find(e => e.n === 'Enchant Cloak - Major Armor');
    check('Major Armor: +120 armor, needs a level 35 item', ma?.st.armor === 120 && ma?.req === 35, JSON.stringify(ma));
    check('Shield Block enchant +15 block rating', ENCHANTS.find(e => e.n === 'Enchant Shield - Shield Block')?.st.block === 15);
    check('Glyph of the Defender +16 defense +17 dodge', JSON.stringify(ENCHANTS.find(e => e.n === 'Glyph of the Defender')?.st) === '{"def":16,"dodge":17}',
      JSON.stringify(ENCHANTS.find(e => e.n === 'Glyph of the Defender')?.st));
    check('Flask of Fortification: +500 health, +10 defense rating', JSON.stringify(CONSUMABLE_BY_ID.get(cons('Flask of Fortification'))?.st) === '{"hp":500,"def":10}',
      JSON.stringify(CONSUMABLE_BY_ID.get(cons('Flask of Fortification'))?.st));
    check('Elixir of Major Defense +550 armor', CONSUMABLE_BY_ID.get(cons('Elixir of Major Defense'))?.st.armor === 550);
    check("Fisherman's Feast +30 stamina +20 spirit", JSON.stringify(CONSUMABLE_BY_ID.get(cons("Fisherman's Feast"))?.st) === '{"sta":30,"spi":20}',
      JSON.stringify(CONSUMABLE_BY_ID.get(cons("Fisherman's Feast"))?.st));
    const gem = GEMS.find(g => g.n === 'Solid Star of Elune');
    check('gem: Solid Star of Elune +12 stamina, blue', gem?.st.sta === 12 && gem?.c === 'blue');
    const brut = BOSSES.find(b => b.n === 'Brutallus');
    check('Brutallus: level 73, dual wield', brut?.lvl === 73 && !!brut?.dw, JSON.stringify(brut && { lvl: brut.lvl, swing: brut.swing, dw: brut.dw, dmg: brut.dmg }));
    const gruul = BOSSES.find(b => b.n === 'Gruul the Dragonkiller');
    check('Gruul: level 73, damage range from cmangos', gruul?.lvl === 73 && !!gruul?.dmg, JSON.stringify(gruul && { swing: gruul.swing, dmg: gruul.dmg }));
    check('every wowsims enchant has a match', Object.keys(ENCHANT_ALIAS).length >= 70, String(Object.keys(ENCHANT_ALIAS).length));
  }

  // ------------------------------------------------------------------ naked characters (in-game character screen values, from wowsims' tests)
  {
    const t = blank('druid', 'tauren'); t.abil = {};
    const s = computeSheet(t);
    check('naked Tauren druid health 4498', near(s.health, 4498, 1), s.health.toFixed(1));
    check('naked Tauren druid melee crit 3.56%', near(s.crit, 3.56, 0.02), s.crit.toFixed(3));
    check('naked Tauren druid spell crit 3.29%', near(s.scrit, 3.29, 0.02), s.scrit.toFixed(3));
    const n = blank('druid', 'nightelf'); n.abil = {};
    const sn = computeSheet(n);
    check('naked Night Elf druid health 4254', near(sn.health, 4254, 1), sn.health.toFixed(1));
    check('naked Night Elf druid melee crit 3.96%', near(sn.crit, 3.96, 0.02), sn.crit.toFixed(3));
    check('naked Night Elf druid spell crit 3.35%', near(sn.scrit, 3.35, 0.02), sn.scrit.toFixed(3));
    const w = blank('warrior', 'human');
    const sw = computeSheet(w);
    const bc = bossCtx(w);
    const tb = bossTable(sw, bc);
    const sum = tb.miss + tb.dodge + tb.parry + tb.block + tb.crit + tb.crush + tb.hit;
    check('table adds to 100', near(sum, 100), sum.toFixed(4));
    check('naked: 15% crush and 5.6% crit from a level 73 boss', near(tb.crush, 15) && near(tb.crit, 5.6));
  }

  // ------------------------------------------------------------------ the wowsims reference tanks
  const refs = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'wowsims.json'), 'utf8'));
  for (const ref of refs) {
    const p = blank(ref.cls, ref.race);
    p.abil = ref.abil;
    for (const f in ref.talents) talent(p, f, ref.talents[f]);
    ref.gear.forEach((g: any, i: number) => {
      if (!g || !g.id) return;
      const slot = SLOTS[i].id;
      const ench = g.enchant ? ENCHANT_ALIAS[g.enchant] : undefined;
      if (g.enchant && !ench) check(`${ref.name}: wowsims enchant ${g.enchant} maps`, false);
      p.gear[slot] = { id: g.id, ...(g.gems ? { gems: g.gems } : {}), ...(ench ? { ench } : {}) };
    });
    p.buffs = ref.buffs;
    p.cons = {};
    for (const k in ref.cons) {
      if (k === 'scrolls') p.cons.scrolls = ref.cons.scrolls.map(cons);
      else (p.cons as any)[k] = cons(ref.cons[k]);
    }
    const missing = ref.gear.filter((g: any) => g && g.id && !ITEM_BY_ID.get(g.id)).map((g: any) => g.id);
    check(`${ref.name}: every item found`, missing.length === 0, missing.join(','));
    const s = computeSheet(p, 'passive');
    const e = ref.expect;
    const defBonus = (s.defenseSkill - 350) * 0.04;
    const mine: Record<string, number> = {
      str: s.str, agi: s.agi, sta: s.sta, int: s.int, hp: s.health, armor: s.armor,
      def: (s.defenseSkill - 350) * R.defense,
      dodge: (s.dodge - defBonus) * R.dodge,
    };
    // wowsims' parry and block ratings leave out the 5% everyone starts with
    if (s.canParry) mine.parry = (s.parry - 5 - defBonus) * R.parry;
    if (s.canBlock) { mine.block = (s.block - 5 - defBonus) * R.block; mine.bv = s.blockValue; }
    mine.ap = s.ap;
    // block value: the app follows the game server (cmangos): (gear + str/20 - 1) x talents, rounded down, for
    // every class with a shield. wowsims gives warriors str/20 without the -1 and paladins no strength at all.
    if (s.canBlock) e.bv = ref.cls === 'warrior' ? Math.floor(e.bv - s.bvMul + 1e-9) : Math.floor(e.bv + (s.str / 20 - 1) * s.bvMul + 1e-9);
    console.log(`     ${ref.name}: ${JSON.stringify(Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, +v.toFixed(2)])))}`);
    for (const k in mine) {
      const want = e[k] || 0;
      const got = mine[k];
      const tol = Math.max(1, Math.abs(want) * 0.003);
      check(`${ref.name}: ${k}`, Math.abs(got - want) <= tol, `app ${got.toFixed(2)}, wowsims ${want.toFixed(2)}`);
    }
  }

  // ------------------------------------------------------------------ rules
  {
    const p = blank('paladin', 'human');
    talent(p, 'anticipation', 5);
    check('Anticipation 5/5 = 370 defense', near(computeSheet(p).defenseSkill, 370));
    const lowChest = ITEMS.find(i => i.s === 'chest' && i.il < 20 && canUse('paladin', i))!;
    const eh = ENCHANTS.find(e => /Chest - Exceptional Health/.test(e.n))!;
    const prob = enchantProblem(eh, lowChest, 'paladin');
    check('a high-level enchant on a low-level item says why it can\'t go on', !!prob && /level \d+ or higher/.test(prob), String(prob));
    const twoH = ENCHANTS.find(e => e.n === 'Enchant 2H Weapon - Major Agility')!;
    const oneH = ITEMS.find(i => i.s === 'weapon' && i.ht === '1h' && i.il > 100)!;
    check('2H enchant refused on a one-hander', enchantProblem(twoH, oneH, 'paladin') === 'Two-handed weapons only');
  }
  {
    const p = blank('warrior', 'human');
    p.cons = { flask: cons('Flask of Fortification'), guardian: cons('Elixir of Major Defense') };
    const s1 = computeSheet(p);
    delete p.cons.flask;
    const s2 = computeSheet(p);
    check('flask on: the guardian elixir does not count', s1.armor < s2.armor && s1.health > s2.health, `${s1.armor.toFixed(0)} vs ${s2.armor.toFixed(0)}`);
  }
  {
    const p = blank('paladin', 'human');
    p.gear.offhand = { id: 30882 };
    const s = computeSheet(p);
    const base = capFor(s, bossCtx(p));
    check('shield, no weapon: 3 parts, cap 101.8', near(base, 101.8), base.toFixed(2));
    p.buffs = { scorpid: 1, insect: 1 };
    const both = capFor(s, bossCtx(p));
    check('Scorpid Sting + Insect Swarm: cap 5 lower, no stacking', near(base - both, 5), (base - both).toFixed(2));
    p.buffs = { tclap: 2 };
    check('Improved Thunder Clap: 20% slower swings', near(bossCtx(p).swing, 2 / 0.8), bossCtx(p).swing.toFixed(3));
  }
  {
    const p = blank('warrior', 'human');
    p.gear.mainhand = { id: ITEMS.find(i => i.s === 'weapon' && i.ht === '1h' && canUse('warrior', i))!.id };
    p.gear.offhand = { id: 30882 };
    const s = computeSheet(p, 'passive');
    const bc = bossCtx(p);
    check('cap with weapon and shield is 102.4', near(capFor(s, bc), 102.4));
    const t = bossTable(s, bc);
    check('crush slice = cap - total when short', near(t.crush, Math.min(15, capFor(s, bc) - s.total) + Math.max(0, 0)), `${t.crush.toFixed(2)} vs ${(capFor(s, bc) - s.total).toFixed(2)}`);
    check('block rating closes the gap fastest', capValues(s, bc)[0].stat === 'block');
    check('crit immunity needs 490 defense', critCap(s, bc).defSkillNeeded === 490, String(critCap(s, bc).defSkillNeeded));
    check('Shear cap 101.8', near(shear(s, bc).cap, 101.8));
  }
  {
    const p = blank('warrior', 'human');
    const low = BOSSES.find(b => b.lvl < 73);
    if (low) {
      p.opts.boss = low.id;
      const bc = bossCtx(p);
      check(`below level 73 (${low.n}, ${low.lvl}): no crushing blows`, bc.crush === 0);
    }
  }
  {
    const p = blank('paladin', 'human');
    p.gear.offhand = { id: 30882 };
    p.opts.boss = BOSSES.find(b => b.n === 'Gruul the Dragonkiller')!.id;
    let s = computeSheet(p); let bc = bossCtx(p);
    const a = intake(s, bc, bossTable(s, bc));
    check('blocked hits take less', a.blockedHit < a.perHit);
    p.buffs.sanc = 1;
    s = computeSheet(p); bc = bossCtx(p);
    const b = intake(s, bc, bossTable(s, bc));
    check('Blessing of Sanctuary: 80 less per hit', near(a.perHit - b.perHit, 80, 0.5), (a.perHit - b.perHit).toFixed(2));
    console.log(`     Gruul vs a naked paladin: raw ${JSON.stringify(a.raw)}, ${a.perHit.toFixed(0)} per hit, ${a.perSecond.toFixed(0)} per second`);
  }
  {
    const p = blank('druid', 'tauren');
    const chest = ITEMS.find(i => i.s === 'chest' && i.at === 'leather' && (i.st.armor || 0) > 300)!;
    p.gear.chest = { id: chest.id };
    const s = computeSheet(p, 'passive');
    check('Dire Bear Form: item armor x5', near(s.armor - s.agi * 2, chest.st.armor! * 5, 1), `${(s.armor - s.agi * 2).toFixed(1)} vs ${chest.st.armor! * 5}`);
    talent(p, 'thickHide', 3);
    const s3 = computeSheet(p, 'passive');
    check('Thick Hide 3/3 in bear form: x5.5', near(s3.armor - s3.agi * 2, chest.st.armor! * 5.5, 1));
    p.abil = {};
    talent(p, 'thickHide', 1);
    const s1 = computeSheet(p, 'passive');
    check('Thick Hide 1/3 out of form: +4%', near(s1.armor - s1.agi * 2, chest.st.armor! * 1.04, 1));
  }
  {
    const p = blank('paladin', 'human');
    talent(p, 'holyShield', 1); talent(p, 'improvedHolyShield', 2);
    p.gear.offhand = { id: 30882 };
    const c = coverage(p);
    check('Holy Shield: 8 charges with 2/2 Improved Holy Shield', !!c && c.charges === 8);
    p.opts.boss = BOSSES.find(b => b.n === 'Brutallus')!.id;
    const c2 = coverage(p);
    check('Brutallus (two weapons) meets more swings per Holy Shield than a 2.0 boss', !!c2 && !!c && c2.hitsPerCast > c.hitsPerCast, c2 ? c2.note : '');
  }
  {
    const old = { id: 'x', name: 'old', cls: 'paladin', race: 'human', gear: { head: { id: 29011, ench: 29186 } }, talents: {}, buffs: { kings: 1, flaskfort: 1, foodsta: 1 },
      opts: { holyShield: true, shieldBlock: true, redoubt: true, bear: false, uses: {}, swing: 2, dualWield: false }, updated: 0 };
    const p = fixup(old);
    check('old save: flask and food move to consumables', p.cons.flask === cons('Flask of Fortification') && p.cons.food === cons("Fisherman's Feast"));
    check('old save: cooldowns move to abilities', !!p.abil.holyShield && !!p.abil.redoubt);
    check('old save: enchant converted', ENCHANT_BY_ID.get(p.gear.head!.ench!)?.n === 'Glyph of the Defender', String(p.gear.head!.ench));
  }
  {
    for (const ex of loadAll()) {
      check(`${ex.name}: talents valid`, valid(ex.cls, ex.talents), `${spent(ex.talents)} points, ${[0, 1, 2].map(i => treeSpent(ex.cls, ex.talents, i)).join('/')}`);
      const s = computeSheet(ex, 'cooldown');
      const v = verdict(ex, 'cooldown');
      console.log(`     ${ex.name}: ${Object.keys(ex.gear).length} items, def ${s.defenseFloor}, sheet ${s.total.toFixed(2)}% of ${v.cap.toFixed(1)}, hp ${s.health.toFixed(0)}, armor ${s.armor.toFixed(0)}`);
    }
    check('abilities for every class', (['warrior', 'paladin', 'druid'] as const).every(c => ABILITIES[c].length > 0));
    check('every buff has an icon and text', [...BUFF_BY_ID.values()].every(b => b.icon && b.text));
  }
  console.log(`errors ${failed}`);
  if (failed) process.exitCode = 1;
}
main();
