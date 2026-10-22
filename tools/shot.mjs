// Screenshots of the built game in headless Chromium: node tools/shot.mjs "query" out.png [w h] [waitExpr]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('build/web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.map': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
const port = server.address().port;
const [q = '', out = 'shot.png', w = '1280', h = '800', wait = 'window.__ready'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('ERROR: ' + e.message));
await p.goto(`http://127.0.0.1:${port}/?${q}`, { timeout: 600000 });
try { await p.waitForFunction(wait, null, { timeout: 600000 }); } catch (e) { logs.push('timeout waiting for ' + wait); }
await p.waitForTimeout(600);
await p.screenshot({ path: out });
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await b.close(); server.close();
