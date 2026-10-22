// Seeded random numbers (sfc32): the whole simulation is reproducible from a seed, and its state saves with the world.
export class Rng {
  a: number; b: number; c: number; d: number;
  constructor(seed: number | string = 1) {
    let h = 1779033703 ^ String(seed).length;
    const s = String(seed);
    for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    const next = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
  }
  u32(): number {
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0;
    const r = (t + d) | 0; c = (c + r) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return r >>> 0;
  }
  /** [0, 1) */
  f(): number { return this.u32() / 4294967296; }
  /** integer in [0, n) */
  int(n: number): number { return Math.floor(this.f() * n); }
  /** float in [a, b) */
  range(a: number, b: number): number { return a + (b - a) * this.f(); }
  irange(a: number, b: number): number { return a + this.int(b - a + 1); }
  chance(p: number): boolean { return this.f() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  /** weighted pick: weights parallel to items */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let sum = 0; for (const w of weights) sum += Math.max(0, w);
    let r = this.f() * sum;
    for (let i = 0; i < items.length; i++) { r -= Math.max(0, weights[i]); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  gauss(): number { let u = 0, v = 0; while (u === 0) u = this.f(); while (v === 0) v = this.f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  shuffle<T>(arr: T[]): T[] { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  state(): number[] { return [this.a, this.b, this.c, this.d]; }
  setState(s: number[]) { [this.a, this.b, this.c, this.d] = s; }
}

/** Stateless hash of integers to [0,1): for per-tile and per-unit variety that must not depend on call order. */
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function hash1(x: number, s = 0): number { return hash2(x, 0x9e3779b9 & x, s); }
