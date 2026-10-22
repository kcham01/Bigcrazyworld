// Creature sprites, painted in code. People are assembled from parts (head by race, clothes in the
// owner's colour, skin in their own colour, legs per walk frame) and carry what their job needs:
// axes, picks, hoes, nets, books, staffs, and weapons and armour that change with each era.
// Animals and monsters are small ASCII paintings (fur/skin uses the creature colour marker).
import { Pix, RGBA, rgb, shade, M1, M2, EM, SHADOW, OUT } from './pixels';

const K = OUT;                                  // outline / darkest
const EYE = rgb(0x1a1210);
const WHITE = rgb(0xf4f1ea);
const HAIRS = [rgb(0x3b2416), rgb(0x6b4423), rgb(0xc99a4b), rgb(0x1c1c1f), rgb(0xa8462a), rgb(0xd8d2c8)];
const LEATHER = rgb(0x6b4a2b), LEATHER_D = rgb(0x4a321d);
const WOOD = rgb(0x8a5a2e), WOOD_D = rgb(0x5e3c1f);
const STEEL = rgb(0xc9cdd3), STEEL_D = rgb(0x7d838c);
const BRONZE = rgb(0xc98a3c), BRONZE_D = rgb(0x8a5a22);
const GOLD = rgb(0xf2c94c), GOLD_D = rgb(0xb8892a);
const GUN = rgb(0x3a3a40);

export type Gear = 'civ' | 'farm' | 'wood' | 'mine' | 'build' | 'fish' | 'hunt' | 'sold' | 'arch' | 'mage' | 'priest' | 'scholar' | 'noble' | 'ruler' | 'merchant' | 'thief' | 'hero' | 'child' | 'guard' | 'smith' | 'herd' | 'healer' | 'sailor';

export interface PersonOpts { build: string; female: boolean; frame: number; gear: Gear; tier: number; hair: number; mounted?: number; boat?: boolean }

