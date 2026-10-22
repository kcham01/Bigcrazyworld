// The simulation: owns the world and everything in it, and advances it one tick at a time.
// Nothing here touches the DOM, so the whole world can also run (and be tested) in Node.
import { World } from './world';
import { Rng, hash2 } from './rng';
import { TICKS_PER_YEAR, TICKS_PER_SEASON, BIOMES, B } from './defs';
import { Units, St, UF, T, Job } from './units';
import { G, Gene, gmul, inherit } from './genetics';
import { SPECIES, SpeciesDef } from './species';
import { Languages, epithet, cap } from './language';
import type { Subspecies, Culture, Religion, City, Building, Kingdom, Character, Dynasty, War, Army, HEvent, Band } from './entities';
import { PathFinder, Mode, modeOf } from './move';
import * as life from './life';
import * as people from './people';
import * as civ from './city';
import * as realm from './kingdom';
import * as war from './war';
import * as nature from './nature';
import * as faith from './culture';

export interface Laws {
  [k: string]: boolean | number;
  births: boolean; oldAge: boolean; hunger: boolean; evolution: boolean; sapience: boolean; rebellion: boolean; wars: boolean;
  diplomacy: boolean; coalitions: boolean; plagues: boolean; disasters: boolean; monsters: boolean; magic: boolean; crime: boolean;
  fog: boolean; ages: boolean; undead: boolean; expansion: boolean; techSpeed: number; maxUnits: number; peace: boolean; dayNight: boolean;
}
export const DEFAULT_LAWS: Laws = {
  births: true, oldAge: true, hunger: true, evolution: true, sapience: true, rebellion: true, wars: true, diplomacy: true,
  coalitions: true, plagues: true, disasters: true, monsters: true, magic: true, crime: true, fog: true, ages: true, undead: true,
  expansion: true, techSpeed: 1, maxUnits: 5000, peace: false, dayNight: true,
};

/** short-lived visual effects for the renderer (projectiles, explosions, text) */
export interface Fx { kind: string; x: number; y: number; x2?: number; y2?: number; t: number; life: number; color?: number; text?: string; size?: number; }

export const START_YEAR = 1;

export class Sim {
  world: World; rng: Rng; seed: string; tick = 0;
  units: Units; paths: PathFinder;
  subs: Subspecies[] = []; baseSub: number[] = [];
  langs = new Languages(); cultures: Culture[] = []; religions: Religion[] = [];
  cities: City[] = []; buildings: Building[] = []; kingdoms: Kingdom[] = [];
  chars: Character[] = []; dynasties: Dynasty[] = []; wars: War[] = []; armies: Army[] = []; bands: Band[] = [];
  events: HEvent[] = []; feed: HEvent[] = [];
  fx: Fx[] = [];
  laws: Laws = { ...DEFAULT_LAWS };
  ageName = 'Age of Dawn'; ageUntil = 0; ageKind = 'dawn';
  weather = { rain: 0, snow: 0, wind: 0.3, storm: 0 };
  stats: { year: number; pop: number; animals: number; kingdoms: number; cities: number; wars: number; byKingdom: Record<number, number>; bySpecies: Record<number, number> }[] = [];
  deaths: Record<string, number> = {};
  totalBirths = 0; totalDeaths = 0;
  undo: { tiles: Map<number, number[]> }[] = [];
  diseases: nature.Disease[] = [];
  onEvent: ((e: HEvent) => void) | null = null;
  favoriteDied: ((name: string) => void) | null = null;
  /** for the UI: a kingdom the player watches over */
  patron = -1;
  /** how many thinking people are alive (for limits) */
  peopleCount = 0;
  /** 0..1 snow cover for the renderer */
  winter = 0;

  constructor(world: World, seed: string) {
    this.world = world; this.seed = seed;
    this.rng = new Rng('sim:' + seed);
    this.units = new Units(1024, world.w, world.h);
    this.paths = new PathFinder(world.n);
  }

  // ---------------------------------------------------------------- time
  get year() { return START_YEAR + Math.floor(this.tick / TICKS_PER_YEAR); }
  get season() { return Math.floor(this.tick / TICKS_PER_SEASON) % 4; }
  /** 0..1 through the day (a day is 120 ticks); night when light is low */
  get dayTime() { return (this.tick % 120) / 120; }
  get light() { const t = this.dayTime; const s = Math.sin((t - 0.25) * Math.PI * 2); return Math.max(0.32, Math.min(1, 0.68 + 0.5 * s)); }
  isNight() { return this.light < 0.5; }
  ageYears(u: number) { return (this.tick - this.units.born[u]) / TICKS_PER_YEAR; }

