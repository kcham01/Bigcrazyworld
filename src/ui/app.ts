// The game: the loop, the camera and touch controls, the god toolbar, the inspector, the chronicle,
// map modes, world laws, graphs, saving and loading, and the title and world-creation screens.
import { Sim } from '../sim/sim';
import { newWorld, DEFAULT_START, type StartOptions } from '../sim/setup';
import { DEFAULT_GEN, type GenOptions, type Shape, type Climate } from '../sim/worldgen';
import { SPECIES, SPECIES_BY_KEY } from '../sim/species';
import { UF } from '../sim/units';
import { TICKS_PER_YEAR, SEASON_NAMES, BIOMES, ORE_COLORS } from '../sim/defs';
import { ERAS } from '../sim/tech';
import { POWERS, POWER_BY_ID, CATEGORIES, applyPower, unitAt, cityAt, release, type PowerState } from '../sim/powers';
import { serialize, deserialize } from '../sim/save';
import { AGE_LIST } from '../sim/nature';
import { Scene } from '../render/scene';
import { Camera } from '../render/camera';
import { icon, banner } from './icons';
import { h, esc, hex, fmt } from './dom';
import * as V from './panels';
import { saveWorld, loadWorld, listWorlds, deleteWorld } from './storage';
import { sfx, setSound, soundOn } from './sound';
import type { HEvent } from '../sim/entities';

const SPEEDS = [0, 1, 3, 8, 25];
const SPEED_LABELS = ['❚❚', '1×', '3×', '8×', '25×'];
const TICKS_PER_SEC = 12;

type Target = { kind: 'unit'; uid: number } | { kind: 'city'; id: number } | { kind: 'kingdom'; id: number } | { kind: 'war'; id: number } | { kind: 'char'; id: number } | { kind: 'species'; id: number } | { kind: 'religion'; id: number } | { kind: 'tile'; i: number } | { kind: 'panel'; id: string };

export class App {
  canvas: HTMLCanvasElement; ui: HTMLElement; gl: WebGL2RenderingContext;
  scene: Scene; cam = new Camera();
  sim: Sim | null = null;
  speed = 1; acc = 0; last = 0; time = 0;
  power = 'inspect'; cat = 'look'; brushR = 3; pstate: PowerState = {};
  following = false;
  target: Target | null = null; tab = 0;
  overlayMode = 'none'; overlayAt = 0;
  labels = true; borders = true;
  undo: string[] = []; undoAt = 0;
  slot = '';
  // dom
  el: Record<string, HTMLElement> = {};
  toastsList: { el: HTMLElement; until: number }[] = [];
  hintTimer = 0;
  sheetRefresh = 0;

