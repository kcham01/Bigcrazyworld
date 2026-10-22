// Entry point: starts the game. URL options (for testing): ?seed=a&size=192&years=60&city=0&zoom=18&tab=...
import { App } from './ui/app';
import { DEFAULT_GEN } from './sim/worldgen';
import { DEFAULT_START } from './sim/setup';

import { gallery } from './ui/gallery';
const q = new URLSearchParams(location.search);
const app = q.get('gallery') ? null as unknown as App : new App();
if (q.get('gallery')) { gallery(q.get('gallery')!); }
else if (q.get('seed')) {
  const size = +(q.get('size') || 192);
  app.newWorld({ ...DEFAULT_GEN, w: size, h: size, seed: q.get('seed')!, shape: (q.get('shape') as any) || DEFAULT_GEN.shape }, { ...DEFAULT_START, races: (q.get('races') || DEFAULT_START.races.join(',')).split(',') });
  const sim = app.sim!;
  const years = +(q.get('years') || 0);
  for (let t = 0; t < years * 240; t++) sim.step();
  if (q.get('night') === '0') sim.laws.dayNight = false;
  if (q.get('speed')) app.setSpeed(+q.get('speed')!); else app.setSpeed(0);
  const ci = q.get('city');
  if (ci !== null) { const c = sim.cities.filter(c => c.alive).sort((a, b) => b.pop - a.pop)[+ci]; if (c) { app.cam.x = c.x + 1; app.cam.y = c.y + 1; app.cam.zoom = +(q.get('zoom') || 16); } }
  else if (q.get('zoom')) { app.cam.zoom = +q.get('zoom')!; app.cam.x = +(q.get('x') || sim.world.w / 2); app.cam.y = +(q.get('y') || sim.world.h / 2); }
  if (q.get('panel')) app.select({ kind: 'panel', id: q.get('panel')! });
  if (q.get('inspect') === 'city') { const c = sim.cities.filter(c => c.alive).sort((a, b) => b.pop - a.pop)[0]; if (c) app.select({ kind: 'city', id: c.id }); }
  if (q.get('inspect') === 'kingdom') { const k = sim.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop)[0]; if (k) app.select({ kind: 'kingdom', id: k.id }); }
  if (q.get('inspect') === 'unit') { const k = sim.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop)[0]; if (k) app.select({ kind: 'unit', uid: k.ruler }); }
  if (q.get('cat')) { (app as any).buildHud(); }
} else if (q.get('menu') === 'creator') app.creator();
else app.titleScreen();

// keep the world safe when the app goes to the background
setInterval(() => { if (app && app.sim && app.speed) app.save(true); }, 180000);
document.addEventListener('visibilitychange', () => { if (document.hidden && app && app.sim) app.save(true); });
if (!q.get('gallery')) (window as any).__ready = true;
