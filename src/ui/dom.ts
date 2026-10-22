// Tiny DOM helpers.
import { iconUrl } from '../data';

type Child = Node | string | number | null | undefined | false | Child[];
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, any> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}
export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

/** an item / spell icon from Wowhead's image server; falls back to a lettered tile when offline */
export function icon(name: string | undefined, size: number, fallback: string, cls = ''): HTMLElement {
  const box = h('span', { class: 'icon ' + cls, style: { width: size + 'px', height: size + 'px' } });
  if (!name) { box.appendChild(h('span', { class: 'icon-fallback' }, fallback.slice(0, 2))); return box; }
  const img = h('img', { src: iconUrl(name, size > 40 ? 'large' : 'medium'), alt: '', loading: 'lazy', draggable: 'false' });
  img.onerror = () => { img.remove(); box.appendChild(h('span', { class: 'icon-fallback' }, fallback.slice(0, 2))); };
  box.appendChild(img);
  return box;
}

export const fmt = (n: number, d = 2) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
export const pct = (n: number, d = 2) => fmt(n, d) + '%';
export const signed = (n: number) => (n >= 0 ? '+' : '') + n;

/** tap does one thing, press and hold (or right-click) another; a finger that moves (scrolling) does neither */
export function pressable(el: HTMLElement, onTap: () => void, onHold: () => void) {
  let timer = 0, held = false, x = 0, y = 0, down = false;
  const cancel = () => { clearTimeout(timer); down = false; };
  el.addEventListener('pointerdown', e => {
    down = true; held = false; x = e.clientX; y = e.clientY;
    timer = window.setTimeout(() => { if (down) { held = true; down = false; onHold(); } }, 450);
  });
  el.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - x, e.clientY - y) > 10) cancel(); });
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointerup', () => { const was = down; cancel(); if (was && !held) onTap(); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); if (!held) { held = true; onHold(); } });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
}