/** 14 x 16 canvas, feet on row 14, anchor (7, 15) */
export function paintPerson(o: PersonOpts): Pix {
  const p = new Pix(16, 18);
  const b = o.build;
  const child = o.gear === 'child';
  const ox = 5;                                  // body left edge
  let top = b === 'dwarf' || b === 'goblin' ? 4 : b === 'orc' ? 1 : b === 'elf' ? 1 : 2;
  if (child) top += 4;
  const legLen = child ? 2 : b === 'dwarf' || b === 'goblin' ? 2 : b === 'elf' ? 4 : 3;
  const torso = child ? 2 : b === 'dwarf' ? 3 : b === 'orc' ? 4 : 3;
  const wide = b === 'orc' || b === 'dwarf' ? 1 : 0;
  const hair = HAIRS[o.hair % HAIRS.length];
  const skin = M2(160), skinD = M2(118), skinL = M2(196);
  const undead = b === 'undead';
  // ---- legs (feet on row 15)
  const feetY = 15;
  const legTop = feetY - legLen;
  const pants = undead ? M2(110) : o.female && !child ? M1(120) : M1(110);
  const boots = undead ? M2(90) : LEATHER_D;
  const f = o.frame;
  const legX = [ox + 1 + wide, ox + 3 + wide];
  for (let l = 0; l < 2; l++) {
    let dx = 0;
    if (f === 1) dx = l === 0 ? -1 : 1;
    if (f === 2) dx = l === 0 ? 1 : -1;
    for (let y = legTop; y < feetY; y++) {
      const t = (y - legTop) / Math.max(1, legLen - 1);
      const x = legX[l] + Math.round(dx * t);
      p.set(x, y, y === feetY - 1 ? boots : pants);
    }
  }
  // ---- torso
  const torTop = legTop - torso;
  const tw = 4 + wide * 2;
  const robe = o.gear === 'priest' || o.gear === 'mage' || o.gear === 'scholar' || (o.female && !child && o.gear !== 'sold' && o.gear !== 'arch' && o.gear !== 'guard');
  for (let y = torTop; y < legTop + (robe ? legLen - 1 : 0); y++) for (let x = 0; x < tw; x++) {
    let c: RGBA = x === tw - 1 ? M1(122) : x === 0 ? M1(140) : M1(165);
    if (o.gear === 'priest') c = x === tw - 1 ? rgb(0xc9c3b4) : rgb(0xf0ebdc);
    if (o.gear === 'mage') c = x === tw - 1 ? rgb(0x3b2a7a) : rgb(0x5a43b8);
    if (undead) c = (x + y) % 3 === 0 ? M2(70) : M1(100);
    if (o.gear === 'thief') c = x === tw - 1 ? rgb(0x2b2b33) : rgb(0x3d3d48);
    p.set(ox + x, y, c);
  }
  // belt
  if (!robe && !child) p.hline(ox, ox + tw - 1, legTop - 1, undead ? M2(80) : LEATHER);
  if (o.gear === 'priest') p.hline(ox, ox + tw - 1, torTop + 2, GOLD);
  // ---- armour on soldiers
  const soldier = o.gear === 'sold' || o.gear === 'arch' || o.gear === 'guard' || o.gear === 'hero';
  if (soldier && !undead) armour(p, o.tier, ox, torTop, tw, legTop);
  // ---- arms (back arm behind torso edge, front arm at the right)
  const armY = torTop + 1;
  p.set(ox - 1, armY, skinD); p.set(ox - 1, armY + 1, skinD);
  const frontArm = ox + tw;
  const working = f === 3;
  if (working) { p.set(frontArm, armY - 1, skin); p.set(frontArm + 1, armY - 2, skin); }
  else { p.set(frontArm, armY, skin); p.set(frontArm, armY + 1, skin); }
  // ---- head
  const hx = ox + wide, hy = torTop - 4;
  head(p, b, hx, hy, o.female, hair, skin, skinD, skinL, child);
  // ---- headgear and held items
  if (soldier && !undead) helmet(p, o.tier, hx, hy, b);
  const hand: [number, number] = working ? [frontArm + 1, armY - 2] : [frontArm, armY + 1];
  held(p, o, hand, working, hx, hy, torTop);
  // hero cape and ruler crown
  if (o.gear === 'hero') { for (let y = torTop; y < legTop + 1; y++) p.set(ox - 1, y, rgb(0xb8282e)); p.set(ox - 2, legTop, rgb(0x8a1e22)); }
  if (o.gear === 'ruler') { p.hline(hx, hx + 3, hy - 1, GOLD); p.set(hx, hy - 2, GOLD); p.set(hx + 2, hy - 2, GOLD); p.set(hx + 3, hy - 2, rgb(0xe0453a)); for (let y = torTop; y < legTop + 1; y++) p.set(ox - 1, y, M1(110)); }
  if (o.gear === 'noble') p.hline(hx, hx + 3, hy - 1, M1(190));
  if (o.gear === 'thief') { p.hline(hx, hx + 3, hy, rgb(0x2b2b33)); p.set(hx, hy + 1, rgb(0x2b2b33)); }
  if (o.gear === 'mage') { p.hline(hx - 1, hx + 4, hy, rgb(0x3b2a7a)); p.hline(hx, hx + 3, hy - 1, rgb(0x5a43b8)); p.set(hx + 1, hy - 2, rgb(0x5a43b8)); p.set(hx + 1, hy - 3, rgb(0x5a43b8)); }
  // ---- extras by race
  if (b === 'lizard') { p.set(ox - 1, legTop, skinD); p.set(ox - 2, legTop + 1, skinD); p.set(ox - 3, legTop + 2, skinD); }
  if (b === 'avian') { p.set(ox - 1, armY, M2(120)); p.set(ox - 2, armY + 1, M2(110)); p.set(ox - 1, armY + 2, M2(110)); }
  p.outline(K);
  // ---- mounts and boats go under the rider
  if (o.mounted) return mount(p, o.mounted);
  if (o.boat) return boat(p);
  for (let x = ox - 1; x <= ox + tw; x++) p.set(x, feetY + 1, SHADOW);
  return p;
}

