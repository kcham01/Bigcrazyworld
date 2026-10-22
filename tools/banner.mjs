// Renders docs/tbcrushcalc-banner.png (the README banner) from HTML in headless Chromium.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const b64 = f => fs.readFileSync(path.join(root, f)).toString('base64');
const font = f => `url(data:font/woff2;base64,${b64('node_modules/@fontsource/' + f)})`;
const html = `<!doctype html><html><head><style>
@font-face { font-family: Cinzel; font-weight: 700; src: ${font('cinzel/files/cinzel-latin-700-normal.woff2')}; }
@font-face { font-family: Inter; font-weight: 400; src: ${font('inter/files/inter-latin-400-normal.woff2')}; }
@font-face { font-family: Inter; font-weight: 700; src: ${font('inter/files/inter-latin-700-normal.woff2')}; }
html,body{margin:0;width:1280px;height:640px;overflow:hidden;background:#0b0907}
.b{position:relative;width:1280px;height:640px;box-sizing:border-box;display:flex;align-items:center;gap:56px;padding:0 120px;
 background: radial-gradient(ellipse at 22% 45%, rgba(255,190,90,.16), transparent 50%), radial-gradient(ellipse at 90% 100%, rgba(0,0,0,.7), transparent 60%), #17130f;}
.b::after{content:'';position:absolute;inset:14px;border-radius:10px;box-shadow:0 0 0 2px #000,0 0 0 5px #6b4a1c,0 0 0 7px #f3d27a,0 0 0 10px #b5893a,0 0 0 12px #000;pointer-events:none}
.icon{width:260px;height:260px;image-rendering:pixelated;filter:drop-shadow(0 10px 30px rgba(0,0,0,.8))}
h1{margin:0;font:700 96px Cinzel;color:#ffd100;text-shadow:0 3px 0 #000,0 0 30px rgba(255,209,0,.25);letter-spacing:.01em}
p{margin:10px 0 28px;font:400 30px/1.3 Inter;color:#e9e2d0;max-width:680px}
.chips{display:flex;gap:12px}
.chip{font:700 22px Inter;padding:9px 18px;border-radius:24px;color:#ffd100;background:rgba(0,0,0,.45);box-shadow:inset 0 0 0 2px #6b4a1c}
.bar{position:absolute;left:120px;right:120px;bottom:70px;height:16px;display:flex;border-radius:3px;overflow:hidden;box-shadow:0 0 0 2px #000,0 0 0 4px #4b3a22}
.bar span{height:100%}
</style></head><body><div class="b">
<img class="icon" src="data:image/png;base64,${b64('web/icon.png')}">
<div><h1>TBCrushCalc</h1><p>Gear planner and crush / crit cap calculator for Burning Crusade tanks</p>
<div class="chips"><span class="chip">Android</span><span class="chip" style="color:#C79C6E">Warrior</span><span class="chip" style="color:#F58CBA">Paladin</span><span class="chip" style="color:#FF7D0A">Druid</span></div></div>
<div class="bar"><span style="width:10.5%;background:#8d8d8d"></span><span style="width:19.8%;background:#3aa0ff"></span><span style="width:11.3%;background:#b06bff"></span><span style="width:58.4%;background:#e8c548"></span></div>
</div></body></html>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1280, height: 640 } });
await pg.setContent(html);
await pg.waitForTimeout(300);
await pg.screenshot({ path: path.join(root, 'docs/tbcrushcalc-banner.png') });
await br.close();
console.log('banner written');
