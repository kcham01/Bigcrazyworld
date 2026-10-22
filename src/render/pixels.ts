// A tiny pixel canvas for painting sprites in code, plus the colour "markers" the sprite shader
// understands: marker 1 pixels are recoloured with the owner's colour (clothes, flags, roofs),
// marker 2 with a per-creature colour (skin, fur, scales), and emissive pixels glow at night.
export type RGBA = [number, number, number, number];

export class Pix {
  w: number; h: number; d: Uint8ClampedArray;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x: number, y: number, c: RGBA | null) {
    x = Math.round(x); y = Math.round(y);
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 4;
    if (c[3] < 90 && c[3] > 0) { if (this.d[o + 3] > 0) return; }   // shadows never cover paint
    this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = c[3];
  }
  get(x: number, y: number): RGBA | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const o = (y * this.w + x) * 4;
    return this.d[o + 3] ? [this.d[o], this.d[o + 1], this.d[o + 2], this.d[o + 3]] : null;
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA | null) { if (!c) return; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  hline(x0: number, x1: number, y: number, c: RGBA | null) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: RGBA | null) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA | null) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA | null, fill = true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (fill ? d <= 1 : d <= 1 && d > 0.6) this.set(x, y, c);
    }
  }
  /** draw an ASCII template with a palette at (ox, oy) */
  ascii(rows: string[], pal: Record<string, RGBA | null>, ox = 0, oy = 0, flip = false) {
    const W = Math.max(...rows.map(r => r.length));
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) continue;
      this.set(ox + (flip ? W - 1 - x : x), oy + y, c);
    }
  }
  /** a dark outline around everything painted (only where empty) */
  outline(c: RGBA, diagonal = false) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[(y * this.w + x) * 4 + 3] >= 90) continue;
      let n = false;
      for (const [dx, dy] of diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && this.d[(yy * this.w + xx) * 4 + 3] >= 90) { n = true; break; }
      }
      if (n) add.push([x, y]);
    }
    for (const [x, y] of add) { const o = (y * this.w + x) * 4; this.d[o] = c[0]; this.d[o + 1] = c[1]; this.d[o + 2] = c[2]; this.d[o + 3] = c[3]; }
  }
  /** shade: darken painted pixels on the right/bottom edge for depth */
  shadeEdges(k = 0.8) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const o = (y * this.w + x) * 4;
      if (this.d[o + 3] !== 255) continue;
      const r = x + 1 >= this.w || this.d[o + 7] === 0;
      if (r) { this.d[o] *= k; this.d[o + 1] *= k; this.d[o + 2] *= k; }
    }
  }
}

export const rgb = (hex: number, a = 255): RGBA => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, a];
export const shade = (c: RGBA, k: number): RGBA => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), c[3]];
export const mix = (a: RGBA, b: RGBA, t: number): RGBA => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3]];
/** owner colour (kingdom), brightness L where 160 = the colour itself */
export const M1 = (L = 160): RGBA => [L, L, L, 204];
/** creature colour (skin/fur), brightness L where 160 = the colour itself */
export const M2 = (L = 160): RGBA => [L, L, L, 153];
/** glows at night */
export const EM = (hex: number): RGBA => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 102];
export const SHADOW: RGBA = [0, 0, 0, 70];
export const OUT: RGBA = rgb(0x20160f);