function head(p: Pix, b: string, x: number, y: number, female: boolean, hair: RGBA, skin: RGBA, skinD: RGBA, skinL: RGBA, child: boolean) {
  // a 4x4 head facing right
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) p.set(x + i, y + j, i === 0 ? skinD : j === 0 && i > 1 ? skinL : skin);
  const eye = b === 'undead' ? rgb(0x9fffd0) : EYE;
  p.set(x + 3, y + 1, eye);
  switch (b) {
    case 'human': case 'elf':
      p.hline(x, x + 3, y - 1, hair); p.set(x, y, hair); p.set(x, y + 1, hair);
      if (female) { p.set(x - 1, y + 1, hair); p.set(x - 1, y + 2, hair); p.set(x - 1, y + 3, hair); p.set(x, y + 2, hair); }
      if (b === 'elf') { p.set(x + 1, y, skin); p.set(x, y - 1, skinL); p.set(x - 1, y - 2, skinL); }   // pointed ear
      break;
    case 'dwarf':
      p.hline(x, x + 3, y - 1, hair);
      p.set(x, y, hair);
      if (!female && !child) { p.rect(x + 1, y + 3, 4, 2, hair); p.set(x + 2, y + 5, hair); p.set(x + 3, y + 5, hair); p.set(x + 4, y + 2, skin); }
      else { p.set(x - 1, y + 1, hair); p.set(x - 1, y + 2, hair); }
      break;
    case 'orc':
      p.set(x + 4, y + 2, skin); p.set(x + 4, y + 3, skinD);
      p.set(x + 3, y + 3, WHITE);   // tusk
      p.hline(x, x + 2, y - 1, female ? hair : EYE);
      if (female) { p.set(x - 1, y, hair); p.set(x - 1, y + 1, hair); }
      break;
    case 'goblin':
      p.set(x - 1, y, skin); p.set(x - 2, y - 1, skin); p.set(x - 1, y + 1, skinD);   // big ear
      p.set(x + 4, y + 2, skin);       // nose
      if (female) p.hline(x, x + 2, y - 1, hair);
      break;
    case 'lizard':
      p.set(x + 4, y + 2, skin); p.set(x + 4, y + 3, skinD); p.set(x + 5, y + 3, skinD);   // snout
      p.set(x + 1, y - 1, skinD); p.set(x + 2, y - 1, skinD);    // crest
      break;
    case 'avian':
      p.set(x + 4, y + 2, GOLD); p.set(x + 5, y + 2, GOLD_D); p.set(x + 4, y + 3, GOLD_D);  // beak
      p.set(x + 1, y - 1, M2(200)); p.set(x, y - 2, M2(200)); p.set(x - 1, y - 2, M2(180));  // crest
      break;
    case 'undead':
      p.set(x + 2, y + 1, EYE); p.set(x + 3, y + 3, EYE); p.set(x + 1, y + 3, rgb(0xd8d2c0));
      p.set(x, y - 1, skinD); p.set(x + 2, y - 1, skinD);
      break;
    default:
      p.hline(x, x + 3, y - 1, hair);
  }
}

function armour(p: Pix, tier: number, ox: number, top: number, tw: number, legTop: number) {
  const cols: [RGBA, RGBA][] = [
    [LEATHER, LEATHER_D], [BRONZE, BRONZE_D], [STEEL_D, rgb(0x5d636b)], [STEEL, STEEL_D],
    [M1(150), M1(110)], [M1(140), M1(100)], [rgb(0x6b7350), rgb(0x4e5539)], [rgb(0x4e5539), rgb(0x363b28)], [rgb(0xe6edf2), rgb(0x9fb2c0)],
  ];
  const [a, ad] = cols[Math.max(0, Math.min(8, tier))];
  if (tier === 4 || tier === 5) {   // coats: cross belts
    for (let y = top; y < legTop; y++) p.set(ox + ((y - top) % tw), y, WHITE);
    return;
  }
  for (let y = top; y < legTop - 1; y++) for (let x = 0; x < tw; x++) p.set(ox + x, y, x === tw - 1 ? ad : a);
  if (tier === 8) { p.set(ox + 1, top + 1, EM(0x6ff0ff)); p.set(ox + 2, top + 1, EM(0x6ff0ff)); }
  if (tier >= 2 && tier <= 3) p.set(ox + tw - 1, top, ad);
}

function helmet(p: Pix, tier: number, x: number, y: number, b: string) {
  if (b === 'avian' && tier < 4) return;
  switch (tier) {
    case 0: p.hline(x, x + 3, y - 1, LEATHER); break;
    case 1: p.hline(x, x + 3, y - 1, BRONZE); p.hline(x, x + 3, y, BRONZE); p.set(x + 1, y - 2, rgb(0xc43a2a)); p.set(x + 2, y - 2, rgb(0xc43a2a)); break;
    case 2: p.hline(x, x + 3, y - 1, STEEL_D); p.hline(x, x + 3, y, STEEL_D); p.set(x + 1, y - 2, STEEL_D); p.set(x + 2, y - 2, STEEL_D); break;
    case 3: p.rect(x, y - 1, 4, 3, STEEL); p.set(x + 3, y + 1, EYE); p.set(x + 1, y - 2, M1(170)); p.set(x + 2, y - 3, M1(170)); break;
    case 4: p.hline(x - 1, x + 4, y - 1, rgb(0x2b2b33)); p.hline(x, x + 3, y - 2, rgb(0x2b2b33)); break;
    case 5: p.hline(x, x + 4, y - 1, M1(120)); p.hline(x, x + 3, y - 2, M1(120)); p.set(x + 2, y - 2, GOLD); break;
    case 6: case 7: p.hline(x - 1, x + 4, y - 1, rgb(0x5d6648)); p.hline(x, x + 3, y - 2, rgb(0x5d6648)); break;
    case 8: p.rect(x, y - 1, 4, 4, rgb(0xe6edf2)); p.hline(x + 2, x + 3, y + 1, EM(0x6ff0ff)); break;
  }
}

