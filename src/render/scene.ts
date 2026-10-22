// Puts the world on screen: terrain (GPU shader), then trees, buildings and creatures row by row from
// the back to the front (so things nearer the viewer overlap things behind), then effects and labels
// on a 2D canvas on top.
import type { Sim } from '../sim/sim';
import { St, UF, Job, T } from '../sim/units';
import { SPECIES } from '../sim/species';
import { G, Gene } from '../sim/genetics';
import { BUILDINGS, BT } from '../sim/entities';
import { TerrainRenderer } from './terrain';
import { Atlas, type Sprite } from './atlas';
import { SpriteRenderer } from './sprites';
import { Camera } from './camera';
import { paintPerson, paintAnimal, type Gear } from './creatures';
import { paintBuilding, paintTree, paintDeco, snowOn } from './buildings';
import { tornados } from '../sim/nature';
import { hash2 } from '../sim/rng';

const PX = 1 / 8;           // world units per art pixel
const ERA_GROUP = [0, 1, 1, 2, 2, 3, 4, 4, 4];
const BUILD_KEYS = BUILDINGS.map(b => b.key);
const NEUTRAL = 0x9a8a6a;
const GEARS: Gear[] = ['civ', 'farm', 'wood', 'mine', 'build', 'fish', 'hunt', 'sold', 'arch', 'mage', 'priest', 'scholar', 'noble', 'ruler', 'merchant', 'thief', 'hero', 'child', 'guard', 'smith', 'herd', 'healer', 'sailor'];
const BUILDS = ['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard', 'avian', 'undead', 'beast'];

export interface ViewOpts { borders: boolean; tint: number; overlay: number; labels: boolean; cityBorders: boolean; }

export class Scene {
  gl: WebGL2RenderingContext; terrain: TerrainRenderer; atlas: Atlas; sprites: SpriteRenderer;
  fx: CanvasRenderingContext2D; fxCanvas: HTMLCanvasElement;
  sim!: Sim;
  prevX = new Float32Array(0); prevY = new Float32Array(0);
  rowHead = new Int32Array(0); rowNext = new Int32Array(0);
  bRowHead = new Int32Array(0); bRowNext = new Int32Array(0);
  selected = -1; selectedUid = 0; hoverTile = -1;
  brush: { x: number; y: number; r: number; color: string } | null = null;
  kingdomColorsSet = new Set<number>();
  drops: { x: number; y: number; s: number }[] = [];

