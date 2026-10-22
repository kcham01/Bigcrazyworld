// Draws the ground. The CPU keeps per-tile textures (colour+height, flags, ownership, overlay) up to date
// chunk by chunk; the fragment shader turns each tile into 8×8 pixel-art detail with soft dithered
// edges, hill shading, animated water and foam, roads, fields, ore specks, fire, borders and night.
import { compile, makeTex, uniforms } from './gl';
import { World, CHUNK } from '../sim/world';
import { B, BIOMES, ORE_COLORS, SEA, Tree } from '../sim/defs';
import { hash2 } from '../sim/rng';

function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, 3), b = hash2(xi + 1, yi, 3), c = hash2(xi, yi + 1, 3), d = hash2(xi + 1, yi + 1, 3);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}

export const TREE_COLORS: number[] = [
  0, 0x2f6b2a, 0x24543a, 0x4f9a3a, 0x1f6b25, 0x6aa84f, 0x6b5a45, 0x9fe6ff, 0xb5574f, 0xff8fc8, 0x3f8a2a,
  0x5f9e3f, 0x8a9a3a, 0x3f6f58, 0x5f8f4a, 0x7fe0b0, 0x7a3f8a,
];

const VS = `#version 300 es
in vec2 aPos;
uniform vec4 uView; // x0, y0 (world at screen top-left), w, h (world units on screen)
uniform float uFlip;
out vec2 vWorld;
void main() {
  vWorld = uView.xy + aPos * uView.zw;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, (1.0 - aPos.y * 2.0) * uFlip, 0.0, 1.0);
}`;

const BAKE_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vWorld;
out vec4 o;
uniform sampler2D uTile, uInfo;
uniform vec2 uMap;
uniform vec3 uOreCol[9];

float hsh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec4 tileAt(ivec2 t) { return texelFetch(uTile, clamp(t, ivec2(0), ivec2(uMap) - 1), 0); }
vec4 infoAt(ivec2 t) { return texelFetch(uInfo, clamp(t, ivec2(0), ivec2(uMap) - 1), 0); }
int flagsAt(ivec2 t) { return int(infoAt(t).r * 255.0 + 0.5); }