  // ---------------------------------------------------------------- species & subspecies
  baseSubspecies(speciesId: number): number {
    if (this.baseSub[speciesId] !== undefined) return this.baseSub[speciesId];
    const d = SPECIES[speciesId];
    const g = new Float32Array(G).fill(128);
    g[Gene.Hue] = 128; g[Gene.Diet] = d.diet === 'carn' ? 220 : d.diet === 'herb' ? 30 : 128;
    g[Gene.Swim] = d.swim ? 200 : 60; g[Gene.Intel] = d.sapient ? 180 : d.kind === 'titan' ? 120 : 60;
    const id = this.subs.length;
    this.subs.push({ id, species: speciesId, name: d.name, latin: latinGenus(d) + ' ' + (d.sapient ? 'sapiens' : 'vulgaris'), genome: g, hue: 128, pop: 0, peak: 0, born: this.tick, died: -1, parent: -1, region: 0, sapient: !!d.sapient, notes: [] });
    this.baseSub[speciesId] = id;
    return id;
  }
  newSubspecies(parent: number, genome: Float32Array, region: number, name?: string): number {
    const p = this.subs[parent], d = SPECIES[p.species];
    const id = this.subs.length;
    const ep = epithet(this.rng.u32());
    this.subs.push({
      id, species: p.species, name: name || cap(ep) + ' ' + d.name.toLowerCase(), latin: p.latin.split(' ')[0] + ' ' + ep,
      genome: Float32Array.from(genome), hue: genome[Gene.Hue], pop: 0, peak: 0, born: this.tick, died: -1, parent, region, sapient: p.sapient, notes: [],
    });
    return id;
  }
  spec(u: number): SpeciesDef { return SPECIES[this.units.spec[u]]; }

  // ---------------------------------------------------------------- creatures
  /** create a creature. age in years (default: young adult for people, random for animals) */
  spawn(subId: number, x: number, y: number, o: { age?: number; sex?: number; mother?: number; father?: number; city?: number; culture?: number; religion?: number; silent?: boolean } = {}): number {
    const U = this.units, sub = this.subs[subId], d = SPECIES[sub.species];
    const u = U.alloc();
    U.sub[u] = subId; U.spec[u] = sub.species;
    U.x[u] = x; U.y[u] = y; U.tx[u] = x; U.ty[u] = y;
    U.sex[u] = o.sex ?? (this.rng.chance(0.5) ? 1 : 0);
    const age = o.age ?? (d.sapient ? this.rng.range(d.adult, d.adult * 1.6) : this.rng.range(0, d.life * 0.6));
    U.born[u] = this.tick - Math.round(age * TICKS_PER_YEAR);
    // genome: from parents, or the subspecies average with some spread
    const go = u * G;
    if (o.mother !== undefined && o.mother >= 0 && U.alive[o.mother]) {
      const f = o.father !== undefined && o.father >= 0 && U.alive[o.father] ? o.father : o.mother;
      inherit(this.rng, U.genome, o.mother * G, U.genome, f * G, U.genome, go, this.laws.evolution ? 0.35 : 0.08);
    } else {
      for (let g = 0; g < G; g++) U.genome[go + g] = Math.max(0, Math.min(255, Math.round(sub.genome[g] + this.rng.gauss() * 10)));
    }
    // traits: a few, some driven by genes
    const nt = d.sapient ? this.rng.irange(1, 3) : (this.rng.chance(0.3) ? 1 : 0);
    for (let k = 0; k < nt; k++) U.setTrait(u, this.rng.int(32));
    if (U.genome[go + Gene.Intel] > 200 && this.rng.chance(0.4)) U.setTrait(u, T.Genius);
    if (U.genome[go + Gene.Strength] > 200 && this.rng.chance(0.4)) U.setTrait(u, T.Strong);
    if (U.genome[go + Gene.Piety] > 200 && this.rng.chance(0.4)) U.setTrait(u, T.Pious);
    if (U.genome[go + Gene.Aggression] > 200 && this.rng.chance(0.4)) U.setTrait(u, T.Cruel);
    if (!d.magic) U.setTrait(u, T.Mage, false);
    if (d.magic && U.genome[go + Gene.Magic] > 170 && this.rng.chance(0.3)) U.setTrait(u, T.Mage);
    U.setTrait(u, T.Veteran, false); U.setTrait(u, T.Blessed, false); U.setTrait(u, T.Cursed, false); U.setTrait(u, T.Mad, false);
    if (d.undead) U.flags[u] |= UF.Undead;
    this.express(u);
    U.hp[u] = U.maxHp[u];
    U.hunger[u] = this.rng.range(0, 30);
    U.state[u] = St.Idle; U.think[u] = this.rng.int(10);
    if (o.mother !== undefined && o.mother >= 0) U.mother[u] = U.uid[o.mother];
    if (o.father !== undefined && o.father >= 0) U.father[u] = U.uid[o.father];
    if (o.city !== undefined && o.city >= 0) U.city[u] = o.city;
    if (o.culture !== undefined) U.culture[u] = o.culture;
    if (o.religion !== undefined) U.religion[u] = o.religion;
    sub.pop++; if (sub.pop > sub.peak) sub.peak = sub.pop;
    return u;
  }

