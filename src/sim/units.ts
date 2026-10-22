// All creatures in flat typed arrays (structure of arrays): thousands of them stay fast on a phone.
import { G } from './genetics';

export const enum St {
  Idle, Wander, Move, Graze, Hunt, Eat, Flee, Sleep, Mate, Gather, Deliver, Build, Work, Fight, Patrol, March,
  Pray, Study, Trade, Fish, Farm, Chop, Mine, Herd, Settle, Board, Sail, Possessed, Dead, Rest, Guard, Raid, Steal, Celebrate, Migrate,
}
export const STATE_NAMES = ['Idle', 'Wandering', 'Walking', 'Grazing', 'Hunting', 'Eating', 'Fleeing', 'Sleeping', 'Courting', 'Gathering', 'Carrying goods', 'Building', 'Working', 'Fighting', 'Patrolling', 'Marching',
  'Praying', 'Studying', 'Trading', 'Fishing', 'Farming', 'Chopping wood', 'Mining', 'Herding', 'Founding a town', 'Boarding', 'Sailing', 'Possessed', 'Dead', 'Resting', 'Guarding', 'Raiding', 'Stealing', 'Celebrating', 'Migrating'];

export const enum Job { None, Farmer, Woodcutter, Miner, Builder, Hunter, Fisher, Soldier, Scholar, Priest, Merchant, Smith, Herder, Healer, Guard, Mage, Sailor, Noble, Thief, Gatherer, COUNT }
export const JOB_NAMES = ['Villager', 'Farmer', 'Woodcutter', 'Miner', 'Builder', 'Hunter', 'Fisher', 'Soldier', 'Scholar', 'Priest', 'Merchant', 'Smith', 'Herder', 'Healer', 'Guard', 'Mage', 'Sailor', 'Noble', 'Thief', 'Gatherer'];

export const enum UF { Fav = 1, Hero = 2, Ruler = 4, Possessed = 8, Undead = 16, OnBoat = 32, Blessed = 64, Mad = 128, Immortal = 256, Tame = 512, Asleep = 1024, Swim = 2048, Guard = 4096, Notable = 8192, Heir = 16384, Bandit = 32768 }

export const enum T {
  Brave, Coward, Strong, Weak, Genius, Dim, Swift, Slow, Lucky, Kind, Cruel, Ambitious, Content, Pious, Greedy, Honest,
  Deceitful, Hardy, Sickly, Charismatic, Beautiful, Lazy, Diligent, Mage, Blessed, Cursed, Mad, Veteran, Fertile, Infertile, Longlived, Wise,
}
export const TRAIT_NAMES = ['Brave', 'Cowardly', 'Strong', 'Weak', 'Genius', 'Dim', 'Swift', 'Slow', 'Lucky', 'Kind', 'Cruel', 'Ambitious', 'Content', 'Pious', 'Greedy', 'Honest',
  'Deceitful', 'Hardy', 'Sickly', 'Charismatic', 'Beautiful', 'Lazy', 'Diligent', 'Mage', 'Blessed', 'Cursed', 'Mad', 'Veteran', 'Fertile', 'Barren', 'Long-lived', 'Wise'];
export const TRAIT_GOOD = new Set([0, 2, 4, 6, 8, 9, 11, 13, 15, 17, 19, 20, 22, 23, 24, 27, 28, 30, 31]);
/** traits that cannot go together */
export const TRAIT_OPPOSITE: Record<number, number> = { 0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4, 6: 7, 7: 6, 9: 10, 10: 9, 11: 12, 12: 11, 15: 16, 16: 15, 17: 18, 18: 17, 21: 22, 22: 21, 28: 29, 29: 28 };

