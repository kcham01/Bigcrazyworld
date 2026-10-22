// Taps through TBCrushCalc on an Android emulator with real touches (adb input) and the real Back
// button, and records screenshots, checks and any page errors in results.json.
const { _android } = require('playwright');
const fs = require('fs');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const PKG = 'app.tbcrushcalc';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = { steps: [], checks: {}, errors: [] };
const log = (...a) => { console.log(...a); results.steps.push(a.join(' ')); };
const save = () => fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));

(async () => {
  const [device] = await _android.devices();
  const shot = async name => { await sleep(1200); fs.writeFileSync(path.join(SHOTS, name + '.png'), await device.shell('screencap -p')); log('shot', name); };
  let page;
  const attach = async () => {
    const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
    page = await webview.page();
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) results.errors.push('console: ' + m.text()); });
    page.on('pageerror', e => { results.errors.push('pageerror: ' + String(e)); console.log('  [page error]', String(e)); });
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  };
  // the emulator's Play services sometimes restart in the first minutes and take the app down with them
  // (it uses their fonts provider): start the app again, up to three times
  for (let attempt = 1; ; attempt++) {
    try { await attach(); break; } catch (e) {
      log(`no webview (attempt ${attempt}): ${e.message.split('\n')[0]}`);
      if (attempt >= 3) { await shot('no-webview'); results.errors.push('no webview: ' + e.message); save(); process.exit(1); }
      await device.shell(`am force-stop ${PKG}`); await sleep(5000);
      await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(8000);
    }
  }

  const size = (await device.shell('wm size')).toString().match(/(\d+)x(\d+)/);
  const W = +size[1], H = +size[2];
  // where page pixels land on screen (status bar offset)
  let off = null;
  const calibrate = async (retry = true) => {
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = '__cal'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent';
      d.addEventListener('pointerdown', e => { window.__calib = [e.clientX, e.clientY]; e.stopPropagation(); e.preventDefault(); }, true);
      document.body.appendChild(d); window.__calib = null;
    });
    let cal = null;
    for (let k = 0; k < 6 && !cal; k++) { await device.shell(`input tap ${Math.round(W / 2)} ${Math.round(H / 2)}`); await sleep(1200); cal = await page.evaluate(() => window.__calib); }
    const dpr = await page.evaluate(() => { document.getElementById('__cal')?.remove(); return window.devicePixelRatio; });
    if (!cal && retry) {
      // the emulator sometimes starts the app with a window that never draws or takes touches:
      // start it again once before giving up
      log('calibration tap never arrived: restarting the app');
      await shot('00-not-drawing');
      await device.shell(`am force-stop ${PKG}`); await sleep(1500);
      await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(8000);
      await attach();
      return calibrate(false);
    }
    if (!cal) { results.errors.push('calibration tap never arrived'); cal = [W / 2 / dpr, H / 2 / dpr]; }
    off = { dpr, x: W / 2 - cal[0] * dpr, y: H / 2 - cal[1] * dpr };
    log(`screen ${W}x${H} dpr ${dpr} offset ${off.x.toFixed(0)},${off.y.toFixed(0)}`);
  };
  // the same Play services restart can come a few seconds later, while calibrating: start again then too
  for (let attempt = 1; ; attempt++) {
    try { await calibrate(); break; } catch (e) {
      log(`app went away while starting (attempt ${attempt}): ${e.message.split('\n')[0]}`);
      if (attempt >= 3) throw e;
      await device.shell(`am force-stop ${PKG}`); await sleep(5000);
      await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(8000);
      await attach();
    }
  }
  const tapAt = async (x, y) => device.shell(`input tap ${Math.round(off.x + x * off.dpr)} ${Math.round(off.y + y * off.dpr)}`);
  const tapSel = async (sel, text) => {
    const loc = text ? page.locator(sel, { hasText: text }).first() : page.locator(sel).first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const box = await loc.boundingBox();
    if (!box) throw new Error('not found: ' + sel + ' ' + (text || ''));
    await tapAt(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(700);
  };
  const back = async () => { await device.shell('input keyevent 4'); await sleep(900); };
  const sheets = () => page.locator('.scrim').count();
  const check = (name, ok, detail = '') => { results.checks[name] = ok ? 'pass' : 'FAIL ' + detail; log(ok ? 'pass' : 'FAIL', name, detail); };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) {
      results.errors.push(name + ': ' + e.message); log('FAILED', name, e.message);
      if (/closed/.test(e.message)) {
        // the app or its page went away: record why, then bring it back so the other steps still run
        await shot('crash-' + name.replace(/\W+/g, '-'));
        const why = (await device.shell(`dumpsys activity exit-info ${PKG}`)).toString().split('\n').slice(0, 40).join('\n');
        results.exitInfo = (results.exitInfo || []).concat([why]); log('exit info', why.replace(/\s+/g, ' ').slice(0, 600));
        await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(6000);
        await attach(); await calibrate();
      }
    }
  };

  await sleep(4000);   // let the Wowhead icons load
  await shot('01-character');
  check('opens on an example character', (await page.locator('#top .nm').textContent()).includes('Example'));

  await step('equip an item', async () => {
    await tapSel('.doll .slot.filled');
    await shot('02-slot');
    await tapSel('.sheet .btn', 'Change item');
    await shot('03-picker');
    const picker = page.locator('.scrim').last();
    const name = (await picker.locator('.li .nm').nth(1).textContent()).trim();
    const box = await picker.locator('.li').nth(1).boundingBox();
    await tapAt(box.x + box.width / 2, box.y + box.height / 2); await sleep(700);
    await shot('04-preview');
    await tapSel('.sheet .btn', 'Equip');
    await sleep(500);
    await shot('05-equipped');
    const tt = await page.locator('.scrim').last().locator('.tt .tn').first().textContent();
    check('picked item is equipped', tt.trim() === name, `${tt} vs ${name}`);
    await back();
    check('Back closes the panel', (await sheets()) === 0);
  });

  await step('gems', async () => {
    await tapSel('.doll .slot.filled');
    const n = await page.locator('.sheet .li', { hasText: 'Socket' }).count();
    if (n) {
      await tapSel('.sheet .li', 'Socket');
      await shot('06-gems');
      const gem = (await page.locator('.scrim').last().locator('.li .nm').first().textContent()).trim();
      await tapSel('.scrim:last-of-type .li');
      await shot('07-gemmed');
      check('gem goes in the socket', (await page.locator('.scrim').last().textContent()).includes(gem), gem);
    }
    while (await sheets()) await back();
  });

  await step('talents', async () => {
    await tapSel('#tabs .tab', 'Talents');
    await shot('08-talents');
    await tapSel('.tal.maxed');
    await shot('09-talent');
    await back();
  });

  await step('buffs', async () => {
    await tapSel('#tabs .tab', 'Buffs');
    await shot('10-buffs');
    const before = await page.locator('#top .verdict').textContent();
    await tapSel('.bt', 'Holy Shield');
    const after = await page.locator('#top .verdict').textContent();
    check('Holy Shield toggle changes the total', before !== after, `${before} -> ${after}`);
    await tapSel('.bt', 'Holy Shield');
    // food drop-down
    await tapSel('.selrow', 'Food');
    await shot('10b-food');
    await tapSel('.scrim:last-of-type .li', 'Spicy Crawdad');
    check('food picked from the list', (await page.locator('.selrow', { hasText: 'Food' }).textContent()).includes('Spicy Crawdad'));
    // flask closes the elixir slots
    check('flask closes the elixir rows', (await page.locator('.selrow.dis', { hasText: 'Battle Elixir' }).count()) === 1);
    // a raid buff: tap on, tap again for improved, tap again off
    const might = page.locator('.bt', { hasText: 'Blessing of Might' });
    await tapSel('.bt', 'Blessing of Might');
    check('raid buff switches on', (await might.getAttribute('class')).includes('on'));
    await tapSel('.bt', 'Blessing of Might');
    check('second tap: improved', (await might.getAttribute('class')).includes('imp'));
    await tapSel('.bt', 'Blessing of Might');
    check('third tap: off', (await might.getAttribute('class')).includes('off'));
    await shot('10c-buff-grid');
    // the boss
    await tapSel('.selrow', 'Boss');
    await shot('10d-bosses');
    await tapSel('.scrim:last-of-type .li', 'Gruul the Dragonkiller');
    await shot('10e-gruul');
    check('boss picked', (await page.locator('.selrow', { hasText: 'Boss' }).textContent()).includes('Gruul'));
  });

  await step('caps', async () => {
    await tapSel('#tabs .tab', 'Caps');
    await shot('11-caps');
    check('caps screen shows the boss', (await page.locator('.frame').first().textContent()).includes('Gruul'));
    check('damage taken for the boss', /Normal hit on you/.test(await page.locator('.frame', { hasText: 'Normal hit on you' }).first().textContent()));
    await page.locator('#view').evaluate(v => { v.scrollTop = 900; });
    await shot('12-caps-more');
  });

  await step('new character', async () => {
    await tapSel('#tabs .tab', 'Saved');
    await shot('13-saved');
    await tapSel('.btn', 'New character');
    await tapSel('.sheet input');
    await device.shell('input text Tester');
    await sleep(500);
    await back();                       // hides the keyboard (or closes the panel on some images)
    if (!(await sheets())) {
      await tapSel('.btn', 'New character');
      await tapSel('.sheet input');
      await device.shell('input text Tester');
      await sleep(500);
    }
    await tapSel('.sheet .chip', 'Druid');
    await shot('14-new');
    await tapSel('.sheet .btn', 'Create');
    await sleep(800);
    await shot('15-new-talents');
    check('new character is open', (await page.locator('#top .nm').textContent()).includes('Tester'));
    await back();
    check('Back goes to the Character screen', await page.locator('#tabs .tab.on', { hasText: 'Character' }).count() === 1);
    await shot('16-druid');
  });

  await step('restart keeps characters', async () => {
    await device.shell(`am force-stop ${PKG}`); await sleep(1500);
    await device.shell(`am start -W -n ${PKG}/.MainActivity --ez devtools true`); await sleep(6000);
    await attach();
    await sleep(2500);
    await shot('17-after-restart');
    check('saved character survives a restart', (await page.locator('#top .nm').textContent()).includes('Tester'));
    check('four characters saved', (await page.evaluate(() => JSON.parse(localStorage.getItem('tbcc.profiles.v1') || '[]').length)) === 4);
  });

  await step('wowhead link leaves the app', async () => {
    await calibrate();
    await tapSel('.doll .slot.filled');
    await tapSel('.sheet .tt a', 'Wowhead');
    await sleep(2500);
    const focus = (await device.shell('dumpsys window | grep -E "mCurrentFocus|mFocusedApp"')).toString();
    log('focus after link', focus.replace(/\s+/g, ' ').slice(0, 200));
    await shot('18-link');
    await device.shell(`am start -n ${PKG}/.MainActivity`); await sleep(2000);
    const url = await page.evaluate(() => location.href).catch(() => '');
    check('app page stays on the app', url.includes('appassets.androidplatform.net'), url);
  });

  log('errors', results.errors.length);
  save();
  process.exit(0);
})().catch(e => { console.error(e); results.errors.push('fatal: ' + e.message); save(); process.exit(1); });