function held(p: Pix, o: PersonOpts, [hx, hy]: [number, number], working: boolean, headX: number, headY: number, torTop: number) {
  const up = working;
  const tier = o.tier;
  switch (o.gear) {
    case 'wood': // axe
      if (up) { p.line(hx, hy, hx + 2, hy - 3, WOOD); p.rect(hx + 2, hy - 4, 2, 2, STEEL); }
      else { p.vline(hx + 1, hy - 3, hy + 1, WOOD); p.rect(hx + 2, hy - 3, 1, 2, STEEL); }
      break;
    case 'mine': // pick
      if (up) { p.line(hx, hy, hx + 2, hy - 3, WOOD); p.line(hx + 1, hy - 4, hx + 4, hy - 2, STEEL_D); }
      else { p.vline(hx + 1, hy - 3, hy + 1, WOOD); p.line(hx, hy - 3, hx + 2, hy - 4, STEEL_D); p.set(hx + 3, hy - 3, STEEL_D); }
      break;
    case 'farm': // hoe / scythe
      p.vline(hx + 1, hy - 4, hy + 2, WOOD);
      p.hline(hx + 1, hx + 3, hy - 4, STEEL_D);
      break;
    case 'build': // hammer
      if (up) { p.line(hx, hy, hx + 1, hy - 2, WOOD); p.rect(hx + 1, hy - 3, 2, 1, STEEL_D); }
      else { p.vline(hx + 1, hy - 1, hy + 1, WOOD); p.rect(hx + 1, hy - 2, 2, 1, STEEL_D); }
      break;
    case 'fish': // rod
      p.line(hx, hy, hx + 4, hy - 5, WOOD_D); p.set(hx + 5, hy - 4, rgb(0xd8d8d8)); p.set(hx + 5, hy - 3, rgb(0xd8d8d8));
      break;
    case 'hunt': // spear
      p.line(hx, hy + 2, hx + 2, hy - 4, WOOD); p.set(hx + 2, hy - 5, STEEL); p.set(hx + 3, hy - 5, STEEL);
      break;
    case 'herd': // crook
      p.vline(hx + 1, hy - 4, hy + 2, WOOD); p.set(hx + 2, hy - 5, WOOD); p.set(hx + 3, hy - 4, WOOD);
      break;
    case 'smith': p.rect(hx + 1, hy - 2, 2, 1, STEEL_D); p.vline(hx + 1, hy - 1, hy + 1, WOOD); break;
    case 'scholar': p.rect(hx, hy, 3, 2, rgb(0x8a2a2a)); p.set(hx + 1, hy, rgb(0xf0ebdc)); break;
    case 'merchant': p.rect(hx, hy, 2, 2, rgb(0xa88a52)); p.set(hx, hy, GOLD); break;
    case 'healer': p.rect(hx, hy, 2, 2, WHITE); p.set(hx, hy, rgb(0xe0453a)); break;
    case 'priest': p.vline(hx + 1, hy - 4, hy + 2, GOLD_D); p.set(hx + 1, hy - 5, GOLD); p.set(hx, hy - 4, GOLD); p.set(hx + 2, hy - 4, GOLD); break;
    case 'mage':
      p.vline(hx + 1, hy - 4, hy + 2, WOOD_D);
      p.set(hx + 1, hy - 5, EM(0x8fe8ff)); p.set(hx + 2, hy - 5, EM(0x8fe8ff)); p.set(hx + 1, hy - 6, EM(0xd8fbff));
      break;
    case 'noble': case 'ruler': if (o.gear === 'ruler') { p.vline(hx + 1, hy - 3, hy + 1, GOLD_D); p.set(hx + 1, hy - 4, rgb(0x6fd0ff)); } break;
    case 'thief': p.set(hx + 1, hy, STEEL); p.set(hx + 2, hy - 1, STEEL); break;
    case 'sailor': p.rect(hx, hy, 2, 2, rgb(0xd8c9a0)); break;
    case 'sold': case 'guard': case 'hero': meleeWeapon(p, tier, hx, hy, up, o.gear === 'hero'); if (tier <= 3 && o.gear !== 'hero') shield(p, tier, headX - 2, torTop + 1); break;
    case 'arch': rangedWeapon(p, tier, hx, hy, up); break;
  }
}

