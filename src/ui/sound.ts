// Small synthesized sounds (no audio files): clicks, booms, thunder, swords, bells, spawns.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
export let soundOn = true;
try { soundOn = localStorage.getItem('bcw-sound') !== '0'; } catch { /* storage blocked */ }

export function setSound(on: boolean) { soundOn = on; try { localStorage.setItem('bcw-sound', on ? '1' : '0'); } catch { /* ignore */ } }

let unlocked = false;
if (typeof window !== 'undefined') addEventListener('pointerdown', () => { unlocked = true; }, { capture: true });
function ac(): AudioContext | null {
  if (!soundOn || !unlocked) return null;
  if (!ctx) {
    const C = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C() as AudioContext;
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function noise(c: AudioContext, dur: number): AudioBufferSourceNode {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(); s.buffer = b; return s;
}
function env(c: AudioContext, g: GainNode, a: number, d: number, peak: number) {
  const t = c.currentTime;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
  const c = ac(); if (!c || !master) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + dur);
  o.connect(g); g.connect(master); env(c, g, 0.005, dur, vol); o.start(); o.stop(c.currentTime + dur + 0.05);
}
function burst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass') {
  const c = ac(); if (!c || !master) return;
  const n = noise(c, dur), f = c.createBiquadFilter(), g = c.createGain();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  n.connect(f); f.connect(g); g.connect(master); env(c, g, 0.01, dur, vol); n.start();
}

let last: Record<string, number> = {};
/** play a sound by name (rate limited per kind) */
export function sfx(kind: string) {
  if (!soundOn || !unlocked) return;
  const now = performance.now();
  if (now - (last[kind] || 0) < 60) return;
  last[kind] = now;
  switch (kind) {
    case 'click': tone('square', 660, 520, 0.05, 0.08); break;
    case 'tab': tone('triangle', 520, 600, 0.06, 0.08); break;
    case 'spawn': tone('sine', 300, 900, 0.16, 0.12); break;
    case 'paint': burst(0.06, 900, 0.7, 0.05); break;
    case 'boom': burst(0.9, 260, 0.8, 0.6); tone('sine', 90, 30, 0.6, 0.4); break;
    case 'nuke': burst(2.2, 180, 0.6, 0.8); tone('sine', 60, 20, 2, 0.5); break;
    case 'thunder': burst(1.4, 400, 0.5, 0.5); break;
    case 'rain': burst(0.5, 3000, 0.4, 0.06, 'highpass'); break;
    case 'fire': burst(0.4, 1200, 0.6, 0.12, 'bandpass'); break;
    case 'quake': burst(1.6, 120, 1, 0.6); tone('sawtooth', 50, 35, 1.4, 0.15); break;
    case 'bless': tone('sine', 660, 990, 0.35, 0.12); setTimeout(() => tone('sine', 880, 1320, 0.35, 0.1), 90); break;
    case 'curse': tone('sawtooth', 220, 110, 0.5, 0.08); break;
    case 'bell': tone('sine', 880, 870, 0.9, 0.12); tone('sine', 1320, 1310, 0.6, 0.05); break;
    case 'war': tone('sawtooth', 147, 140, 0.25, 0.1); setTimeout(() => tone('sawtooth', 196, 190, 0.45, 0.1), 220); break;
    case 'clash': burst(0.08, 4000, 2, 0.06, 'bandpass'); break;
    case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.25, 0.1), i * 120)); break;
    case 'death': tone('triangle', 400, 200, 0.4, 0.08); break;
  }
}
