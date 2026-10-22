// Pixel icons for the toolbar, painted with the same tools as the sprites, so the interface and the
// world look like one thing. Returned as data URLs and cached.
import { Pix, rgb, RGBA, M1, M2 } from '../render/pixels';
import { paintPerson, paintAnimal } from '../render/creatures';
import { paintTree } from '../render/buildings';
import { BIOMES, B } from '../sim/defs';
import { SPECIES_BY_KEY } from '../sim/species';

const cache = new Map<string, string>();

const PAL: Record<string, RGBA | null> = {
  k: rgb(0x1b1410), w: rgb(0xf4f1ea), W: rgb(0xc8c2b4), y: rgb(0xf2c94c), Y: rgb(0xb8892a), r: rgb(0xe0453a), R: rgb(0x8a1e18),
  o: rgb(0xf08a2e), g: rgb(0x5fbf4a), G: rgb(0x2f7a2a), b: rgb(0x3a7be0), B: rgb(0x1d4378), c: rgb(0x8fe8ff), p: rgb(0xd86fd0), P: rgb(0x7a3f8a),
  n: rgb(0x8a5a2e), N: rgb(0x5e3c1f), m: rgb(0x9a9a9f), M: rgb(0x5d5d63), s: rgb(0xe8b796), v: rgb(0xb06fff), l: rgb(0x9fe06a), d: rgb(0x3a3a40),
};

