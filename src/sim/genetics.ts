// Genomes: 16 genes per creature, 0..255 each (128 = the species' normal). Children mix their parents'
// genes and mutate a little; isolated groups drift apart until they become a new subspecies.
import { Rng } from './rng';

export const G = 16;
export const enum Gene { Size, Speed, Strength, Tough, Intel, Fertility, Lifespan, Aggression, Social, Hue, Cold, Heat, Magic, Diet, Piety, Swim }
export const GENE_NAMES = ['Size', 'Speed', 'Strength', 'Toughness', 'Intelligence', 'Fertility', 'Lifespan', 'Aggression', 'Sociability', 'Colour', 'Cold tolerance', 'Heat tolerance', 'Magic', 'Diet (meat)', 'Piety', 'Swimming'];

/** gene value → multiplier around 1 (0 → lo, 128 → 1, 255 → hi) */
export function gmul(v: number, lo = 0.6, hi = 1.5): number {
  return v < 128 ? lo + (1 - lo) * (v / 128) : 1 + (hi - 1) * ((v - 128) / 127);
}

export function inherit(rng: Rng, a: Uint8Array, ao: number, b: Uint8Array, bo: number, out: Uint8Array, oo: number, mutation: number) {
  for (let g = 0; g < G; g++) {
    // blend with a random lean toward either parent, then mutate
    const t = rng.f();
    let v = a[ao + g] * t + b[bo + g] * (1 - t);
    if (rng.f() < mutation) v += rng.gauss() * 14;
    out[oo + g] = Math.max(0, Math.min(255, Math.round(v)));
  }
}

export function distance(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number): number {
  let s = 0;
  for (let g = 0; g < G; g++) { if (g === Gene.Hue) continue; const d = a[ao + g] - b[bo + g]; s += d * d; }
  return Math.sqrt(s / (G - 1));
}
