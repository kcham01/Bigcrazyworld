// The map: one entry per tile in flat typed arrays (fast, compact, easy to save).
import { B, BIOMES, SEA } from './defs';

export const CHUNK = 32;

export class World {
  readonly w: number; readonly h: number; readonly n: number;
  height: Float32Array;   // 0..1, SEA = 0.5
  biome: Uint8Array;
  temp: Int8Array;        // base temperature, roughly °C
  moist: Uint8Array;      // 0..255
  veg: Uint8Array;        // forage / grass, 0..255
  tree: Uint8Array;       // Tree kind
  ore: Uint8Array;        // Ore kind
  oreAmt: Uint8Array;
  river: Uint8Array;      // 0 none, else river size 1..4
  owner: Int16Array;      // city id + 1 (0 = nobody)
  bld: Int32Array;        // building id + 1
  road: Uint8Array;       // 0 none, 1 path, 2 road, 3 paved, 4 highway
  traffic: Uint16Array;
  field: Uint8Array;      // crop growth (0 = not a field)
  fire: Uint8Array;       // burning intensity
  deco: Uint8Array;       // Deco
  region: Int32Array;     // >0 land region, <0 water body, 0 unassigned
  regionSize: Map<number, number> = new Map();
  /** chunks needing a redraw (terrain) and (borders/overlay) */
  dirty: Uint8Array; dirtyOverlay: Uint8Array;
  readonly cw: number; readonly ch: number;
  regionsStale = true;
  changeCount = 0;

  constructor(w: number, h: number) {
    this.w = w; this.h = h; this.n = w * h;
    const n = this.n;
    this.height = new Float32Array(n); this.biome = new Uint8Array(n); this.temp = new Int8Array(n);
    this.moist = new Uint8Array(n); this.veg = new Uint8Array(n); this.tree = new Uint8Array(n);
    this.ore = new Uint8Array(n); this.oreAmt = new Uint8Array(n); this.river = new Uint8Array(n);
    this.owner = new Int16Array(n); this.bld = new Int32Array(n); this.road = new Uint8Array(n);
    this.traffic = new Uint16Array(n); this.field = new Uint8Array(n); this.fire = new Uint8Array(n);
    this.deco = new Uint8Array(n); this.region = new Int32Array(n);
    this.cw = Math.ceil(w / CHUNK); this.ch = Math.ceil(h / CHUNK);
    this.dirty = new Uint8Array(this.cw * this.ch).fill(1);
    this.dirtyOverlay = new Uint8Array(this.cw * this.ch).fill(1);
  }

  idx(x: number, y: number) { return y * this.w + x; }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  xOf(i: number) { return i % this.w; }
  yOf(i: number) { return (i / this.w) | 0; }
  tileAt(x: number, y: number) { return this.idx(Math.max(0, Math.min(this.w - 1, Math.floor(x))), Math.max(0, Math.min(this.h - 1, Math.floor(y)))); }

  isWater(i: number) { return BIOMES[this.biome[i]].water === true; }
  isDeep(i: number) { return this.biome[i] === B.DeepOcean; }
  isLava(i: number) { return this.biome[i] === B.Lava; }
  /** land that people can walk on (rivers are fordable, bridges count as land) */
  walkable(i: number) {
    const b = this.biome[i];
    if (b === B.Lava) return false;
    if (BIOMES[b].water) return this.road[i] >= 2 && this.bld[i] !== 0; // a bridge
    return true;
  }
  /** movement cost for walkers, 1 = open grass */
  moveCost(i: number): number {
    const b = this.biome[i];
    let c = BIOMES[b].move;
    if (BIOMES[b].water) return this.walkable(i) ? 0.6 : 99;
    if (this.river[i]) c = this.road[i] >= 2 ? 0.6 : 3.5;   // ford, or a bridge
    const r = this.road[i];
    if (r) c = Math.min(c, r === 1 ? 0.8 : r === 2 ? 0.6 : r === 3 ? 0.5 : 0.4);
    if (this.fire[i] > 0) c += 4;
    return c;
  }

  markDirty(i: number) {
    const c = ((this.yOf(i) / CHUNK) | 0) * this.cw + ((this.xOf(i) / CHUNK) | 0);
    this.dirty[c] = 1; this.changeCount++;
  }
  markOverlay(i: number) {
    const c = ((this.yOf(i) / CHUNK) | 0) * this.cw + ((this.xOf(i) / CHUNK) | 0);
    this.dirtyOverlay[c] = 1;
  }
  markAll() { this.dirty.fill(1); this.dirtyOverlay.fill(1); }

  /** biome from height + climate (used by world generation and when the land is reshaped) */
  biomeFor(i: number): B {
    const h = this.height[i], t = this.temp[i], m = this.moist[i];
    if (h < SEA) {
      if (t < -8 && h > SEA - 0.06) return B.Ice;
      return h < 0.40 ? B.DeepOcean : B.Ocean;
    }
    if (h > 0.84) return B.Peak;
    if (h > 0.76) return t < -5 ? B.Peak : B.Mountain;
    if (h < SEA + 0.007 && t > -4) return B.Beach;
    if (t < -12) return B.Snow;
    if (t < -3) return m > 110 ? B.Taiga : B.Tundra;
    if (h > 0.68) return t < 4 ? B.Taiga : B.Hills;
    if (t > 22) {
      if (m < 60) return h > 0.62 ? B.Badlands : B.Desert;
      if (m < 130) return B.Savanna;
      return B.Jungle;
    }
    if (t > 14) {
      if (m < 45) return B.Desert;
      if (m < 95) return B.Savanna;
      if (m > 200 && h < SEA + 0.05) return B.Swamp;
      return m > 150 ? B.Forest : B.Grass;
    }
    if (m < 50) return B.Grass;
    if (m > 210 && h < SEA + 0.04) return B.Swamp;
    return m > 140 ? B.Forest : B.Grass;
  }

  /** label connected land (positive ids) and water bodies (negative ids) */
  computeRegions() {
    const { w, h, n, region } = this;
    region.fill(0);
    this.regionSize.clear();
    const stack = new Int32Array(n);
    let nextLand = 1, nextWater = -1;
    for (let s = 0; s < n; s++) {
      if (region[s] !== 0) continue;
      const land = this.walkable(s);
      const water = !land && this.isWater(s);
      if (!land && !water) { region[s] = 0; continue; }
      const id = land ? nextLand++ : nextWater--;
      let sp = 0, size = 0;
      stack[sp++] = s; region[s] = id;
      while (sp > 0) {
        const i = stack[--sp]; size++;
        const x = i % w, y = (i / w) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x, ny = d === 2 ? y + 1 : d === 3 ? y - 1 : y;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (region[j] !== 0) continue;
          const ok = land ? this.walkable(j) : (!this.walkable(j) && this.isWater(j));
          if (ok) { region[j] = id; stack[sp++] = j; }
        }
      }
      this.regionSize.set(id, size);
    }
    this.regionsStale = false;
  }
}