const ART: Record<string, string[]> = {
  eye: ['............', '....kkkk....', '..kkwwwwkk..', '.kwwwbbwwwk.', 'kwwwbkkbwwwk', 'kwwwbkkbwwwk', '.kwwwbbwwwk.', '..kkwwwwkk..', '....kkkk....'],
  follow: ['....kkkk....', '...kyyyyk...', '..kyykkyyk..', '..kykwwkyk..', '..kyykkyyk..', '...kyyyyk...', '....kyyk....', '.....kk.....', '..k..kk..k..', '...k.kk.k...', '....kkkk....'],
  star: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkyyyykkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyykyyk..', '.kyyk..kyyk.', '.kkk....kkk.'],
  raise: ['.....kk.....', '....kwwk....', '...kwwwwk...', '..kkkwwkkk..', '....kwwk....', '....kwwk....', '..kkGGGGkk..', '.kGgggggggk.', 'kGggggggggGk', 'kkkkkkkkkkkk'],
  lower: ['....kwwk....', '....kwwk....', '..kkkwwkkk..', '...kwwwwk...', '....kwwk....', '.....kk.....', 'kkk......kkk', 'kGgk....kgGk', 'kGggkbbkggGk', 'kkkkkkkkkkkk'],
  river: ['..kbbk......', '..kbbbk.....', '...kbbbk....', '....kbbbk...', '...kbbbk....', '..kbbbk.....', '..kbbk......', '..kbbbk.....', '...kbbbk....', '....kbbk....'],
  road: ['....knnk....', '....knnk....', '....knnk....', '....knnk....', 'kkkkknnkkkkk', 'nnnnnnnnnnnn', 'nnnnnnnnnnnn', 'kkkkknnkkkkk', '....knnk....', '....knnk....'],
  ore: ['............', '...kkk......', '..kmmmk.....', '.kmyymmk....', '.kmmmcmk.kk.', '..kmmmk.kmmk', '...kkk.kmyyk', '.......kmmmk', '........kkk.'],
  tree: [],
  axe: ['....kkk.....', '...kmmmk....', '..kmmmmk....', '..kmmmkn....', '...kkknk....', '.....knk....', '....knk.....', '....knk.....', '...knk......', '...kk.......'],
  rain: ['....kkkk....', '..kkWWWWkk..', '.kWWwwwwWWk.', 'kWwwwwwwwwWk', '.kkkkkkkkkk.', '..b...b...b.', '.b...b...b..', '...b...b....', '..b...b...b.'],
  fire: ['.....k......', '....kok.....', '...koook....', '..kooyook.k.', '..koyyyokok.', '.koyywyyook.', '.koyywwyyok.', '.kooyyyyook.', '..koooooook.', '...kkkkkkk..'],
  bolt: ['......kkkk..', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyyyyyk..', '.....kyyk...', '....kyyk....', '...kyk......', '..kyk.......', '..kk........'],
  tornado: ['kkkkkkkkkkkk', 'kmmmmmmmmmmk', '.kkmmmmmmkk.', '...kmmmmk...', '..kmmmmmk...', '...kmmmmk...', '....kmmk....', '...kmmk.....', '....kmk.....', '.....kk.....'],
  snowflake: ['.....kk.....', '..k.kwwk.k..', '...kwwwwk...', '.kkwwkkwwkk.', 'kwwwk..kwwwk', 'kwwwk..kwwwk', '.kkwwkkwwkk.', '...kwwwwk...', '..k.kwwk.k..', '.....kk.....'],
  sun: ['.....kk.....', '..k..yy..k..', '...kkkkkk...', '..kyyyyyyk..', 'kykyyyyyykyk', 'kykyyyyyykyk', '..kyyyyyyk..', '...kkkkkk...', '..k..yy..k..', '.....kk.....'],
  meteor: ['k...........', '.k..........', '..kk........', '...kok......', '....koook...', '.....kooyk..', '.....koyyyk.', '......kyyyk.', '.......kkk..'],
  quake: ['kkkkkkkkkkkk', 'knnnnnknnnnk', 'knnnnkknnnnk', 'knnnnk.knnnk', 'kkkkk..kkkkk', 'knnnk.knnnnk', 'knnnnkknnnnk', 'knnnnnknnnnk', 'kkkkkkkkkkkk'],
  volcano: ['....k.k.....', '...kokok....', '....kyk.....', '...kkokk....', '..kMMoMMk...', '..kMMoMMMk..', '.kMMMoMMMMk.', '.kMMMMMMMMk.', 'kMMMMMMMMMMk', 'kkkkkkkkkkkk'],
  flood: ['............', '..kk....kk..', '.kbbk..kbbk.', 'kbbbbkkbbbbk', 'bbbbbbbbbbbb', 'kkkkkkkkkkkk', 'bbbbbbbbbbbb', 'bBbBbBbBbBbB', 'BBBBBBBBBBBB'],
  bomb: ['........ko..', '.......kk...', '...kkkkk....', '..kdddddk...', '.kddwdddddk.', '.kdwddddddk.', '.kddddddddk.', '.kddddddddk.', '..kddddddk..', '...kkkkkk...'],
  nuke: ['...kkkkkk...', '..kooooook..', '.koooyyooook', '.kooyyyyook.', '..kkoyyokk..', '....koyk....', '....koyk....', '...koyyok...', '..kooyyook..', '.kkkkkkkkkk.'],
  plague: ['.....kk.....', '....kllk....', '.kk.kllk.kk.', 'kllkkllkkllk', 'kllllllllllk', '.kllkkkkllk.', '..kk.kk.kk..', '....kllk....', '...kllllk...', '....kkkk....'],
  zombie: [],
  mad: ['...kkkkkk...', '..krrrrrrk..', '.krwkrrwkrk.', '.krkkrrkkrk.', '.krrrrrrrrk.', '.krkkkkkkrk.', '.krkwkwkkrk.', '..krrrrrrk..', '...kkkkkk...'],
  smite: ['.....kk.....', '....kwwk....', '...kwwwwk...', '....kwwk....', '..k.kwwk.k..', '.kwkkwwkkwk.', 'kwwwwwwwwwwk', '.kwkkwwkkwk.', '..k.kwwk.k..', '.....kk.....'],
  bless: ['.....kk.....', '.k..kyyk..k.', '..k.kyyk.k..', '....kyyk....', 'kkkkyyyykkkk', 'kyyyyyyyyyyk', 'kkkkyyyykkkk', '....kyyk....', '..k.kyyk.k..', '.k..kkkk..k.'],
  curse: ['...kkkkkk...', '..kPPPPPPk..', '.kPPkPPkPPk.', '.kPPkPPkPPk.', '.kPPPPPPPPk.', '..kPPkkPPk..', '...kPPPPk...', '..kPkPkPkPk.', '..kk.k.k.kk.'],
  heal: ['....kkkk....', '....kggk....', '....kggk....', 'kkkkkggkkkkk', 'kggggggggggk', 'kggggggggggk', 'kkkkkggkkkkk', '....kggk....', '....kggk....', '....kkkk....'],
  spark: ['.....k......', '....kck.....', '..k.kck.k...', '...kcwck....', 'kkkcwwwckkk.', '...kcwck....', '..k.kck.k...', '....kck.....', '.....k......'],
  hero: ['......kk....', '.....kmmk...', '....kmmk....', '...kmmk.....', '..kmmk......', 'kkyyk.......', '.kyk........', 'kkk.........', 'knk.........', 'kk..........'],
  ankh: ['...kkkk.....', '..kyyyyk....', '..kyk.kyk...', '..kyk.kyk...', '...kyyyk....', 'kkkkyykkkk..', 'kyyyyyyyyk..', 'kkkkyykkkk..', '...kyyk.....', '...kyyk.....', '...kkkk.....'],
  heart: ['.kkk..kkk...', 'krrrkkrrrk..', 'krrwrrrrrk..', 'krrrrrrrrk..', '.krrrrrrk...', '..krrrrk....', '...krrk.....', '....kk......'],
  idea: ['...kkkkk....', '..kyyyyyk...', '.kyywwyyyk..', '.kyywyyyyk..', '.kyyyyyyyk..', '..kyyyyyk...', '...kmmmk....', '...kMMMk....', '....kkk.....'],
  wheat: ['.k..k..k....', 'kyk.kyk.kyk.', 'kyk.kyk.kyk.', '.kyk.kyk.kyk', '..kykykyk...', '...kgygk....', '....kgk.....', '....kgk.....', '...kgggk....', '...kkkkk....'],
  coin: ['...kkkkk....', '..kyyyyyk...', '.kyyYYYyyk..', '.kyYyyyYyk..', '.kyyYyyyyk..', '.kyyyYYyyk..', '.kyYyyyYyk..', '.kyyYYYyyk..', '..kyyyyyk...', '...kkkkk....'],
  dove: ['......kkk...', '.....kwwwk..', 'kk..kwwwkyk.', 'kwkkwwwwwk..', '.kwwwwwwk...', '..kwwwwwk...', '...kwwwk....', '....kgk.....', '...kgk......'],
  swords: ['k.........k.', 'kmk.....kmk.', '.kmk...kmk..', '..kmk.kmk...', '...kmkmk....', '....kmk.....', '...kmkmk....', '.knkk.kknk..', 'knk.....knk.', 'kk.......kk.'],
  hands: ['............', '.kk....kk...', 'kssk..kssk..', 'kssskksssk..', '.kssssssk...', '..kssssk....', '..kbbbbk....', '..kbbbbk....', '..kkkkkk....'],
  fist: ['....kkkk....', '...kssssk...', '..ksskskk...', '..ksssskk...', '..ksssssk...', '...kssssk...', '...krrrrk...', '...krrrrk...', '...kkkkkk...'],
  crown: ['............', 'k...kk...k..', 'kk.kyyk.kk..', 'kykkyykkyk..', 'kyyyyyyyyk..', 'kyryybyyrk..', 'kyyyyyyyyk..', 'kkkkkkkkkk..'],
  temple: ['.....kk.....', '....kyyk....', '...kkkkkk...', '..kwwwwwwk..', '.kkkkkkkkkk.', '.kwkwkkwkwk.', '.kwkwkkwkwk.', '.kwkwkkwkwk.', 'kkkkkkkkkkkk', 'kWWWWWWWWWWk'],
  book: ['.kkkkkkkkk..', 'krrrrrrrrwk.', 'krrrrrrrrwk.', 'krryyyyrrwk.', 'krrrrrrrrwk.', 'krrrrrrrrwk.', 'krrrrrrrrwk.', 'kkkkkkkkkwk.', '.kwwwwwwwwk.', '..kkkkkkkk..'],
  shield: ['.kkkkkkkkk..', 'kbbbbbbbbbk.', 'kbbbyybbbbk.', 'kbbyyyybbbk.', 'kbbbyybbbbk.', '.kbbbbbbbk..', '..kbbbbbk...', '...kbbbk....', '....kkk.....'],
  tribe: [],
};

function toUrl(p: Pix, scale = 3): string {
  const c = document.createElement('canvas');
  c.width = p.w * scale; c.height = p.h * scale;
  const g = c.getContext('2d')!;
  const img = new ImageData(new Uint8ClampedArray(p.d), p.w, p.h);
  const tmp = document.createElement('canvas'); tmp.width = p.w; tmp.height = p.h;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  g.drawImage(tmp, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** resolve marker pixels to real colours so icons show without the sprite shader */
function resolve(p: Pix, t1: number, t2: number) {
  for (let i = 0; i < p.d.length; i += 4) {
    const a = p.d[i + 3];
    if (a === 204 || a === 153) {
      const t = a === 204 ? t1 : t2, k = p.d[i] / 160;
      p.d[i] = Math.min(255, ((t >> 16) & 255) * k); p.d[i + 1] = Math.min(255, ((t >> 8) & 255) * k); p.d[i + 2] = Math.min(255, (t & 255) * k); p.d[i + 3] = 255;
    } else if (a === 102) p.d[i + 3] = 255;
  }
}

function biomeSwatch(b: B, deco?: (p: Pix) => void): Pix {
  const p = new Pix(12, 12);
  const bd = BIOMES[b];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const c = ((x * 7 + y * 13) % 5) < 2 ? bd.c2 : bd.c1;
    const edge = x === 0 || y === 0 || x === 11 || y === 11;
    p.set(x, y, edge ? rgb(0x1b1410) : rgb(c));
  }
  if (deco) deco(p);
  return p;
}

export function icon(name: string): string {
  const hit = cache.get(name);
  if (hit) return hit;
  let p: Pix;
  if (name.startsWith('sp:')) {
    const key = name.slice(3);
    const d = SPECIES_BY_KEY[key];
    if (d.sapient) { p = paintPerson({ build: d.build || 'human', female: false, frame: 0, gear: 'civ', tier: 0, hair: 1 }); resolve(p, 0x3a7be0, d.key === 'undead' ? 0xc8c4b0 : d.color); }
    else { p = paintAnimal(key, 0); resolve(p, 0x3a7be0, d.color); }
  } else if (name === 'tribe') {
    p = new Pix(20, 18);
    for (const [ox, f] of [[0, false], [6, true], [11, false]] as [number, boolean][]) {
      const q = paintPerson({ build: 'human', female: f, frame: 0, gear: 'civ', tier: 0, hair: ox % 5 }); resolve(q, 0x9a8a6a, 0xe8b796);
      for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) { const c = q.get(x, y); if (c && c[3] > 90) p.set(x + ox - 3, y, c); }
    }
  } else if (name === 'tree') { p = paintTree(1, 1, false); resolve(p, 0, 0); }
  else if (name === 'zombie') { p = paintAnimal('zombie', 0); resolve(p, 0, 0); }
  else {
    const sw: Record<string, B> = { sea: B.Ocean, grass: B.Grass, forest: B.Forest, jungle: B.Jungle, desert: B.Desert, snow: B.Snow, swamp: B.Swamp, mountain: B.Mountain, enchanted: B.Enchanted, corrupt: B.Corrupted, candy: B.Candy, crystal: B.Crystal, mushroom: B.Mushroom, prehistoric: B.Prehistoric, waste: B.Wasteland };
    if (sw[name] !== undefined) {
      const b = sw[name];
      p = biomeSwatch(b, (q) => {
        const tr = BIOMES[b].trees[0];
        if (tr) { const t = paintTree(tr, 0, b === B.Snow); resolve(t, 0, 0); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const c = t.get(x + 1, y + 5); if (c && c[3] > 90) q.set(x + 1, y + 1, c); } }
        if (b === B.Mountain) { for (let y = 0; y < 6; y++) q.hline(6 - y, 5 + y, 3 + y, rgb(0x9a948c)); q.hline(5, 6, 3, rgb(0xf4f6f8)); }
        if (b === B.Ocean) { q.hline(3, 6, 4, rgb(0xd8ecf8)); q.hline(6, 9, 7, rgb(0xd8ecf8)); }
        if (b === B.Desert) { q.hline(2, 9, 8, rgb(0xc9a85a)); }
      });
    } else {
      const art = ART[name] || ART.eye;
      const W = Math.max(...art.map(r => r.length));
      p = new Pix(W, Math.max(art.length, 10));
      p.ascii(art, PAL, 0, Math.floor((p.h - art.length) / 2));
    }
  }
  const url = toUrl(p);
  cache.set(name, url);
  return url;
}

export { M1, M2 };
