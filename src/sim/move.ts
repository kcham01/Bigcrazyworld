// Getting around: straight lines when the way is clear, A* (with a per-tick budget so the game never
// stalls) when it isn't. Walkers, swimmers, sea creatures and flyers each have their own rules.
import type { Sim } from './sim';
import { BIOMES, B } from './defs';
import { BT } from './entities';
import { SPECIES } from './species';
import { UF } from './units';

export const enum Mode { Walk, Swim, Sea, Fly }

export function modeOf(sim: Sim, u: number): Mode {
  const d = SPECIES[sim.units.spec[u]];
  if (sim.units.flags[u] & UF.OnBoat) return Mode.Sea;
  if (d.fly) return Mode.Fly;
  if (d.swim === 2) return Mode.Sea;
  if (d.swim === 1) return Mode.Swim;
  return Mode.Walk;
}

/** can this kind of mover stand on tile i? (k = kingdom of the mover, for walls and gates) */
export function passable(sim: Sim, i: number, mode: Mode, k = -1): boolean {
  const w = sim.world, b = w.biome[i];
  if (mode === Mode.Fly) return true;
  const water = BIOMES[b].water === true;
  if (mode === Mode.Sea) return water || w.river[i] > 1;
  if (b === B.Lava) return false;
  const bi = w.bld[i];
  if (bi) {
    const bd = sim.buildings[bi - 1];
    if (bd.built >= 1 && (bd.type === BT.Wall || bd.type === BT.Tower)) return false;
    if (bd.built >= 1 && bd.type === BT.Gate && k >= 0 && sim.cityKingdom(bd.city) !== k && !sim.atPeace(k, sim.cityKingdom(bd.city))) return false;
  }
  if (water) return mode === Mode.Swim ? b !== B.DeepOcean || true : w.walkable(i);
  return true;
}

function stepCost(sim: Sim, i: number, mode: Mode): number {
  const w = sim.world;
  if (mode === Mode.Fly) return 1;
  if (mode === Mode.Sea) return w.biome[i] === B.DeepOcean ? 1.1 : 1;
  if (mode === Mode.Swim && BIOMES[w.biome[i]].water) return 2;
  return w.moveCost(i);
}

/** Bresenham walk: is the straight line from a to b passable and not too slow? */
export function lineClear(sim: Sim, x0: number, y0: number, x1: number, y1: number, mode: Mode, k = -1): boolean {
  if (mode === Mode.Fly) return true;
  const w = sim.world;
  let x = Math.floor(x0), y = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const dx = Math.abs(ex - x), dy = -Math.abs(ey - y), sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) {
    if (!w.inb(x, y)) return false;
    const i = y * w.w + x;
    if (!passable(sim, i, mode, k)) return false;
    if (mode === Mode.Walk && n > 0 && stepCost(sim, i, mode) > 3) return false;
    if (x === ex && y === ey) return true;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (++n > 400) return false;
  }
}