  constructor() {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.ui = document.getElementById('ui')!;
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) { this.ui.innerHTML = '<div class="menu"><div class="card panel"><h1 class="title">Sorry</h1><p>This device does not support WebGL 2, which the game needs to draw the world.</p></div></div>'; throw new Error('no webgl2'); }
    this.gl = gl;
    this.scene = new Scene(gl, document.getElementById('fx') as HTMLCanvasElement);
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();
    requestAnimationFrame((t) => this.frame(t));
    (window as any).app = this;
    // Android back button
    (window as any).onBack = () => this.back();
  }

  /** drawing resolution relative to the screen: lowered automatically on slow devices */
  perf = { simMs: 0, drawMs: 0 };
  quality = 1; frameMs = 16; slowFor = 0; fastFor = 0;
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = dpr * this.quality;
    this.canvas.width = Math.round(innerWidth * s); this.canvas.height = Math.round(innerHeight * s);
    this.cam.vw = innerWidth; this.cam.vh = innerHeight; this.cam.dpr = Math.max(1, s);
  }
  adaptQuality(dt: number) {
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    if (this.frameMs > 30) { this.slowFor += dt; this.fastFor = 0; } else if (this.frameMs < 17) { this.fastFor += dt; this.slowFor = 0; } else { this.slowFor = 0; this.fastFor = 0; }
    const minQ = 0.5 / Math.min(2, window.devicePixelRatio || 1);
    if (this.slowFor > 2 && this.quality > minQ) { this.quality = Math.max(minQ, this.quality * 0.8); this.slowFor = 0; this.resize(); }
    if (this.fastFor > 6 && this.quality < 1) { this.quality = Math.min(1, this.quality * 1.15); this.fastFor = 0; this.resize(); }
  }

  // ------------------------------------------------------------------ worlds
  startWorld(sim: Sim, slot: string) {
    this.sim = sim; this.slot = slot;
    this.scene.setSim(sim);
    this.cam.fit(sim.world.w, sim.world.h);
    this.cam.maxZoom = 64;
    sim.onEvent = (e) => this.onEvent(e);
    sim.favoriteDied = (name) => this.hint(`Your favourite ${name} has died.`);
    this.target = null; this.undo = [];
    this.buildHud();
    this.setSpeed(1);
    let seen = false;
    try { seen = localStorage.getItem('bcw-tips') === '1'; localStorage.setItem('bcw-tips', '1'); } catch { /* private mode */ }
    if (!seen) setTimeout(() => this.hint('Drag to look around, pinch to zoom. Pick a power below, then touch the world. Tap anyone to learn about them.'), 800);
  }

  newWorld(gen: GenOptions, start: StartOptions) {
    const sim = newWorld(gen, start);
    this.startWorld(sim, 'world-' + Date.now());
  }

  async save(silent = false) {
    if (!this.sim) return;
    try {
      const name = this.sim.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop)[0]?.short || 'Empty world';
      const { meta, data } = serialize(this.sim, `World of ${name}`);
      await saveWorld(this.slot, meta, data);
      if (!silent) this.hint('World saved.');
    } catch (e) { this.hint('Could not save: ' + (e as Error).message); }
  }

  async load(slot: string) {
    this.showLoading('Loading world…');
    try {
      const data = await loadWorld(slot);
      if (!data) throw new Error('The save is empty.');
      const sim = deserialize(data);
      this.closeMenu();
      this.startWorld(sim, slot);
    } catch (e) { this.closeMenu(); this.titleScreen(); this.hint('Could not load: ' + (e as Error).message); }
  }

  pushUndo() {
    if (!this.sim || performance.now() - this.undoAt < 2500) return;
    this.undoAt = performance.now();
    try { this.undo.push(serialize(this.sim).data); if (this.undo.length > 4) this.undo.shift(); } catch { /* memory */ }
    this.el.undo?.classList.toggle('on', this.undo.length > 0);
  }
  doUndo() {
    const d = this.undo.pop();
    if (!d) { this.hint('Nothing to undo.'); return; }
    const sim = deserialize(d);
    const cam = { x: this.cam.x, y: this.cam.y, z: this.cam.zoom };
    this.startWorld(sim, this.slot);
    this.cam.x = cam.x; this.cam.y = cam.y; this.cam.zoom = cam.z;
    this.hint('Undone.');
  }

  // ------------------------------------------------------------------ loop
  frame(t: number) {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000);
    this.last = t; this.time += dt;
    const sim = this.sim;
    if (sim && dt > 0) this.adaptQuality(dt);
    if (sim) {
      this.acc += dt * TICKS_PER_SEC * SPEEDS[this.speed];
      const t0 = performance.now();
      let steps = 0;
      const budget = this.speed >= 3 ? 26 : 14;
      while (this.acc >= 1 && performance.now() - t0 < budget) {
        this.scene.snapshot(); sim.step(); this.acc -= 1; steps++;
        if (this.brushHeld && steps % 2 === 1) this.applyHeld();
      }
      if (steps) this.perf.simMs = this.perf.simMs * 0.9 + (performance.now() - t0) / steps * 0.1;
      if (this.acc > 3) this.acc = 3;
      if (this.brushHeld && !steps && (t - this.lastApply > 70)) this.applyHeld();
      this.cam.update(dt);
      this.followStep();
      this.cam.clamp(sim.world.w, sim.world.h);
      if (this.overlayMode !== 'none' && t - this.overlayAt > 1000) { this.overlayAt = t; this.computeOverlay(); }
      const alpha = Math.min(1, this.acc);
      const td = performance.now();
      this.scene.draw(this.cam, SPEEDS[this.speed] ? alpha : 1, this.time, {
        borders: this.borders, tint: this.overlayMode === 'realms' ? 0.45 : 0, overlay: this.overlayMode !== 'none' && this.overlayMode !== 'realms' ? 0.7 : 0,
        labels: this.labels, cityBorders: this.overlayMode === 'realms',
      });
      this.perf.drawMs = this.perf.drawMs * 0.9 + (performance.now() - td) * 0.1;
      this.hud(t);
    } else {
      // title backdrop
      this.gl.clearColor(0.05, 0.08, 0.15, 1); this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    (window as any).__frames = ((window as any).__frames || 0) + 1;
    requestAnimationFrame((tt) => this.frame(tt));
  }

  followStep() {
    if (!this.following || !this.sim || this.target?.kind !== 'unit') return;
    const u = this.sim.units.idx(this.target.uid);
    if (u < 0) { this.following = false; return; }
    const k = 0.12;
    this.cam.x += (this.sim.units.x[u] - this.cam.x) * k; this.cam.y += (this.sim.units.y[u] - this.cam.y) * k;
  }

  setSpeed(i: number) {
    this.speed = i;
    this.el.speed?.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
  }

  // ------------------------------------------------------------------ input
  pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  pinch: { d: number; cx: number; cy: number } | null = null;
  brushHeld = false; heldX = 0; heldY = 0; lastApply = 0; dragMoved = false;

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      if (!this.sim) return;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      this.dragMoved = false;
      if (this.pointers.size === 2) { this.brushHeld = false; this.startPinch(); return; }
      const p = POWER_BY_ID[this.power];
      if (e.button === 0 && this.pointers.size === 1 && p && (p.kind === 'brush' || p.kind === 'drag' || p.kind === 'spawn')) {
        this.pushUndo();
        this.brushHeld = true; this.heldX = e.clientX; this.heldY = e.clientY;
        this.pstate.lastX = undefined; this.pstate.lastY = undefined;
        this.applyHeld();
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.sim) return;
      const [wx, wy] = this.cam.screenToWorld(e.clientX, e.clientY);
      const p = POWER_BY_ID[this.power];
      this.scene.brush = p && (p.kind === 'brush') ? { x: wx, y: wy, r: this.brushR, color: 'rgba(255,224,122,0.8)' } : null;
      const pt = this.pointers.get(e.pointerId);
      if (!pt) return;
      const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      pt.x = e.clientX; pt.y = e.clientY;
      if (Math.abs(pt.x - pt.sx) + Math.abs(pt.y - pt.sy) > 8) this.dragMoved = true;
      if (this.pointers.size >= 2) { this.movePinch(); return; }
      if (this.brushHeld) { this.heldX = e.clientX; this.heldY = e.clientY; return; }
      // pan
      this.cam.x -= dx / this.cam.zoom; this.cam.y -= dy / this.cam.zoom; this.cam.target = null;
      if (this.dragMoved) this.following = false;
    });
    const up = (e: PointerEvent) => {
      const pt = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!pt || !this.sim) { this.brushHeld = false; return; }
      const wasBrush = this.brushHeld;
      this.brushHeld = false;
      if (e.type === 'pointercancel') return;
      const quick = performance.now() - pt.t < 450 && !this.dragMoved;
      if (quick && !wasBrush && this.pointers.size === 0) this.tap(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse') this.scene.brush = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.target = null; this.cam.zoomAt(e.clientX, e.clientY, Math.pow(1.0015, -e.deltaY)); }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!this.sim || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === ' ') { this.setSpeed(this.speed ? 0 : 1); e.preventDefault(); }
      if (e.key >= '1' && e.key <= '4') this.setSpeed(+e.key);
      if (e.key === 'Escape') this.back();
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) this.doUndo();
    });
  }
  startPinch() {
    const ps = [...this.pointers.values()];
    this.pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), cx: (ps[0].x + ps[1].x) / 2, cy: (ps[0].y + ps[1].y) / 2 };
  }
  movePinch() {
    const ps = [...this.pointers.values()];
    if (!this.pinch || ps.length < 2) return;
    const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    const cx = (ps[0].x + ps[1].x) / 2, cy = (ps[0].y + ps[1].y) / 2;
    this.cam.x -= (cx - this.pinch.cx) / this.cam.zoom; this.cam.y -= (cy - this.pinch.cy) / this.cam.zoom;
    this.cam.zoomAt(cx, cy, d / Math.max(1, this.pinch.d));
    this.pinch = { d, cx, cy }; this.cam.target = null; this.dragMoved = true;
  }
  applyHeld() {
    if (!this.sim) return;
    const p = POWER_BY_ID[this.power];
    const now = performance.now();
    if (p.kind === 'spawn' && now - this.lastApply < 160) return;
    this.lastApply = now;
    const [wx, wy] = this.cam.screenToWorld(this.heldX, this.heldY);
    const msg = applyPower(this.sim, this.power, wx, wy, this.brushR, this.pstate);
    if (msg) this.hint(msg); else this.powerSound(this.power);
  }
  powerSound(id: string) {
    if (id.startsWith('spawn:') || id === 'tribe') return sfx('spawn');
    const m: Record<string, string> = { meteor: 'boom', bomb: 'boom', nuke: 'nuke', lightning: 'thunder', quake: 'quake', volcano: 'quake', fire: 'fire', rain: 'rain', blizzard: 'rain', bless: 'bless', heal: 'bless', harvest: 'bless', fertility: 'bless', spark: 'bless', hero: 'fanfare', immortal: 'bless', inspire: 'bless', gold: 'bless', curse: 'curse', madness: 'curse', zombify: 'curse', plague: 'curse', erase: 'boom', war: 'war', rebel: 'war', peace: 'bell', alliance: 'bell', crown: 'fanfare', faith: 'bell', tech: 'fanfare', tornado: 'thunder', flood: 'rain' };
    sfx(m[id] || 'paint');
  }

  tap(sx: number, sy: number) {
    const sim = this.sim!;
    const [wx, wy] = this.cam.screenToWorld(sx, sy);
    const p = POWER_BY_ID[this.power];
    if (this.power === 'inspect' || this.power === 'follow') {
      const r = Math.max(0.8, 14 / this.cam.zoom);
      const u = unitAt(sim, wx, wy + 0.2, r);
      if (u >= 0) {
        this.select({ kind: 'unit', uid: sim.units.uid[u] });
        if (this.power === 'follow') this.following = true;
        return;
      }
      const w = sim.world;
      if (!w.inb(Math.floor(wx), Math.floor(wy))) return;
      const i = w.tileAt(wx, wy);
      const b = w.bld[i] - 1;
      if (b >= 0 && sim.cities[sim.buildings[b].city]) { this.select({ kind: 'city', id: sim.buildings[b].city }); return; }
      if (w.owner[i] && this.cam.zoom < 6) { this.select({ kind: 'city', id: w.owner[i] - 1 }); return; }
      this.select({ kind: 'tile', i });
      return;
    }
    if (p && p.kind === 'tap') {
      if (p.id !== 'favorite' && p.id !== 'patron') this.pushUndo();
      const msg = applyPower(sim, this.power, wx, wy, this.brushR, this.pstate);
      if (msg) this.hint(msg); else this.powerSound(this.power);
      if (this.power === 'patron') this.buildHud();
      if (this.power === 'possess' && this.pstate.possessed !== undefined) { this.target = { kind: 'unit', uid: this.pstate.possessed }; this.scene.selected = sim.units.idx(this.pstate.possessed); this.scene.selectedUid = this.pstate.possessed; this.following = true; }
    }
  }

  // ------------------------------------------------------------------ events and toasts
  onEvent(e: HEvent) {
    const sim = this.sim!;
    const patron = sim.patron >= 0 && (e.k === sim.patron || e.k2 === sim.patron);
    if (e.imp < 2 && !patron && e.kind !== 'fav') return;
    sfx(e.kind === 'war' || e.kind === 'rebel' || e.kind === 'coalition' ? 'war' : e.kind === 'era' || e.kind === 'golden' || e.kind === 'stars' || e.kind === 'hero' ? 'fanfare' : e.kind === 'fav' || e.kind === 'death' ? 'death' : 'bell');
    const k = e.k !== undefined ? sim.kingdoms[e.k] : null;
    const el = h('div', { class: 'toast panel' + (e.imp >= 2 ? ' big' : ''), style: { '--k': k ? hex(k.color) : 'var(--dim)' } as any },
      h('span', { class: 'y' }, 'Y' + sim.year), h('span', {}, e.text));
    el.addEventListener('click', () => { this.cam.flyTo(e.x + 0.5, e.y + 0.5, Math.max(this.cam.zoom, 10)); this.following = false; });
    this.el.toasts.prepend(el);
    this.toastsList.unshift({ el, until: performance.now() + 7000 });
    while (this.toastsList.length > 4) this.toastsList.pop()!.el.remove();
    // auto-pause on great events for the patron
    if (patron && (e.kind === 'war' || e.kind === 'capture') && sim.kingdoms[sim.patron]) this.hint(`News from ${sim.kingdoms[sim.patron].name}!`);
  }

  hint(msg: string) {
    const el = this.el.hint;
    if (!el) return;
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => { el.style.opacity = "0"; }, Math.max(2600, msg.length * 55));
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    const ui = this.ui;
    ui.innerHTML = '';
    const sim = this.sim!;
    // top bar
    const menuBtn = h('button', { class: 'iconbtn', 'aria-label': 'Menu', onclick: () => this.gameMenu() }, '☰');
    const year = h('span', { class: 'year' }); const meta = h('span', { class: 'meta' });
    this.el.year = year; this.el.meta = meta;
    const speed = h('div', { class: 'panel speed' }, ...SPEED_LABELS.map((l, i) => h('button', { onclick: () => this.setSpeed(i), 'aria-label': i ? `Speed ${l}` : 'Pause' }, l)));
    this.el.speed = speed;
    const ib = (name: string, label: string, fn: () => void) => { const b = h('button', { class: 'iconbtn', 'aria-label': label, title: label, onclick: fn }, h('img', { src: icon(name), alt: '' })); return b; };
    const undo = ib('lower', 'Undo', () => this.doUndo()); undo.innerHTML = '↶'; this.el.undo = undo;
    const right = h('div', { class: 'panel side' },
      undo,
      ib('book', 'Chronicle', () => this.select({ kind: 'panel', id: 'chronicle' })),
      ib('crown', 'Realms', () => this.select({ kind: 'panel', id: 'realms' })),
      ib('idea', 'Graphs', () => this.select({ kind: 'panel', id: 'graphs' })),
      ib('eye', 'Map', () => this.select({ kind: 'panel', id: 'map' })),
      ib('temple', 'World laws', () => this.select({ kind: 'panel', id: 'laws' })),
    );
    ui.append(h('div', { class: 'top' }, h('div', { class: 'panel clock' }, menuBtn, year, meta), h('div', { class: 'spacer' }), speed, right));
    // toasts and hint
    this.el.toasts = h('div', { class: 'toasts' });
    this.el.hint = h('div', { class: 'hint panel', style: { opacity: '0' } });
    ui.append(this.el.toasts, this.el.hint);
    // toolbar
    const cats = h('div', { class: 'panel cats' });
    const powers = h('div', { class: 'panel powers' });
    const brushIn = h('input', { type: 'range', min: '1', max: '12', step: '1', value: String(this.brushR), 'aria-label': 'Brush size' }) as HTMLInputElement;
    const brushVal = h('span', {}, String(this.brushR));
    brushIn.addEventListener('input', () => { this.brushR = +brushIn.value; brushVal.textContent = brushIn.value; });
    const brush = h('div', { class: 'panel brush' }, h('label', {}, 'Brush', brushVal), brushIn);
    this.el.brush = brush;
    ui.append(h('div', { class: 'tools' }, cats, h('div', { class: 'row' }, powers, brush)));
    const showCat = (id: string) => {
      if (this.cat !== id) sfx('tab');
      this.cat = id;
      cats.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
      powers.innerHTML = '';
      for (const p of POWERS.filter(p => p.cat === id)) {
        const b = h('button', { class: 'power' + (p.id === this.power ? ' on' : ''), title: p.desc, 'aria-label': p.name, onclick: () => this.choosePower(p.id) },
          h('img', { src: icon(p.icon), alt: '' }), h('span', {}, p.name));
        b.dataset.id = p.id;
        powers.append(b);
      }
      powers.scrollLeft = 0;
    };
    for (const c of CATEGORIES) { const b = h('button', { onclick: () => showCat(c.id) }, c.name); b.dataset.cat = c.id; cats.append(b); }
    this.el.powers = powers;
    showCat(this.cat);
    this.updateBrushVis();
    // sheet
    this.el.sheet = h('div', { class: 'sheet panel', style: { display: 'none' } });
    ui.append(this.el.sheet);
    this.el.sheet.addEventListener('click', (e) => {
      const go = (e.target as HTMLElement).closest('[data-go]') as HTMLElement | null;
      if (go) this.go(go.dataset.go!);
    });
    this.setSpeed(this.speed);
    void sim;
  }

  choosePower(id: string) {
    sfx('click');
    if (this.sim) release(this.sim, this.pstate);
    this.power = id; this.pstate = { race: this.pstate.race };
    this.el.powers.querySelectorAll('.power').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.id === id));
    const p = POWER_BY_ID[id];
    if (p.r) { this.brushR = p.r; const inp = this.el.brush.querySelector('input') as HTMLInputElement; inp.value = String(p.r); this.el.brush.querySelector('span')!.textContent = String(p.r); }
    this.updateBrushVis();
    this.hint(p.kind === 'brush' || p.kind === 'drag' || p.kind === 'spawn' ? `${p.desc} Move the map with two fingers.` : p.desc);
    if (p.kind !== 'brush') this.scene.brush = null;
  }
  updateBrushVis() { const p = POWER_BY_ID[this.power]; this.el.brush.style.visibility = p && p.kind === 'brush' ? 'visible' : 'hidden'; }

  hud(t: number) {
    const sim = this.sim!;
    if (t - this.sheetRefresh > 600) {
      this.sheetRefresh = t;
      this.el.year.textContent = `Year ${sim.year}`;
      const pop = sim.peopleCount;
      this.el.meta.textContent = `${SEASON_NAMES[sim.season]}  ·  ${sim.ageName}  ·  ${fmt(pop)} people, ${sim.kingdoms.filter(k => k.alive).length} realms`;
      if (this.target) this.renderSheet(true);
      const now = performance.now();
      for (const ts of this.toastsList) if (now > ts.until) ts.el.classList.add('fade');
      this.toastsList = this.toastsList.filter(ts => { if (now > ts.until + 800) { ts.el.remove(); return false; } return true; });
    }
  }

  // ------------------------------------------------------------------ inspector
  go(s: string) {
    const [kind, id] = s.split(':');
    const sim = this.sim!;
    if (kind === 'pos') { const [x, y] = id.split(',').map(Number); this.cam.flyTo(x + 0.5, y + 0.5, Math.max(this.cam.zoom, 10)); return; }
    if (kind === 'unit') { const u = sim.units.idx(+id); if (u < 0) { this.hint('They are no longer alive.'); return; } this.select({ kind: 'unit', uid: +id }); this.cam.flyTo(sim.units.x[u], sim.units.y[u], Math.max(this.cam.zoom, 14)); return; }
    if (kind === 'city') { const c = sim.cities[+id]; this.select({ kind: 'city', id: +id }); this.cam.flyTo(c.x + 1, c.y + 1, Math.max(this.cam.zoom, 8)); return; }
    if (kind === 'kingdom') { const k = sim.kingdoms[+id]; this.select({ kind: 'kingdom', id: +id }); const c = sim.cities[k.capital]; if (c && k.alive) this.cam.flyTo(c.x + 1, c.y + 1, Math.min(Math.max(this.cam.zoom, 3), 6)); return; }
    this.select({ kind: kind as any, id: +id } as Target);
  }

  select(t: Target) {
    this.target = t; this.tab = 0;
    if (t.kind === 'unit' && this.sim) { const u = this.sim.units.idx(t.uid); this.scene.selected = u; this.scene.selectedUid = t.uid; }
    else { this.scene.selected = -1; }
    if (t.kind !== 'unit') this.following = false;
    this.renderSheet(false);
  }

  /** a picture of a creature for the inspector, painted from its sprite */
  portrait(u: number): HTMLElement | null {
    const sc = this.scene, sim = this.sim!;
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48; c.className = 'portrait';
    const g = c.getContext('2d')!;
    g.fillStyle = '#2a3550'; g.fillRect(0, 0, 48, 48);
    const d = SPECIES[sim.units.spec[u]];
    // paint again on the CPU so marker colours can be resolved for this creature
    import('../render/creatures').then(cr => {
      const p = d.sapient ? cr.paintPerson({ build: d.build || 'human', female: sim.units.sex[u] === 1, frame: 0, gear: sc.gearOf(u), tier: Math.max(sim.units.weapon[u], sim.units.armor[u]), hair: sim.units.uid[u] % 6 }) : cr.paintAnimal(d.key, 0);
      const t1 = sc.unitTint1(u), t2 = sc.unitTint2(u);
      for (let i = 0; i < p.d.length; i += 4) {
        const a = p.d[i + 3];
        if (a === 204 || a === 153) { const t = a === 204 ? t1 : t2, k = p.d[i] / 160; p.d[i] = Math.min(255, ((t >> 16) & 255) * k); p.d[i + 1] = Math.min(255, ((t >> 8) & 255) * k); p.d[i + 2] = Math.min(255, (t & 255) * k); p.d[i + 3] = 255; }
        else if (a === 102) p.d[i + 3] = 255; else if (a < 90) p.d[i + 3] = 0;
      }
      const tmp = document.createElement('canvas'); tmp.width = p.w; tmp.height = p.h;
      tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.d), p.w, p.h), 0, 0);
      const k = Math.max(1, Math.floor(Math.min(44 / p.w, 44 / p.h)));
      g.imageSmoothingEnabled = false;
      g.drawImage(tmp, Math.round((48 - p.w * k) / 2), Math.round((48 - p.h * k) / 2), p.w * k, p.h * k);
    });
    return c;
  }

  closeSheet() { this.target = null; this.following = false; this.scene.selected = -1; this.el.sheet.style.display = 'none'; }

  back() {
    if (document.querySelector('.menu')) { if (this.sim) this.closeMenu(); return; }
    if (this.target) { this.closeSheet(); return; }
    if (this.sim) this.gameMenu();
  }

  viewFor(t: Target): V.View | null {
    const sim = this.sim!;
    switch (t.kind) {
      case 'unit': { const u = sim.units.idx(t.uid); if (u < 0) { const ch = sim.chars.find(c => c.uid === t.uid); return ch ? V.charView(sim, ch.id) : null; } return V.unitView(sim, u, this.following); }
      case 'city': return V.cityView(sim, t.id);
      case 'kingdom': return V.kingdomView(sim, t.id);
      case 'war': return V.warView(sim, t.id);
      case 'char': { const ch = sim.chars[t.id]; const u = ch && ch.died < 0 ? sim.units.idx(ch.uid) : -1; return u >= 0 ? V.unitView(sim, u, this.following) : V.charView(sim, t.id); }
      case 'species': return V.speciesView(sim, t.id);
      case 'religion': return V.religionView(sim, t.id);
      case 'tile': return V.tileView(sim, t.i);
      case 'panel': return this.panelView(t.id);
    }
  }

  renderSheet(refresh: boolean) {
    const sheet = this.el.sheet;
    if (!this.target) { sheet.style.display = 'none'; return; }
    const v = this.viewFor(this.target);
    if (!v) { this.closeSheet(); return; }
    if (refresh && this.target.kind === 'panel' && (this.target.id === 'laws' || this.target.id === 'map' || this.target.id === 'menu')) return;
    const body = sheet.querySelector('.body') as HTMLElement | null;
    const scroll = body ? body.scrollTop : 0;
    if (this.tab >= v.tabs.length) this.tab = 0;
    if (refresh && body && sheet.dataset.key === JSON.stringify(this.target) + this.tab) {
      // only the body changes
      body.innerHTML = v.tabs[this.tab].html();
      (sheet.querySelector('h2') as HTMLElement).textContent = v.title;
      this.afterBody(body);
      return;
    }
    sheet.dataset.key = JSON.stringify(this.target) + this.tab;
    sheet.style.display = 'flex';
    sheet.innerHTML = '';
    const head = h('header', {}, h('div', { style: { flex: '1', minWidth: '0' } }, h('h2', {}, v.title), h('div', { class: 'sub' }, v.sub)), h('button', { class: 'close', 'aria-label': 'Close', onclick: () => this.closeSheet() }, '✕'));
    const pu = this.target.kind === 'unit' ? this.sim!.units.idx(this.target.uid) : -1;
    if (pu >= 0) { const img = this.portrait(pu); if (img) head.prepend(img); }
    const bk = this.target.kind === 'kingdom' ? this.sim!.kingdoms[this.target.id] : this.target.kind === 'city' ? this.sim!.kingdoms[this.sim!.cities[this.target.id].kingdom] : null;
    if (bk) head.prepend(h('img', { class: 'portrait', src: banner(bk.color, bk.color2, bk.banner), alt: '', style: { width: '36px', height: '48px' } }));
    if (v.color !== undefined) head.style.boxShadow = `inset 4px 0 0 ${hex(v.color)}`;
    sheet.append(head);
    if (v.actions && v.actions.length) sheet.append(h('div', { class: 'actions', style: { padding: '0 12px' } }, ...v.actions.map(a => h('button', { class: a.on ? 'on' : '', onclick: () => this.action(a.id) }, a.label))));
    if (v.tabs.length > 1) sheet.append(h('div', { class: 'tabs' }, ...v.tabs.map((tb, i) => h('button', { class: i === this.tab ? 'on' : '', onclick: () => { this.tab = i; this.renderSheet(false); } }, tb.name))));
    const b = h('div', { class: 'body', html: v.tabs[this.tab].html() });
    sheet.append(b);
    b.scrollTop = refresh ? scroll : 0;
    this.afterBody(b);
  }

  afterBody(body: HTMLElement) {
    const c = body.querySelector('canvas.chart') as HTMLCanvasElement | null;
    if (c) this.drawChart(c, c.dataset.mode || 'realms');
    body.querySelectorAll('[data-law]').forEach((el) => {
      const inp = el as HTMLInputElement;
      inp.addEventListener('change', () => {
        const k = inp.dataset.law!;
        (this.sim!.laws as any)[k] = inp.type === 'checkbox' ? inp.checked : +inp.value;
      });
    });
    body.querySelectorAll('[data-map]').forEach((el) => el.addEventListener('click', () => { this.overlayMode = (el as HTMLElement).dataset.map!; this.overlayAt = 0; this.renderSheet(false); }));
    body.querySelectorAll('[data-sound]').forEach((el) => el.addEventListener('change', () => { setSound((el as HTMLInputElement).checked); sfx('click'); }));
    body.querySelectorAll('[data-opt]').forEach((el) => el.addEventListener('change', () => { const k = (el as HTMLElement).dataset.opt!; (this as any)[k] = (el as HTMLInputElement).checked; }));
    body.querySelectorAll('[data-age]').forEach((el) => el.addEventListener('click', () => { import('../sim/nature').then(n => n.setAge(this.sim!, (el as HTMLElement).dataset.age!, 30)); }));
  }

  action(id: string) {
    const sim = this.sim!, t = this.target;
    if (!t) return;
    if (t.kind === 'unit' || t.kind === 'char') {
      const uid = t.kind === 'unit' ? t.uid : sim.chars[t.id].uid;
      const u = sim.units.idx(uid);
      if (u < 0) return;
      if (id === 'follow') { this.following = !this.following; if (this.following) this.cam.zoom = Math.max(this.cam.zoom, 12); }
      if (id === 'fav') { sim.units.flags[u] ^= UF.Fav; if (sim.units.flags[u] & UF.Fav) import('../sim/people').then(p => p.makeNotable(sim, u)); }
    }
    if (t.kind === 'kingdom' && id === 'patron') { for (const k of sim.kingdoms) k.favored = false; sim.kingdoms[t.id].favored = true; sim.patron = t.id; this.hint(`You now watch over ${sim.kingdoms[t.id].name}.`); }
    this.renderSheet(false);
  }

  // ------------------------------------------------------------------ panels
  panelView(id: string): V.View {
    const sim = this.sim!;
    switch (id) {
      case 'chronicle': return { title: 'Chronicle', sub: `Year ${sim.year}, ${sim.ageName}`, tabs: [
        { name: 'Great events', html: () => V.eventsHtml(sim, null, e => e.imp >= 2, 120) },
        { name: 'Everything', html: () => V.eventsHtml(sim, null, e => e.imp >= 1, 150) },
        { name: 'Wars', html: () => V.eventsHtml(sim, null, e => ['war', 'peace', 'capture', 'raze', 'rebel', 'coalition'].includes(e.kind), 120) },
        { name: 'Lives', html: () => V.eventsHtml(sim, null, e => ['hero', 'ruler', 'death', 'religion', 'genius', 'fav'].includes(e.kind), 120) },
      ] };
      case 'realms': return { title: 'Realms', sub: `${sim.kingdoms.filter(k => k.alive).length} realms, ${sim.wars.filter(w => w.active).length} wars`, tabs: [
        { name: 'Realms', html: () => '<div class="list">' + sim.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop).map(k => `<button class="item" data-go="kingdom:${k.id}"><img src="${banner(k.color, k.color2, k.banner)}" alt="" style="width:18px;height:24px;image-rendering:pixelated"><b>${esc(k.name)}</b><small>${fmt(k.pop)} · ${k.cities.length} town${k.cities.length === 1 ? "" : "s"} · ${esc(ERAS[k.era])}</small></button>`).join('') + '</div>' },
        { name: 'Wars', html: () => { const ws = sim.wars.slice().reverse().slice(0, 60); return ws.length ? '<div class="list">' + ws.map(w => `<button class="item" data-go="war:${w.id}"><b>${esc(w.name)}</b><small>${w.active ? 'ongoing' : 'over'}</small></button>`).join('') + '</div>' : '<p>The world has known no war. Yet.</p>'; } },
        { name: 'Faiths', html: () => { const rs = sim.religions.filter(r => r.alive).sort((a, b) => b.followers - a.followers); return rs.length ? '<div class="list">' + rs.map(r => `<button class="item" data-go="religion:${r.id}"><span class="swatch" style="background:${hex(r.color)}"></span><b>${esc(r.name)}</b><small>${fmt(r.followers)}</small></button>`).join('') + '</div>' : '<p>No one has founded a faith yet.</p>'; } },
        { name: 'Species', html: () => '<div class="list">' + sim.subs.filter(s => s.pop > 0).sort((a, b) => b.pop - a.pop).map(s => `<button class="item" data-go="species:${s.id}"><b>${esc(s.name)}</b><small>${fmt(s.pop)}${s.sapient ? ' · thinking' : ''}</small></button>`).join('') + '</div>' },
        { name: 'Heroes', html: () => { const hs = sim.chars.filter(c => c.died < 0 && (c.hero || c.titles.length)).sort((a, b) => b.fame - a.fame).slice(0, 60); return hs.length ? '<div class="list">' + hs.map(c => `<button class="item" data-go="char:${c.id}"><b>${esc(c.name)}</b><small>${esc(c.titles[0] || '')}</small></button>`).join('') + '</div>' : '<p>No heroes yet.</p>'; } },
      ] };
      case 'graphs': return { title: 'Graphs', sub: 'Over the years', tabs: [
        { name: 'Realms', html: () => '<canvas class="chart" data-mode="realms"></canvas><p><small>People in the six largest realms.</small></p>' },
        { name: 'World', html: () => '<canvas class="chart" data-mode="world"></canvas><p><small>Thinking people (gold) and animals (green).</small></p>' },
        { name: 'Peoples', html: () => '<canvas class="chart" data-mode="species"></canvas><p><small>Each thinking race.</small></p>' },
        { name: 'Deaths', html: () => { const d = Object.entries(sim.deaths).sort((a, b) => b[1] - a[1]).slice(0, 18); return `<dl class="kv">${d.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${fmt(v)}</dd>`).join('')}</dl>`; } },
      ] };
      case 'map': return { title: 'Map', sub: 'How the world is shown', tabs: [{ name: 'Map', html: () => {
        const modes: [string, string][] = [['none', 'Plain'], ['realms', 'Realms'], ['cultures', 'Peoples'], ['faiths', 'Faiths'], ['density', 'Population'], ['height', 'Height'], ['heat', 'Temperature'], ['fertile', 'Fertility'], ['ore', 'Ore']];
        return `<div class="actions">${modes.map(([k, n]) => `<button data-map="${k}" class="${this.overlayMode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <label class="toggle"><span>Names on the map</span><input type="checkbox" data-opt="labels" ${this.labels ? 'checked' : ''}></label>
          <label class="toggle"><span>Borders</span><input type="checkbox" data-opt="borders" ${this.borders ? 'checked' : ''}></label>
          <label class="toggle"><span>Sounds</span><input type="checkbox" data-sound="1" ${soundOn ? 'checked' : ''}></label>`;
      } }] };
      case 'laws': return { title: 'World laws', sub: 'The rules your world runs by', tabs: [{ name: 'Laws', html: () => {
        const L = sim.laws;
        const t = (k: string, n: string, d: string) => `<label class="toggle"><span>${n}<small>${d}</small></span><input type="checkbox" data-law="${k}" ${L[k] ? 'checked' : ''}></label>`;
        return t('births', 'Births', 'Creatures have young.') + t('oldAge', 'Old age', 'Creatures die when they get old.') + t('hunger', 'Hunger', 'Everyone has to eat.') +
          t('evolution', 'Evolution', 'Genes drift and new subspecies appear.') + t('sapience', 'Awakening', 'Clever animals can become thinking peoples.') +
          t('wars', 'Wars', 'Realms may go to war.') + t('peace', 'Eternal peace', 'Nobody declares war.') + t('diplomacy', 'Diplomacy', 'Alliances, marriages, opinions.') +
          t('coalitions', 'Coalitions', 'Realms band together against a giant.') + t('rebellion', 'Rebellions', 'Unhappy towns rise up.') + t('expansion', 'Settlers', 'Crowded towns found new ones.') +
          t('plagues', 'Plagues', 'Diseases break out.') + t('disasters', 'Disasters', 'Earthquakes, meteors, volcanoes.') + t('monsters', 'Monsters', 'Dragons and worse appear.') +
          t('undead', 'Restless dead', 'The dead can rise.') + t('crime', 'Crime', 'Thieves and bandits.') + t('ages', 'Ages', 'Ice ages, dark ages, ages of magic.') + t('dayNight', 'Day and night', 'The world gets dark at night.') +
          `<label class="toggle"><span>Speed of ideas<small>How fast realms discover things.</small></span><input type="range" min="0.25" max="4" step="0.25" value="${L.techSpeed}" data-law="techSpeed"></label>` +
          `<label class="toggle"><span>Creature limit<small>More is slower on old phones.</small></span><input type="range" min="2000" max="16000" step="1000" value="${L.maxUnits}" data-law="maxUnits"></label>` +
          `<div class="sec">Start an age</div><div class="actions">${AGE_LIST.map(a => `<button data-age="${a.kind}" title="${esc(a.desc)}">${esc(a.name.replace('Age of ', ''))}</button>`).join('')}</div>`;
      } }] };
    }
    return { title: id, sub: '', tabs: [{ name: '', html: () => '' }] };
  }

  drawChart(c: HTMLCanvasElement, mode: string) {
    const sim = this.sim!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = c.clientWidth || 340, H = c.clientHeight || 180;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d')!; g.scale(dpr, dpr);
    g.fillStyle = '#1a2133'; g.fillRect(0, 0, W, H);
    const st = sim.stats;
    if (st.length < 2) { g.fillStyle = '#a9a58f'; g.font = '13px Inter'; g.fillText('Let a few years pass first.', 12, 24); return; }
    const series: { color: string; v: number[] }[] = [];
    if (mode === 'world') { series.push({ color: '#e2b54a', v: st.map(s => s.pop) }, { color: '#79c47a', v: st.map(s => s.animals) }); }
    else if (mode === 'species') {
      for (const d of SPECIES.filter(s => s.sapient)) { const v = st.map(s => s.bySpecies[d.id] || 0); if (Math.max(...v) > 0) series.push({ color: hex(d.color), v }); }
    } else {
      const ks = sim.kingdoms.slice().sort((a, b) => b.peakPop - a.peakPop).slice(0, 6);
      for (const k of ks) series.push({ color: hex(k.color), v: st.map(s => s.byKingdom[k.id] || 0) });
    }
    let max = 1; for (const s of series) for (const v of s.v) max = Math.max(max, v);
    const pad = 24;
    g.strokeStyle = '#2a3550'; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const y = pad / 2 + (H - pad) * k / 4; g.beginPath(); g.moveTo(pad, y); g.lineTo(W - 6, y); g.stroke(); }
    g.fillStyle = '#a9a58f'; g.font = '10px Pixelify, monospace';
    g.fillText(fmt(max), 2, pad / 2 + 4); g.fillText('Y' + st[0].year, pad, H - 4); g.fillText('Y' + st[st.length - 1].year, W - 40, H - 4);
    for (const s of series) {
      g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
      s.v.forEach((v, i) => { const x = pad + (W - pad - 6) * i / (s.v.length - 1), y = pad / 2 + (H - pad) * (1 - v / max); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  }

  computeOverlay() {
    const sim = this.sim!, w = sim.world, sc = this.scene.terrain;
    if (!sc.overlay || sc.overlay.length !== w.n * 4) sc.overlay = new Uint8Array(w.n * 4);
    const o = sc.overlay;
    o.fill(0);
    const set = (i: number, c: number, a = 220) => { o[i * 4] = (c >> 16) & 255; o[i * 4 + 1] = (c >> 8) & 255; o[i * 4 + 2] = c & 255; o[i * 4 + 3] = a; };
    const m = this.overlayMode;
    if (m === 'cultures' || m === 'faiths') {
      for (let i = 0; i < w.n; i++) { const c = w.owner[i] - 1; if (c < 0) continue; const city = sim.cities[c]; const id = m === 'cultures' ? city.culture : city.religion; if (id < 0) continue; set(i, m === 'cultures' ? sim.cultures[id].color : sim.religions[id].color, 200); }
    } else if (m === 'density') {
      const cnt = new Uint16Array(w.n);
      const U = sim.units;
      for (let u = 0; u < U.hi; u++) if (U.alive[u]) { const t = w.tileAt(U.x[u], U.y[u]); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const j = t + dy * w.w + dx; if (j >= 0 && j < w.n) cnt[j]++; } }
      for (let i = 0; i < w.n; i++) if (cnt[i]) { const v = Math.min(1, cnt[i] / 30); set(i, ((255 * v) << 16) | ((80 + 100 * (1 - v)) << 8) | 40, 90 + v * 150); }
    } else if (m === 'height') {
      for (let i = 0; i < w.n; i++) { const v = Math.round(w.height[i] * 255); set(i, (v << 16) | (v << 8) | v, 200); }
    } else if (m === 'heat') {
      for (let i = 0; i < w.n; i++) { const t = Math.max(0, Math.min(1, (w.temp[i] + 25) / 60)); set(i, (Math.round(255 * t) << 16) | (Math.round(80 + 60 * (1 - Math.abs(t - 0.5) * 2)) << 8) | Math.round(255 * (1 - t)), 190); }
    } else if (m === 'fertile') {
      for (let i = 0; i < w.n; i++) { const f = BIOMES[w.biome[i]].fert * (0.5 + w.moist[i] / 510); if (!w.isWater(i)) set(i, (Math.round(200 * (1 - f)) << 16) | (Math.round(80 + 170 * f) << 8) | 40, 180); }
    } else if (m === 'ore') {
      for (let i = 0; i < w.n; i++) if (w.ore[i]) set(i, ORE_COLORS[w.ore[i]] || 0xffffff, 255); else if (!w.isWater(i)) set(i, 0x202020, 150);
    }
    sc.overlayDirty = true;
  }

  // ------------------------------------------------------------------ menus
  menuEl: HTMLElement | null = null;
  closeMenu() { this.menuEl?.remove(); this.menuEl = null; }
  showLoading(text: string) {
    this.closeMenu();
    this.menuEl = h('div', { class: 'menu' }, h('div', { class: 'card panel' }, h('p', { class: 'loading' }, text)));
    this.ui.append(this.menuEl);
  }

  async titleScreen() {
    this.sim = null;
    this.ui.innerHTML = '';
    const saves = await listWorlds().catch(() => []);
    const card = h('div', { class: 'card panel' },
      h('h1', { class: 'title' }, 'Big Crazy World', h('small', {}, 'Make a world. Watch it live.')),
      h('p', { class: 'lead' }, 'Raise continents, seed them with life, and watch peoples settle, grow, pray, trade, fight and fall over thousands of years.'),
      h('button', { class: 'bigbtn primary', onclick: () => this.creator() }, 'New world'),
      saves.length ? h('button', { class: 'bigbtn', onclick: () => this.load(saves[0].slot) }, `Continue: ${saves[0].meta.name}, year ${saves[0].meta.year}`) : null,
      saves.length ? h('button', { class: 'bigbtn', onclick: () => this.loadMenu() }, 'Saved worlds') : null,
      h('button', { class: 'bigbtn', onclick: () => { const g = { ...DEFAULT_GEN, seed: Math.random().toString(36).slice(2, 8), shape: 'random' as Shape }; this.showLoading('Shaping the land…'); setTimeout(() => { this.closeMenu(); this.newWorld(g, DEFAULT_START); }, 30); } }, 'Quick start'),
    );
    this.menuEl = h('div', { class: 'menu' }, card);
    this.ui.append(this.menuEl);
  }

  async loadMenu() {
    const saves = await listWorlds().catch(() => []);
    this.closeMenu();
    const list = h('div', { class: 'list saves' });
    for (const s of saves) {
      const row = h('div', { style: { display: 'flex', gap: '4px' } },
        h('button', { class: 'item', style: { flex: '1' }, onclick: () => this.load(s.slot) }, h('b', {}, s.meta.name), h('small', {}, `Year ${s.meta.year} · ${fmt(s.meta.pop)} people · ${new Date(s.meta.saved).toLocaleDateString()}`)),
        h('button', { class: 'item', style: { width: '64px', justifyContent: 'center' }, onclick: async () => { await deleteWorld(s.slot); this.loadMenu(); } }, 'Delete'));
      list.append(row);
    }
    this.menuEl = h('div', { class: 'menu' }, h('div', { class: 'card panel' }, h('h1', { class: 'title', style: { fontSize: '34px' } }, 'Saved worlds'), saves.length ? list : h('p', {}, 'No saved worlds yet.'),
      h('button', { class: 'bigbtn', style: { marginTop: '12px' }, onclick: () => { this.closeMenu(); if (this.sim) return; this.titleScreen(); } }, 'Back')));
    this.ui.append(this.menuEl);
  }

  creator() {
    this.closeMenu();
    const gen: GenOptions = { ...DEFAULT_GEN, seed: Math.random().toString(36).slice(2, 8) };
    const start: StartOptions = { ...DEFAULT_START, races: [...DEFAULT_START.races] };
    const sel = (label: string, opts: [string, string][], value: string, on: (v: string) => void) => {
      const s = h('select', {}, ...opts.map(([v, n]) => h('option', { value: v, selected: v === value }, n))) as HTMLSelectElement;
      s.addEventListener('change', () => on(s.value));
      return h('label', {}, label, s);
    };
    const range = (label: string, min: number, max: number, step: number, value: number, on: (v: number) => void) => {
      const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
      r.addEventListener('input', () => on(+r.value));
      return h('label', {}, label, r);
    };
    const seed = h('input', { type: 'text', value: String(gen.seed), 'aria-label': 'Seed' }) as HTMLInputElement;
    seed.addEventListener('input', () => { gen.seed = seed.value || '1'; });
    const races = h('div', { class: 'races' });
    for (const d of SPECIES.filter(s => s.sapient)) {
      const b = h('button', { class: start.races.includes(d.key) ? 'on' : '', onclick: () => {
        const i = start.races.indexOf(d.key);
        if (i >= 0) start.races.splice(i, 1); else start.races.push(d.key);
        b.classList.toggle('on', start.races.includes(d.key));
      } }, h('img', { src: icon('sp:' + d.key), alt: '' }), h('span', {}, d.plural));
      races.append(b);
    }
    const form = h('div', { class: 'form' },
      sel('Size', [['128', 'Small island'], ['192', 'Medium'], ['256', 'Large'], ['384', 'Huge'], ['512', 'Enormous (slow)']], String(gen.w), (v) => { gen.w = gen.h = +v; }),
      sel('Shape', [['continents', 'Continents'], ['pangaea', 'One supercontinent'], ['archipelago', 'Archipelago'], ['islands', 'Islands'], ['lakes', 'Land of lakes'], ['random', 'Surprise me']], gen.shape, (v) => { gen.shape = v as Shape; }),
      sel('Climate', [['varied', 'Varied'], ['temperate', 'Temperate'], ['hot', 'Hot'], ['cold', 'Cold']], gen.climate, (v) => { gen.climate = v as Climate; }),
      sel('Tribes of each race', [['1', 'One'], ['2', 'Two'], ['3', 'Three'], ['4', 'Four']], String(start.tribes), (v) => { start.tribes = +v; }),
      range('Land', 0.2, 0.75, 0.05, gen.land, (v) => { gen.land = v; }),
      range('Mountains', 0, 1, 0.1, gen.mountains, (v) => { gen.mountains = v; }),
      range('Magic lands', 0, 1, 0.1, gen.magic, (v) => { gen.magic = v; }),
      range('Rivers', 0, 1, 0.1, gen.rivers, (v) => { gen.rivers = v; }),
      range('Wildlife', 0.2, 2, 0.1, start.animals, (v) => { start.animals = v; }),
      h('label', {}, 'Seed', seed),
      h('div', { style: { gridColumn: '1 / -1', font: '400 13px Pixelify, monospace', color: 'var(--dim)' } }, 'Starting peoples'),
      races,
    );
    const card = h('div', { class: 'card panel' }, h('h1', { class: 'title', style: { fontSize: '34px' } }, 'A new world'), form,
      h('button', { class: 'bigbtn primary', onclick: () => { this.showLoading('Shaping the land…'); setTimeout(() => { this.closeMenu(); this.newWorld({ ...gen }, { ...start }); }, 30); } }, 'Create world'),
      h('button', { class: 'bigbtn', onclick: () => { this.closeMenu(); this.titleScreen(); } }, 'Back'));
    this.menuEl = h('div', { class: 'menu' }, card);
    this.ui.append(this.menuEl);
  }

  gameMenu() {
    this.closeMenu();
    const wasSpeed = this.speed; this.setSpeed(0);
    const close = () => { this.closeMenu(); this.setSpeed(wasSpeed); };
    const card = h('div', { class: 'card panel' },
      h('h1', { class: 'title', style: { fontSize: '34px' } }, 'Paused'),
      h('button', { class: 'bigbtn primary', onclick: close }, 'Back to the world'),
      h('button', { class: 'bigbtn', onclick: async () => { await this.save(); close(); } }, 'Save world'),
      h('button', { class: 'bigbtn', onclick: () => this.loadMenu() }, 'Load a world'),
      h('button', { class: 'bigbtn', onclick: async () => { await this.save(true); this.creator(); } }, 'New world'),
      h('button', { class: 'bigbtn', onclick: async () => { await this.save(true); this.titleScreen(); } }, 'Save and quit to title'),
    );
    this.menuEl = h('div', { class: 'menu' }, card);
    this.ui.append(this.menuEl);
  }
}

export { SPECIES_BY_KEY, TICKS_PER_YEAR, cityAt };
