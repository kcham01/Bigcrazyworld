// Procedural worlds: continents, mountain chains, climate, rivers that really flow downhill to the sea,
// lakes, biomes (including magical ones), forests and ore veins.
import { Noise } from './noise';
import { Rng } from './rng';
import { World } from './world';
import { B, BIOMES, Ore, SEA, Tree } from './defs';

export type Shape = 'continents' | 'pangaea' | 'archipelago' | 'islands' | 'lakes' | 'random';
export type Climate = 'varied' | 'temperate' | 'hot' | 'cold';

export interface GenOptions {
  w: number; h: number; seed: string | number;
  shape: Shape; land: number;        // fraction of land, 0.15..0.85
  climate: Climate; mountains: number; // 0..1
  magic: number;                      // 0..1 amount of magical biomes
  rivers: number;                     // 0..1
}

export const DEFAULT_GEN: GenOptions = { w: 256, h: 256, seed: 1, shape: 'continents', land: 0.42, climate: 'varied', mountains: 0.5, magic: 0.35, rivers: 0.6 };

export function generateWorld(opt: GenOptions): World {
  const W = opt.w, H = opt.h, N = W * H;
  const world = new World(W, H);
  const rng = new Rng('gen:' + opt.seed);
  const nBase = new Noise(rng.u32()), nDet = new Noise(rng.u32()), nRidge = new Noise(rng.u32()), nWarp = new Noise(rng.u32());
  const nTemp = new Noise(rng.u32()), nMoist = new Noise(rng.u32()), nMagic = new Noise(rng.u32()), nOre = new Noise(rng.u32());
  const shape: Shape = opt.shape === 'random' ? rng.pick(['continents', 'pangaea', 'archipelago', 'islands', 'lakes'] as Shape[]) : opt.shape;
  const S = 1 / Math.min(W, H);   // noise frequencies scale with map size so every size looks alike

  // ---- continent mask: blobs of land
  type Blob = { x: number; y: number; r: number; s: number };
  const blobs: Blob[] = [];
  const addBlobs = (count: number, rMin: number, rMax: number, margin: number) => {
    for (let k = 0; k < count; k++) blobs.push({ x: rng.range(margin, 1 - margin), y: rng.range(margin, 1 - margin), r: rng.range(rMin, rMax), s: rng.range(0.8, 1.2) });
  };
  if (shape === 'continents') addBlobs(rng.irange(2, 4), 0.16, 0.27, 0.2);
  else if (shape === 'pangaea') { blobs.push({ x: 0.5 + rng.range(-0.05, 0.05), y: 0.5 + rng.range(-0.05, 0.05), r: 0.38, s: 1.2 }); addBlobs(3, 0.08, 0.14, 0.25); }
  else if (shape === 'archipelago') addBlobs(rng.irange(16, 28), 0.04, 0.09, 0.1);
  else if (shape === 'islands') addBlobs(rng.irange(5, 8), 0.08, 0.15, 0.15);

  const raw = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      // domain warp makes coastlines ragged instead of round
      const wx = u + 0.12 * nWarp.fbm(u * 3, v * 3, 3), wy = v + 0.12 * nWarp.fbm(u * 3 + 17, v * 3 + 31, 3);
      let mask = 0;
      if (shape === 'lakes') mask = 0.85;
      for (const b of blobs) {
        const dx = (wx - b.x) / b.r, dy = (wy - b.y) / b.r;
        mask = Math.max(mask, b.s * Math.exp(-(dx * dx + dy * dy) * 1.6));
      }
      // keep the map edge as sea (except the lake world, which has an ocean rim anyway)
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const fall = Math.min(1, edge / 0.08);
      const base = nBase.fbm(x * S * 4, y * S * 4, 6);
      const detail = nDet.fbm(x * S * 16, y * S * 16, 3);
      const ridge = nRidge.ridged(x * S * 5, y * S * 5, 5);
      let h = 0.55 * mask + 0.32 * base + 0.06 * detail;
      h += opt.mountains * 0.38 * Math.max(0, ridge - 0.45) * Math.min(1, mask * 1.6 + 0.2);
      if (shape === 'lakes') h -= 0.35 * Math.max(0, nWarp.fbm(x * S * 6 + 50, y * S * 6, 4) - 0.25);
      raw[y * W + x] = h * (0.25 + 0.75 * fall) - (1 - fall) * 0.3;
    }
  }

  // ---- normalise so the chosen share of tiles is land
  const sorted = Float32Array.from(raw).sort();
  const thr = sorted[Math.floor((1 - Math.max(0.1, Math.min(0.9, opt.land))) * (N - 1))];
  const lo = sorted[0], hi = sorted[N - 1];
  // land: by rank, so every world has the same mix of lowland, hills, mountains and peaks
  const landIdx: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = raw[i];
    if (r < thr) { const t = (r - lo) / Math.max(1e-6, thr - lo); world.height[i] = SEA * Math.pow(t, 0.7); }
    else landIdx.push(i);
  }
  landIdx.sort((a, b) => raw[a] - raw[b]);
  const peakShare = 0.012 + 0.03 * opt.mountains, mtnShare = 0.04 + 0.08 * opt.mountains, hillShare = 0.12 + 0.1 * opt.mountains;
  const r1 = 1 - peakShare - mtnShare - hillShare, r2 = 1 - peakShare - mtnShare, r3 = 1 - peakShare;
  for (let k = 0; k < landIdx.length; k++) {
    const r = k / Math.max(1, landIdx.length - 1);
    let g: number;
    if (r < r1) g = 0.36 * (r / r1);                                  // lowland 0.50..0.68
    else if (r < r2) g = 0.36 + 0.16 * ((r - r1) / (r2 - r1));       // hills    0.68..0.76
    else if (r < r3) g = 0.52 + 0.16 * ((r - r2) / (r3 - r2));       // mountains 0.76..0.84
    else g = 0.68 + 0.32 * ((r - r3) / (1 - r3));                     // peaks    0.84..1
    world.height[landIdx[k]] = SEA + (1 - SEA) * g;
  }

  // ---- temperature: latitude, altitude, noise
  const shift = opt.climate === 'hot' ? 9 : opt.climate === 'cold' ? -12 : opt.climate === 'temperate' ? 0 : 0;
  const range = opt.climate === 'temperate' ? 26 : 46;
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / (H - 1) - 0.5) * 2; // 0 equator (middle), 1 poles (top/bottom)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const alt = Math.max(0, world.height[i] - SEA) * 42;
      const t = 28 - range * Math.pow(lat, 1.25) + shift - alt + nTemp.fbm(x * S * 5, y * S * 5, 3) * 7;
      world.temp[i] = Math.max(-40, Math.min(45, Math.round(t)));
    }
  }

  // ---- moisture: distance from the sea, noise, and rain shadow from the west wind
  const dist = new Uint16Array(N).fill(65535);
  {
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (world.height[i] < SEA) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0, d = dist[i] + 1;
      if (d > 60) continue;
      if (x > 0 && dist[i - 1] > d) { dist[i - 1] = d; q[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] > d) { dist[i + 1] = d; q[qt++] = i + 1; }
      if (y > 0 && dist[i - W] > d) { dist[i - W] = d; q[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] > d) { dist[i + W] = d; q[qt++] = i + W; }
    }
  }
  for (let y = 0; y < H; y++) {
    let air = 1;  // moisture carried by the wind across this row
    for (let x = 0; x < W; x++) {
      const i = y * W + x, h = world.height[i];
      if (h < SEA) air = Math.min(1, air + 0.08);
      else {
        const climb = x > 0 ? Math.max(0, h - world.height[i - 1]) : 0;
        air = Math.max(0.15, air - climb * 6 - 0.004);
      }
      const coast = Math.max(0, 1 - Math.min(60, dist[i]) / 60 * (W / 256 > 1 ? 1 / Math.sqrt(W / 256) : 1));
      let m = 0.45 * (0.5 + 0.5 * nMoist.fbm(x * S * 4, y * S * 4, 4)) + 0.3 * coast + 0.35 * air - 0.1;
      if (opt.climate === 'hot') m -= 0.08;
      world.moist[i] = Math.max(0, Math.min(255, Math.round(m * 255)));
    }
  }

  // ---- rivers: priority flood from the sea gives every land tile a downhill route; rain gathers along it
  if (opt.rivers > 0) carveRivers(world, rng, opt.rivers);

  // ---- biomes
  for (let i = 0; i < N; i++) {
    let b = world.biomeFor(i);
    if (b === B.Beach && dist[i] > 2) b = world.temp[i] > 22 && world.moist[i] < 70 ? B.Desert : B.Grass;
    world.biome[i] = b;
  }

  // ---- magical and special biomes in patches
  if (opt.magic > 0) {
    const patches = Math.round((W * H) / 9000 * opt.magic) + 1;
    const kinds = [B.Enchanted, B.Crystal, B.Mushroom, B.Corrupted, B.Candy, B.Prehistoric, B.Volcanic];
    for (let k = 0; k < patches; k++) {
      const kind = rng.weighted(kinds, [3, 2, 3, 1.2, 0.8, 1.6, 1.4]);
      // find a fitting spot
      for (let tries = 0; tries < 40; tries++) {
        const cx = rng.int(W), cy = rng.int(H), ci = cy * W + cx;
        const b = world.biome[ci];
        if (BIOMES[b].water || b === B.Peak) continue;
        if (kind === B.Prehistoric && !(b === B.Jungle || b === B.Forest || b === B.Swamp)) continue;
        if (kind === B.Crystal && !(b === B.Hills || b === B.Mountain || b === B.Tundra || b === B.Snow)) continue;
        if (kind === B.Mushroom && !(b === B.Swamp || b === B.Forest || b === B.Taiga)) continue;
        if (kind === B.Volcanic && !(b === B.Mountain || b === B.Hills)) continue;
        const r = rng.range(4, 10) * Math.sqrt(W * H) / 256;
        for (let y = Math.max(0, cy - r * 2); y < Math.min(H, cy + r * 2); y++) {
          for (let x = Math.max(0, cx - r * 2); x < Math.min(W, cx + r * 2); x++) {
            const i = (y | 0) * W + (x | 0);
            const d = hyp(x - cx, y - cy) / r + 0.5 * nMagic.fbm(x * 0.15, y * 0.15, 3);
            if (d < 1 && !BIOMES[world.biome[i]].water && world.biome[i] !== B.Peak) world.biome[i] = kind;
          }
        }
        if (kind === B.Volcanic) {  // a lava lake in the crater
          for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
            if (world.inb(x, y) && hyp(x - cx, y - cy) < 1.8) { const i = world.idx(x, y); world.biome[i] = B.Lava; world.river[i] = 0; }
          }
        }
        break;
      }
    }
  }

  // ---- forests (clumped by noise), forage, ore
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, bd = BIOMES[world.biome[i]];
      if (bd.water || world.biome[i] === B.Lava) continue;
      const m = world.moist[i] / 255;
      world.veg[i] = Math.round(bd.vegMax * (0.4 + 0.6 * m));
      if (!world.river[i] && bd.trees.length) {
        const clump = 0.5 + 0.5 * nDet.fbm(x * 0.09, y * 0.09, 3);
        const p = bd.treeDensity * (0.3 + 1.4 * clump * clump) * (0.6 + 0.8 * m);
        if (rng.f() < p) world.tree[i] = bd.trees[rng.int(bd.trees.length)];
      }
      // ore: veins in hills and mountains, a little in other rough ground
      const b = world.biome[i];
      const rough = b === B.Mountain ? 1 : b === B.Hills ? 0.55 : b === B.Peak ? 0.6 : b === B.Badlands || b === B.Volcanic ? 0.5 : b === B.Crystal ? 0.4 : 0.05;
      const vein = 0.5 + 0.5 * nOre.n2(x * 0.11, y * 0.11);
      if (rng.f() < rough * 0.10 * (0.4 + vein)) {
        const deep = b === B.Mountain || b === B.Peak;
        let ore: Ore = Ore.Stone;
        const r = rng.f();
        if (b === B.Crystal) ore = r < 0.6 ? Ore.Gems : Ore.Stone;
        else if (b === B.Volcanic) ore = r < 0.3 ? Ore.Iron : r < 0.45 ? Ore.Gems : Ore.Stone;
        else if (r < 0.30) ore = Ore.Stone;
        else if (r < 0.48) ore = Ore.Copper;
        else if (r < 0.66) ore = Ore.Iron;
        else if (r < 0.78) ore = Ore.Coal;
        else if (r < 0.88) ore = Ore.Gold;
        else if (r < 0.96) ore = deep ? Ore.Gems : Ore.Iron;
        else ore = deep && world.biome[i] === B.Peak || rng.chance(0.25) ? Ore.Mithril : Ore.Gold;
        world.ore[i] = ore; world.oreAmt[i] = rng.irange(40, 200);
        world.tree[i] = 0;
      } else if ((b === B.Desert || b === B.Swamp || b === B.Tundra) && rng.f() < 0.0025) {
        world.ore[i] = Ore.Oil; world.oreAmt[i] = rng.irange(120, 255);
      }
    }
  }
  world.computeRegions();
  world.markAll();
  return world;
}

