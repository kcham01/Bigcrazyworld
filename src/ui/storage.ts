// Saved worlds live in IndexedDB (works in browsers and the Android WebView), gzipped when possible.
import type { SaveMeta } from '../sim/save';

const DB = 'bigcrazyworld', STORE = 'worlds', META = 'meta';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE); if (!db.objectStoreNames.contains(META)) db.createObjectStore(META); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(db => new Promise<T>((res, rej) => {
    const t = db.transaction(store, mode); const r = fn(t.objectStore(store));
    r.onsuccess = () => res(r.result as T); r.onerror = () => rej(r.error);
  }));
}

async function gzip(s: string): Promise<Blob | string> {
  const CS = (globalThis as any).CompressionStream;
  if (!CS) return s;
  const stream = new Blob([s]).stream().pipeThrough(new CS('gzip'));
  return await new Response(stream).blob();
}
async function gunzip(v: Blob | string): Promise<string> {
  if (typeof v === 'string') return v;
  const DS = (globalThis as any).DecompressionStream;
  const stream = v.stream().pipeThrough(new DS('gzip'));
  return await new Response(stream).text();
}

export async function saveWorld(slot: string, meta: SaveMeta, data: string) {
  const z = await gzip(data);
  await tx(STORE, 'readwrite', s => s.put(z, slot));
  await tx(META, 'readwrite', s => s.put(meta, slot));
}
export async function loadWorld(slot: string): Promise<string | null> {
  const v = await tx<Blob | string | undefined>(STORE, 'readonly', s => s.get(slot));
  return v ? gunzip(v) : null;
}
export async function listWorlds(): Promise<{ slot: string; meta: SaveMeta }[]> {
  const keys = await tx<IDBValidKey[]>(META, 'readonly', s => s.getAllKeys());
  const vals = await tx<SaveMeta[]>(META, 'readonly', s => s.getAll());
  return keys.map((k, i) => ({ slot: String(k), meta: vals[i] })).sort((a, b) => b.meta.saved - a.meta.saved);
}
export async function deleteWorld(slot: string) {
  await tx(STORE, 'readwrite', s => s.delete(slot));
  await tx(META, 'readwrite', s => s.delete(slot));
}