  /** work out a creature's stats from species, genes, traits, level and gear */
  express(u: number) {
    const U = this.units, d = SPECIES[U.spec[u]], go = u * G, gn = U.genome;
    const has = (t: number) => (U.traits[u] & (1 << t)) !== 0;
    const size = gmul(gn[go + Gene.Size], 0.7, 1.4);
    let hp = d.hp * size * gmul(gn[go + Gene.Tough], 0.7, 1.4);
    let atk = d.atk * gmul(gn[go + Gene.Strength], 0.6, 1.5) * Math.sqrt(size);
    let def = d.def * gmul(gn[go + Gene.Tough], 0.6, 1.4);
    let spd = d.speed * gmul(gn[go + Gene.Speed], 0.7, 1.35) / Math.sqrt(size);
    if (has(T.Strong)) atk *= 1.3; if (has(T.Weak)) atk *= 0.75;
    if (has(T.Hardy)) hp *= 1.2; if (has(T.Sickly)) hp *= 0.8;
    if (has(T.Swift)) spd *= 1.2; if (has(T.Slow)) spd *= 0.82;
    if (has(T.Blessed)) { hp *= 1.3; atk *= 1.2; }
    if (has(T.Veteran)) { atk *= 1.15; def += 1; }
    const lvl = U.level[u];
    hp *= 1 + (lvl - 1) * 0.12; atk *= 1 + (lvl - 1) * 0.1;
    if (U.flags[u] & UF.Hero) { hp *= 1.8; atk *= 1.6; def += 2; }
    // equipment (people): weapon and armour tiers follow the era
    if (d.sapient) {
      const wpn = U.weapon[u], arm = U.armor[u];
      atk += wpn * 2.2; def += arm * 1.2; hp += arm * 3;
      if (U.mount[u]) { spd *= 1.6; hp *= 1.25; atk *= 1.2; }
    }
    U.maxHp[u] = Math.max(1, hp);
    if (U.hp[u] > U.maxHp[u]) U.hp[u] = U.maxHp[u];
    U.atk[u] = atk; U.def[u] = def; U.spd[u] = spd;
    U.range[u] = d.range ?? 0.9;
    if (U.slot[u] & 128) U.range[u] = Math.max(U.range[u], U.weapon[u] >= 4 ? 6 : 4.5);   // archers and gunners
  }

  /** how fast this unit moves right now (weather, mounts handled in express) */
  speedFactor(u: number): number {
    let f = 1;
    if (this.weather.snow > 0.3 && !this.spec(u).fly) f *= 0.8;
    if (this.units.flags[u] & UF.Possessed) f *= 1.3;
    return f;
  }