function meleeWeapon(p: Pix, tier: number, hx: number, hy: number, up: boolean, hero: boolean) {
  if (tier >= 4) { rangedWeapon(p, tier, hx, hy, up); if (tier === 4) p.set(hx + 5, hy - 1, STEEL); return; }   // muskets with bayonets
  const blade = tier === 0 ? WOOD : tier === 1 ? BRONZE : hero ? GOLD : STEEL;
  if (tier === 0) { // club
    if (up) { p.line(hx, hy, hx + 2, hy - 3, WOOD); p.rect(hx + 2, hy - 4, 2, 2, WOOD_D); }
    else { p.vline(hx + 1, hy - 3, hy + 1, WOOD); p.rect(hx + 1, hy - 4, 2, 2, WOOD_D); }
    return;
  }
  if (up) { p.line(hx + 1, hy - 1, hx + 4, hy - 4, blade); p.set(hx, hy, GOLD_D); p.set(hx + 1, hy, GOLD_D); }
  else { p.vline(hx + 1, hy - 4, hy - 1, blade); p.hline(hx, hx + 2, hy, GOLD_D); }
}

function shield(p: Pix, tier: number, x: number, y: number) {
  const c = tier === 0 ? WOOD : tier === 1 ? BRONZE : M1(160);
  p.rect(x, y, 2, 3, c);
  p.set(x, y + 3, shade(c, 0.8));
  if (tier >= 2) p.set(x, y + 1, M1(220));
}

function rangedWeapon(p: Pix, tier: number, hx: number, hy: number, up: boolean) {
  if (tier <= 3) { // bows
    const c = tier === 0 ? WOOD_D : WOOD;
    p.vline(hx + 2, hy - 3, hy + 2, c); p.set(hx + 1, hy - 4, c); p.set(hx + 1, hy + 3, c);
    p.vline(hx + 1, hy - 3, hy + 2, rgb(0xe8e0d0));
    if (up) p.hline(hx - 1, hx + 3, hy, WOOD_D);
    return;
  }
  // guns: longer and darker as eras pass
  const len = tier === 4 ? 6 : tier === 5 ? 5 : 4;
  const c = tier === 4 ? WOOD : tier === 8 ? rgb(0xe6edf2) : GUN;
  p.hline(hx - 1, hx + len - 1, hy - 1, c);
  p.set(hx - 1, hy, c);
  if (tier >= 6) p.set(hx + 1, hy, GUN);
  if (tier === 8) { p.set(hx + len - 1, hy - 1, EM(0xff4f6f)); p.set(hx + 1, hy - 2, EM(0x6ff0ff)); }
}

function mount(rider: Pix, kind: number): Pix {
  // 1 horse, 2 wolf, 3 tank
  const p = new Pix(20, 20);
  const ox = 2, oy = 2;
  if (kind === 3) {
    // a little tank
    p.rect(ox + 1, oy + 11, 15, 4, rgb(0x5d6648)); p.rect(ox + 4, oy + 8, 8, 3, rgb(0x6b7350)); p.hline(ox + 12, ox + 18, oy + 9, rgb(0x3d4430));
    for (let x = 0; x < 15; x += 3) p.rect(ox + 1 + x, oy + 15, 2, 2, rgb(0x2b2b2b));
    p.set(ox + 7, oy + 9, M1(160)); p.set(ox + 8, oy + 9, M1(160));
    p.outline(K);
    for (let x = ox; x <= ox + 17; x++) p.set(x, oy + 17, SHADOW);
    return p;
  }
  const horse = kind === 1;
  const body = horse ? rgb(0x7a4f2e) : rgb(0x6b6b70);
  const bodyD = shade(body, 0.75);
  // body
  p.rect(ox + 2, oy + 10, 10, 4, body); p.hline(ox + 2, ox + 11, oy + 13, bodyD);
  // neck and head
  p.rect(ox + 11, oy + 7, 2, 4, body); p.rect(ox + 12, oy + 6, 4, 2, body); p.set(ox + 15, oy + 7, bodyD);
  p.set(ox + 13, oy + 6, EYE);
  if (horse) { p.vline(ox + 11, oy + 6, oy + 9, rgb(0x2b1d12)); p.vline(ox + 1, oy + 10, oy + 13, rgb(0x2b1d12)); }
  else { p.set(ox + 12, oy + 5, body); p.set(ox + 1, oy + 9, body); }
  // legs
  for (const lx of [ox + 3, ox + 5, ox + 9, ox + 11]) { p.vline(lx, oy + 14, oy + 16, bodyD); }
  // saddle in kingdom colour
  p.rect(ox + 5, oy + 9, 4, 2, M1(150));
  p.outline(K);
  // the rider sits on top
  for (let y = 0; y < rider.h; y++) for (let x = 0; x < rider.w; x++) {
    const c = rider.get(x, y);
    if (!c || c[3] < 90) continue;
    const ty = y - 5 + oy - 3, tx = x - 2 + ox;
    if (ty > oy + 11) continue;
    p.set(tx, ty, c);
  }
  for (let x = ox + 1; x <= ox + 14; x++) p.set(x, oy + 17, SHADOW);
  return p;
}