  constructor(gl: WebGL2RenderingContext, fxCanvas: HTMLCanvasElement) {
    this.gl = gl;
    this.terrain = new TerrainRenderer(gl);
    this.atlas = new Atlas(gl);
    this.atlas.onReset = () => this.numCache.clear();
    this.sprites = new SpriteRenderer(gl);
    this.fxCanvas = fxCanvas;
    this.fx = fxCanvas.getContext('2d')!;
    for (let i = 0; i < 160; i++) this.drops.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() });
  }

  setSim(sim: Sim) {
    this.sim = sim;
    this.terrain.setWorld(sim.world);
    this.terrain.kingdomOfCity = (c) => { const city = sim.cities[c]; return city ? city.kingdom + 1 : 0; };
    this.kingdomColorsSet.clear();
    this.atlas.reset();
  }

  /** call before each sim step so movement can be smoothed between steps */
  snapshot() {
    const U = this.sim.units;
    if (this.prevX.length < U.cap) { this.prevX = new Float32Array(U.cap); this.prevY = new Float32Array(U.cap); }
    this.prevX.set(U.x.subarray(0, U.hi)); this.prevY.set(U.y.subarray(0, U.hi));
  }

  // ------------------------------------------------------------------ colours
  kingdomColor(k: number): number { return k >= 0 && this.sim.kingdoms[k] ? this.sim.kingdoms[k].color : NEUTRAL; }
  unitTint1(u: number): number {
    const U = this.sim.units;
    if (U.flags[u] & UF.Bandit) return 0x3a2a2a;
    const c = U.city[u];
    if (c >= 0) return this.kingdomColor(this.sim.cities[c].kingdom);
    return NEUTRAL;
  }
  unitTint2(u: number): number {
    const U = this.sim.units, d = SPECIES[U.spec[u]];
    const hue = U.genome[u * G + Gene.Hue] / 255;      // 0..1
    const v = (hue - 0.5);
    let base = d.color;
    if (d.sapient) {
      switch (d.key) {
        case 'human': { const tones = [0xf2d0b4, 0xe8b796, 0xc98e66, 0x9a6a46, 0x6b4a32]; base = tones[Math.min(4, Math.floor(hue * 5))]; break; }
        case 'elf': base = hue > 0.8 ? 0xb8c8e8 : 0xf2d5c4; break;
        case 'dwarf': base = [0xe8b090, 0xd99a78, 0xb87a5a][Math.min(2, Math.floor(hue * 3))]; break;
        case 'orc': base = [0x7aa84f, 0x6f9a4a, 0x5a7a3a, 0x8a8a4a][Math.min(3, Math.floor(hue * 4))]; break;
        case 'goblin': base = [0xa8c84a, 0x8fbf4a, 0x6aa85a][Math.min(2, Math.floor(hue * 3))]; break;
        case 'lizard': base = [0x4f9a6a, 0x3f8a8a, 0x6a9a3a, 0x8a6a3a][Math.min(3, Math.floor(hue * 4))]; break;
        case 'avian': base = [0xc9a46a, 0xe8e0d0, 0x6a7a9a, 0xb8603a][Math.min(3, Math.floor(hue * 4))]; break;
        case 'undead': base = 0xc8c4b0; break;
        default: base = shiftHue(d.color, v * 0.3);
      }
      return base;
    }
    return shiftHue(base, v * 0.35);
  }

  // ------------------------------------------------------------------ sprite keys
  gearOf(u: number): Gear {
    const U = this.sim.units, d = SPECIES[U.spec[u]];
    if (this.sim.ageYears(u) < d.adult) return 'child';
    const f = U.flags[u];
    if (f & UF.Ruler) return 'ruler';
    if (f & UF.Hero) return 'hero';
    if (f & UF.Bandit) return 'thief';
    switch (U.job[u] as Job) {
      case Job.Farmer: return 'farm'; case Job.Woodcutter: return 'wood'; case Job.Miner: return 'mine'; case Job.Builder: return 'build';
      case Job.Hunter: return 'hunt'; case Job.Fisher: return 'fish'; case Job.Soldier: return U.slot[u] & 128 ? 'arch' : 'sold';
      case Job.Scholar: return 'scholar'; case Job.Priest: return 'priest'; case Job.Merchant: return 'merchant'; case Job.Smith: return 'smith';
      case Job.Herder: return 'herd'; case Job.Healer: return 'healer'; case Job.Guard: return 'guard'; case Job.Mage: return 'mage';
      case Job.Sailor: return 'sailor'; case Job.Noble: return 'noble'; case Job.Thief: return 'thief';
    }
    if (U.traits[u] & (1 << T.Mage)) return 'mage';
    return 'civ';
  }

  /** sprites by a numeric key, so no strings are built per creature per frame */
  numCache = new Map<number, Sprite>();
  unitSprite(u: number, frame: number): Sprite | null {
    const U = this.sim.units, d = SPECIES[U.spec[u]];
    if (d.sapient) {
      const gear = this.gearOf(u);
      const gi = GEARS.indexOf(gear);
      const soldier = gear === 'sold' || gear === 'arch' || gear === 'guard' || gear === 'hero';
      const tier = soldier ? Math.max(U.weapon[u], U.armor[u]) : 0;
      const hair = U.uid[u] % 6;
      const mounted = U.mount[u] && (gear === 'sold' || gear === 'hero') ? U.mount[u] : 0;
      const boat = (U.flags[u] & UF.OnBoat) !== 0 ? 1 : 0;
      const female = U.sex[u] === 1 ? 1 : 0;
      const bi = BUILDS.indexOf(d.build || 'human');
      const nk = 1 + (((((((bi * 2 + female) * 32 + gi) * 16 + tier) * 8 + hair) * 4 + frame) * 4 + mounted) * 2 + boat);
      const hit = this.numCache.get(nk);
      if (hit) return hit;
      const build = d.build || 'human';
      const s = this.atlas.get(`p${build}${female}${gear}${tier}${hair}${frame}${mounted}${boat}`, () => {
        const pix = paintPerson({ build, female: female === 1, frame, gear, tier, hair, mounted, boat: boat === 1 });
        return { pix, ax: pix.w / 2, ay: pix.h - 2 };
      });
      if (s) this.numCache.set(nk, s);
      return s;
    }
    const nk = -(1 + d.id * 2 + (frame & 1));
    const hit = this.numCache.get(nk);
    if (hit) return hit;
    const s = this.atlas.get('a' + d.key + (frame & 1), () => { const pix = paintAnimal(d.key, frame & 1); return { pix, ax: pix.w / 2, ay: pix.h - 2 }; });
    if (s) this.numCache.set(nk, s);
    return s;
  }

  // ------------------------------------------------------------------ drawing
  draw(cam: Camera, alpha: number, time: number, o: ViewOpts) {
    const gl = this.gl, sim = this.sim, w = sim.world;
    const vw = cam.vw / cam.zoom, vh = cam.vh / cam.zoom;
    const view = { x0: cam.x - vw / 2, y0: cam.y - vh / 2, w: vw, h: vh, zoom: cam.zoom };
    // kingdom colours for the border shader
    for (const k of sim.kingdoms) {
      const key = k.id * 1e7 + k.color;
      if (!this.kingdomColorsSet.has(key)) { this.kingdomColorsSet.add(key); this.terrain.setKingdomColor(k.id + 1, k.color); }
    }
    this.terrain.winter = sim.winter;
    this.terrain.sync(cam.zoom > 3 ? 24 : 64);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    const light = sim.laws.dayNight === false ? 1 : sim.light;
    const zoomedIn = cam.zoom >= 5;
    this.terrain.draw(view, time, { light, tint: o.tint, overlay: o.overlay, borders: o.borders, cityBorders: o.cityBorders, treesInShader: !zoomedIn });
    // ---- sprites
    this.atlas.budget = 80;
    const sp = this.sprites;
    sp.begin();
    const x0 = Math.max(0, Math.floor(view.x0) - 2), x1 = Math.min(w.w - 1, Math.ceil(view.x0 + vw) + 2);
    const y0 = Math.max(0, Math.floor(view.y0) - 1), y1 = Math.min(w.h - 1, Math.ceil(view.y0 + vh) + 6);
    const rows = y1 - y0 + 1;
    if (this.rowHead.length < rows) { this.rowHead = new Int32Array(rows * 2); this.bRowHead = new Int32Array(rows * 2); }
    this.rowHead.fill(-1, 0, rows); this.bRowHead.fill(-1, 0, rows);
    const U = sim.units;
    if (this.rowNext.length < U.cap) this.rowNext = new Int32Array(U.cap);
    if (this.bRowNext.length < sim.buildings.length) this.bRowNext = new Int32Array(sim.buildings.length * 2);
    // bucket buildings by their bottom row
    for (const b of sim.buildings) {
      if (!b.alive) continue;
      const by = b.y + b.h - 1;
      if (by < y0 || by > y1 || b.x + b.w < x0 - 4 || b.x > x1 + 4) continue;
      const r = by - y0;
      this.bRowNext[b.id] = this.bRowHead[r]; this.bRowHead[r] = b.id;
    }
    // bucket creatures by row
    const px = this.prevX, py = this.prevY, hasPrev = px.length >= U.hi;
    for (let u = 0; u < U.hi; u++) {
      if (!U.alive[u]) continue;
      let x = U.x[u], y = U.y[u];
      if (hasPrev) { const dx = x - px[u], dy = y - py[u]; if (dx * dx + dy * dy < 4) { x = px[u] + dx * alpha; y = py[u] + dy * alpha; } }
      if (x < x0 - 1 || x > x1 + 1 || y < y0 || y > y1) continue;
      const r = Math.floor(y) - y0;
      this.rowNext[u] = this.rowHead[r]; this.rowHead[r] = u;
    }
    const tick = sim.tick;
    for (let r = 0; r < rows; r++) {
      const ty = y0 + r;
      // trees in this row
      if (zoomedIn) for (let tx = x0; tx <= x1; tx++) {
        const i = ty * w.w + tx;
        const tr = w.tree[i];
        if (!tr && w.deco[i] && w.deco[i] !== 10 && !w.bld[i]) {
          const dk = w.deco[i], dv = (i * 2654435761 >>> 30) & 1;
          const ds = this.atlas.get(`d${dk}${dv}`, () => ({ pix: paintDeco(dk, dv), ax: 5, ay: 9 }));
          if (ds) sp.push(ds, tx + 0.5, ty + 0.95, PX, 0, 0, 0, 1, 1);
          continue;
        }
        if (!tr || w.bld[i]) continue;
        const v = (i * 2654435761 >>> 28) & 1;
        const snow = sim.winter > 0.5 && w.temp[i] < 4;
        const tk = 1e7 + tr * 4 + v * 2 + (snow ? 1 : 0);
        let s = this.numCache.get(tk) || null;
        if (!s) { s = this.atlas.get(`t${tr}${v}${snow ? 1 : 0}`, () => { const pix = paintTree(tr, v, snow); return { pix, ax: 6, ay: 15 }; }); if (s) this.numCache.set(tk, s); }
        if (!s) continue;
        const jx = (hash2(tx, ty, 5) - 0.5) * 0.3;
        sp.push(s, tx + 0.5 + jx, ty + 0.95, PX, 0, 0, 2 | (hash2(tx, ty, 9) < 0.5 ? 1 : 0), 1, 1, tx * 0.7 + ty);
      }
      // buildings that end in this row
      for (let b = this.bRowHead[r]; b !== -1; b = this.bRowNext[b]) {
        const bd = sim.buildings[b];
        const city = sim.cities[bd.city];
        const k = city ? city.kingdom : -1;
        const era = ERA_GROUP[Math.min(8, bd.era)];
        const scaf = bd.built < 1 ? Math.max(0.25, Math.ceil(bd.built * 4) / 4) : 0;
        const type = BUILD_KEYS[bd.type];
        if (bd.type === BT.Bridge) continue;
        const variant = bd.id % 3;
        const snowy = sim.winter > 0.5 && w.temp[bd.y * w.w + bd.x] < 4 ? 1 : 0;
        const s = this.atlas.get(`b${type}${bd.style}${era}${variant}${scaf}${snowy}`, () => { const a = paintBuilding(type, bd.style, era, bd.w, bd.h, variant * 101 + 7, scaf); if (snowy) snowOn(a.pix); return { pix: a.pix, ax: a.ax, ay: a.ay }; });
        if (!s) continue;
        const hit = bd.hp < bd.maxHp * 0.5 ? 0.82 : 1;
        sp.push(s, bd.x, bd.y, PX, this.kingdomColor(k), 0, 0, 1, hit);
      }
      // creatures
      for (let u = this.rowHead[r]; u !== -1; u = this.rowNext[u]) {
        let x = U.x[u], y = U.y[u];
        if (hasPrev) { const dx = x - px[u], dy = y - py[u]; if (dx * dx + dy * dy < 4) { x = px[u] + dx * alpha; y = py[u] + dy * alpha; } }
        const st = U.state[u];
        const moving = hasPrev && (Math.abs(U.x[u] - px[u]) + Math.abs(U.y[u] - py[u])) > 0.005;
        let frame = 0;
        const phase = ((tick >> 2) + U.uid[u]) & 1;
        if (moving) frame = 1 + phase;
        else if (st === St.Fight || st === St.Chop || st === St.Mine || st === St.Build || st === St.Farm || st === St.Work) frame = ((tick >> 2) + U.uid[u]) % 3 === 0 ? 3 : 0;
        const d = SPECIES[U.spec[u]];
        if (!d.sapient && frame === 3) frame = 0;
        if (!d.sapient && frame === 2) frame = 1;
        if (!d.sapient && moving) frame = phase;
        if (d.fly && !d.sapient) frame = ((tick >> 2) + U.uid[u]) & 1;
        const s = this.unitSprite(u, frame);
        if (!s) continue;
        let scale = PX * (d.sapient ? (U.flags[u] & UF.Hero ? 0.9 : 0.75) : Math.max(0.7, Math.min(1.6, 0.85 + (U.genome[u * G + Gene.Size] - 128) / 400)));
        if (d.kind === 'titan' || d.key === 'dragon') scale *= 1.6;
        const flash = tick - U.lastHit[u] < 3 ? 4 : 0;
        const flip = U.facing[u] < 0 ? 1 : 0;
        let yy = y;
        if (d.fly) yy -= 0.6 + Math.sin((tick + u) * 0.15) * 0.1;
        if (U.flags[u] & UF.Asleep) yy += 0.05;
        const alphaU = d.key === 'ghost' ? 0.7 : 1;
        sp.push(s, x, yy, scale, this.unitTint1(u), this.unitTint2(u), flip | flash, alphaU, 1);
      }
    }
    sp.flush(this.atlas.tex, view, time, light);
    this.drawOverlay(cam, view, alpha, time, o, light);
  }

  // ------------------------------------------------------------------ 2D overlay: effects, labels, selection
  drawOverlay(cam: Camera, view: { x0: number; y0: number; w: number; h: number; zoom: number }, alpha: number, time: number, o: ViewOpts, light: number) {
    const c = this.fx, sim = this.sim, z = cam.zoom, dpr = cam.dpr;
    const cv = this.fxCanvas;
    if (cv.width !== Math.round(cam.vw * dpr) || cv.height !== Math.round(cam.vh * dpr)) { cv.width = Math.round(cam.vw * dpr); cv.height = Math.round(cam.vh * dpr); }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = (x: number) => (x - view.x0) * z, sy = (y: number) => (y - view.y0) * z;
    const inView = (x: number, y: number, m = 2) => x > view.x0 - m && x < view.x0 + view.w + m && y > view.y0 - m && y < view.y0 + view.h + m;
    // effects
    for (const f of sim.fx) {
      if (!inView(f.x, f.y, 4)) continue;
      const t = f.t / f.life;
      const X = sx(f.x), Y = sy(f.y);
      switch (f.kind) {
        case 'arrow': case 'bullet': case 'laser': case 'fireball': case 'boulder': {
          const x2 = sx(f.x2 ?? f.x), y2 = sy(f.y2 ?? f.y);
          const px = X + (x2 - X) * t, py = Y + (y2 - Y) * t - (f.kind === 'arrow' || f.kind === 'boulder' ? Math.sin(t * Math.PI) * z * 0.6 : 0);
          if (f.kind === 'laser') { c.strokeStyle = '#ff4f6f'; c.lineWidth = Math.max(1, z * 0.08); c.beginPath(); c.moveTo(X, Y); c.lineTo(x2, y2); c.stroke(); break; }
          c.fillStyle = f.kind === 'fireball' ? '#ffb02a' : f.kind === 'bullet' ? '#f2e0a0' : f.kind === 'boulder' ? '#8a8278' : '#e8dcc0';
          const s = Math.max(1.5, z * (f.kind === 'boulder' ? 0.3 : f.kind === 'fireball' ? 0.25 : 0.12));
          c.fillRect(px - s / 2, py - s / 2, s, s);
          if (f.kind === 'arrow' && z > 6) { c.strokeStyle = '#6b4a2b'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(px - (x2 - X) * 0.08, py - (y2 - Y) * 0.08); c.stroke(); }
          break;
        }
        case 'fire': {
          const x2 = sx(f.x2 ?? f.x), y2 = sy(f.y2 ?? f.y);
          for (let k = 0; k < 6; k++) { const q = Math.min(1, t * 1.5 + k * 0.05); c.fillStyle = k % 2 ? 'rgba(255,140,40,0.8)' : 'rgba(255,220,90,0.8)'; const s = z * (0.2 + k * 0.05); c.fillRect(X + (x2 - X) * q - s / 2 + Math.sin(k + time * 20) * 2, Y + (y2 - Y) * q - s / 2, s, s); }
          break;
        }
        case 'hit': c.fillStyle = `rgba(255,240,200,${1 - t})`; { const s = Math.max(2, z * 0.25); c.fillRect(X - s / 2, Y - s / 2, s, s); } break;
        case 'die': { c.fillStyle = `rgba(200,40,30,${0.8 * (1 - t)})`; for (let k = 0; k < 5; k++) { const a = k * 1.3; const r = t * z * 0.6; c.fillRect(X + Math.cos(a) * r, Y + Math.sin(a) * r - t * z * 0.3, Math.max(1, z * 0.1), Math.max(1, z * 0.1)); } break; }
        case 'level': c.fillStyle = `rgba(255,220,90,${1 - t})`; c.font = `bold ${Math.max(9, z * 0.5)}px Pixelify, monospace`; c.fillText('▲', X - z * 0.2, Y - t * z * 0.8); break;
        case 'confetti': for (let k = 0; k < 4; k++) { c.fillStyle = ['#e0453a', '#f2c230', '#3a7be0', '#3fb04f'][k]; c.fillRect(X + Math.sin(k * 2 + f.t * 0.3) * z * 0.5, Y - z * 0.5 + t * z, Math.max(1, z * 0.08), Math.max(1, z * 0.08)); } break;
        case 'splash': c.strokeStyle = `rgba(220,240,255,${1 - t})`; c.lineWidth = 1; c.beginPath(); c.ellipse(X, Y, z * 0.4 * t + 1, z * 0.2 * t + 1, 0, 0, Math.PI * 2); c.stroke(); break;
        case 'dust': c.fillStyle = `rgba(200,180,140,${0.6 * (1 - t)})`; c.fillRect(X, Y - t * z * 0.5, Math.max(1, z * 0.15), Math.max(1, z * 0.15)); break;
        case 'ring': c.strokeStyle = hexA(f.color ?? 0xffffff, 1 - t); c.lineWidth = Math.max(1, z * 0.1); c.beginPath(); c.arc(X, Y, (f.size ?? 2) * z * t, 0, Math.PI * 2); c.stroke(); break;
        case 'collapse': case 'boom': case 'meteor': case 'eruption': {
          const R = (f.size ?? 1) * z * (0.4 + t);
          c.fillStyle = `rgba(255,${Math.round(200 - t * 150)},60,${0.7 * (1 - t)})`; c.beginPath(); c.arc(X, Y, R * 0.6, 0, Math.PI * 2); c.fill();
          c.fillStyle = `rgba(90,80,70,${0.5 * (1 - t)})`; c.beginPath(); c.arc(X, Y - R * 0.5 * t, R * 0.9, 0, Math.PI * 2); c.fill();
          if (f.kind === 'meteor' && t < 0.3) { c.strokeStyle = 'rgba(255,230,150,0.9)'; c.lineWidth = z * 0.4; c.beginPath(); c.moveTo(X - 400 * (0.3 - t), Y - 600 * (0.3 - t)); c.lineTo(X, Y); c.stroke(); }
          break;
        }
        case 'steam': c.fillStyle = `rgba(230,230,230,${0.5 * (1 - t)})`; c.beginPath(); c.arc(X, Y - t * z, z * 0.3 * (1 + t), 0, Math.PI * 2); c.fill(); break;
        case 'lightning': if (t < 0.5) { c.strokeStyle = '#f4f6ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(X + 10, 0); let yy = 0; let xx = X + 10; while (yy < Y) { yy += 12; xx += (Math.random() - 0.5) * 14; c.lineTo(xx, Math.min(Y, yy)); } c.stroke(); } break;
        case 'quake': c.strokeStyle = `rgba(120,90,60,${1 - t})`; c.lineWidth = 2; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(X, Y, (f.size ?? 8) * z * ((t + k / 3) % 1), 0, Math.PI * 2); c.stroke(); } break;
        case 'flood': c.fillStyle = `rgba(60,120,200,${0.4 * (1 - t)})`; c.beginPath(); c.arc(X, Y, (f.size ?? 5) * z, 0, Math.PI * 2); c.fill(); break;
        case 'raise': c.fillStyle = `rgba(160,255,200,${0.8 * (1 - t)})`; for (let k = 0; k < 4; k++) c.fillRect(X + (k - 2) * z * 0.15, Y - t * z * 1.2 - k * 2, Math.max(1, z * 0.1), Math.max(1, z * 0.1)); break;
        case 'power': c.strokeStyle = hexA(f.color ?? 0xffffff, 1 - t); c.lineWidth = Math.max(1, z * 0.15); c.beginPath(); c.arc(X, Y, (f.size ?? 2) * z * (0.3 + t), 0, Math.PI * 2); c.stroke(); break;
        case 'rocket': {
          const up = t * t * view.h * z * 1.4;
          c.fillStyle = '#f4f6f8'; c.fillRect(X - z * 0.15, Y - up - z * 1.2, z * 0.3, z * 1.2);
          for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? 'rgba(255,170,60,0.85)' : 'rgba(255,240,150,0.85)'; const s2 = z * (0.2 + Math.random() * 0.25); c.fillRect(X - s2 / 2 + (Math.random() - 0.5) * z * 0.3, Y - up + k * z * 0.12, s2, s2); }
          c.fillStyle = `rgba(220,220,220,${0.5 * (1 - t)})`; c.beginPath(); c.arc(X, Y, z * (1 + t * 3), 0, Math.PI * 2); c.fill();
          break;
        }
        case 'text': c.fillStyle = hexA(f.color ?? 0xffffff, 1 - t); c.font = `bold ${Math.max(10, z * 0.45)}px Pixelify, monospace`; c.textAlign = 'center'; c.fillText(f.text || '', X, Y - t * z); c.textAlign = 'left'; break;
      }
    }
    // tornados
    for (const tn of tornados(sim)) {
      if (!inView(tn.x, tn.y, 6)) continue;
      const X = sx(tn.x), Y = sy(tn.y);
      for (let k = 0; k < 8; k++) {
        const yy = Y - k * z * 0.5, r = z * (0.3 + k * 0.18);
        c.strokeStyle = `rgba(180,180,190,${0.55 - k * 0.04})`; c.lineWidth = Math.max(1, z * 0.12);
        c.beginPath(); c.ellipse(X + Math.sin(time * 6 + k) * z * 0.2, yy, r, r * 0.3, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    // weather
    if (sim.weather.rain > 0.2 || sim.weather.snow > 0.3 || sim.weather.storm > 0.5) {
      const snow = sim.weather.snow > 0.3;
      c.fillStyle = snow ? 'rgba(255,255,255,0.7)' : 'rgba(180,200,255,0.35)';
      for (const d of this.drops) {
        d.y += (snow ? 0.002 : 0.012) * d.s; d.x += snow ? Math.sin(time + d.s * 9) * 0.0005 : 0.002;
        if (d.y > 1) { d.y = 0; d.x = Math.random(); }
        if (d.x > 1) d.x = 0;
        const X = d.x * cam.vw, Y = d.y * cam.vh;
        if (snow) c.fillRect(X, Y, 2, 2); else c.fillRect(X, Y, 1, 6);
      }
      if (sim.weather.storm > 0.5) { c.fillStyle = 'rgba(20,24,40,0.12)'; c.fillRect(0, 0, cam.vw, cam.vh); }
    }
    // armies on campaign: a banner over the general with the army's size
    for (const a of sim.armies) {
      if (a.state === 'disband' || a.state === 'home' || a.members.length < 3) continue;
      const g = a.general;
      if (g < 0 || !sim.units.alive[g]) continue;
      const gx = sim.units.x[g], gy = sim.units.y[g];
      if (!inView(gx, gy, 3)) continue;
      const k = sim.kingdoms[a.kingdom];
      const X = sx(gx), Y = sy(gy) - Math.max(16, z * 1.3);
      c.strokeStyle = '#2b1d12'; c.lineWidth = 2; c.beginPath(); c.moveTo(X, sy(gy) - z * 0.5); c.lineTo(X, Y - 10); c.stroke();
      const label = (a.state === 'siege' ? '⚔ ' : a.state === 'battle' ? '⚔ ' : '') + a.members.length;
      c.font = `700 ${z > 10 ? 12 : 10}px Pixelify, monospace`;
      const tw = c.measureText(label).width + 8;
      c.fillStyle = hexA(k ? k.color : 0x888888, 1); c.fillRect(X + 1, Y - 18, tw, 14);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X + 1, Y - 5, tw, 2);
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(label, X + 5, Y - 11);
    }
    // selection ring
    if (this.selected >= 0) {
      const U = sim.units, u = this.selected;
      if (!U.alive[u] || U.uid[u] !== this.selectedUid) this.selected = -1;
      else {
        let x = U.x[u], y = U.y[u];
        if (this.prevX.length > u) { x = this.prevX[u] + (x - this.prevX[u]) * alpha; y = this.prevY[u] + (y - this.prevY[u]) * alpha; }
        c.strokeStyle = '#ffe07a'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(sx(x), sy(y), Math.max(5, z * 0.55), Math.max(3, z * 0.28), 0, 0, Math.PI * 2); c.stroke();
        // where they are going
        if (U.state[u] !== St.Idle && z > 3) { c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,224,122,0.5)'; c.beginPath(); c.moveTo(sx(x), sy(y)); c.lineTo(sx(U.tx[u]), sy(U.ty[u])); c.stroke(); c.setLineDash([]); }
      }
    }
    // the god brush
    if (this.brush) {
      const b = this.brush;
      c.strokeStyle = b.color; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx(b.x), sy(b.y), Math.max(4, b.r * z), 0, Math.PI * 2); c.stroke();
    }
    if (o.labels) this.drawLabels(c, view, sx, sy, z, light);
  }

  drawLabels(c: CanvasRenderingContext2D, view: { x0: number; y0: number; w: number; h: number }, sx: (x: number) => number, sy: (y: number) => number, z: number, light: number) {
    const sim = this.sim;
    c.textBaseline = 'middle';
    if (z < 3.2) {
      // kingdom names over their capitals
      for (const k of sim.kingdoms) {
        if (!k.alive) continue;
        const cap = sim.cities[k.capital];
        if (!cap) continue;
        // centre of all its cities
        let mx = 0, my = 0, n = 0;
        for (const ci of k.cities) { const ct = sim.cities[ci]; mx += ct.x; my += ct.y; n++; }
        if (!n) continue;
        mx /= n; my /= n;
        const size = Math.max(11, Math.min(22, 9 + Math.sqrt(k.pop) * 0.5));
        c.font = `700 ${size}px Pixelify, monospace`;
        const tw = c.measureText(k.name).width;
        const X = sx(mx + 1) - tw / 2, Y = sy(my + 1) - 14;
        c.fillStyle = 'rgba(10,12,20,0.55)'; c.fillRect(X - 6, Y - size / 2 - 3, tw + 12, size + 6);
        c.fillStyle = hexA(k.color, 1); c.fillRect(X - 6, Y - size / 2 - 3, 3, size + 6);
        c.fillStyle = '#f4f1ea'; c.fillText(k.name, X, Y);
      }
      return;
    }
    // city name plates
    c.font = `600 ${z > 10 ? 13 : 11}px Pixelify, monospace`;
    for (const city of sim.cities) {
      if (!city.alive) continue;
      if (z < 6 && !city.capital && city.pop < 25) continue;     // keep the zoomed-out map readable
      const X = sx(city.x + 1), Y = sy(city.y - 1.2);
      if (X < -80 || Y < -20 || X > view.w * z + 80 || Y > view.h * z + 30) continue;
      const k = sim.kingdoms[city.kingdom];
      const label = `${city.capital ? '★ ' : ''}${city.name}  ${city.pop}`;
      const tw = c.measureText(label).width;
      c.fillStyle = 'rgba(12,14,22,0.62)'; c.fillRect(X - tw / 2 - 5, Y - 9, tw + 10, 18);
      c.fillStyle = hexA(k ? k.color : NEUTRAL, 1); c.fillRect(X - tw / 2 - 5, Y + 7, tw + 10, 2);
      c.fillStyle = '#f4f1ea'; c.fillText(label, X - tw / 2, Y);
      if (city.siege > 0) { c.fillStyle = '#ff6a5a'; c.fillText('⚔', X + tw / 2 + 8, Y); }
      if (city.plague > 0) { c.fillStyle = '#9fe06a'; c.fillText('☣', X - tw / 2 - 18, Y); }
    }
    void light;
  }
}

function shiftHue(hex: number, d: number): number {
  let r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0; const l = (mx + mn) / 2; const s = mx === mn ? 0 : l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  if (mx !== mn) { if (mx === r) h = (g - b) / (mx - mn) + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4; h /= 6; }
  h = (h + d + 1) % 1;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  r = s ? f(h + 1 / 3) : l; g = s ? f(h) : l; b = s ? f(h - 1 / 3) : l;
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}
export function hexA(hex: number, a: number) { return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${Math.max(0, Math.min(1, a))})`; }
