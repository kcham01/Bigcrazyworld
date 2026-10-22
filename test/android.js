// Plays Big Crazy World on an Android emulator with real touches (adb input) and the real Back button,
// and records screenshots, frame rate, simulation speed and any errors in results.json.
const { _android } = require('playwright');
const fs = require('fs');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PKG = 'app.bigcrazyworld';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = { steps: [], errors: [] };
const log = (...a) => { console.log(...a); results.steps.push(a.join(' ')); };

(async () => {
  const [device] = await _android.devices();
  const shot = async name => { await sleep(300); fs.writeFileSync(path.join(SHOTS, name + '.png'), await device.shell('screencap -p')); log('shot', name); };
  let page;
  try {
    const webview = await device.webView({ pkg: PKG }, { timeout: 120000 });
    page = await webview.page();
  } catch (e) { await shot('no-webview'); results.errors.push('no webview: ' + e.message); fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2)); process.exit(1); }
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { results.errors.push(m.type() + ': ' + m.text()); } console.log('  [page]', m.type(), m.text()); });
  page.on('pageerror', e => { results.errors.push('pageerror: ' + String(e)); console.log('  [page error]', String(e)); });
  const size = (await device.shell('wm size')).toString().match(/(\d+)x(\d+)/);
  const W = +size[1], H = +size[2];
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  // where page pixels land on screen
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = '__cal'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent';
    d.addEventListener('pointerdown', e => { window.__calib = [e.clientX, e.clientY]; e.stopPropagation(); e.preventDefault(); }, true);
    document.body.appendChild(d);
  });
  let cal = null;
  for (let k = 0; k < 6 && !cal; k++) {
    await device.shell(`input tap ${Math.round(W / 2)} ${Math.round(H / 2)}`);
    await sleep(1500);
    cal = await page.evaluate(() => window.__calib || null);
    if (!cal) await shot('calibration-' + k);
  }
  const dpr = await page.evaluate(() => { const d = document.getElementById('__cal'); if (d) d.remove(); return window.devicePixelRatio; });
  if (!cal) { results.errors.push('calibration tap never arrived; assuming a full-screen page'); cal = [W / 2 / dpr, H / 2 / dpr]; }
  const [cx, cy] = cal;
  const offX = W / 2 - cx * dpr, offY = H / 2 - cy * dpr;
  log(`screen ${W}x${H} dpr ${dpr}`);
  const tapAt = async (x, y) => device.shell(`input tap ${Math.round(offX + x * dpr)} ${Math.round(offY + y * dpr)}`);
  const tapSel = async (sel, text) => {
    const loc = text ? page.locator(sel, { hasText: text }).first() : page.locator(sel).first();
    const box = await loc.boundingBox();
    if (!box) throw new Error('not found: ' + sel + ' ' + (text || ''));
    await tapAt(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(600);
  };
  const swipe = async (x1, y1, x2, y2, ms = 400) => device.shell(`input swipe ${Math.round(offX + x1 * dpr)} ${Math.round(offY + y1 * dpr)} ${Math.round(offX + x2 * dpr)} ${Math.round(offY + y2 * dpr)} ${ms}`);
  const measure = async (label, ms = 8000) => {
    const a = await page.evaluate(() => ({ f: window.__frames, t: window.app.sim ? window.app.sim.tick : 0, n: performance.now() }));
    await sleep(ms);
    const b = await page.evaluate(() => ({ f: window.__frames, t: window.app.sim ? window.app.sim.tick : 0, n: performance.now(), units: window.app.sim ? window.app.sim.units.count : 0, year: window.app.sim ? window.app.sim.year : 0, people: window.app.sim ? window.app.sim.peopleCount : 0 }));
    const s = (b.n - a.n) / 1000;
    const m = { label, fps: +((b.f - a.f) / s).toFixed(1), ticksPerSec: +((b.t - a.t) / s).toFixed(1), units: b.units, year: b.year, people: b.people };
    results[label] = m; log(JSON.stringify(m));
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { results.errors.push(name + ': ' + e.message); log('FAILED', name, e.message); } };

  await shot('01-title');
  await step('quick start', async () => { await tapSel('button', 'Quick start'); await page.waitForFunction(() => window.app.sim, null, { timeout: 120000 }); await sleep(3000); });
  await shot('02-new-world');
  await step('zoom in', async () => { await page.evaluate(() => { const a = window.app, c = a.sim.cities[0]; const b = a.sim.bands.find(b => b.alive); const u = b ? b.leader : 0; a.cam.x = c ? c.x : a.sim.units.x[u]; a.cam.y = c ? c.y : a.sim.units.y[u]; a.cam.zoom = 14; }); await sleep(1500); });
  await shot('03-tribe-close');
  await step('speed 1x', async () => { await tapSel('.speed button', '1×'); await measure('speed1', 8000); });
  await step('speed 8x', async () => { await tapSel('.speed button', '8×'); await measure('speed8', 20000); });
  await step('speed 25x', async () => { await tapSel('.speed button', '25×'); await measure('speed25', 60000); });
  await shot('04-after-a-while');
  await step('pan', async () => { await swipe(300, 400, 120, 300, 500); await sleep(800); });
  await step('inspect city', async () => {
    await page.evaluate(() => { const a = window.app; const c = a.sim.cities.filter(c => c.alive).sort((x, y) => y.pop - x.pop)[0]; if (c) { a.cam.x = c.x + 1; a.cam.y = c.y + 1; a.cam.zoom = 16; } });
    await sleep(1200); await shot('05-city');
    const p = await page.evaluate(() => { const a = window.app; return [a.cam.vw / 2, a.cam.vh / 2]; });
    await tapAt(p[0], p[1]); await sleep(1000); await shot('06-inspect');
  });
  await step('back closes panel', async () => { await device.shell('input keyevent 4'); await sleep(800); });
  await step('realms panel', async () => { await tapSel('[aria-label="Realms"]'); await sleep(800); await shot('07-realms'); await device.shell('input keyevent 4'); });
  await step('meteor', async () => {
    await tapSel('.cats button', 'Ruin'); await tapSel('.power', 'Meteor');
    const p = await page.evaluate(() => [window.app.cam.vw / 2 + 40, window.app.cam.vh / 2 - 30]);
    await tapAt(p[0], p[1]); await sleep(1500); await shot('08-meteor');
  });
  await step('paint land', async () => {
    await tapSel('.cats button', 'Land'); await tapSel('.power', 'Raise land');
    await swipe(100, 250, 260, 330, 900); await sleep(800); await shot('09-painted');
  });
  await step('spawn dragon', async () => { await tapSel('.cats button', 'Beasts'); await page.locator('.power', { hasText: 'Dragon' }).first().scrollIntoViewIfNeeded(); await tapSel('.power', 'Dragon'); await tapAt(200, 300); await sleep(1200); await shot('10-dragon'); });
  await step('long run', async () => { await tapSel('.speed button', '25×'); await measure('speed25-late', 90000); await shot('11-late'); });
  await step('zoom out', async () => { await page.evaluate(() => { const a = window.app; a.cam.fit(a.sim.world.w, a.sim.world.h); }); await sleep(1200); await shot('12-world'); });
  await step('save', async () => {
    for (let k = 0; k < 4 && !(await page.locator('.menu').count()); k++) { await device.shell('input keyevent 4'); await sleep(900); }
    await shot('13-menu'); await tapSel('button', 'Save world'); await sleep(4000);
  });
  await step('restart and continue', async () => {
    await device.shell(`am force-stop ${PKG}`); await sleep(1500);
    await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(6000);
    const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
    page = await webview.page();
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await sleep(1500); await shot('14-title-again');
    await tapSel('button', 'Continue'); await page.waitForFunction(() => window.app.sim, null, { timeout: 120000 }); await sleep(2000);
    results.loadedYear = await page.evaluate(() => window.app.sim.year);
    await shot('15-continued');
  });
  results.summary = await page.evaluate(() => { const s = window.app.sim; return s ? { year: s.year, people: s.peopleCount, realms: s.kingdoms.filter(k => k.alive).length, towns: s.cities.filter(c => c.alive).length, wars: s.wars.length } : null; }).catch(() => null);
  log('summary', JSON.stringify(results.summary));
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(0);
})().catch(e => { console.error(e); results.errors.push('fatal: ' + e.message); fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2)); process.exit(1); });