export class Units {
  cap = 0; hi = 0; count = 0; nextUid = 1;
  free: number[] = [];
  byUid = new Map<number, number>();
  alive!: Uint8Array; uid!: Uint32Array; sub!: Uint16Array; spec!: Uint8Array;
  x!: Float32Array; y!: Float32Array; tx!: Float32Array; ty!: Float32Array; dest!: Int32Array;
  sex!: Uint8Array; born!: Int32Array;
  hp!: Float32Array; maxHp!: Float32Array; atk!: Float32Array; def!: Float32Array; spd!: Float32Array; range!: Float32Array;
  hunger!: Float32Array; state!: Uint8Array; timer!: Uint16Array; think!: Uint8Array; task!: Int32Array;
  targetU!: Int32Array; targetUid!: Uint32Array;
  city!: Int32Array; house!: Int32Array; job!: Uint8Array; band!: Int32Array;
  carry!: Uint8Array; carryAmt!: Uint16Array;
  culture!: Int16Array; religion!: Int16Array;
  genome!: Uint8Array; traits!: Uint32Array;
  level!: Uint8Array; xp!: Uint16Array; kills!: Uint16Array;
  weapon!: Uint8Array; armor!: Uint8Array; mount!: Uint8Array;
  disease!: Uint8Array; dtimer!: Uint16Array; immune!: Uint32Array;
  army!: Int32Array; slot!: Uint8Array; flags!: Uint16Array;
  mother!: Uint32Array; father!: Uint32Array; spouse!: Uint32Array; family!: Int32Array;
  morale!: Uint8Array; cd!: Uint8Array; facing!: Int8Array; happy!: Int8Array; lastHit!: Int32Array;
  path: (Int32Array | null)[] = []; pathPos!: Uint16Array;
  // spatial grid
  cell = 8; gw = 0; gh = 0; head!: Int32Array; next!: Int32Array;

  constructor(cap: number, mapW: number, mapH: number) {
    this.grow(cap);
    this.gw = Math.ceil(mapW / this.cell); this.gh = Math.ceil(mapH / this.cell);
    this.head = new Int32Array(this.gw * this.gh).fill(-1);
  }

  private grow(cap: number) {
    const old = this.cap;
    const f32 = (a: Float32Array | undefined) => { const n = new Float32Array(cap); if (a) n.set(a); return n; };
    const i32 = (a: Int32Array | undefined, fill = 0) => { const n = new Int32Array(cap).fill(fill); if (a) n.set(a); return n; };
    const u8 = (a: Uint8Array | undefined, m = 1) => { const n = new Uint8Array(cap * m); if (a) n.set(a); return n; };
    const u16 = (a: Uint16Array | undefined) => { const n = new Uint16Array(cap); if (a) n.set(a); return n; };
    const i16 = (a: Int16Array | undefined, fill = 0) => { const n = new Int16Array(cap).fill(fill); if (a) n.set(a); return n; };
    const u32 = (a: Uint32Array | undefined) => { const n = new Uint32Array(cap); if (a) n.set(a); return n; };
    const i8 = (a: Int8Array | undefined) => { const n = new Int8Array(cap); if (a) n.set(a); return n; };
    this.alive = u8(this.alive); this.uid = u32(this.uid); this.sub = u16(this.sub); this.spec = u8(this.spec);
    this.x = f32(this.x); this.y = f32(this.y); this.tx = f32(this.tx); this.ty = f32(this.ty); this.dest = i32(this.dest, -1);
    this.sex = u8(this.sex); this.born = i32(this.born);
    this.hp = f32(this.hp); this.maxHp = f32(this.maxHp); this.atk = f32(this.atk); this.def = f32(this.def); this.spd = f32(this.spd); this.range = f32(this.range);
    this.hunger = f32(this.hunger); this.state = u8(this.state); this.timer = u16(this.timer); this.think = u8(this.think); this.task = i32(this.task, -1);
    this.targetU = i32(this.targetU, -1); this.targetUid = u32(this.targetUid);
    this.city = i32(this.city, -1); this.house = i32(this.house, -1); this.job = u8(this.job); this.band = i32(this.band, -1);
    this.carry = u8(this.carry); this.carryAmt = u16(this.carryAmt);
    this.culture = i16(this.culture, -1); this.religion = i16(this.religion, -1);
    this.genome = u8(this.genome, G); this.traits = u32(this.traits);
    this.level = u8(this.level); this.xp = u16(this.xp); this.kills = u16(this.kills);
    this.weapon = u8(this.weapon); this.armor = u8(this.armor); this.mount = u8(this.mount);
    this.disease = u8(this.disease); this.dtimer = u16(this.dtimer); this.immune = u32(this.immune);
    this.army = i32(this.army, -1); this.slot = u8(this.slot); this.flags = u16(this.flags);
    this.mother = u32(this.mother); this.father = u32(this.father); this.spouse = u32(this.spouse); this.family = i32(this.family, -1);
    this.morale = u8(this.morale); this.cd = u8(this.cd); this.facing = i8(this.facing); this.happy = i8(this.happy); this.lastHit = i32(this.lastHit, -9999);
    this.pathPos = u16(this.pathPos);
    for (let i = old; i < cap; i++) this.path.push(null);
    this.next = i32(this.next, -1);
    this.cap = cap;
  }

