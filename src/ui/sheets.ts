// Pop-up panels that slide up from the bottom, with a back stack for the Android back button.
import { h } from './dom';

const stack: { el: HTMLElement; onClose?: () => void }[] = [];

export function openSheet(title: string, body: HTMLElement, opts: { full?: boolean; onClose?: () => void; actions?: HTMLElement } = {}): { close: () => void; body: HTMLElement; setTitle: (t: string) => void } {
  const t = h('div', { class: 't' }, title);
  const closeBtn = h('button', { class: 'close', 'aria-label': 'Close' }, '✕');
  const bodyWrap = h('div', { class: 'body' }, body);
  const sheet = h('div', { class: 'sheet rock' + (opts.full ? ' full' : '') }, h('div', { class: 'head' }, t, opts.actions || null, closeBtn), bodyWrap);
  const scrim = h('div', { class: 'scrim' }, sheet);
  const entry = { el: scrim, onClose: opts.onClose };
  const close = () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    scrim.remove();
    entry.onClose?.();
  };
  closeBtn.onclick = close;
  scrim.addEventListener('click', e => { if (e.target === scrim) close(); });
  document.body.appendChild(scrim);
  stack.push(entry);
  return { close, body: bodyWrap, setTitle: (s: string) => { t.textContent = s; } };
}

/** closes the top sheet; false when there was none */
export function closeTop(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  stack.pop();
  top.el.remove();
  top.onClose?.();
  return true;
}
export function closeAll() { while (closeTop()) { /* keep closing */ } }

let toastTimer = 0;
export function toast(text: string) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = h('div', { class: 'toast' }, text);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), 1800);
}

/** a confirmation built into the page (the WebView has no confirm()) */
export function confirmSheet(title: string, text: string, yes: string, onYes: () => void) {
  const body = h('div', null, h('p', { class: 'note' }, text));
  const s = openSheet(title, body);
  body.appendChild(h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } },
    h('button', { class: 'btn dark', onclick: () => s.close() }, 'Cancel'),
    h('button', { class: 'btn', onclick: () => { s.close(); onYes(); } }, yes)));
}