void main() {
  vec2 p = vWorld;
  if (p.x < 0.0 || p.y < 0.0 || p.x >= uMap.x || p.y >= uMap.y) { o = vec4(0.04, 0.06, 0.11, 1.0); return; }
  ivec2 t = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 sp = floor(f * 8.0);           // 8×8 art pixels per tile
  vec2 gp = vec2(t) * 8.0 + sp;       // global art pixel
  float hn = hsh(gp);
  int fl = flagsAt(t);
  bool water = (fl & 1) != 0, river = (fl & 2) != 0, lava = (fl & 8) != 0;

  // dithered edges: pixels near a tile border sometimes take the neighbour's look
  ivec2 src = t;
  float edgeChance = 0.42;
  if (sp.x < 1.0 && hn < edgeChance) src = t + ivec2(-1, 0);
  else if (sp.x > 6.0 && hn < edgeChance) src = t + ivec2(1, 0);
  else if (sp.y < 1.0 && hn < edgeChance) src = t + ivec2(0, -1);
  else if (sp.y > 6.0 && hn < edgeChance) src = t + ivec2(0, 1);
  else if (sp.x < 2.0 && sp.y < 2.0 && hn < 0.2) src = t + ivec2(-1, -1);
  int sfl = flagsAt(src);
  if (((sfl & 1) != 0) != water && !river) src = t;      // keep coastlines crisp-ish
  vec4 tile = tileAt(src);
  vec4 info = infoAt(src);
  int flg = flagsAt(src);
  vec3 c = tile.rgb;
  bool w = (flg & 1) != 0, rv = (flg & 2) != 0;

  // per-pixel texture
  c *= 0.93 + 0.12 * hn;

  // hill shading from the height kept in alpha
  vec2 pc = (vec2(t) + (sp + 0.5) / 8.0) - 0.5;
  ivec2 t0 = ivec2(floor(pc)); vec2 fr = fract(pc);
  float h00 = tileAt(t0).a, h10 = tileAt(t0 + ivec2(1, 0)).a, h01 = tileAt(t0 + ivec2(0, 1)).a, h11 = tileAt(t0 + ivec2(1, 1)).a;
  vec2 grad = vec2(mix(h10 - h00, h11 - h01, fr.y), mix(h01 - h00, h11 - h10, fr.x)) * 2.0;
  if (!w) c *= clamp(1.0 - dot(grad, vec2(1.0, 1.4)) * 2.2, 0.72, 1.25);

  if (w || rv) {
    // water: depth shading, drifting glints, foam along the shore
    if (!rv) {
      bool shore = (flagsAt(t + ivec2(1,0)) & 1) == 0 || (flagsAt(t + ivec2(-1,0)) & 1) == 0 || (flagsAt(t + ivec2(0,1)) & 1) == 0 || (flagsAt(t + ivec2(0,-1)) & 1) == 0;
      if (shore) {
        float d = 9.0;
        if ((flagsAt(t + ivec2(1,0)) & 1) == 0) d = min(d, 7.0 - sp.x);
        if ((flagsAt(t + ivec2(-1,0)) & 1) == 0) d = min(d, sp.x);
        if ((flagsAt(t + ivec2(0,1)) & 1) == 0) d = min(d, 7.0 - sp.y);
        if ((flagsAt(t + ivec2(0,-1)) & 1) == 0) d = min(d, sp.y);
        float foam = step(d, 1.0 + step(0.5, hsh(vec2(t) + sp.yx)) * 0.9);
        c = mix(c, vec3(0.86, 0.93, 0.97), foam * 0.55 * step(0.25, hn));
      }
    }
  }

  // fields: furrows that go from green to gold
  if ((flg & 32) != 0 && !w) {
    float g = info.a;
    vec3 crop = mix(vec3(0.42, 0.62, 0.22), vec3(0.86, 0.72, 0.28), clamp(g * 1.2, 0.0, 1.0));
    if (g < 0.02) crop = vec3(0.45, 0.33, 0.2);
    float row = mod(sp.y, 2.0);
    c = row < 1.0 ? crop * (0.9 + 0.1 * hn) : vec3(0.47, 0.34, 0.2) * (0.92 + 0.1 * hn);
  }

  // roads: a band through the middle reaching toward neighbouring roads
  int road = int(info.b * 255.0 + 0.5) >> 4;
  if (road > 0 && !w) {
    ivec2 cc = ivec2(sp);
    bool on = cc.x >= 3 && cc.x <= 4 && cc.y >= 3 && cc.y <= 4;
    if ((int(infoAt(src + ivec2(1,0)).b*255.0+0.5) >> 4) > 0 && cc.y >= 3 && cc.y <= 4 && cc.x >= 3) on = true;
    if ((int(infoAt(src + ivec2(-1,0)).b*255.0+0.5) >> 4) > 0 && cc.y >= 3 && cc.y <= 4 && cc.x <= 4) on = true;
    if ((int(infoAt(src + ivec2(0,1)).b*255.0+0.5) >> 4) > 0 && cc.x >= 3 && cc.x <= 4 && cc.y >= 3) on = true;
    if ((int(infoAt(src + ivec2(0,-1)).b*255.0+0.5) >> 4) > 0 && cc.x >= 3 && cc.x <= 4 && cc.y <= 4) on = true;
    if (road >= 3 && (cc.x == 2 || cc.x == 5 || cc.y == 2 || cc.y == 5) && hn < 0.5) on = on || false;
    if (on) {
      vec3 rc = road == 1 ? vec3(0.62, 0.5, 0.33) : road == 2 ? vec3(0.58, 0.55, 0.5) : road == 3 ? vec3(0.5, 0.5, 0.52) : vec3(0.22, 0.22, 0.24);
      c = rc * (0.9 + 0.15 * hn);
      if (road == 4 && cc.x == 3 && mod(sp.y, 3.0) < 1.0) c = vec3(0.9, 0.85, 0.4);
    } else if (rv) {
      // bridge planks over the river
      c = mix(c, vec3(0.5, 0.36, 0.22), 0.0);
    }
  }
  if (road > 0 && rv) {
    // a bridge deck
    if (sp.y >= 2.0 && sp.y <= 5.0) c = (mod(sp.x, 2.0) < 1.0 ? vec3(0.55, 0.4, 0.25) : vec3(0.47, 0.33, 0.2));
  }

  // ore specks on rock
  int ore = int(info.b * 255.0 + 0.5) & 15;
  if (ore > 0 && !w) {
    float k = hsh(gp * 1.7);
    if (k > 0.72) c = uOreCol[ore] * (0.85 + 0.3 * hsh(gp + 3.0));
    else if (k > 0.55) c *= 0.82;
  }

  if (lava) c = vec3(0.9, 0.35, 0.08) * (0.85 + 0.3 * hn);
  o = vec4(c, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vWorld;
out vec4 o;
uniform sampler2D uBake, uInfo, uOwn, uOver, uKCol;
uniform vec2 uMap;
uniform float uTime, uZoom, uLight, uTreesInShader, uTint, uOverAlpha, uBorders, uCityBorders, uScale;
uniform vec3 uTreeCol[17];

float hsh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec4 infoAt(ivec2 t) { return texelFetch(uInfo, clamp(t, ivec2(0), ivec2(uMap) - 1), 0); }
ivec2 ownAt(ivec2 t) { vec4 v = texelFetch(uOwn, clamp(t, ivec2(0), ivec2(uMap) - 1), 0); return ivec2(int(v.r*255.0+0.5) + int(v.g*255.0+0.5)*256, int(v.b*255.0+0.5) + int(v.a*255.0+0.5)*256); }
vec3 kcol(int k) { return texelFetch(uKCol, ivec2(k % 256, k / 256), 0).rgb; }

void main() {
  vec2 p = vWorld;
  if (p.x < 0.0 || p.y < 0.0 || p.x >= uMap.x || p.y >= uMap.y) { o = vec4(0.05, 0.075, 0.14, 1.0); return; }
  ivec2 t = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 sp = floor(f * 8.0);
  vec2 gp = vec2(t) * 8.0 + sp;
  vec3 c = texelFetch(uBake, ivec2(floor(p * uScale)), 0).rgb;
  vec4 info = infoAt(t);
  int fl = int(info.r * 255.0 + 0.5);
  bool water = (fl & 1) != 0, river = (fl & 2) != 0, lava = (fl & 8) != 0;
  float hn = hsh(gp);
  if (water || river) {
    float wave = sin(gp.x * 0.35 + gp.y * 0.22 + uTime * 1.6) * sin(gp.y * 0.4 - uTime * 1.1 + hsh(vec2(t)) * 6.28);
    c *= 0.96 + 0.06 * wave;
    if (hsh(gp + floor(uTime * 1.5)) > 0.987) c += vec3(0.16);
  }
  // trees as dots when zoomed out (sprites take over up close)
  int tr = int(info.g * 255.0 + 0.5);
  if (uTreesInShader > 0.5 && tr > 0 && !water) {
    vec2 q = sp - vec2(3.5, 3.0);
    if (dot(q, q) < 9.5 + 3.0 * hn) c = uTreeCol[tr] * (0.85 + 0.25 * hn) * (sp.y < 3.0 ? 1.12 : 0.95);
  }
  vec3 glow = vec3(0.0);
  if (lava) {
    float m = 0.5 + 0.5 * sin(gp.x * 0.5 + uTime * 2.0 + hsh(vec2(t)) * 6.0) * sin(gp.y * 0.4 - uTime * 1.4);
    c = mix(vec3(0.85, 0.2, 0.05), vec3(1.0, 0.75, 0.2), m * (0.7 + 0.3 * hn));
    glow = c * 0.8;
  }
  float fire = (fl & 16) != 0 ? info.a : 0.0;
  if (fire > 0.0) {
    float fl2 = hsh(gp + floor(uTime * 10.0));
    vec3 fc = mix(vec3(0.95, 0.3, 0.05), vec3(1.0, 0.85, 0.2), fl2);
    if (fl2 > 0.35) { c = mix(c * 0.3, fc, 0.85); glow += fc * 0.9 * fire; }
    else c *= 0.35;
  }
  ivec2 own = ownAt(t);
  int k = own.x;
  if (k > 0 && uTint > 0.0 && !water) c = mix(c, kcol(k), uTint);
  if (uBorders > 0.5 && k > 0) {
    float lw = max(1.0, 1.6 / max(uZoom, 0.001) * 8.0);
    vec2 d8 = f * 8.0;
    float near = min(min(d8.x, 8.0 - d8.x), min(d8.y, 8.0 - d8.y));
    if (near < lw) {
      ivec2 nb[4] = ivec2[4](ivec2(-1,0), ivec2(1,0), ivec2(0,-1), ivec2(0,1));
      float dl[4] = float[4](d8.x, 8.0 - d8.x, d8.y, 8.0 - d8.y);
      for (int i = 0; i < 4; i++) {
        if (dl[i] >= lw) continue;
        ivec2 on2 = ownAt(t + nb[i]);
        if (on2.x != k) { c = mix(c, kcol(k) * 1.15 + 0.05, 0.9); break; }
        if (uCityBorders > 0.5 && on2.y != own.y && dl[i] < lw * 0.6 && mod(gp.x + gp.y, 2.0) < 1.0) { c = mix(c, kcol(k), 0.45); break; }
      }
    }
  }
  if (uOverAlpha > 0.0) { vec4 ov = texelFetch(uOver, t, 0); if (ov.a > 0.0) c = mix(c, ov.rgb, ov.a * uOverAlpha); }
  c = c * uLight + glow * (1.0 - uLight) * 0.9;
  o = vec4(c, 1.0);
}`;

export class TerrainRenderer {
  gl: WebGL2RenderingContext;
  world!: World;
  prog: WebGLProgram; u: Record<string, WebGLUniformLocation>;
  bakeProg: WebGLProgram; ub: Record<string, WebGLUniformLocation>;
  bakeTex: WebGLTexture | null = null; fbo: WebGLFramebuffer | null = null; scale = 8; bakeQueue: number[] = []; bakeMark!: Uint8Array;
  vao: WebGLVertexArrayObject;
  tileTex!: WebGLTexture; infoTex!: WebGLTexture; ownTex!: WebGLTexture; overTex!: WebGLTexture; kcolTex: WebGLTexture;
  tileBuf = new Uint8Array(CHUNK * CHUNK * 4); infoBuf = new Uint8Array(CHUNK * CHUNK * 4);
  ownBuf = new Uint8Array(CHUNK * CHUNK * 4);
  overlay: Uint8Array | null = null; overlayDirty = false;
  kcol = new Uint8Array(256 * 16 * 4);
  kcolDirty = true;
  winter = 0;          // 0..1 snow cover on cold land
  /** owner lookups, set by the game: tile → kingdom id+1, city id+1 */
  kingdomOfCity: (cityId: number) => number = () => 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = compile(gl, VS, FS);
    this.u = uniforms(gl, this.prog);
    this.bakeProg = compile(gl, VS, BAKE_FS);
    this.ub = uniforms(gl, this.bakeProg);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    if (gl.getAttribLocation(this.bakeProg, 'aPos') !== loc) throw new Error('attribute mismatch');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.kcolTex = makeTex(gl, 256, 16, this.kcol);
  }

  setWorld(world: World) {
    const gl = this.gl;
    this.world = world;
    for (const t of [this.tileTex, this.infoTex, this.ownTex, this.overTex]) if (t) gl.deleteTexture(t);
    this.tileTex = makeTex(gl, world.w, world.h, null);
    this.infoTex = makeTex(gl, world.w, world.h, null);
    this.ownTex = makeTex(gl, world.w, world.h, null);
    this.overTex = makeTex(gl, world.w, world.h, new Uint8Array(world.w * world.h * 4));
    // the baked ground: every tile painted once at full detail, redrawn only when it changes
    if (this.bakeTex) gl.deleteTexture(this.bakeTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.scale = world.w * 8 <= Math.min(4096, maxTex) && world.w <= 256 ? 8 : 4;
    this.bakeTex = makeTex(gl, world.w * this.scale, world.h * this.scale, null);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bakeTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.bakeMark = new Uint8Array(world.cw * world.ch);
    this.bakeQueue = [];
    world.markAll();
  }

  setKingdomColor(id: number, color: number) {
    const o = id * 4;
    if (o + 3 >= this.kcol.length) return;
    this.kcol[o] = (color >> 16) & 255; this.kcol[o + 1] = (color >> 8) & 255; this.kcol[o + 2] = color & 255; this.kcol[o + 3] = 255;
    this.kcolDirty = true;
  }

  /** colour of a tile's ground (trees are drawn separately) */
  tileColor(i: number, out: Uint8Array, o: number) {
    const w = this.world;
    const b = w.biome[i], bd = BIOMES[b];
    const x = i % w.w, y = (i / w.w) | 0;
    const hv = 0.75 * vnoise(x * 0.18, y * 0.18) + 0.25 * hash2(x, y, 7);
    let c1 = bd.c1, c2 = bd.c2;
    let r = ((c1 >> 16) & 255) * (1 - hv) + ((c2 >> 16) & 255) * hv;
    let g = ((c1 >> 8) & 255) * (1 - hv) + ((c2 >> 8) & 255) * hv;
    let bl = (c1 & 255) * (1 - hv) + (c2 & 255) * hv;
    const h = w.height[i];
    if (bd.water) {
      // depth: lighter in the shallows
      const d = Math.max(0, Math.min(1, (SEA - h) / SEA));
      const k = 1.15 - d * 0.55;
      r *= k; g *= k; bl *= k * 0.98 + 0.04;
      if (b === B.Ocean && h > SEA - 0.035) { r += 18; g += 26; bl += 18; }
    } else if (w.river[i]) {
      const s = w.river[i];
      r = 50 - s * 4; g = 112 - s * 5; bl = 176 - s * 3;
    } else {
      // moisture greens, altitude lightens rock
      if (b === B.Grass || b === B.Forest || b === B.Savanna || b === B.Hills) {
        const m = w.moist[i] / 255 - 0.5;
        g += m * 18; r -= m * 10;
      }
      if (h > 0.72 && (b === B.Mountain || b === B.Hills)) { const k = 1 + (h - 0.72) * 1.2; r *= k; g *= k; bl *= k; }
      // winter snow on cold ground
      if (this.winter > 0 && w.temp[i] < 4 && !bd.hot) {
        const s = Math.min(1, (4 - w.temp[i]) / 10) * this.winter;
        r += (240 - r) * s; g += (245 - g) * s; bl += (250 - bl) * s;
      }
      // grazed or burnt ground is browner
      if (bd.vegMax > 40) {
        const v = w.veg[i] / Math.max(1, bd.vegMax);
        if (v < 0.5) { const k = (0.5 - v) * 0.5; r += (120 - r) * k; g += (98 - g) * k; bl += (60 - bl) * k; }
      }
      if (w.deco[i] === 11 /* ash */) { r *= 0.5; g *= 0.5; bl *= 0.5; }
    }
    out[o] = Math.max(0, Math.min(255, r)); out[o + 1] = Math.max(0, Math.min(255, g)); out[o + 2] = Math.max(0, Math.min(255, bl));
    out[o + 3] = Math.max(0, Math.min(255, Math.round(h * 255)));
  }

  private uploadChunk(cx: number, cy: number) {
    const gl = this.gl, w = this.world;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const cw = Math.min(CHUNK, w.w - x0), ch = Math.min(CHUNK, w.h - y0);
    const tb = this.tileBuf, ib = this.infoBuf;
    let o = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++, o += 4) {
        const i = (y0 + y) * w.w + x0 + x;
        this.tileColor(i, tb, o);
        const b = w.biome[i];
        let flags = 0;
        if (BIOMES[b].water) flags |= 1;
        if (w.river[i]) flags |= 2;
        if (b === B.DeepOcean) flags |= 4;
        if (b === B.Lava) flags |= 8;
        if (w.fire[i]) flags |= 16;
        if (w.field[i]) flags |= 32;
        if (w.tree[i]) flags |= 128;
        ib[o] = flags;
        ib[o + 1] = w.tree[i];
        ib[o + 2] = (w.ore[i] & 15) | (Math.min(15, w.road[i]) << 4);
        ib[o + 3] = w.fire[i] ? Math.min(255, w.fire[i] * 2) : w.field[i];
      }
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.tileTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, tb.subarray(0, cw * ch * 4));
    gl.bindTexture(gl.TEXTURE_2D, this.infoTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, ib.subarray(0, cw * ch * 4));
    // this chunk and its neighbours (their edges blend into it) need painting again
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w.cw || ny >= w.ch) continue;
      const c = ny * w.cw + nx;
      if (!this.bakeMark[c]) { this.bakeMark[c] = 1; this.bakeQueue.push(c); }
    }
  }

  /** paint changed chunks of ground into the baked texture */
  private bake(max: number) {
    if (!this.bakeQueue.length) return;
    const gl = this.gl, w = this.world, u = this.ub, S = this.scale;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.useProgram(this.bakeProg);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tileTex); gl.uniform1i(u.uTile, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.infoTex); gl.uniform1i(u.uInfo, 1);
    gl.uniform2f(u.uMap, w.w, w.h);
    gl.uniform1f(u.uFlip, -1);
    const oc = new Float32Array(9 * 3);
    ORE_COLORS.forEach((c, i) => { oc[i * 3] = ((c >> 16) & 255) / 255; oc[i * 3 + 1] = ((c >> 8) & 255) / 255; oc[i * 3 + 2] = (c & 255) / 255; });
    gl.uniform3fv(u.uOreCol, oc);
    let n = 0;
    const later: number[] = [];
    while (this.bakeQueue.length && n < max) {
      const c = this.bakeQueue.shift()!;
      const cx = c % w.cw, cy = (c / w.cw) | 0;
      // wait until this chunk and its neighbours are uploaded, so edges never blend with stale tiles
      let stale = false;
      for (let dy = -1; dy <= 1 && !stale; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < w.cw && ny < w.ch && w.dirty[ny * w.cw + nx]) { stale = true; break; }
      }
      if (stale) { later.push(c); continue; }
      this.bakeMark[c] = 0;
      const x0 = cx * CHUNK, y0 = cy * CHUNK, cw = Math.min(CHUNK, w.w - x0), ch = Math.min(CHUNK, w.h - y0);
      gl.viewport(x0 * S, y0 * S, cw * S, ch * S);
      gl.uniform4f(u.uView, x0, y0, cw, ch);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      n++;
    }
    for (const c of later) this.bakeQueue.push(c);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private uploadOwnChunk(cx: number, cy: number) {
    const gl = this.gl, w = this.world;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const cw = Math.min(CHUNK, w.w - x0), ch = Math.min(CHUNK, w.h - y0);
    const ob = this.ownBuf;
    let o = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++, o += 4) {
        const i = (y0 + y) * w.w + x0 + x;
        const city = w.owner[i];
        const k = city ? this.kingdomOfCity(city - 1) : 0;
        ob[o] = k & 255; ob[o + 1] = (k >> 8) & 255; ob[o + 2] = city & 255; ob[o + 3] = (city >> 8) & 255;
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.ownTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, cw, ch, gl.RGBA, gl.UNSIGNED_BYTE, ob.subarray(0, cw * ch * 4));
  }

  /** push changed chunks to the GPU; budget limits work per frame (rest next frame) */
  sync(budget = 64) {
    const w = this.world;
    let done = 0;
    for (let c = 0; c < w.dirty.length && done < budget; c++) {
      if (w.dirty[c]) { w.dirty[c] = 0; this.uploadChunk(c % w.cw, (c / w.cw) | 0); done++; }
    }
    for (let c = 0; c < w.dirtyOverlay.length && done < budget * 2; c++) {
      if (w.dirtyOverlay[c]) { w.dirtyOverlay[c] = 0; this.uploadOwnChunk(c % w.cw, (c / w.cw) | 0); done++; }
    }
    const gl = this.gl;
    this.bake(budget * 2);
    if (this.kcolDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.kcolTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 16, gl.RGBA, gl.UNSIGNED_BYTE, this.kcol);
      this.kcolDirty = false;
    }
    if (this.overlayDirty && this.overlay) {
      gl.bindTexture(gl.TEXTURE_2D, this.overTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w.w, w.h, gl.RGBA, gl.UNSIGNED_BYTE, this.overlay);
      this.overlayDirty = false;
    }
  }

  draw(view: { x0: number; y0: number; w: number; h: number; zoom: number }, time: number, opts: { light: number; tint: number; overlay: number; borders: boolean; cityBorders: boolean; treesInShader: boolean }) {
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    const bind = (unit: number, tex: WebGLTexture, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u[name], unit); };
    bind(0, this.bakeTex!, 'uBake'); bind(1, this.infoTex, 'uInfo'); bind(2, this.ownTex, 'uOwn'); bind(3, this.overTex, 'uOver'); bind(4, this.kcolTex, 'uKCol');
    gl.uniform4f(u.uView, view.x0, view.y0, view.w, view.h);
    gl.uniform2f(u.uMap, this.world.w, this.world.h);
    gl.uniform1f(u.uFlip, 1); gl.uniform1f(u.uScale, this.scale);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uZoom, view.zoom); gl.uniform1f(u.uLight, opts.light);
    gl.uniform1f(u.uTint, opts.tint); gl.uniform1f(u.uOverAlpha, opts.overlay);
    gl.uniform1f(u.uBorders, opts.borders ? 1 : 0); gl.uniform1f(u.uCityBorders, opts.cityBorders ? 1 : 0);
    gl.uniform1f(u.uTreesInShader, opts.treesInShader ? 1 : 0);
    const tc = new Float32Array(17 * 3);
    TREE_COLORS.forEach((c, i) => { tc[i * 3] = ((c >> 16) & 255) / 255; tc[i * 3 + 1] = ((c >> 8) & 255) / 255; tc[i * 3 + 2] = (c & 255) / 255; });
    gl.uniform3fv(u.uTreeCol, tc);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}
