// Paints the app icon (a gold-trimmed tank shield on dark rock, with a cracked boss swing bouncing
// off it) as 32x32 pixel art and writes PNGs for Android and the web.
import zlib from 'node:zlib'; import fs from 'node:fs'; import path from 'node:path';
const N = 32;
const px = new Uint8Array(N * N * 4);
const set = (x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= N || y >= N) return; const o = (y * N + x) * 4; px[o] = (c >> 16) & 255; px[o + 1] = (c >> 8) & 255; px[o + 2] = c & 255; px[o + 3] = a; };
// rounded dark rock square
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const corner = (x < 2 && y < 2) || (x > N - 3 && y < 2) || (x < 2 && y > N - 3) || (x > N - 3 && y > N - 3);
  if (corner && !((x === 1 || x === N - 2) && (y === 1 || y === N - 2))) continue;
  const n = ((x * 7 + y * 13) ^ (x * y)) % 5;
  set(x, y, n === 0 ? 0x221a12 : n === 1 ? 0x1a140e : 0x17120d);
}
// the shield: a heater shape, half-width w(y)
const top = 5, bottom = 28, cx = 15.5;
const half = y => y < 15 ? 10.5 : 10.5 * Math.sqrt(Math.max(0, 1 - ((y - 15) / (bottom - 15)) ** 2));
for (let y = top; y <= bottom; y++) {
  const w = half(y);
  for (let x = 0; x < N; x++) {
    const d = Math.abs(x + 0.5 - cx);
    if (d > w) continue;
    const edge = d > w - 1.6 || y < top + 1.6 || (y > bottom - 2 && d > w - 3);
    let c;
    if (edge) c = (x + y) % 3 === 0 ? 0xffe08a : 0xd4a640;                       // gold rim
    else c = x + 0.5 < cx ? 0x8a1410 : 0x6a0c07;                                  // red field, shaded right half
    if (d > w - 2.6 && !edge) c = 0x2c1d0a;                                       // dark line inside the rim
    set(x, y, c);
  }
}
// a gold chevron (the "cap") across the shield
for (let x = 7; x <= 24; x++) {
  const y = 19 - Math.round(Math.max(0, 6 - Math.abs(x + 0.5 - cx)) * 0.9);
  for (let k = 0; k < 3; k++) if (Math.abs(x + 0.5 - cx) <= half(y + k) - 2.6) set(x, y + k, k === 0 ? 0xfff2b8 : 0xe9c972);
}
// a percent sign above it
const pct = ['xx...x', 'xx..x.', '...x..', '..x...', '.x..xx', 'x...xx'];
pct.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'x') set(x + 13, y + 7, 0xfff6dc); }));
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