  kill(u: number, cause: string, killer = -1) {
    const U = this.units;
    if (!U.alive[u]) return;
    const d = SPECIES[U.spec[u]];
    const x = U.x[u], y = U.y[u];
    this.deaths[cause] = (this.deaths[cause] || 0) + 1;
    this.totalDeaths++;
    const sub = this.subs[U.sub[u]];
    sub.pop--;
    if (sub.pop <= 0 && sub.died < 0) {
      sub.died = this.tick;
      if (sub.peak >= 15) this.log('extinct', `The ${sub.name} went extinct.`, x, y, { s: sub.id, imp: 2 });
    }
    // drop what they carried
    if (U.carry[u] && U.city[u] >= 0) { /* lost */ }
    if (killer >= 0 && U.alive[killer]) {
      U.kills[killer]++;
      const kv = this.unitKingdom(u), kk = this.unitKingdom(killer);
      if (kv >= 0 && kk >= 0 && kv !== kk) { war.battleDeath(this, kv, kk); const c = U.city[u]; if (c >= 0) this.cities[c].lastAttacked = this.tick; }
      else if (U.city[u] >= 0 && SPECIES[U.spec[killer]].hostile) this.cities[U.city[u]].lastAttacked = this.tick;
      people.gainXp(this, killer, 4 + Math.round(U.level[u] * 2 + d.hp / 20));
      // the World Serpent grows when it eats
      if (SPECIES[U.spec[killer]].key === 'serpent') { U.maxHp[killer] += d.hp * 0.5; U.atk[killer] += 0.4; }
    }
    if (U.flags[u] & UF.Notable) people.characterDied(this, u, cause, killer);
    if (U.flags[u] & UF.Fav) {
      const t = this.world.tileAt(x, y);
      if (!this.world.isWater(t) && !this.world.bld[t]) { this.world.deco[t] = 7 /* placeholder replaced below */; this.world.deco[t] = 1; this.world.markDirty(t); }
      if (this.favoriteDied) this.favoriteDied(this.unitName(u));
      this.log('fav', `${this.unitName(u)} died (${cause}). A grave marks the spot.`, x, y, { imp: 2 });
    }
    if (U.army[u] >= 0) war.leaveArmy(this, u);
    this.fx.push({ kind: 'die', x, y, t: 0, life: 14, color: d.color });
    // undead rise from fresh corpses when the dead walk
    const raised = (d.sapient || d.key === 'cow' || d.key === 'horse') && !d.undead && this.laws.undead && nature.corpseRises(this, x, y, killer);
    const deadSub = U.sub[u];
    U.release(u);
    if (raised) nature.raiseDead(this, x, y, deadSub, killer);
  }

  damage(u: number, amount: number, attacker = -1, cause = 'battle') {
    const U = this.units;
    if (!U.alive[u] || U.flags[u] & UF.Immortal) return;
    U.hp[u] -= amount;
    U.lastHit[u] = this.tick;
    if (attacker >= 0) { U.targetU[u] = U.targetU[u] >= 0 ? U.targetU[u] : attacker; }
    if (U.hp[u] <= 0) this.kill(u, cause, attacker);
  }

  // ---------------------------------------------------------------- names
  unitName(u: number): string {
    const U = this.units, d = SPECIES[U.spec[u]];
    if (!d.sapient && !(U.flags[u] & UF.Notable)) {
      const sub = this.subs[U.sub[u]];
      return sub.name === d.name ? d.name : sub.name;
    }
    const ch = this.charOf(u);
    if (ch) return ch.name + (ch.family ? ' ' + ch.family : '');
    const c = U.culture[u];
    const lang = c >= 0 ? this.langs.list[this.cultures[c].lang] : this.langs.list[0];
    if (!lang) return d.name;
    const given = this.langs.person(lang, U.uid[u], U.sex[u] === 1);
    const fam = U.family[u] >= 0 ? this.langs.family(lang, U.family[u]) : '';
    return given + (fam ? ' ' + fam : '');
  }
  charOf(u: number): Character | null {
    if (!(this.units.flags[u] & UF.Notable)) return null;
    return people.charByUid(this, this.units.uid[u]);
  }

  // ---------------------------------------------------------------- lookups
  cityKingdom(c: number): number { return c >= 0 && this.cities[c] ? this.cities[c].kingdom : -1; }
  unitKingdom(u: number): number { const c = this.units.city[u]; return c >= 0 ? this.cities[c].kingdom : -1; }
  atWar(a: number, b: number): boolean {
    if (a < 0 || b < 0 || a === b) return false;
    const r = this.kingdoms[a].relations.get(b);
    return !!r && r.status === 'war';
  }
  atPeace(a: number, b: number): boolean { return a === b || !this.atWar(a, b); }
  /** are units a and b enemies right now? */
  hostile(a: number, b: number): boolean {
    const U = this.units;
    if (a === b) return false;
    const da = SPECIES[U.spec[a]], db = SPECIES[U.spec[b]];
    const ua = (U.flags[a] & UF.Undead) !== 0, ub = (U.flags[b] & UF.Undead) !== 0;
    if (ua !== ub && (da.sapient || db.sapient || da.undead || db.undead)) return true;
    if (U.flags[a] & UF.Mad || U.flags[b] & UF.Mad) return true;
    const ka = this.unitKingdom(a), kb = this.unitKingdom(b);
    if (ka >= 0 && kb >= 0) return this.atWar(ka, kb);
    if ((U.flags[a] & UF.Bandit) && db.sapient && !(U.flags[b] & UF.Bandit)) return true;
    if ((U.flags[b] & UF.Bandit) && da.sapient && !(U.flags[a] & UF.Bandit)) return true;
    if (da.hostile && db.sapient && !da.sapient) return true;
    if (db.hostile && da.sapient && !db.sapient) return true;
    if (da.hostile && db.hostile) return false;
    if ((da.kind === 'titan' || da.kind === 'monster') && da.hostile && !db.hostile) return true;
    if ((db.kind === 'titan' || db.kind === 'monster') && db.hostile && !da.hostile) return true;
    return false;
  }

