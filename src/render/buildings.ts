// Buildings, painted in code, in three-quarter view: a front wall with doors and windows and a roof
// that shows the depth of the footprint. Each race builds in its own style, and the look moves
// with the times: hides and thatch, mud brick and timber, stone and slate, brick and chimneys,
// concrete and glass. Owner colour shows on flags, awnings and trims; windows glow at night.
import { Pix, RGBA, rgb, shade, mix, M1, EM, SHADOW, OUT } from './pixels';
import { hash2 } from '../sim/rng';

export const STYLE_NAMES = ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard', 'avian', 'undead', 'beast'];

interface Pal { wall: RGBA; wallD: RGBA; roof: RGBA; roofD: RGBA; trim: RGBA; shape: 'gable' | 'cone' | 'dome' | 'flat' | 'spike' | 'mush' | 'nest' | 'hide'; win: RGBA }

const LIGHT = EM(0xffd27a);
function palette(style: number, era: number): Pal {
  const e = Math.min(4, era);
  const g = (w: number, r: number, t: number, shape: Pal['shape'], win: RGBA = LIGHT): Pal => ({ wall: rgb(w), wallD: shade(rgb(w), 0.72), roof: rgb(r), roofD: shade(rgb(r), 0.7), trim: rgb(t), shape, win });
  switch (STYLE_NAMES[style]) {
    case 'elf': return [g(0xb59a6a, 0x5f9e4a, 0x7a5a32, 'cone'), g(0xe6dcc4, 0x4f8f5a, 0x9a7a4a, 'cone'), g(0xf2ecdc, 0x3f8a6a, 0xc9a85a, 'dome'), g(0xf0f0ea, 0x4fa88a, 0xd8c070, 'dome'), g(0xe8f4f0, 0x6fd0b0, 0xa0e0d0, 'dome', EM(0xbaf7ff))][e];
    case 'dwarf': return [g(0x8a8278, 0x6b5a45, 0x5a4a3a, 'flat'), g(0x8f8a82, 0x5d5650, 0xb8892a, 'flat'), g(0x9a948c, 0x4a4a52, 0xd8a83a, 'gable'), g(0x8a4a3a, 0x3a3a40, 0xd8a83a, 'flat'), g(0x7d838c, 0x4a4a52, 0xf2c94c, 'flat')][e];
    case 'orc': return [g(0x7a5a3a, 0x9a7a52, 0xe8e0c8, 'hide'), g(0x6b4a2b, 0x8a6a48, 0xe8e0c8, 'hide'), g(0x5a5a5a, 0x7a5a42, 0xc43a2a, 'hide'), g(0x4a4a4a, 0x2b2b2b, 0xc43a2a, 'flat'), g(0x3d3d40, 0x2b2b2b, 0xe0453a, 'flat', EM(0xff8a5a))][e];
    case 'goblin': return [g(0x7a6a3a, 0x9a8a4a, 0x5a3a22, 'cone'), g(0x8a6a3a, 0x6a7a3a, 0x5a3a22, 'gable'), g(0x7a6a5a, 0x5a6a3a, 0x8a5a2e, 'gable'), g(0x6a5a4a, 0x4a5a2a, 0xa8a8a8, 'flat'), g(0x5a6a4a, 0x3a4a2a, 0x9fffd0, 'flat', EM(0x9fffaa))][e];
    case 'lizard': return [g(0x8a7a52, 0x9a8a4a, 0x4f9a6a, 'dome'), g(0xa08a5a, 0x7a8a42, 0x4f9a6a, 'dome'), g(0xb8a070, 0x5a8a5a, 0x2fa06a, 'dome'), g(0xa89060, 0x4a6a4a, 0x2fa06a, 'flat'), g(0x9ab0a0, 0x3a6a5a, 0x6fffc0, 'dome', EM(0x9fffd0))][e];
    case 'avian': return [g(0x9a7a4a, 0xb89a5a, 0xe8e0c8, 'nest'), g(0xd8c8a0, 0xb07a4a, 0xf2f0e8, 'cone'), g(0xf2ecdc, 0x6a7ab8, 0xf2f0e8, 'cone'), g(0xe8e4dc, 0x5a6aa8, 0xf2f0e8, 'cone'), g(0xf4f6f8, 0x8aa8e8, 0xffffff, 'cone', EM(0xc8e8ff))][e];
    case 'undead': return [g(0x5a5560, 0x3a3540, 0x9fb39a, 'spike', EM(0x9fffd0)), g(0x4a4550, 0x2b2830, 0x9fb39a, 'spike', EM(0x9fffd0)), g(0x55505e, 0x2b2830, 0x8f6fd0, 'spike', EM(0xb06fff)), g(0x4a4550, 0x2b2830, 0x8f6fd0, 'spike', EM(0xb06fff)), g(0x3d3a45, 0x24222a, 0x8f6fd0, 'flat', EM(0xb06fff))][e];
    case 'beast': return [g(0x8a6a42, 0x9a8a4a, 0x5a3a22, 'cone'), g(0x8a6a42, 0x7a5a32, 0x5a3a22, 'gable'), g(0x9a8a7a, 0x6a4a3a, 0x5a3a22, 'gable'), g(0x8a4a3a, 0x4a4a4a, 0xa8a8a8, 'flat'), g(0x9aa0a8, 0x5a6068, 0xd8d8d8, 'flat')][e];
    default: return [g(0x9a7a52, 0xc9a85a, 0x6b4a2b, 'cone'), g(0xc9b48a, 0xa0522d, 0x6b4a2b, 'gable'), g(0xd8ccb0, 0x8a3a2e, 0x5a3a22, 'gable'), g(0xa84a3a, 0x4a4a52, 0x3a3a3a, 'gable'), g(0xb8bcc4, 0x5a6270, 0xe8eef4, 'flat', EM(0xd8f0ff))][e];
  }
}

