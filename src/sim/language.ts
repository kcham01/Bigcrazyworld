// Procedural languages. Each culture speaks one; when a culture splits, its language splits too and
// drifts by sound changes, so daughter peoples' names still look related to their ancestors'.
import { Rng, hash2 } from './rng';

export type Flavor = 'human' | 'elf' | 'dwarf' | 'orc' | 'goblin' | 'lizard' | 'avian' | 'undead' | 'beast';

interface Phon { cons: string[]; vowels: string[]; onsets: string[]; codas: string[]; patterns: string[]; ends: string[]; placeEnds: string[]; femEnds: string[]; }

const FLAVORS: Record<Flavor, Phon> = {
  human: { cons: ['b', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w'], vowels: ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'ea', 'ai'], onsets: ['br', 'st', 'tr', 'gr', 'th', 'dr', 'cl', 'sh'], codas: ['n', 'r', 'l', 's', 'nd', 'rd', 'th', 'm', 'ck'], patterns: ['CV', 'CVC', 'CV', 'VC', 'CVC'], ends: ['an', 'or', 'ric', 'mund', 'win', 'bert', 'ald', 'en'], placeEnds: ['ford', 'ton', 'burg', 'wick', 'dale', 'mouth', 'ham', 'stead', 'bury', 'field', 'mere'], femEnds: ['a', 'ia', 'wyn', 'eth', 'ella'] },
  elf: { cons: ['l', 'n', 'r', 's', 'th', 'v', 'f', 'm', 'd', 'g'], vowels: ['a', 'e', 'i', 'ae', 'ie', 'ea', 'ia', 'o', 'y'], onsets: ['gl', 'el', 'fl', 'th', 'sil', 'cael'], codas: ['l', 'n', 'r', 's', 'th', 'nd', 'ss'], patterns: ['CV', 'CVC', 'V', 'CVV', 'CV'], ends: ['iel', 'ion', 'las', 'ndil', 'rion', 'thas', 'or'], placeEnds: ['ost', 'lond', 'dor', 'thil', 'aras', 'lorien', 'vale', 'nelle', 'quessir'], femEnds: ['wen', 'iel', 'lith', 'riel', 'ae'] },
  dwarf: { cons: ['b', 'd', 'g', 'k', 'r', 'z', 'th', 'm', 'n', 'gr', 'kh', 'dr'], vowels: ['a', 'u', 'o', 'i', 'ai', 'au', 'e'], onsets: ['br', 'gr', 'dr', 'thr', 'kh', 'bh'], codas: ['k', 'r', 'n', 'm', 'rk', 'nd', 'rn', 'rim', 'g'], patterns: ['CVC', 'CVC', 'CV', 'CVCC'], ends: ['in', 'ur', 'rim', 'dain', 'grim', 'rak', 'bur', 'ok'], placeEnds: ['dum', 'heim', 'garak', 'zad', 'khaz', 'forge', 'hold', 'deep', 'barad'], femEnds: ['a', 'ris', 'dis', 'ga'] },
  orc: { cons: ['g', 'k', 'r', 'z', 'sh', 'gh', 'b', 'd', 'm', 'n', 'kr', 'gr', 'zg'], vowels: ['u', 'a', 'o', 'u', 'a', 'au', 'ar'], onsets: ['gr', 'kr', 'sk', 'zh', 'gh', 'br', 'dr'], codas: ['k', 'g', 'z', 'sh', 'rg', 'gg', 'zz', 'rk', 'm'], patterns: ['CVC', 'CVC', 'CVCC', 'CV'], ends: ['ash', 'ug', 'ok', 'grom', 'gul', 'zug', 'nak'], placeEnds: ['gash', 'krag', 'uzg', 'grok', 'mor', 'skull', 'thak', 'burz'], femEnds: ['a', 'ga', 'sha', 'ka'] },
  goblin: { cons: ['z', 'k', 'n', 'b', 'p', 'g', 'x', 'sn', 'sk', 'r', 't'], vowels: ['i', 'e', 'a', 'o', 'ee', 'ix'], onsets: ['sn', 'sk', 'kr', 'gr', 'zz', 'bl'], codas: ['k', 'x', 'z', 'b', 'p', 'zz', 'nk', 'g'], patterns: ['CVC', 'CV', 'CVCC', 'CVC'], ends: ['ix', 'nik', 'zob', 'git', 'bix', 'nab', 'ok'], placeEnds: ['snik', 'warren', 'hole', 'rot', 'pit', 'mudge', 'gob', 'nook'], femEnds: ['ie', 'sa', 'ix', 'ka'] },
  lizard: { cons: ['s', 'ss', 'th', 'x', 'k', 'sh', 'z', 'h', 'q', 't'], vowels: ['i', 'a', 'e', 'aa', 'ii', 'ia'], onsets: ['ss', 'th', 'sk', 'x', 'kh', 'zh'], codas: ['ss', 's', 'x', 'k', 'th', 'sh', 'q'], patterns: ['CVC', 'CV', 'VC', 'CVC', 'CVV'], ends: ['issa', 'ith', 'ax', 'ssk', 'esh', 'iq'], placeEnds: ['sssa', 'thak', 'ixa', 'nesh', 'kaas', 'quith', 'ssora'], femEnds: ['issa', 'aa', 'ia', 'esh'] },
  avian: { cons: ['k', 'r', 'w', 't', 'q', 'p', 'l', 'h', 'tch', 'kr'], vowels: ['i', 'e', 'ee', 'a', 'ia', 'ai', 'o'], onsets: ['kr', 'tr', 'wh', 'pr', 'tch', 'kl'], codas: ['k', 'r', 't', 'w', 'kk', 'tt', 'rr'], patterns: ['CV', 'CVC', 'CVV', 'CV'], ends: ['kree', 'wit', 'rri', 'ka', 'tee', 'ew'], placeEnds: ['aerie', 'roost', 'peak', 'krii', 'nest', 'wing', 'cliff'], femEnds: ['ee', 'ia', 'ki', 'wi'] },
  undead: { cons: ['m', 'n', 'v', 'th', 'r', 'd', 'g', 'z', 'l', 'sk'], vowels: ['o', 'u', 'a', 'oo', 'au', 'y'], onsets: ['dr', 'gr', 'mo', 'sk', 'vr', 'th'], codas: ['r', 'th', 'n', 'm', 'rk', 'l', 'ghast'], patterns: ['CVC', 'CV', 'CVCC'], ends: ['mor', 'nul', 'goth', 'rak', 'zul', 'dred'], placeEnds: ['grave', 'tomb', 'mor', 'nekros', 'barrow', 'crypt', 'gloom'], femEnds: ['a', 'eth', 'ys'] },
  beast: { cons: ['g', 'r', 'h', 'w', 'f', 'k', 'n', 'm', 'b'], vowels: ['a', 'o', 'u', 'aa', 'oo', 'au'], onsets: ['gr', 'hr', 'wr', 'br'], codas: ['r', 'f', 'k', 'n', 'rr', 'wl', 'ff'], patterns: ['CVC', 'CV', 'CVCC'], ends: ['ar', 'ok', 'uf', 'aw', 'rro', 'un'], placeEnds: ['den', 'lair', 'howl', 'fang', 'paw', 'rock', 'run'], femEnds: ['a', 'aa', 'ri'] },
};

/** consonant and vowel shifts a daughter language may pick up */
const SHIFTS: [RegExp, string][] = [
  [/k/g, 'ch'], [/t/g, 'd'], [/s/g, 'sh'], [/p/g, 'f'], [/b/g, 'v'], [/d/g, 'th'], [/g/g, 'gh'], [/a/g, 'e'], [/o/g, 'u'],
  [/u/g, 'ou'], [/e/g, 'ie'], [/i/g, 'y'], [/r/g, 'rr'], [/l/g, 'll'], [/th/g, 't'], [/sh/g, 's'], [/ch/g, 'k'], [/v/g, 'w'], [/n$/, 'nd'], [/a$/, 'ah'],
];

export interface Language {
  id: number; name: string; flavor: Flavor; seed: number; parent: number; shifts: number[]; born: number; alive: boolean;
}

export class Languages {
  list: Language[] = [];
  create(flavor: Flavor, seed: number, born: number, parent?: Language, rng?: Rng): Language {
    const shifts = parent ? [...parent.shifts] : [];
    if (parent && rng) { const k = rng.irange(1, 3); for (let i = 0; i < k; i++) shifts.push(rng.int(SHIFTS.length)); }
    const lang: Language = { id: this.list.length, name: '', flavor, seed: parent ? parent.seed : seed, parent: parent ? parent.id : -1, shifts, born, alive: true };
    this.list.push(lang);
    lang.name = cap(this.root(lang, 'langname', 2)) + (flavor === 'elf' ? 'arin' : flavor === 'dwarf' ? 'ish' : flavor === 'orc' ? 'uk' : 'ic');
    return lang;
  }

  private phon(l: Language) { return FLAVORS[l.flavor]; }

  /** a root word for key, the same every time for this language */
  root(l: Language, key: string, syllables = 0): string {
    const P = this.phon(l);
    let h = l.seed >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761) >>> 0;
    const r = new Rng(h);
    const n = syllables || r.weighted([1, 2, 3], [3, 6, 2]);
    let w = '';
    for (let s = 0; s < n; s++) {
      const pat = P.patterns[r.int(P.patterns.length)];
      for (const ch of pat) {
        if (ch === 'C') w += (s === 0 && r.chance(0.25) ? P.onsets[r.int(P.onsets.length)] : P.cons[r.int(P.cons.length)]);
        else if (ch === 'V') w += P.vowels[r.int(P.vowels.length)];
      }
      if (s === n - 1 && r.chance(0.35)) w += P.codas[r.int(P.codas.length)];
    }
    return this.drift(l, clean(w));
  }

  private drift(l: Language, w: string): string {
    for (const s of l.shifts) { const [re, to] = SHIFTS[s]; w = w.replace(re, to); }
    return clean(w);
  }

  person(l: Language, seed: number, female: boolean): string {
    const P = this.phon(l);
    let w = this.root(l, 'p' + seed, hash2(seed, 1) < 0.5 ? 1 : 2);
    if (hash2(seed, 2) < 0.55) {
      const ends = female ? P.femEnds : P.ends;
      w = w.replace(/[aeiouy]+$/, '') + this.drift(l, ends[Math.floor(hash2(seed, 3) * ends.length)]);
    } else if (female && !/[aeiy]$/.test(w)) w += this.drift(l, P.femEnds[Math.floor(hash2(seed, 4) * P.femEnds.length)]);
    return cap(clean(w));
  }
  family(l: Language, seed: number): string { return cap(this.root(l, 'f' + seed, 2)); }
  place(l: Language, seed: number): string {
    const P = this.phon(l);
    let w = this.root(l, 'c' + seed, hash2(seed, 5) < 0.6 ? 1 : 2);
    if (hash2(seed, 6) < 0.7) w = w.replace(/[aeiouy]+$/, hash2(seed, 9) < 0.5 ? '' : 'a') + this.drift(l, P.placeEnds[Math.floor(hash2(seed, 7) * P.placeEnds.length)]);
    return cap(clean(w));
  }
  word(l: Language, key: string, syl = 0): string { return cap(this.root(l, key, syl)); }
}

function clean(w: string): string {
  return w.replace(/(.)\1\1+/g, '$1$1').replace(/([^aeiouy])([^aeiouy])([^aeiouy])([^aeiouy])/g, '$1$2$3').replace(/^([^aeiouy]{3})/, (m) => m.slice(0, 2));
}
export function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Latin-ish scientific names for subspecies */
const EPITHETS = ['minor', 'major', 'borealis', 'australis', 'montanus', 'silvestris', 'palustris', 'deserti', 'glacialis', 'aureus', 'niger', 'albus', 'ferox', 'velox', 'gigas', 'sapiens', 'magnus', 'insularis', 'occidentalis', 'orientalis', 'arcanus', 'umbrus', 'ignis', 'marinus', 'nanus', 'robustus', 'gracilis', 'sylvanus'];
export function epithet(seed: number): string { return EPITHETS[Math.floor(hash2(seed, 11) * EPITHETS.length)]; }