  /** a fresh slot with defaults; the caller fills in species, stats and genome */
  alloc(): number {
    let i: number;
    if (this.free.length) i = this.free.pop()!;
    else { if (this.hi >= this.cap) this.grow(this.cap * 2); i = this.hi++; }
    this.alive[i] = 1; this.count++;
    const uid = this.nextUid++;
    this.uid[i] = uid; this.byUid.set(uid, i);
    this.dest[i] = -1; this.task[i] = -1; this.targetU[i] = -1; this.targetUid[i] = 0;
    this.city[i] = -1; this.house[i] = -1; this.job[i] = 0; this.band[i] = -1; this.carry[i] = 0; this.carryAmt[i] = 0;
    this.culture[i] = -1; this.religion[i] = -1; this.traits[i] = 0; this.level[i] = 1; this.xp[i] = 0; this.kills[i] = 0;
    this.weapon[i] = 0; this.armor[i] = 0; this.mount[i] = 0; this.disease[i] = 0; this.dtimer[i] = 0; this.immune[i] = 0;
    this.army[i] = -1; this.slot[i] = 0; this.flags[i] = 0; this.mother[i] = 0; this.father[i] = 0; this.spouse[i] = 0; this.family[i] = -1;
    this.morale[i] = 100; this.cd[i] = 0; this.facing[i] = 1; this.happy[i] = 0; this.lastHit[i] = -9999;
    this.state[i] = 0; this.timer[i] = 0; this.think[i] = 0; this.hunger[i] = 20; this.path[i] = null; this.pathPos[i] = 0;
    return i;
  }

  release(i: number) {
    if (!this.alive[i]) return;
    this.alive[i] = 0; this.count--;
    this.byUid.delete(this.uid[i]);
    this.path[i] = null;
    this.free.push(i);
  }

  idx(uid: number): number { const i = this.byUid.get(uid); return i === undefined ? -1 : i; }
  has(t: number, tr: number) { return (this.traits[t] & (1 << tr)) !== 0; }
  setTrait(i: number, tr: number, on = true) {
    if (on) { this.traits[i] |= (1 << tr); const o = TRAIT_OPPOSITE[tr]; if (o !== undefined) this.traits[i] &= ~(1 << o); }
    else this.traits[i] &= ~(1 << tr);
  }

  rebuildGrid() {
    const { head, next, cell, gw, gh } = this;
    head.fill(-1);
    for (let i = 0; i < this.hi; i++) {
      if (!this.alive[i]) continue;
      const cx = Math.min(gw - 1, Math.max(0, (this.x[i] / cell) | 0)), cy = Math.min(gh - 1, Math.max(0, (this.y[i] / cell) | 0));
      const c = cy * gw + cx;
      next[i] = head[c]; head[c] = i;
    }
  }

  /** calls fn(index) for every live unit within r tiles; stop early by returning true */
  near(x: number, y: number, r: number, fn: (j: number) => boolean | void) {
    const { head, next, cell, gw, gh } = this;
    const x0 = Math.max(0, ((x - r) / cell) | 0), x1 = Math.min(gw - 1, ((x + r) / cell) | 0);
    const y0 = Math.max(0, ((y - r) / cell) | 0), y1 = Math.min(gh - 1, ((y + r) / cell) | 0);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      for (let j = head[cy * gw + cx]; j !== -1; j = next[j]) {
        const dx = this.x[j] - x, dy = this.y[j] - y;
        if (dx * dx + dy * dy <= r2 && fn(j) === true) return;
      }
    }
  }
}