/** Rivers by priority flood + flow accumulation. Depressions deep enough become lakes. */
function carveRivers(world: World, rng: Rng, amount: number) {
  const { w: W, h: H, n: N, height } = world;
  const filled = new Float32Array(N);
  const down = new Int32Array(N).fill(-1);
  const order = new Int32Array(N); let on = 0;
  const done = new Uint8Array(N);
  // binary heap keyed by filled height
  const heapI = new Int32Array(N); const heapK = new Float32Array(N); let hs = 0;
  const push = (i: number, k: number) => {
    let c = hs++; heapI[c] = i; heapK[c] = k;
    while (c > 0) { const p = (c - 1) >> 1; if (heapK[p] <= heapK[c]) break; const ti = heapI[p], tk = heapK[p]; heapI[p] = heapI[c]; heapK[p] = heapK[c]; heapI[c] = ti; heapK[c] = tk; c = p; }
  };
  const pop = (): number => {
    const top = heapI[0]; hs--;
    if (hs > 0) {
      heapI[0] = heapI[hs]; heapK[0] = heapK[hs];
      let c = 0;
      for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < hs && heapK[l] < heapK[m]) m = l; if (r < hs && heapK[r] < heapK[m]) m = r; if (m === c) break; const ti = heapI[m], tk = heapK[m]; heapI[m] = heapI[c]; heapK[m] = heapK[c]; heapI[c] = ti; heapK[c] = tk; c = m; }
    }
    return top;
  };
  for (let i = 0; i < N; i++) if (height[i] < SEA) { filled[i] = height[i]; done[i] = 1; push(i, height[i]); }
  while (hs > 0) {
    const i = pop();
    if (height[i] >= SEA) order[on++] = i;
    const x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 8; d++) {
      const dx = [1, -1, 0, 0, 1, 1, -1, -1][d], dy = [0, 0, 1, -1, 1, -1, 1, -1][d];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (done[j]) continue;
      done[j] = 1;
      filled[j] = Math.max(height[j], filled[i] + 1e-5);
      down[j] = i;
      push(j, filled[j]);
    }
  }
  const lake = new Uint8Array(N);
  // rain falls everywhere on land; water runs down the routes (highest tiles first)
  const flow = new Float32Array(N);
  for (let k = on - 1; k >= 0; k--) {
    const i = order[k];
    flow[i] += 0.2 + world.moist[i] / 255;
    if (down[i] >= 0) flow[down[i]] += flow[i];
  }
  const scale = Math.sqrt(N / 65536);
  const thr = 150 * scale / Math.max(0.15, amount);
  for (let k = 0; k < on; k++) {
    const i = order[k];
    // lakes: water collects where the ground had to be filled
    if (filled[i] - height[i] > 0.008 && world.moist[i] > 80) { height[i] = SEA - 0.03; lake[i] = 1; continue; }
    if (flow[i] > thr && height[i] < 0.8) {
      world.river[i] = flow[i] > thr * 12 ? 4 : flow[i] > thr * 5 ? 3 : flow[i] > thr * 2.2 ? 2 : 1;
      // rivers make the land around them greener
      const x = i % W, y = (i / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) { const j = ny * W + nx; world.moist[j] = Math.min(255, world.moist[j] + 10); }
      }
    }
  }
  // ponds smaller than a few tiles go back to dry land
  {
    const seen = new Uint8Array(N); const st: number[] = []; const comp: number[] = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (!lake[s0] || seen[s0]) continue;
      st.length = 0; comp.length = 0; st.push(s0); seen[s0] = 1;
      while (st.length) {
        const i = st.pop()!; comp.push(i);
        const x = i % W, y = (i / W) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && lake[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
      if (comp.length < 10) for (const i of comp) { height[i] = SEA + 0.004; lake[i] = 0; }
    }
  }
  // big rivers are a little wider
  for (let i = 0; i < N; i++) if (world.river[i] >= 3) {
    const x = i % W, y = (i / W) | 0;
    if (x + 1 < W && height[i + 1] >= SEA && !world.river[i + 1]) world.river[i + 1] = world.river[i] - 1;
  }
}
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