/** a wall-and-roof block. x0 = left, base = bottom row of the footprint; fw = front wall height; depth = roof depth */
function block(p: Pix, x0: number, base: number, W: number, depth: number, fw: number, pal: Pal, opts: { door?: boolean; windows?: number; floors?: number; seed?: number; noRoof?: boolean; era?: number; boxes?: boolean } = {}) {
  const wallTop = base - fw;
  const era = opts.era ?? 2, seed = opts.seed ?? 0;
  const beam = shade(pal.wall, 0.55);
  // front wall, textured by the age it was built in
  for (let y = wallTop; y < base; y++) for (let x = x0; x < x0 + W; x++) {
    const lx = x - x0, ly = y - wallTop;
    let c = pal.wall;
    if (era <= 1) { if (lx % 3 === 2) c = shade(pal.wall, 0.86); }                                     // planks / mud
    else if (era === 2) { if ((ly + ((lx >> 1) & 1)) % 3 === 0) c = shade(pal.wall, 0.93); }          // plaster
    else if (era === 3) { if (ly % 2 === 1 || (lx + (ly >> 1) * 2) % 4 === 0) c = shade(pal.wall, 0.86); } // bricks
    else { if (ly % 3 === 0) c = shade(pal.wall, 0.9); }                                              // concrete panels
    if (lx === 0) c = shade(c, 1.08);
    if (lx === W - 1) c = pal.wallD;
    p.set(x, y, c);
  }
  // half-timbering on old houses
  if (era === 2 && W >= 8) { p.vline(x0, wallTop, base - 1, beam); p.vline(x0 + W - 1, wallTop, base - 1, shade(beam, 0.8)); if (fw >= 8) p.hline(x0, x0 + W - 1, wallTop + (fw >> 1) - 1, beam); }
  // a shadow line under the eaves
  p.hline(x0, x0 + W - 1, wallTop, shade(pal.wall, 0.7));
  // windows with frames, sills and night glow
  const floors = opts.floors ?? 1;
  const win = opts.windows ?? Math.max(1, Math.floor(W / 5));
  const frame = era >= 4 ? rgb(0x9aa4b0) : rgb(0x4a321d);
  for (let f = 0; f < floors; f++) {
    const wy = base - 4 - f * 5;
    if (wy - 1 <= wallTop) break;
    for (let k = 0; k < win; k++) {
      const wx = x0 + Math.round((k + 0.5) * W / win) - 1;
      if (opts.door && f === 0 && Math.abs(wx - (x0 + (W >> 1) - 1)) < 3) continue;
      p.hline(wx - 1, wx + 2, wy - 2, frame);
      p.set(wx, wy - 1, pal.win); p.set(wx + 1, wy - 1, era >= 4 ? pal.win : shade(pal.win as RGBA, 0.8)); p.set(wx, wy, shade(pal.win as RGBA, 0.75)); p.set(wx + 1, wy, pal.win);
      p.hline(wx - 1, wx + 2, wy + 1, era >= 3 ? rgb(0xd8d2c8) : rgb(0x8a6a42));
      if (opts.boxes && f === 0 && hash2(seed, k, 3) < 0.6) { p.set(wx, wy + 2, rgb(0xe0453a)); p.set(wx + 1, wy + 2, rgb(0x6fbf4a)); }
    }
  }
  if (opts.door) {
    const dx = x0 + (W >> 1) - 1;
    p.rect(dx - 1, base - 5, 4, 1, frame);
    p.rect(dx, base - 4, 2, 4, rgb(0x3a2616)); p.set(dx, base - 4, rgb(0x5a3a22)); p.set(dx + 1, base - 2, rgb(0xd8a83a));
    p.hline(dx - 1, dx + 2, base, rgb(0x8a8278));
  }
  if (opts.noRoof) return;
  roof(p, x0, wallTop, W, depth, pal, seed);
}

function roof(p: Pix, x0: number, wallTop: number, W: number, depth: number, pal: Pal, seed = 0) {
  const r = pal.roof, rd = pal.roofD, rl = shade(r, 1.18);
  const top = wallTop - depth;
  switch (pal.shape) {
    case 'flat': {
      for (let y = top; y < wallTop; y++) for (let x = x0; x < x0 + W; x++) p.set(x, y, x === x0 + W - 1 ? rd : (x + y) % 5 === 0 ? shade(r, 0.95) : r);
      p.hline(x0, x0 + W - 1, top, rl); p.vline(x0, top, wallTop - 1, rl);
      p.hline(x0, x0 + W - 1, wallTop - 1, rd);
      // something on the roof: a vent, a water tank or a little garden
      const k = Math.floor(hash2(seed, 5, 9) * 3);
      if (k === 0 && W >= 8) p.rect(x0 + 2, top + 2, 2, 2, shade(r, 0.7));
      if (k === 1 && W >= 10) { p.rect(x0 + W - 5, top + 1, 3, 3, rgb(0x8a8a90)); p.hline(x0 + W - 5, x0 + W - 3, top + 1, rgb(0xb0b0b8)); }
      break;
    }
    case 'gable': {
      // the near slope of a pitched roof seen from above-front, tiles in rows, eaves overhanging
      const L = x0 - 1, R = x0 + W;
      const ridge = top - 1;
      for (let y = ridge; y < wallTop; y++) {
        const row = y - ridge;
        for (let x = L; x <= R; x++) {
          let c = row === 0 ? rl : row % 2 === 0 ? r : shade(r, 0.9);
          if (row > 0 && (x + (row >> 1) * 2) % 4 === 0) c = shade(c, 0.85);   // tile seams
          if (x === L || x === R) c = rd;                                      // gable ends
          if (y === wallTop - 1) c = rd;                                       // eaves
          p.set(x, y, c);
        }
      }
      break;
    }
    case 'cone': {
      const cx = x0 + W / 2, h = depth + 4;
      for (let y = 0; y < h; y++) {
        const hw = Math.max(0.5, (W / 2 + 1) * (y + 1) / h);
        for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) p.set(x, wallTop - h + y, x > cx + hw * 0.4 ? rd : (y % 3 === 0 ? shade(r, 0.88) : (x + y) % 4 === 0 ? rl : r));
      }
      p.set(Math.floor(cx), wallTop - h - 1, pal.trim);
      break;
    }
    case 'dome': {
      const cx = x0 + W / 2 - 0.5, ry = Math.min(depth * 0.9 + 1, W * 0.55);
      p.ellipse(cx + 0.5, wallTop, W / 2 + 0.5, ry, r);
      for (let y = Math.floor(wallTop - ry); y <= wallTop; y++) for (let x = x0; x < x0 + W; x++) { if (!p.get(x, y)) continue; if (x > cx + W * 0.22) p.set(x, y, rd); else if (x < cx - W * 0.15 && y < wallTop - ry * 0.4) p.set(x, y, rl); }
      p.vline(Math.round(cx), Math.floor(wallTop - ry) - 2, Math.floor(wallTop - ry) - 1, pal.trim);
      break;
    }
    case 'spike': {
      // hide-and-timber roof with stakes along the top
      for (let y = top; y < wallTop; y++) for (let x = x0; x < x0 + W; x++) p.set(x, y, x === x0 + W - 1 ? rd : (y - top) % 3 === 0 ? shade(r, 0.85) : (x % 4 === 1 ? rl : r));
      for (let x = x0; x < x0 + W; x += 3) { p.vline(x, top - 3, top - 1, rgb(0x6b4a2b)); p.set(x, top - 4, pal.trim); }
      break;
    }
    case 'hide': {
      // a big hide yurt: stitched skins over a frame, tusks and a skull on top
      const cx = x0 + W / 2 - 0.5, ry = Math.min(depth + 3, W * 0.62);
      p.ellipse(cx + 0.5, wallTop + 1, W / 2 + 1, ry, r);
      for (let y = Math.floor(wallTop - ry); y <= wallTop; y++) for (let x = x0 - 1; x <= x0 + W; x++) {
        if (!p.get(x, y)) continue;
        if ((y - wallTop) % 3 === 0) p.set(x, y, shade(r, 0.82));
        else if (x > cx + W * 0.25) p.set(x, y, rd);
        else if ((x * 7 + y * 3) % 11 === 0) p.set(x, y, rl);
      }
      const ty = Math.floor(wallTop - ry);
      p.line(cx - 2, ty + 2, cx - 4, ty - 2, rgb(0xe8e0c8)); p.line(cx + 3, ty + 2, cx + 5, ty - 2, rgb(0xe8e0c8));
      p.rect(Math.round(cx), ty - 1, 2, 2, rgb(0xe8e0c8)); p.set(Math.round(cx), ty, rgb(0x1a1210));
      break;
    }
    case 'mush': {
      p.ellipse(x0 + W / 2, wallTop - depth / 2, W / 2 + 2, depth / 2 + 1, rgb(0xc4483a));
      for (let k = 0; k < 4; k++) p.set(x0 + 1 + k * 3, wallTop - depth / 2 - 1, rgb(0xf4f1ea));
      break;
    }
    case 'nest': {
      p.ellipse(x0 + W / 2, wallTop - 1, W / 2 + 1, depth / 2 + 1, r);
      for (let x = x0 - 1; x < x0 + W + 1; x += 2) p.set(x, wallTop - depth / 2 - 1, rd);
      break;
    }
  }
}