/** A* over tiles. Reuses its arrays between searches. */
export class PathFinder {
  g: Float32Array; parent: Int32Array; seen: Uint32Array; closed: Uint32Array; stamp = 1;
  heapI: Int32Array; heapK: Float32Array; hs = 0;
  budget = 0;
  constructor(n: number) {
    this.g = new Float32Array(n); this.parent = new Int32Array(n); this.seen = new Uint32Array(n); this.closed = new Uint32Array(n);
    this.heapI = new Int32Array(n); this.heapK = new Float32Array(n);
  }
  private push(i: number, k: number) {
    let c = this.hs++; const hi = this.heapI, hk = this.heapK; hi[c] = i; hk[c] = k;
    while (c > 0) { const p = (c - 1) >> 1; if (hk[p] <= hk[c]) break; const ti = hi[p], tk = hk[p]; hi[p] = hi[c]; hk[p] = hk[c]; hi[c] = ti; hk[c] = tk; c = p; }
  }
  private pop(): number {
    const hi = this.heapI, hk = this.heapK; const top = hi[0]; this.hs--;
    if (this.hs > 0) {
      hi[0] = hi[this.hs]; hk[0] = hk[this.hs];
      let c = 0;
      for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < this.hs && hk[l] < hk[m]) m = l; if (r < this.hs && hk[r] < hk[m]) m = r; if (m === c) break; const ti = hi[m], tk = hk[m]; hi[m] = hi[c]; hk[m] = hk[c]; hi[c] = ti; hk[c] = tk; c = m; }
    }
    return top;
  }
  /** returns a path of tile indices (start excluded), null if unreachable, or undefined if out of budget this tick */
  find(sim: Sim, from: number, to: number, mode: Mode, k = -1, maxNodes = 30000): Int32Array | null | undefined {
    if (this.budget <= 0) return undefined;
    const w = sim.world, W = w.w;
    if (!passable(sim, to, mode, k)) {
      // aim for the nearest passable tile next to the goal instead
      let best = -1;
      const tx = to % W, ty = (to / W) | 0;
      for (let r = 1; r <= 3 && best < 0; r++) for (let dy = -r; dy <= r && best < 0; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (w.inb(nx, ny) && passable(sim, ny * W + nx, mode, k)) { best = ny * W + nx; break; }
      }
      if (best < 0) return null;
      to = best;
    }
    if (mode === Mode.Walk || mode === Mode.Swim) {
      if (w.regionsStale) w.computeRegions();
      const ra = w.region[from], rb = w.region[to];
      if (mode === Mode.Walk && ra > 0 && rb > 0 && ra !== rb) return null;   // different islands
    }
    const st = ++this.stamp;
    const { g, parent, seen, closed } = this;
    this.hs = 0;
    const tx = to % W, ty = (to / W) | 0;
    const h = (i: number) => { const dx = Math.abs(i % W - tx), dy = Math.abs(((i / W) | 0) - ty); return (dx + dy + (1.414 - 2) * Math.min(dx, dy)) * 0.85; };
    g[from] = 0; seen[from] = st; parent[from] = -1;
    this.push(from, h(from));
    let nodes = 0;
    while (this.hs > 0) {
      const cur = this.pop();
      if (closed[cur] === st) continue;
      closed[cur] = st;
      if (cur === to) break;
      if (++nodes > maxNodes) { this.budget -= nodes; return null; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (let d = 0; d < 8; d++) {
        const dx = d < 4 ? (d === 0 ? 1 : d === 1 ? -1 : 0) : (d === 4 || d === 5 ? 1 : -1);
        const dy = d < 4 ? (d === 2 ? 1 : d === 3 ? -1 : 0) : (d === 4 || d === 6 ? 1 : -1);
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= w.h) continue;
        const ni = ny * W + nx;
        if (closed[ni] === st || !passable(sim, ni, mode, k)) continue;
        if (d >= 4 && (!passable(sim, cy * W + nx, mode, k) || !passable(sim, ny * W + cx, mode, k))) continue; // no corner cutting
        const ng = g[cur] + stepCost(sim, ni, mode) * (d >= 4 ? 1.414 : 1);
        if (seen[ni] !== st || ng < g[ni]) {
          seen[ni] = st; g[ni] = ng; parent[ni] = cur;
          this.push(ni, ng + h(ni));
        }
      }
    }
    this.budget -= nodes;
    if (closed[to] !== st) return null;
    const out: number[] = [];
    for (let c = to; c !== from && c !== -1; c = parent[c]) out.push(c);
    out.reverse();
    return Int32Array.from(out);
  }
}

const DIRECT = 65535;

