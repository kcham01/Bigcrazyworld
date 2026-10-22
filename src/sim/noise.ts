// 2D simplex noise with a seeded permutation, plus fractal helpers for terrain and climate.
import { Rng } from './rng';

const G2 = (3 - Math.sqrt(3)) / 6, F2 = 0.5 * (Math.sqrt(3) - 1);
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

export class Noise {
  private perm = new Uint8Array(512);
  constructor(seed: number | string) {
    const r = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = r.int(i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** about -1..1 */
  n2(xin: number, yin: number): number {
    const perm = this.perm;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = (perm[ii + perm[jj]] & 7) * 2; t0 *= t0; n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2; t1 *= t1; n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2; t2 *= t2; n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * n;
  }
  /** fractal brownian motion, about -1..1 */
  fbm(x: number, y: number, oct = 5, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n2(x * f, y * f); norm += a; a *= gain; f *= lac; }
    return s / norm;
  }
  /** ridged multifractal, 0..1 (mountain chains) */
  ridged(x: number, y: number, oct = 5): number {
    let a = 0.5, f = 1, s = 0, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(this.n2(x * f, y * f)); v *= v; v *= w; w = Math.min(1, Math.max(0, v * 2));
      s += v * a; norm += a; a *= 0.5; f *= 2.05;
    }
    return s / norm;
  }
}