function flag(p: Pix, x: number, y: number, h = 5) {
  p.vline(x, y, y + h, rgb(0x4a321d));
  p.rect(x + 1, y, 3, 2, M1(165)); p.set(x + 1, y + 2, M1(130)); p.set(x + 3, y + 1, M1(130));
}
function chimney(p: Pix, x: number, y: number, glow = false) {
  p.rect(x, y, 2, 3, rgb(0x6a4a3a)); p.set(x, y, rgb(0x4a3a2a));
  if (glow) p.set(x + 1, y - 1, EM(0xff8a2a));
}

export interface BuildingArt { pix: Pix; ax: number; ay: number }   // ax/ay: pixel at the footprint's top-left

/**
 * paint a building. w,h in tiles. Returns a sprite whose footprint top-left is at (ax, ay) in pixels
 * (art pixels; 8 per tile).
 */
export function paintBuilding(type: string, style: number, era: number, w: number, h: number, seed: number, scaffold = 0): BuildingArt {
  const W = w * 8, D = h * 8;
  const rise = RISE[type] ?? 8;
  const pad = 3;
  const p = new Pix(W + pad * 2, D + rise + pad * 2);
  const x0 = pad, base = pad + rise + D;   // base = bottom of footprint
  const pal0 = palette(style, era);
  const st = STYLE_NAMES[style];
  // neighbours don't all have the same roof
  const v = hash2(seed, 1, 5);
  const pal: Pal = { ...pal0, roof: shade(pal0.roof, 0.85 + v * 0.3), roofD: shade(pal0.roofD, 0.85 + v * 0.3) };
  if (st === 'human' && era >= 1 && era <= 3 && hash2(seed, 2, 5) < 0.3) { pal.roof = rgb(0x5a6270); pal.roofD = rgb(0x3a4048); }
  const rnd = (k: number) => hash2(seed, k, 77);
  const ground = (c: RGBA) => p.rect(x0, base - D + 2, W, D - 2, c);
  const e = Math.min(4, era);
  switch (type) {
    case 'hearth': {
      if (e === 0) {
        // a camp: fire pit, totem, a big tent
        tent(p, x0 + 1, base - 2, W - 6, 9, pal);
        p.ellipse(x0 + W - 3, base - 3, 2, 1.5, rgb(0x5a5550));
        p.set(x0 + W - 3, base - 4, EM(0xffb02a)); p.set(x0 + W - 4, base - 3, EM(0xff6a1a)); p.set(x0 + W - 2, base - 3, EM(0xff8a2a)); p.set(x0 + W - 3, base - 5, EM(0xffe07a));
        flag(p, x0 + W - 2, base - D - 4, 8);
      } else {
        block(p, x0, base, W, D - 4, 8 + (e >= 3 ? 4 : 0), pal, { era: e, seed, door: true, windows: 3, floors: e >= 3 ? 2 : 1 });
        flag(p, x0 + (W >> 1) - 1, base - 8 - D - (e >= 3 ? 8 : 4) - 2, 6);
        if (e >= 2) { p.rect(x0 + (W >> 1) - 2, base - 12 - D + 2, 4, 3, pal.wall); p.set(x0 + (W >> 1) - 1, base - 11 - D + 2, rgb(0xf4f1ea)); }
      }
      break;
    }
    case 'tent': tent(p, x0, base, W, 7, pal); break;
    case 'hut':
      if (st === 'avian') { nestHut(p, x0, base, W, D, pal); break; }
      block(p, x0 + 1, base, W - 2, D - 6, 5, { ...pal, shape: e === 0 ? (pal.shape === 'flat' ? 'cone' : pal.shape) : pal.shape }, { era: e, seed, door: true, windows: 1 });
      if (rnd(1) < 0.5) p.rect(x0 + W - 3, base - 3, 2, 2, rgb(0x8a5a2e));   // firewood
      break;
    case 'house': {
      const tall = rnd(4) < 0.35 && e >= 2;
      const fw = tall ? 11 : 8;
      block(p, x0, base, W, D - 6, fw, pal, { era: e, seed, door: true, windows: 2, floors: tall ? 2 : 1, boxes: e >= 2 && st !== 'orc' && st !== 'undead' });
      if (e >= 2 && rnd(2) < 0.7) chimney(p, x0 + (rnd(6) < 0.5 ? 2 : W - 4), base - fw - (D - 6) - 2);
      if (rnd(7) < 0.4 && e >= 1) { p.rect(x0 + W - 2, base - 2, 2, 2, rgb(0x8a5a2e)); p.set(x0 + W - 2, base - 3, rgb(0x6b4a2b)); }   // barrel
      break;
    }
    case 'manor': {
      block(p, x0, base, W, D - 5, 12, pal, { era: e, seed, door: true, windows: 4, floors: 2, boxes: true });
      // dormers in the roof
      const rt = base - 12 - (D - 5);
      for (const dx of [4, W - 6]) { p.rect(x0 + dx, rt + 2, 3, 3, pal.wall); p.set(x0 + dx + 1, rt + 3, pal.win); p.hline(x0 + dx - 1, x0 + dx + 3, rt + 1, pal.roofD); }
      flag(p, x0 + (W >> 1), rt - 6, 5);
      // a little garden hedge
      for (let x = x0; x < x0 + W; x += 2) p.set(x, base + 1, rgb(0x3f8a33));
      break;
    }
    case 'highrise': {
      const floors = 6 + Math.floor(rnd(3) * 5);
      const glass = e >= 4;
      for (let y = base - floors * 4 - 2; y < base; y++) for (let x = x0 + 1; x < x0 + W - 1; x++) {
        const win = (y - base) % 4 !== 0 && (x - x0) % 3 !== 0;
        p.set(x, y, win ? (glass ? (hash2(x, y, seed) < 0.5 ? LIGHT : rgb(0x6a8aa8)) : pal.win) : x >= x0 + W - 3 ? pal.wallD : pal.wall);
      }
      p.hline(x0 + 1, x0 + W - 2, base - floors * 4 - 2, pal.roofD);
      p.vline(x0 + W - 4, base - floors * 4 - 6, base - floors * 4 - 3, rgb(0x9a9a9f)); p.set(x0 + W - 4, base - floors * 4 - 7, EM(0xff3f3f));
      return { pix: crop(p, scaffold), ax: x0, ay: base - D };
    }
    case 'granary': {
      if (st === 'dwarf' || e >= 3) { block(p, x0, base, W, D - 4, 8, pal, { era: e, seed, door: true, windows: 0 }); break; }
      // round silo with a conical roof
      const cx = x0 + W / 2;
      for (let y = base - 9; y < base; y++) for (let x = x0 + 2; x < x0 + W - 2; x++) p.set(x, y, x > cx + 2 ? pal.wallD : (y % 3 === 0 ? shade(pal.wall, 0.9) : pal.wall));
      roof(p, x0 + 2, base - 9, W - 4, 6, { ...pal, shape: 'cone' });
      p.rect(x0 + (W >> 1) - 1, base - 3, 2, 3, rgb(0x3a2616));
      p.rect(x0, base - 3, 2, 3, rgb(0xd8b84a)); p.rect(x0 + W - 2, base - 2, 2, 2, rgb(0xd8b84a));
      break;
    }
    case 'warehouse': block(p, x0, base, W, D - 4, 8, { ...pal, shape: e >= 3 ? 'flat' : 'gable' }, { era: e, seed, door: true, windows: 1 }); p.rect(x0 + 1, base - 3, 3, 3, rgb(0x9a6a3a)); break;
    case 'barn': {
      const red = { ...pal, wall: rgb(0xa8402e), wallD: rgb(0x7a2e22), roof: rgb(0x5a4a3a), roofD: rgb(0x3a3028), shape: 'gable' as const };
      block(p, x0, base, W, D - 5, 7, st === 'human' || st === 'beast' ? red : pal, { era: e, seed, door: true, windows: 0 });
      p.line(x0 + (W >> 1) - 2, base - 6, x0 + (W >> 1) + 1, base - 3, rgb(0xf4f1ea));
      break;
    }
    case 'lumber':
      for (let k = 0; k < 3; k++) { p.hline(x0 + 1, x0 + W - 4, base - 2 - k * 2, rgb(0x8a5a2e)); p.set(x0 + 1, base - 2 - k * 2, rgb(0xd8b07a)); p.set(x0 + W - 4, base - 2 - k * 2, rgb(0xd8b07a)); }
      p.rect(x0 + W - 3, base - 5, 2, 2, rgb(0x6b4a2b)); p.vline(x0 + W - 2, base - 7, base - 5, rgb(0x5e3c1f)); p.set(x0 + W - 1, base - 7, rgb(0xc9cdd3));
      break;
    case 'mine': {
      // a dark shaft in a rock face, rails and a cart
      p.ellipse(x0 + W / 2, base - 5, W / 2, 6, rgb(0x7d7873));
      p.ellipse(x0 + W / 2, base - 3, 3, 3.5, rgb(0x1a1210));
      p.rect(x0 + W / 2 - 4, base - 7, 8, 1, rgb(0x6b4a2b)); p.vline(x0 + W / 2 - 4, base - 7, base - 1, rgb(0x6b4a2b)); p.vline(x0 + W / 2 + 3, base - 7, base - 1, rgb(0x6b4a2b));
      p.hline(x0, x0 + W - 1, base - 1, rgb(0x5d5d63));
      p.rect(x0 + W - 5, base - 4, 4, 2, rgb(0x5d5d63)); p.set(x0 + W - 4, base - 5, rgb(0xf2c94c)); p.set(x0 + W - 3, base - 5, rgb(0x9a948c));
      if (e >= 3) { p.vline(x0 + 2, base - 14, base - 6, rgb(0x5d5d63)); p.hline(x0 + 2, x0 + 6, base - 14, rgb(0x5d5d63)); p.set(x0 + 6, base - 13, rgb(0x5d5d63)); }
      break;
    }
    case 'smithy':
      block(p, x0, base, W, D - 5, 7, pal, { era: e, seed, door: true, windows: 1 });
      chimney(p, x0 + W - 4, base - 7 - (D - 5) - 2, true);
      p.rect(x0 + W - 4, base - 2, 3, 1, rgb(0x3a3a40)); p.set(x0 + W - 3, base - 3, rgb(0x3a3a40));
      break;
    case 'barracks':
      block(p, x0 + 4, base, W - 4, D - 4, 8, { ...pal, shape: pal.shape === 'cone' || pal.shape === 'dome' ? 'gable' : pal.shape }, { era: e, seed, door: true, windows: 2 });
      flag(p, x0 + 5, base - 8 - D, 6); flag(p, x0 + W - 4, base - 8 - D, 6);
      // a yard with a training dummy and a weapon rack
      p.vline(x0 + 1, base - 6, base - 1, rgb(0x8a5a2e)); p.hline(x0, x0 + 2, base - 5, rgb(0x8a5a2e)); p.rect(x0, base - 8, 3, 2, rgb(0xd8c9a0));
      p.vline(x0 + 3, base - 4, base - 1, rgb(0x6b4a2b)); p.set(x0 + 3, base - 5, rgb(0xc9cdd3));
      break;
    case 'stable':
      block(p, x0 + 6, base, W - 6, D - 5, 6, pal, { era: e, seed, door: true, windows: 0 });
      for (let x = x0; x < x0 + 7; x += 2) p.vline(x, base - 4, base - 1, rgb(0x6b4a2b));
      p.hline(x0, x0 + 6, base - 3, rgb(0x8a5a2e));
      p.rect(x0 + 2, base - 4, 3, 2, rgb(0x7a4f2e)); p.set(x0 + 5, base - 5, rgb(0x7a4f2e));
      break;
    case 'temple': {
      if (st === 'lizard' || st === 'goblin' || (st === 'human' && e === 1)) { ziggurat(p, x0, base, W, D + rise - 2, pal); break; }
      const stone = e >= 3 ? rgb(0xe8e4dc) : shade(pal.wall, 1.05);
      // steps, columns, pediment, and a dome behind
      p.hline(x0 - 1, x0 + W, base, shade(stone, 0.8)); p.hline(x0, x0 + W - 1, base - 1, shade(stone, 0.9));
      const ct = base - 10;
      p.rect(x0 + 1, ct, W - 2, 9, shade(stone, 0.7));
      for (let x = x0 + 1; x < x0 + W - 1; x += 2) p.vline(x, ct, base - 2, stone);
      p.rect(x0 + (W >> 1) - 1, base - 5, 2, 4, EM(0xffd27a));
      for (let y = 0; y < 4; y++) p.hline(x0 + y, x0 + W - 1 - y, ct - 1 - y, y === 0 ? shade(stone, 0.85) : stone);
      p.set(x0 + (W >> 1), ct - 3, pal.trim);
      roof(p, x0 + 2, ct - 4, W - 4, D - 6, { ...pal, roof: e >= 2 ? rgb(0xe8c050) : pal.roof, roofD: e >= 2 ? rgb(0xb8892a) : pal.roofD, shape: st === 'orc' || st === 'undead' ? 'spike' : 'dome' }, seed);
      break;
    }
    case 'library': {
      block(p, x0, base, W, D - 5, 10, { ...pal, shape: e >= 2 ? 'dome' : pal.shape }, { era: e, seed, door: true, windows: 0 });
      for (let x = x0 + 1; x < x0 + W - 1; x += 3) p.vline(x, base - 9, base - 1, shade(pal.wall, 1.15));    // columns
      p.rect(x0 + 2, base - 12, 4, 2, rgb(0x8a2a2a)); p.set(x0 + 3, base - 12, rgb(0xf0ebdc));            // the sign: a book
      break;
    }
    case 'market': {
      // stalls with striped awnings in the owner colour
      for (let k = 0; k < 3; k++) {
        const sx = x0 + k * Math.floor(W / 3);
        const sw = Math.floor(W / 3) - 1;
        for (let x = sx; x < sx + sw; x++) { p.set(x, base - 7, x % 2 ? M1(170) : rgb(0xf4f1ea)); p.set(x, base - 6, x % 2 ? M1(130) : rgb(0xd8d2c8)); }
        p.vline(sx, base - 5, base - 1, rgb(0x6b4a2b)); p.vline(sx + sw - 1, base - 5, base - 1, rgb(0x6b4a2b));
        p.hline(sx + 1, sx + sw - 2, base - 3, rgb(0x8a5a2e));
        p.set(sx + 1, base - 4, [rgb(0xe0453a), rgb(0xf2c94c), rgb(0x6fbf4a)][k]);
      }
      break;
    }
    case 'tavern':
      block(p, x0, base, W, D - 5, 9, pal, { era: e, seed, door: true, windows: 2, floors: 1 });
      p.hline(x0 + W - 1, x0 + W + 1, base - 8, rgb(0x6b4a2b)); p.rect(x0 + W, base - 7, 3, 3, rgb(0xd8a83a)); p.set(x0 + W + 1, base - 6, rgb(0x8a5a2e));   // a sign: a mug
      chimney(p, x0 + 2, base - 9 - (D - 5) - 2, true);
      p.rect(x0, base - 2, 2, 2, rgb(0x8a5a2e)); p.rect(x0 + 2, base - 2, 2, 2, rgb(0x7a4f2e)); p.set(x0 + 1, base - 3, rgb(0x6b4a2b));   // barrels
      break;
    case 'dock':
      for (let x = x0; x < x0 + W; x++) for (let y = base - D + 3; y < base; y++) p.set(x, y, (x + y) % 2 ? rgb(0x8a5a2e) : rgb(0x7a4f2e));
      for (let x = x0; x < x0 + W; x += 3) p.vline(x, base - 1, base, rgb(0x4a321d));
      p.rect(x0 + 2, base - D, 4, 4, rgb(0x6b4a2b)); p.vline(x0 + W - 3, base - D - 6, base - D + 2, rgb(0x5e3c1f));
      flag(p, x0 + W - 3, base - D - 6, 3);
      break;
    case 'wall': case 'gate': case 'tower': {
      const stone = e === 0 ? rgb(0x8a6a42) : e >= 4 ? rgb(0x9aa0a8) : st === 'undead' ? rgb(0x4a4550) : st === 'orc' ? rgb(0x6b4a2b) : rgb(0x9a948c);
      const tall = type === 'tower' ? 14 : 7;
      if (e === 0 || (st === 'orc' && e < 3)) {
        // wooden palisade
        for (let x = x0; x < x0 + W; x++) { p.vline(x, base - tall - (x % 2), base - 1, x % 2 ? rgb(0x7a5a32) : rgb(0x8a6a42)); p.set(x, base - tall - 1 - (x % 2), rgb(0x5e3c1f)); }
      } else {
        p.rect(x0, base - tall, W, tall, stone);
        p.rect(x0, base - tall - 3, W, 3, shade(stone, 1.15));
        for (let x = x0; x < x0 + W; x += 2) p.set(x, base - tall - 4, shade(stone, 1.15));
        for (let y = base - tall; y < base; y += 2) for (let x = x0 + ((y >> 1) & 1); x < x0 + W; x += 3) p.set(x, y, shade(stone, 0.85));
      }
      if (type === 'gate') { p.rect(x0 + 2, base - 5, W - 4, 5, rgb(0x3a2616)); p.hline(x0 + 2, x0 + W - 3, base - 5, rgb(0x5a5550)); }
      if (type === 'tower') { p.set(x0 + 3, base - 9, rgb(0x1a1210)); p.set(x0 + 4, base - 9, rgb(0x1a1210)); flag(p, x0 + 3, base - tall - 10, 5); }
      break;
    }
    case 'castle': {
      const stone = st === 'undead' ? rgb(0x4a4550) : st === 'orc' ? rgb(0x5a5a5a) : rgb(0xa8a298);
      const s2 = shade(stone, 0.8);
      p.rect(x0 + 2, base - 14, W - 4, 14, stone);
      for (const tx of [x0, x0 + W - 5]) { p.rect(tx, base - 20, 5, 20, s2); for (let x = tx; x < tx + 5; x += 2) p.set(x, base - 21, s2); roof(p, tx, base - 20, 5, 4, { ...pal, shape: st === 'orc' || st === 'undead' ? 'spike' : 'cone' }); }
      p.rect(x0 + (W >> 1) - 3, base - 26, 6, 12, stone); for (let x = x0 + (W >> 1) - 3; x < x0 + (W >> 1) + 3; x += 2) p.set(x, base - 27, stone);
      p.rect(x0 + (W >> 1) - 2, base - 6, 4, 6, rgb(0x2b1d12));
      for (const wx of [x0 + 5, x0 + W - 7, x0 + (W >> 1) - 1]) p.set(wx, base - 10, pal.win);
      flag(p, x0 + (W >> 1), base - 34, 6);
      break;
    }
    case 'palace': {
      const gold = { ...pal, roof: rgb(0xe8c050), roofD: rgb(0xb8892a) };
      block(p, x0 + 4, base, W - 8, D - 6, 13, { ...gold, shape: st === 'orc' || st === 'undead' ? 'spike' : 'dome' }, { era: e, seed, door: true, windows: 2, floors: 2 });
      for (const tx of [x0, x0 + W - 5]) {
        block(p, tx, base, 5, 4, 18, { ...gold, shape: 'cone' }, { era: e, seed, windows: 1, floors: 3 });
        flag(p, tx + 2, base - 18 - 4 - 9, 4);
      }
      p.rect(x0 + (W >> 1) - 1, base - 1, 2, 1, rgb(0xb8282e));   // a red carpet
      break;
    }
    case 'monument': {
      p.rect(x0 + 3, base - 4, W - 6, 4, rgb(0xb8b0a0)); p.hline(x0 + 2, x0 + W - 3, base - 4, rgb(0xd8d0c0));
      // a figure with a raised arm
      const sx = x0 + (W >> 1) - 1;
      const stone = e >= 3 ? rgb(0x6aa890) : rgb(0xd8d0c0);
      p.rect(sx, base - 12, 3, 8, stone); p.rect(sx, base - 15, 3, 3, stone); p.vline(sx + 3, base - 17, base - 11, stone);
      break;
    }
    case 'wonder': {
      const kind = Math.floor(rnd(9) * 4);
      if (kind === 0) pyramid(p, x0, base, W, rgb(0xe0c27a));
      else if (kind === 1) ziggurat(p, x0, base, W, D + rise - 2, { ...pal, wall: rgb(0xc9a06a), wallD: rgb(0x8a6a42) });
      else if (kind === 2) { // a great spire
        for (let y = 0; y < D + rise - 2; y++) { const hw = Math.max(1, (W / 2) * (1 - y / (D + rise))); for (let x = Math.floor(x0 + W / 2 - hw); x < x0 + W / 2 + hw; x++) p.set(x, base - 1 - y, x > x0 + W / 2 ? shade(pal.wall, 0.8) : pal.wall); }
        p.set(Math.floor(x0 + W / 2), base - D - rise + 1, EM(0x8fe8ff));
      } else { // a colossal statue on a plinth
        p.rect(x0 + 4, base - 6, W - 8, 6, rgb(0xb8b0a0));
        const sx = x0 + (W >> 1) - 3, c = rgb(0x5fa890);
        p.rect(sx, base - 26, 6, 20, c); p.rect(sx + 1, base - 31, 4, 5, c); p.vline(sx + 6, base - 38, base - 20, c); p.set(sx + 6, base - 39, EM(0xffd25a)); p.set(sx + 7, base - 39, EM(0xffd25a));
        p.vline(sx - 1, base - 24, base - 16, c);
      }
      break;
    }
    case 'academy': {
      block(p, x0, base, W, D - 4, 8, pal, { era: e, seed, door: true, windows: 3 });
      p.rect(x0 + W - 7, base - 26, 5, 18, shade(pal.wall, 0.95)); roof(p, x0 + W - 7, base - 26, 5, 5, { ...pal, roof: rgb(0x5a43b8), roofD: rgb(0x3b2a7a), shape: 'cone' });
      p.set(x0 + W - 5, base - 35, EM(0x8fe8ff)); p.set(x0 + W - 5, base - 20, EM(0xb06fff));
      break;
    }
    case 'hospital': block(p, x0, base, W, D - 4, 9, { ...pal, shape: e >= 3 ? 'flat' : pal.shape }, { era: e, seed, door: true, windows: 4, floors: 2 }); p.rect(x0 + 2, base - 9 - D + 6, 3, 1, rgb(0xe0453a)); p.rect(x0 + 3, base - 10 - D + 6, 1, 3, rgb(0xe0453a)); break;
    case 'university': block(p, x0, base, W, D - 4, 12, { ...pal, shape: 'dome' }, { era: e, seed, door: true, windows: 5, floors: 2 }); flag(p, x0 + 2, base - 12 - D - 2, 5); break;
    case 'factory': {
      block(p, x0, base, W, D - 6, 9, { ...pal, wall: rgb(0x9a4a3a), wallD: rgb(0x6a3028), roof: rgb(0x5a5a62), roofD: rgb(0x3a3a40), shape: 'flat' }, { era: e, seed, door: true, windows: 4 });
      for (let k = 0; k < 2; k++) { const sx = x0 + 3 + k * 8; p.rect(sx, base - 26, 3, 14, rgb(0x6a3028)); p.hline(sx, sx + 2, base - 26, rgb(0x3a3a40)); }
      // saw-tooth roof
      for (let x = x0; x < x0 + W; x++) p.set(x, base - 9 - (D - 6) - (x % 4), rgb(0x5a5a62));
      break;
    }
    case 'power': {
      ground(rgb(0x6a6a70));
      for (let k = 0; k < 2; k++) {
        const cx = x0 + 6 + k * 11;
        for (let y = 0; y < 18; y++) { const hw = 4 - Math.sin(y / 18 * Math.PI) * 1.4; for (let x = Math.floor(cx - hw); x < cx + hw; x++) p.set(x, base - 2 - y, x > cx + 1 ? rgb(0x9a9aa0) : rgb(0xc8c8cc)); }
      }
      p.rect(x0 + 2, base - 6, 6, 5, rgb(0x5a6270)); p.set(x0 + 4, base - 4, EM(0x8fe8ff));
      break;
    }
    case 'airport': {
      ground(rgb(0x5a5a62));
      p.hline(x0 + 1, x0 + W - 2, base - 6, rgb(0xf4f1ea));
      for (let x = x0 + 2; x < x0 + W - 2; x += 4) p.set(x, base - 10, rgb(0xf4f1ea));
      p.rect(x0 + W - 6, base - 22, 3, 16, rgb(0xb8bcc4)); p.rect(x0 + W - 7, base - 25, 5, 3, rgb(0x6a8aa8)); p.set(x0 + W - 5, base - 26, EM(0xff3f3f));
      // a little plane
      p.hline(x0 + 4, x0 + 12, base - 14, rgb(0xe8eef4)); p.vline(x0 + 8, base - 17, base - 11, rgb(0xd8dee4)); p.set(x0 + 12, base - 15, M1(160));
      break;
    }
    case 'launchpad': {
      ground(rgb(0x5a5a62));
      // gantry and a rocket
      p.rect(x0 + 6, base - 40, 2, 40, rgb(0xc43a2a)); for (let y = base - 40; y < base; y += 4) p.hline(x0 + 6, x0 + 10, y, rgb(0xc43a2a));
      const rx = x0 + 13;
      p.rect(rx, base - 36, 6, 34, rgb(0xf4f6f8)); p.rect(rx + 4, base - 36, 2, 34, rgb(0xc8ccd0));
      for (let y = 0; y < 6; y++) p.hline(rx + Math.floor(y / 2), rx + 5 - Math.floor(y / 2), base - 37 - y, rgb(0xf4f6f8));
      p.rect(rx - 2, base - 8, 2, 6, M1(160)); p.rect(rx + 6, base - 8, 2, 6, M1(160)); p.rect(rx + 1, base - 26, 4, 3, M1(160));
      p.set(rx + 2, base - 30, rgb(0x6a8aa8));
      break;
    }
    case 'lighthouse': {
      for (let y = 0; y < 20; y++) for (let x = x0 + 2; x < x0 + 6; x++) p.set(x, base - 1 - y, Math.floor(y / 4) % 2 ? rgb(0xc43a2a) : rgb(0xf4f1ea));
      p.rect(x0 + 1, base - 24, 6, 4, rgb(0x3a3a40)); p.rect(x0 + 2, base - 23, 4, 2, EM(0xffe07a));
      break;
    }
    case 'graveyard': {
      ground(rgb(0x4f6b3d));
      for (let k = 0; k < 6; k++) { const gx = x0 + 2 + (k % 3) * 5, gy = base - 3 - Math.floor(k / 3) * 6; p.rect(gx, gy - 3, 2, 3, rgb(0x9a948c)); p.set(gx, gy - 4, rgb(0xb8b0a0)); }
      for (let x = x0; x < x0 + W; x += 2) p.set(x, base - 1, rgb(0x3a3a40));
      break;
    }
    case 'shrine': {
      p.rect(x0 + 1, base - 3, W - 2, 3, rgb(0x9a948c));
      p.rect(x0 + 2, base - 7, W - 4, 4, pal.wall); roof(p, x0 + 1, base - 7, W - 2, 3, { ...pal, shape: st === 'elf' ? 'dome' : 'gable' });
      p.set(x0 + (W >> 1), base - 5, EM(0xffd27a));
      break;
    }
    default:
      block(p, x0, base, W, D - 4, 7, pal, { era: e, seed, door: true });
  }
  p.outline(OUT);
  // ground shadow on the right
  return { pix: crop(p, scaffold), ax: x0, ay: base - D };
}