function boat(rider: Pix): Pix {
  const p = new Pix(20, 18);
  for (let y = 0; y < rider.h; y++) for (let x = 0; x < rider.w; x++) {
    const c = rider.get(x, y);
    if (!c || c[3] < 90) continue;
    if (y > 11) continue;
    p.set(x + 1, y + 1, c);
  }
  // hull
  const hull = rgb(0x6b4423), hullD = rgb(0x4a2e17);
  p.hline(2, 17, 12, hull); p.hline(3, 16, 13, hull); p.hline(4, 15, 14, hullD);
  p.set(1, 11, hull); p.set(18, 11, hull);
  // sail with the flag colour
  p.vline(13, 2, 11, WOOD_D);
  for (let y = 3; y < 10; y++) p.hline(14, 14 + Math.min(4, (y - 2)), y, y % 3 === 0 ? M1(130) : M1(175));
  p.outline(K);
  return p;
}

// ------------------------------------------------------------------ animals and monsters
interface Art { rows: string[]; a?: string[]; b?: string[]; pal?: Record<string, RGBA | null>; outline?: boolean; fly?: boolean }
const P: Record<string, RGBA | null> = {
  f: M2(160), F: M2(115), l: M2(205), d: M2(80), k: K, e: EYE, w: WHITE, p: rgb(0xe9a0a0), b: rgb(0x5a3a22), y: GOLD, Y: GOLD_D,
  r: rgb(0xc43a2a), R: rgb(0x8a1e18), g: rgb(0x4f9a3a), G: rgb(0x2f6b2a), m: rgb(0x9a9a9f), M: rgb(0x5d5d63), n: rgb(0xe8e0c8), N: rgb(0xb8ae94),
  v: EM(0xb06fff), V: EM(0x6ff0ff), o: EM(0xff8a2a), O: EM(0xffd25a), t: WHITE, u: rgb(0x2b6aa8), x: EM(0xff3f3f), s: SHADOW, c: rgb(0x9fe6ff), C: EM(0xc8f6ff),
};