  // ---------------------------------------------------------------- history
  log(kind: string, text: string, x: number, y: number, refs: Partial<HEvent> = {}): HEvent {
    const e: HEvent = { id: this.events.length, tick: this.tick, kind, text, x, y, imp: 1, ...refs };
    this.events.push(e);
    if (e.imp >= 1) this.feed.push(e);
    if (this.feed.length > 200) this.feed.splice(0, this.feed.length - 200);
    if (this.onEvent) this.onEvent(e);
    return e;
  }

  footstep(i: number) {
    const w = this.world;
    if (w.traffic[i] < 65000) w.traffic[i] += 1;
    if (w.road[i] === 0 && w.traffic[i] > 420 && !w.isWater(i) && !w.river[i] && !w.bld[i] && !w.field[i]) {
      w.road[i] = 1; w.tree[i] = 0; w.markDirty(i);
    }
  }

  // ---------------------------------------------------------------- the tick
  step() {
    this.tick++;
    const U = this.units;
    this.paths.budget = 30000;
    U.rebuildGrid();
    this.scanThreats();
    for (let u = 0; u < U.hi; u++) {
      if (!U.alive[u]) continue;
      const d = SPECIES[U.spec[u]];
      if (d.sapient && !(d.undead && U.city[u] < 0 && U.band[u] < 0 && !(U.flags[u] & UF.Undead))) people.updatePerson(this, u);
      else if (d.sapient) people.updatePerson(this, u);
      else life.updateCreature(this, u);
    }
    nature.stepWorld(this);
    if (this.tick % 4 === 0) civ.stepCities(this);
    if (this.tick % 5 === 0) war.stepArmies(this);
    if (this.tick % 20 === 0) realm.stepKingdoms(this);
    if (this.tick % 30 === 0) people.stepBands(this);
    if (this.tick % TICKS_PER_SEASON === 0) this.seasonal();
    if (this.tick % TICKS_PER_YEAR === 0) this.yearly();
    // effects age out
    if (this.fx.length) {
      let k = 0;
      for (const f of this.fx) { f.t++; if (f.t < f.life) this.fx[k++] = f; }
      this.fx.length = k;
      if (this.fx.length > 3000) this.fx.splice(0, this.fx.length - 3000);
    }
  }