function crop(p: Pix, scaffold: number): Pix {
  if (!scaffold) return p;
  // under construction: only the bottom part, with scaffolding poles
  const keep = Math.floor(p.h * scaffold);
  for (let y = 0; y < p.h - keep; y++) for (let x = 0; x < p.w; x++) p.d[(y * p.w + x) * 4 + 3] = 0;
  const yTop = Math.max(1, p.h - keep - 2);
  const pole = rgb(0xb88a52);
  for (let x = 2; x < p.w - 2; x += 5) p.vline(x, yTop, p.h - 2, pole);
  for (let y = yTop; y < p.h - 2; y += 4) p.hline(2, p.w - 3, y, pole);
  return p;
}

function tent(p: Pix, x0: number, base: number, W: number, H: number, pal: Pal) {
  const cx = x0 + W / 2;
  for (let y = 0; y < H; y++) {
    const hw = (W / 2) * (y + 1) / H;
    for (let x = Math.floor(cx - hw); x < Math.ceil(cx + hw); x++) p.set(x, base - H + y, x > cx ? shade(pal.roof, 0.78) : (y % 3 === 0 ? shade(pal.roof, 0.92) : pal.roof));
  }
  p.rect(Math.floor(cx) - 1, base - 3, 2, 3, rgb(0x2b1d12));
  p.set(Math.floor(cx), base - H - 1, rgb(0x5e3c1f)); p.set(Math.floor(cx) - 1, base - H - 2, rgb(0x5e3c1f));
}