const ANIMALS: Record<string, Art> = {
  sheep: { rows: [
    '.lll.....',
    'lllll.kk.',
    'llllllkek',
    'llllll.kk',
    '.llll....'], a: ['.k.k..k..', '.k.k..k..'], b: ['k...k.k..', 'k....kk..'] },
  cow: { rows: [
    '........w.',
    'fffwffffkw',
    'fwwfffffkek',
    'ffffwwffkkp',
    'fffffff....',
    '.F.....F...'], a: ['.k.k..k.k..'], b: ['k...k...kk.'] },
  pig: { rows: [
    '......pp.',
    '.ffffffff',
    'fffffffepp',
    'ffffffff..',
    '.ffffff...'], a: ['.k.k.k.k.'], b: ['k..k..k.k'] },
  chicken: { rows: [
    '...rr',
    '..lle',
    'l.llly',
    'lllll.',
    '.lll..'], a: ['..y.y.'], b: ['.y..y.'] },
  horse: { rows: [
    '.........dd.',
    '........ffff',
    '........ffef',
    '.d.....ff..',
    'dfffffffff..',
    'dffffffff...',
    '.fffffffF...'], a: ['.F.F...F.F..', '.k.k...k.k..'], b: ['F...F.F...F.', 'k...k.k...k.'] },
  camel: { rows: [
    '..........ff',
    '...ff....ffe',
    '..ffff...f..',
    '.ffffffff...',
    'fffffffff...',
    '.ffffffff...'], a: ['.F.F..F.F...', '.F.F..F.F...', '.k.k..k.k...'], b: ['F...FF...F..', 'F...FF...F..', 'k...kk...k..'] },
  deer: { rows: [
    '........b.b',
    '.........bb.',
    '........ffe',
    '.......ff..',
    'lffffffff..',
    '.fffffff...'], a: ['.F.F..F.F..', '.k.k..k.k..'], b: ['F..F.F...F.', 'k..k.k...k.'] },
  rabbit: { rows: [
    '...ff',
    '...fl',
    'lffffe',
    'ffffff',
    '.ffff.'], a: ['.k..k.'], b: ['k...k.'] },
  wolf: { rows: [
    '.......f.f',
    'F.....ffff',
    '.ffffffffek',
    '.fffffffl..',
    '.fffffff...'], a: ['.F.F..F.F..'], b: ['F...FF...F.'] },
  bear: { rows: [
    '.......ff.',
    '..fffffffff',
    '.ffffffffefk',
    'ffffffffffF',
    'fffffffff..',
    '.FFFFFFFF..'], a: ['.FF..FF.FF.'], b: ['FF.FF..FF..'] },
  fox: { rows: [
    '......f.f',
    'll...ffff',
    'lff.ffffek',
    '.fffffffw.',
    '..ffffff..'], a: ['..k.k.k.k.'], b: ['.k..kk..k.'] },
  croc: { rows: [
    '..F.F.F.F.....',
    'FffffffffffffF',
    '.fffffffffftetw',
    '..F.F....F.F..'], a: ['..k.k....k.k..'], b: ['.k...k..k...k.'] },
  elephant: { rows: [
    '....FFFFF.....',
    '..fffffffff...',
    '.ffffffffffff.',
    'Fffffffffffef.',
    'ffffffffffff.w',
    'fffffffffffwf.',
    'fffffffffff.f.',
    '.fffffffff..f.'], a: ['.ff..ff.ff.ff.', '.ff..ff.ff.ff.'], b: ['ff..ff..ff.ff.', 'ff..ff..ff.ff.'] },
  raptor: { rows: [
    '.......ffff',
    '......ffefw',
    'F.....ffkkk',
    '.FffffFf...',
    '..ffffff...',
    '...ffff....'], a: ['....F.F....', '...k..k....'], b: ['...F...F...', '..k.....k..'] },
  trex: { rows: [
    '..........ffffff',
    '.........ffffeff',
    '.........fffffff',
    'F........fffwtwt',
    '.F......ffffkkk.',
    '..Fffffffffff...',
    '...fffffffffl...',
    '....ffffffffF...',
    '.....fffffff....',
    '.....FF...FF....'], a: ['.....FF...FF....', '.....kk...kk....'], b: ['....FF.....FF...', '....kk.....kk...'] },
  bronto: { rows: [
    '.................fff',
    '................ffef',
    '................ff..',
    '...............ff...',
    '..............ff....',
    '.....fffffffffff....',
    '...fffffffffffff....',
    '..ffffffffffffff....',
    'Fffffffffffffff.....',
    '..fffffffffffff.....',
    '...FFFFFFFFFFF......'], a: ['...ff.ff...ff.ff....', '...ff.ff...ff.ff....'], b: ['..ff...ff.ff...ff...', '..ff...ff.ff...ff...'] },
  fish: { rows: ['.f..', 'ffffe', '.fff.'] },
  shark: { rows: ['....F.....', 'f..fff....', 'ffffffffff', '.fllllltwe', '..f.......'] },
  whale: { rows: ['.....................', 'f...fffffffffffff....', 'ff.fffffffffffffff...', '.fffffffffffffffefff.', 'ff.llllllllllllllll..', 'f.....lllllll........'] },
  kraken: { rows: [
    '.....ffffff.....',
    '....ffffffff....',
    '...fffeffeff....',
    '...ffffffffff...',
    '....ffffffff....',
    '..f.f.f.ff.f.f..',
    '.f.f..f.f..f.ff.',
    'f..f.f...f..f..f',
    '..f..f....f...f.'] },
  serpent: { rows: [
    '........................',
    '...ff......ff.....ffff..',
    '..ffff....ffff...ffffefw',
    '.ff..ff..ff..ff.ff..fff.',
    'ff....ffff....fff.......',
    'f......ff...............'] },
  crow: { rows: ['..kkk', 'kkkkeY', '.kkk..'], a: ['k...k.', '.kk...'], b: ['.....', 'kk.kk.'], fly: true },
  dragon: { rows: [
    '......F...........F...',
    '.....FfF.........FfF..',
    '....FfffF.......FfffF.',
    '...FffffffF...FfffffF.',
    '..Fffff.fffffffff.ffF.',
    '........fffffffff.ffff',
    '.......fffffffffffffeff',
    '..ff..fffffffffllftwtw',
    '.f..fffffffffflll.kkk.',
    'f.....ffffffffll......',
    '.......fff..fff.......',
    '.......FF....FF.......'], fly: true },
  demon: { rows: [
    '.n....n.',
    '.nf..fn.',
    '..ffff..',
    '..fxfx..',
    '..ffff..',
    '.ffffff.',
    'ff.ff.ff',
    'f.ffff.f',
    '..f..f..',
    '..f..f..',
    '.kk..kk.'] },
  ghost: { rows: ['..lll..', '.lllll.', 'lleleel', 'lllllll', 'lllllll', 'lllllll', 'l.l.l.l'] },
  slime: { rows: ['..ll..', '.lfff.', 'ffefef', 'ffffff', '.FFFF.'] },
  golem: { rows: [
    '...mmmm...',
    '...mVmV...',
    '...mmmm...',
    '.mmmmmmmm.',
    'mmMmmmmMmm',
    'mm.mmmm.mm',
    'Mm.mmmm.mM',
    '...mm.mm..',
    '...mm.mm..',
    '..MMM.MMM.'] },
  treant: { rows: [
    '..gGgGgg..',
    '.gGgggGgg.',
    'gggGggggGg',
    '.gggGgggg.',
    '...bbbb...',
    '..bebbeb..',
    '.b.bbbb.b.',
    'b..bbbb..b',
    '...bbbb...',
    '...bb.bb..',
    '..bb...bb.',
    '.bb.....bb'] },
  titan: { rows: [
    '.....mmmm.....',
    '....mmmmmm....',
    '....mOmmOm....',
    '....mmmmmm....',
    '.....mmmm.....',
    '..mmmmmmmmmm..',
    '.mmmmmmmmmmmm.',
    'mmmmmMmmMmmmmm',
    'mm.mmmmmmmm.mm',
    'mm.mmmmmmmm.mm',
    'mm.mmmmmmmm.mm',
    'MM.mmmmmmmm.MM',
    '...mmmmmmmm...',
    '...mmm..mmm...',
    '...mmm..mmm...',
    '...mmm..mmm...',
    '..MMMM..MMMM..'] },
  sandworm: { rows: [
    '..ffff..',
    '.fwfwff.',
    'fk.kk.kf',
    'fkkkkkkf',
    '.ffffff.',
    '.fFfFff.',
    '.ffffff.',
    '..fFff..',
    '.dddddd.'] },
  alien: { rows: ['..lll..', '.lllll.', 'lVllVll', '.lllll.', '..lll..', '.mmmmm.', 'l.mmm.l', '..m.m..', '..m.m..', '.kk.kk.'] },
  zombie: { rows: ['..ggg.', '.gggeg', '.ggggg', '..rgg.', '.bbbbg', 'g.bbb.g', '..bbb..', '..b.b..', '..b.b..', '.kk.kk.'] },
};

export function hasAnimal(key: string) { return key in ANIMALS; }

export function paintAnimal(key: string, frame: number): Pix {
  const art = ANIMALS[key] || ANIMALS.rabbit;
  const legs = frame === 1 ? art.b : art.a;
  const rows = [...art.rows, ...(legs || [])];
  const W = Math.max(...rows.map(r => r.length));
  const p = new Pix(W + 2, rows.length + 3);
  // flyers flap: frame 1 lifts the wings
  if (art.fly && frame === 1) {
    const r2 = rows.map(r => r);
    p.ascii(r2.slice(Math.min(3, Math.floor(rows.length / 3))), P, 1, 1);
    p.ascii(r2.slice(0, Math.min(3, Math.floor(rows.length / 3))).map(r => r.replace(/F/g, '.')), P, 1, 0);
  } else p.ascii(rows, P, 1, 1);
  p.outline(K);
  if (!art.fly) for (let x = 1; x < W + 1; x++) if (p.get(x, rows.length) || p.get(x, rows.length - 1)) p.set(x, rows.length + 1, SHADOW);
  return p;
}