  /** per grid cell: how many creatures there would attack a peaceful person (monsters, undead, bandits, the mad) */
  threatCell = new Uint16Array(0);
  /** kingdoms currently at war */
  warring = new Uint8Array(0);
  scanThreats() {
    const U = this.units;
    const n = U.gw * U.gh;
    if (this.threatCell.length !== n) this.threatCell = new Uint16Array(n);
    else this.threatCell.fill(0);
    if (this.kMaskLo.length !== n) { this.kMaskLo = new Uint32Array(n); this.kMaskHi = new Uint32Array(n); }
    else { this.kMaskLo.fill(0); this.kMaskHi.fill(0); }
    for (let u = 0; u < U.hi; u++) {
      if (!U.alive[u]) continue;
      const cx = Math.min(U.gw - 1, Math.max(0, (U.x[u] / U.cell) | 0)), cy = Math.min(U.gh - 1, Math.max(0, (U.y[u] / U.cell) | 0));
      const cell = cy * U.gw + cx;
      const c = U.city[u];
      if (c >= 0) { const k = this.cities[c].kingdom & 63; if (k < 32) this.kMaskLo[cell] |= 1 << k; else this.kMaskHi[cell] |= 1 << (k - 32); }
      const f = U.flags[u];
      if (!(f & (UF.Undead | UF.Mad | UF.Bandit)) && !SPECIES[U.spec[u]].hostile) continue;
      this.threatCell[cell]++;
    }
    if (this.warring.length < this.kingdoms.length + 1) { this.warring = new Uint8Array(this.kingdoms.length + 16); this.enemyLo = new Uint32Array(this.kingdoms.length + 16); this.enemyHi = new Uint32Array(this.kingdoms.length + 16); }
    if (this.tick % 5 === 0 || this.tick < 3) for (const k of this.kingdoms) {
      this.warring[k.id] = k.alive && k.wars.length ? 1 : 0;
      let lo = 0, hi = 0;
      if (this.warring[k.id]) for (const [o, r] of k.relations) if (r.status === 'war') { const b = o & 63; if (b < 32) lo |= 1 << b; else hi |= 1 << (b - 32); }
      this.enemyLo[k.id] = lo; this.enemyHi[k.id] = hi;
    }
  }
  kMaskLo = new Uint32Array(0); kMaskHi = new Uint32Array(0); enemyLo = new Uint32Array(0); enemyHi = new Uint32Array(0);
  /** could anything near (x,y) within r be an enemy of unit u? (fast rejection for peaceful places) */
  maybeDanger(u: number, r: number): boolean {
    const U = this.units;
    const f = U.flags[u];
    if (f & (UF.Undead | UF.Mad | UF.Bandit) || SPECIES[U.spec[u]].hostile) return true;
    const k = this.unitKingdom(u);
    const war = k >= 0 && this.warring[k];
    const elo = war ? this.enemyLo[k] : 0, ehi = war ? this.enemyHi[k] : 0;
    const x0 = Math.max(0, ((U.x[u] - r) / U.cell) | 0), x1 = Math.min(U.gw - 1, ((U.x[u] + r) / U.cell) | 0);
    const y0 = Math.max(0, ((U.y[u] - r) / U.cell) | 0), y1 = Math.min(U.gh - 1, ((U.y[u] + r) / U.cell) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = cy * U.gw + cx;
      if (this.threatCell[c]) return true;
      if (war && ((this.kMaskLo[c] & elo) || (this.kMaskHi[c] & ehi))) return true;
    }
    return false;
  }

  seasonal() {
    nature.seasonChange(this);
    faith.seasonal(this);
  }

  yearly() {
    life.yearly(this);
    people.yearly(this);
    realm.yearly(this);
    war.yearly(this);
    faith.yearly(this);
    nature.yearly(this);
    // statistics for the graphs
    const byK: Record<number, number> = {}, byS: Record<number, number> = {};
    let pop = 0, animals = 0;
    for (const c of this.cities) if (c.alive) byK[c.kingdom] = (byK[c.kingdom] || 0) + c.pop;
    for (const s of this.subs) if (s.pop > 0) { byS[s.species] = (byS[s.species] || 0) + s.pop; if (s.sapient) pop += s.pop; else animals += s.pop; }
    this.stats.push({ year: this.year, pop, animals, kingdoms: this.kingdoms.filter(k => k.alive).length, cities: this.cities.filter(c => c.alive).length, wars: this.wars.filter(w => w.active).length, byKingdom: byK, bySpecies: byS });
    if (this.stats.length > 3000) this.stats.splice(0, this.stats.length - 3000);
  }
}

function latinGenus(d: SpeciesDef): string {
  const m: Record<string, string> = { human: 'Homo', elf: 'Elvenus', dwarf: 'Nanus', orc: 'Orcus', goblin: 'Goblinus', lizard: 'Saurus', avian: 'Avianthropus', undead: 'Mortuus', sheep: 'Ovis', cow: 'Bos', pig: 'Sus', chicken: 'Gallus', horse: 'Equus', camel: 'Camelus', deer: 'Cervus', rabbit: 'Lepus', wolf: 'Canis', bear: 'Ursus', fox: 'Vulpes', croc: 'Crocodylus', elephant: 'Mammuthus', raptor: 'Velociraptor', trex: 'Tyrannosaurus', bronto: 'Brontosaurus', fish: 'Piscis', shark: 'Carcharodon', whale: 'Balaena', kraken: 'Architeuthis', serpent: 'Jormungandr', crow: 'Corvus', dragon: 'Draco', demon: 'Daemon', ghost: 'Spectrum', slime: 'Mucus', golem: 'Golemus', treant: 'Dendros', titan: 'Colossus', sandworm: 'Vermis', alien: 'Xenos', zombie: 'Necrus' };
  return m[d.key] || cap(d.key) + 'us';
}
export { hash2 };
