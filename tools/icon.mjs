// Paints the app icon (a little pixel world with a castle) and writes PNGs for Android and the web.
import zlib from 'node:zlib'; import fs from 'node:fs'; import path from 'node:path';
const N = 32;
const px = new Uint8Array(N * N * 4);
const set = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const o = (y * N + x) * 4; px[o] = (c >> 16) & 255; px[o + 1] = (c >> 8) & 255; px[o + 2] = c & 255; px[o + 3] = a; };
// night sky square with rounded steps
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const corner = (x < 2 && y < 2) || (x > N - 3 && y < 2) || (x < 2 && y > N - 3) || (x > N - 3 && y > N - 3);
  if (corner && !((x === 1 || x === N - 2) && (y === 1 || y === N - 2))) continue;
  set(x, y, y < 16 ? 0x1a2133 : 0x202a44);
}
// stars
for (const [x, y] of [[4, 4], [26, 6], [8, 9], [22, 3], [28, 12], [3, 14]]) set(x, y, 0xece2c6);
// the world: a disc with sea and land
const cx = 16, cy = 18, R = 11.5;
const land = (x, y) => { const a = Math.sin(x * 0.55) + Math.cos(y * 0.6 + x * 0.2) + Math.sin((x + y) * 0.35); return a > 0.55; };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (d > R) continue;
  const edge = d > R - 1.2;
  let c = land(x, y) ? (y > cy + 5 ? 0x4f8f2c : 0x5fa83f) : 0x2b6aa8;
  if (!land(x, y) && d < R - 4 && (x + y) % 5 === 0) c = 0x3a7bc0;
  if (x > cx + 3 && y > cy) c = c === 0x2b6aa8 ? 0x1d4f88 : 0x3f7a2a;   // shade
  if (edge) c = 0x0d1426;
  set(x, y, c);
}
// a castle on top
const castle = ['..k.k.k.k..', '..kwkwkwk..', '..kwwwwwk..', 'k.kwwwwwk.k', 'kwkwwkwwkwk', 'kwwwwkwwwwk', 'kwwwkkkwwwk', 'kwwwkdkwwwk', 'kkkkkkkkkkk'];
const pal = { k: 0x1b1410, w: 0xd8ccb0, d: 0x3a2616 };
castle.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') set(x + 10, y + 3, pal[ch]); }));
// flag in brass
for (let y = 0; y < 4; y++) set(15, y - 1 + 0, 0x5e3c1f);
set(16, 0, 0xe2b54a); set(17, 0, 0xe2b54a); set(16, 1, 0xe2b54a);
function png(scale) {
  const S = N * scale;
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; for (let x = 0; x < S; x++) { const o = ((y / scale | 0) * N + (x / scale | 0)) * 4; raw.set(px.subarray(o, o + 4), y * (S * 4 + 1) + 1 + x * 4); } }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const v of b) r = t[(r ^ v) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const res = path.join(root, 'android/app/src/main/res');
for (const [dir, s] of [['mipmap-mdpi', 48], ['mipmap-hdpi', 72], ['mipmap-xhdpi', 96], ['mipmap-xxhdpi', 144], ['mipmap-xxxhdpi', 192]]) {
  fs.mkdirSync(path.join(res, dir), { recursive: true });
  // scale 32 art to the nearest integer multiple then let Android scale the rest
  fs.writeFileSync(path.join(res, dir, 'ic_launcher.png'), png(Math.max(1, Math.round(s / 32))));
}
fs.writeFileSync(path.join(root, 'web/icon.png'), png(8));
console.log('icons written');