/** Move unit u one tick toward (tx,ty). Returns 1 arrived, 0 still going, -1 can't get there. */
export function goTo(sim: Sim, u: number, tx: number, ty: number, reach = 0.4): number {
  const U = sim.units, w = sim.world;
  const x = U.x[u], y = U.y[u];
  const ddx = tx - x, ddy = ty - y;
  const dist = hyp(ddx, ddy);
  if (dist <= reach) return 1;
  const mode = modeOf(sim, u);
  const k = U.city[u] >= 0 ? sim.cityKingdom(U.city[u]) : -1;
  const goal = w.tileAt(tx, ty);
  if (U.dest[u] !== goal) {
    U.dest[u] = goal; U.path[u] = null; U.pathPos[u] = 0;
    if (dist < 1.5 || lineClear(sim, x, y, tx, ty, mode, k)) U.pathPos[u] = DIRECT;
  }
  let ax = tx, ay = ty;
  if (U.pathPos[u] !== DIRECT) {
    let p = U.path[u];
    if (!p) {
      const r = sim.paths.find(sim, w.tileAt(x, y), goal, mode, k, dist > 60 ? 30000 : 8000);
      if (r === undefined) return 0;            // no budget left this tick: wait
      if (r === null || r.length === 0) { U.dest[u] = -1; return dist < 1.5 ? 1 : -1; }
      p = U.path[u] = r; U.pathPos[u] = 0;
    }
    // skip ahead along the path while the straight line is clear
    let pp = U.pathPos[u];
    if (((sim.tick + u) & 3) === 0) {
      const look = Math.min(p.length - 1, pp + 4);
      for (let q = look; q > pp + 1; q--) {
        const qi = p[q];
        if (lineClear(sim, x, y, qi % w.w + 0.5, ((qi / w.w) | 0) + 0.5, mode, k)) { pp = q; break; }
      }
    }
    U.pathPos[u] = pp;
    const wi = p[pp];
    ax = wi % w.w + 0.5; ay = ((wi / w.w) | 0) + 0.5;
    if (pp === p.length - 1) { ax = tx; ay = ty; }
    if (hyp(ax - x, ay - y) < 0.35 && pp < p.length - 1) U.pathPos[u] = pp + 1;
  }
  // step
  const ti = w.tileAt(x, y);
  let sp = U.spd[u] * sim.speedFactor(u);
  if (mode === Mode.Walk || mode === Mode.Swim) sp /= Math.max(0.4, Math.min(4, stepCost(sim, ti, mode)));
  const sx = ax - x, sy = ay - y, sd = hyp(sx, sy) || 1;
  const step = Math.min(sp, sd);
  const nx = x + sx / sd * step, ny = y + sy / sd * step;
  const ni = w.tileAt(nx, ny);
  if (ni !== ti && !passable(sim, ni, mode, k)) {
    // blocked (the world changed under us): plan again next tick
    if (U.pathPos[u] === DIRECT) { U.pathPos[u] = 0; U.path[u] = null; return 0; }
    U.dest[u] = -1; U.path[u] = null;
    return -1;
  }
  U.x[u] = nx; U.y[u] = ny;
  if (Math.abs(sx) > 0.01) U.facing[u] = sx > 0 ? 1 : -1;
  // feet wear paths into the ground
  if (mode === Mode.Walk && (sim.tick & 3) === 0 && !(U.flags[u] & UF.Possessed)) sim.footstep(ni);
  return hyp(tx - nx, ty - ny) <= reach ? 1 : 0;
}

/** wander a little around (cx,cy) */
export function wanderTarget(sim: Sim, u: number, cx: number, cy: number, r: number): [number, number] {
  const w = sim.world, mode = modeOf(sim, u);
  for (let t = 0; t < 8; t++) {
    const x = cx + sim.rng.range(-r, r), y = cy + sim.rng.range(-r, r);
    if (!w.inb(x | 0, y | 0)) continue;
    if (passable(sim, w.tileAt(x, y), mode)) return [x, y];
  }
  return [sim.units.x[u], sim.units.y[u]];
}
const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