function nestHut(p: Pix, x0: number, base: number, W: number, D: number, pal: Pal) {
  p.vline(x0 + 3, base - 8, base - 1, rgb(0x6b4a2b)); p.vline(x0 + W - 4, base - 8, base - 1, rgb(0x6b4a2b));
  p.ellipse(x0 + W / 2, base - 10, W / 2, 4, pal.roof);
  for (let x = x0; x < x0 + W; x += 2) p.set(x, base - 8, pal.roofD);
  p.set(x0 + W / 2, base - 11, rgb(0x1a1210));
}

function ziggurat(p: Pix, x0: number, base: number, W: number, H: number, pal: Pal) {
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const inset = s * 2, sh = Math.floor(H / steps);
    p.rect(x0 + inset, base - (s + 1) * sh, W - inset * 2, sh, s % 2 ? pal.wall : shade(pal.wall, 0.92));
    p.vline(x0 + W - inset - 1, base - (s + 1) * sh, base - s * sh - 1, pal.wallD);
  }
  p.vline(x0 + (W >> 1), base - H, base - 1, shade(pal.wall, 1.15));
  p.rect(x0 + (W >> 1) - 1, base - H - 2, 3, 2, pal.trim);
}

function pyramid(p: Pix, x0: number, base: number, W: number, c: RGBA) {
  const H = Math.floor(W * 0.75);
  for (let y = 0; y < H; y++) {
    const hw = (W / 2) * (1 - y / H);
    for (let x = Math.floor(x0 + W / 2 - hw); x < x0 + W / 2 + hw; x++) p.set(x, base - 1 - y, x > x0 + W / 2 ? shade(c, 0.75) : (y % 3 === 0 ? shade(c, 0.93) : c));
  }
  p.set(Math.floor(x0 + W / 2), base - H, rgb(0xf2c94c));
}

