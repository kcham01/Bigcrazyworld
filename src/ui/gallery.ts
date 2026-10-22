// A sprite sheet for reviewing the art: ?gallery=buildings | creatures
import { paintBuilding, STYLE_NAMES, paintTree } from '../render/buildings';
import { paintPerson, paintAnimal, Gear } from '../render/creatures';
import { BUILDINGS } from '../sim/entities';
import { SPECIES } from '../sim/species';
import type { Pix } from '../render/pixels';

function resolve(p: Pix, t1: number, t2: number) {
  for (let i = 0; i < p.d.length; i += 4) {
    const a = p.d[i + 3];
    if (a === 204 || a === 153) { const t = a === 204 ? t1 : t2, k = p.d[i] / 160; p.d[i] = Math.min(255, ((t >> 16) & 255) * k); p.d[i + 1] = Math.min(255, ((t >> 8) & 255) * k); p.d[i + 2] = Math.min(255, (t & 255) * k); p.d[i + 3] = 255; }
    else if (a === 102) p.d[i + 3] = 255;
  }
}
export function gallery(kind: string) {
  document.body.innerHTML = '';
  document.body.style.overflow = 'auto';
  const c = document.createElement('canvas');
  const S = 3;
  c.width = 1900; c.height = 4000;
  c.style.cssText = 'position:static;width:auto;height:auto;image-rendering:pixelated;background:#5fa83f';
  document.body.append(c);
  const g = c.getContext('2d')!;
  g.fillStyle = '#5fa83f'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  const blit = (p: Pix, x: number, y: number) => { const t = document.createElement('canvas'); t.width = p.w; t.height = p.h; t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.d), p.w, p.h), 0, 0); g.drawImage(t, x, y, p.w * S, p.h * S); };
  let x = 10, y = 10, rowH = 0;
  g.font = '12px monospace'; g.fillStyle = '#000';
  if (kind === 'buildings') {
    const style = +(new URLSearchParams(location.search).get('style') || 0);
    for (const era of [0, 1, 2, 3, 4]) {
      g.fillStyle = '#000'; g.fillText(`${STYLE_NAMES[style]} era ${era}`, 10, y + 10); y += 16;
      x = 10; rowH = 0;
      for (const b of BUILDINGS) {
        if (b.key === 'bridge') continue;
        const a = paintBuilding(b.key, style, era, b.w, b.h, 7, 0);
        resolve(a.pix, 0x3a7be0, 0);
        if (x + a.pix.w * S > c.width - 10) { x = 10; y += rowH + 8; rowH = 0; }
        blit(a.pix, x, y);
        x += a.pix.w * S + 6; rowH = Math.max(rowH, a.pix.h * S);
      }
      y += rowH + 20;
    }
  } else {
    const gears: Gear[] = ['civ', 'farm', 'wood', 'mine', 'build', 'sold', 'arch', 'mage', 'priest', 'ruler', 'hero', 'child'];
    for (const d of SPECIES.filter(s => s.sapient)) {
      x = 10;
      for (const gear of gears) for (const tier of gear === 'sold' || gear === 'arch' ? [0, 2, 4, 6, 8] : [0]) {
        const p = paintPerson({ build: d.build || 'human', female: false, frame: 0, gear, tier, hair: 1 }); resolve(p, 0x3a7be0, 0xe8b796);
        blit(p, x, y); x += p.w * S + 2;
      }
      y += 18 * S + 4;
    }
    x = 10;
    for (const d of SPECIES.filter(s => !s.sapient)) {
      const p = paintAnimal(d.key, 0); resolve(p, 0x3a7be0, d.color);
      if (x + p.w * S > c.width - 10) { x = 10; y += 34 * S; }
      blit(p, x, y); x += p.w * S + 8;
    }
    y += 40 * S; x = 10;
    for (let t = 1; t < 17; t++) { const p = paintTree(t, 0, false); resolve(p, 0, 0); blit(p, x, y); x += p.w * S + 6; }
  }

  (window as any).__ready = true;
}
