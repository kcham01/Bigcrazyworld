// Saving and loading whole worlds. Everything in the simulation is plain data (typed arrays, objects,
// Sets and Maps), so it is walked generically into JSON, with typed arrays as base64.
import { Sim } from './sim';
import { World } from './world';
import { Units } from './units';
import { Languages } from './language';
import { PathFinder } from './move';
import * as civ from './city';
import * as people from './people';

export const SAVE_VERSION = 1;

function b64(u8: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const TYPED: Record<string, any> = { Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array };

function enc(v: any, depth = 0): any {
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (ArrayBuffer.isView(v)) {
    const ta = v as unknown as { constructor: { name: string }; buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return { __t: ta.constructor.name, d: b64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) };
  }
  if (v instanceof Set) return { __s: [...v].map(x => enc(x, depth + 1)) };
  if (v instanceof Map) return { __m: [...v].map(([k, x]) => [enc(k, depth + 1), enc(x, depth + 1)]) };
  if (Array.isArray(v)) return v.map(x => enc(x, depth + 1));
  const o: any = {};
  for (const k of Object.keys(v)) { const e = enc(v[k], depth + 1); if (e !== undefined) o[k] = e; }
  return o;
}
function dec(v: any): any {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(dec);
  if (v.__t) { const u8 = unb64(v.d); const C = TYPED[v.__t]; return new C(u8.buffer, 0, u8.byteLength / C.BYTES_PER_ELEMENT); }
  if (v.__s) return new Set(v.__s.map(dec));
  if (v.__m) return new Map(v.__m.map(([k, x]: any) => [dec(k), dec(x)]));
  const o: any = {};
  for (const k of Object.keys(v)) o[k] = dec(v[k]);
  return o;
}

export interface SaveMeta { name: string; year: number; pop: number; kingdoms: number; size: number; saved: number; version: number }

export function serialize(sim: Sim, name = 'World'): { meta: SaveMeta; data: string } {
  const U = sim.units;
  const units: any = {};
  for (const k of Object.keys(U)) {
    const v = (U as any)[k];
    if (k === 'path' || k === 'byUid' || k === 'head' || k === 'next') continue;
    if (ArrayBuffer.isView(v)) units[k] = enc((v as any).subarray(0, k === 'genome' ? U.hi * 16 : U.hi));
    else units[k] = enc(v);
  }
  const skip = new Set(['world', 'units', 'paths', 'onEvent', 'favoriteDied', 'fx', 'langs', 'rng', 'feed']);
  const rest: any = {};
  for (const k of Object.keys(sim)) if (!skip.has(k)) rest[k] = enc((sim as any)[k]);
  rest.events = enc(sim.events.slice(-4000));
  const W = sim.world, world: any = {};
  for (const k of ['height', 'biome', 'temp', 'moist', 'veg', 'tree', 'ore', 'oreAmt', 'river', 'owner', 'bld', 'road', 'traffic', 'field', 'fire', 'deco']) world[k] = enc((W as any)[k]);
  const obj = { v: SAVE_VERSION, w: W.w, h: W.h, seed: sim.seed, rng: sim.rng.state(), langs: sim.langs.list, world, units, sim: rest };
  const meta: SaveMeta = { name, year: sim.year, pop: sim.peopleCount, kingdoms: sim.kingdoms.filter(k => k.alive).length, size: W.w, saved: Date.now(), version: SAVE_VERSION };
  return { meta, data: JSON.stringify(obj) };
}

export function deserialize(data: string): Sim {
  const o = JSON.parse(data);
  const world = new World(o.w, o.h);
  for (const k of Object.keys(o.world)) (world as any)[k] = dec(o.world[k]);
  world.regionsStale = true; world.markAll();
  const sim = new Sim(world, o.seed);
  sim.rng.setState(o.rng);
  sim.langs = new Languages(); sim.langs.list = o.langs;
  for (const k of Object.keys(o.sim)) {
    if (k === 'events') continue;
    (sim as any)[k] = dec(o.sim[k]);
  }
  sim.events = dec(o.sim.events);
  // re-number event ids so references stay valid enough (history arrays hold ids)
  sim.feed = sim.events.slice(-60);
  // creatures
  const U = new Units(Math.max(1024, o.units.hi + 64), world.w, world.h);
  const n = o.units.hi;
  for (const k of Object.keys(o.units)) {
    if (k === 'cap' || k === 'gw' || k === 'gh' || k === 'cell') continue;   // these belong to the fresh arrays
    const v = dec(o.units[k]);
    const cur = (U as any)[k];
    if (ArrayBuffer.isView(cur)) (cur as any).set(v);
    else (U as any)[k] = v;
  }
  U.hi = n;
  U.byUid = new Map();
  for (let i = 0; i < n; i++) if (U.alive[i]) U.byUid.set(U.uid[i], i);
  for (let i = 0; i < U.cap; i++) { U.path[i] = null; U.dest[i] = -1; }
  sim.units = U;
  sim.paths = new PathFinder(world.n);
  sim.fx = [];
  civ.resetCaches();
  people.resetCharIndex(sim);
  return sim;
}