/** how far above its footprint each building rises (art pixels) */
const RISE: Record<string, number> = {
  hearth: 10, tent: 4, hut: 6, house: 7, manor: 10, highrise: 44, granary: 8, warehouse: 6, barn: 7, lumber: 2, mine: 6, smithy: 8,
  barracks: 8, stable: 6, temple: 12, library: 9, market: 4, tavern: 9, dock: 6, wall: 6, gate: 6, tower: 16, castle: 30, palace: 14,
  monument: 12, wonder: 34, academy: 30, hospital: 10, university: 14, factory: 20, power: 14, airport: 20, launchpad: 40, lighthouse: 20,
  graveyard: 2, shrine: 6, bridge: 0,
};

// ------------------------------------------------------------------ trees
const TREE_PAL: Record<number, [number, number, number]> = {
  1: [0x3f8a33, 0x2f6b2a, 0x6b4a2b], 2: [0x2f6b4a, 0x214f36, 0x5e3c1f], 3: [0x5fa83f, 0x3f7a2a, 0x9a7a4a], 4: [0x2d8a3a, 0x1f6b25, 0x5e3c1f],
  5: [0x7ab84f, 0x5a9a3a, 0xe8e0d0], 6: [0x6b5a45, 0x4a3a2a, 0x6b5a45], 7: [0x9fe6ff, 0x5fb0d8, 0xc8f6ff], 8: [0xc4483a, 0x8a2a22, 0xe8dcc8],
  9: [0xff8fc8, 0xf25aa0, 0xf4f1ea], 10: [0x4f9a3a, 0x2f6b2a, 0x5e3c1f], 11: [0x5f9e3f, 0x3f7a2a, 0x5f9e3f], 12: [0x8a9a3a, 0x6a7a2a, 0x6b4a2b],
  13: [0x3f6f58, 0x2a4f3f, 0x5e3c1f], 14: [0x6a9a4a, 0x4a7a3a, 0x6b4a2b], 15: [0x7fe0b0, 0x4fb08a, 0xd8f8e8], 16: [0x7a3f8a, 0x4a2a5a, 0x3a2a3a],
};
export function paintTree(kind: number, variant: number, snow: boolean): Pix {
  const [c1, c2, c3] = TREE_PAL[kind] || TREE_PAL[1];
  const L = rgb(c1), D = rgb(c2), T = rgb(c3);
  const p = new Pix(12, 16);
  const trunk = (h: number) => { p.vline(5, 15 - h, 14, T); p.vline(6, 15 - h, 14, shade(T, 0.75)); };
  const v = variant;
  switch (kind) {
    case 2: case 13: // pines
      trunk(3);
      for (let k = 0; k < 4; k++) { const y = 12 - k * 3, hw = 4 - k; for (let j = 0; j < 3; j++) p.hline(6 - hw + Math.floor(j / 2), 5 + hw - Math.floor(j / 2), y - j, j === 0 ? D : L); }
      p.set(5, 1, L);
      if (snow || kind === 13) for (let k = 0; k < 4; k++) { const y = 12 - k * 3 - 2, hw = 4 - k; p.hline(6 - hw + 1, 5 + hw - 1, y, rgb(0xf4f6f8)); }
      break;
    case 3: // palm
      p.line(5, 14, 6 + v, 5, T); p.line(6, 14, 7 + v, 5, shade(T, 0.8));
      for (const [dx, dy] of [[-4, 1], [4, 1], [-3, -1], [3, -1], [0, -2]]) p.line(6 + v, 4, 6 + v + dx, 4 + dy + 1, L);
      p.set(6 + v, 5, rgb(0x6b4a2b)); p.set(7 + v, 5, rgb(0x6b4a2b));
      break;
    case 6: case 16: // dead / blight
      trunk(9); p.line(5, 8, 2, 5, T); p.line(6, 7, 9, 3, T); p.line(5, 10, 3, 9, T);
      if (kind === 16) { p.set(2, 5, EM(0xb06fff)); p.set(9, 3, EM(0xb06fff)); }
      break;
    case 7: // crystal spire
      for (let y = 0; y < 12; y++) { const hw = Math.max(0, 2 - Math.floor(y / 5)); p.hline(5 - hw, 5 + hw, 14 - y, y % 2 ? L : D); }
      p.set(5, 2, EM(0xc8f6ff)); p.line(8, 14, 9, 9, L); p.set(9, 8, EM(0xc8f6ff));
      break;
    case 8: // giant mushroom
      p.rect(5, 8, 2, 7, rgb(0xe8dcc8));
      p.ellipse(6, 7, 5, 3, L); p.hline(2, 9, 8, D);
      p.set(4, 5, rgb(0xf4f1ea)); p.set(7, 6, rgb(0xf4f1ea)); p.set(9, 7, rgb(0xf4f1ea));
      break;
    case 9: // lollipop
      p.vline(6, 7, 14, rgb(0xf4f1ea));
      p.ellipse(6, 5, 3.5, 3.5, L); p.set(5, 4, rgb(0xf4f1ea)); p.set(7, 6, D); p.set(6, 5, rgb(0xf4f1ea));
      break;
    case 11: // cactus
      p.rect(5, 6, 2, 9, L); p.rect(3, 8, 1, 3, L); p.set(4, 10, L); p.rect(8, 7, 1, 3, D); p.set(7, 9, D);
      if (v) p.set(5, 5, rgb(0xff8fc8));
      break;
    case 12: // acacia
      trunk(7); p.line(5, 9, 3, 6, T); p.line(6, 9, 9, 6, T);
      p.hline(1, 10, 5, D); p.hline(2, 9, 4, L); p.hline(3, 8, 3, L);
      break;
    case 14: // willow
      trunk(6); p.ellipse(6, 6, 5, 4, L);
      for (let x = 2; x < 11; x += 2) p.vline(x, 7, 11 + (x % 3), D);
      break;
    case 10: // fern
      trunk(5);
      for (const [dx, dy] of [[-4, 2], [4, 2], [-3, -1], [3, -1], [0, -3]]) p.line(6, 9, 6 + dx, 9 + dy - 3, L);
      break;
    default: { // round broadleaf (oak, jungle, birch, glow)
      trunk(kind === 4 ? 6 : 5);
      const big = kind === 4 ? 1 : 0;
      p.ellipse(6, 6 - big, 4.2 + big, 4.2 + big * 0.5, L);
      p.ellipse(7, 8, 3, 2.4, D);
      p.set(4, 4, shade(L, 1.15)); p.set(5, 3, shade(L, 1.15));
      if (kind === 5) for (let y = 11; y < 15; y += 2) p.set(5, y, rgb(0x3a3a3a));
      if (kind === 15) { p.set(4, 6, EM(0xd8fff0)); p.set(8, 5, EM(0xd8fff0)); p.set(6, 8, EM(0xd8fff0)); }
      if (kind === 1 && v) { p.set(4, 7, rgb(0xd84a3a)); p.set(8, 5, rgb(0xd84a3a)); }  // apples
      if (snow) p.hline(3, 8, 2, rgb(0xf4f6f8));
    }
  }
  p.outline([20, 30, 18, 255]);
  p.hline(3, 8, 15, SHADOW);
  return p;
}

export { mix };
