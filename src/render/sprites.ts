// Instanced sprite drawing: every creature, building and tree is a textured quad from the atlas.
// The shader recolours marker pixels (owner colour, creature colour), lets windows glow at night,
// sways trees, and flashes things that were just hit.
import { compile, uniforms } from './gl';
import type { Sprite } from './atlas';

const VS = `#version 300 es
in vec4 aRect;    // x0, y0, w, h in world units
in vec4 aUV;      // u0, v0, u1, v1
in vec4 aT1;      // owner colour
in vec4 aT2;      // creature colour
in vec4 aMisc;    // flags (1 flip, 2 sway, 4 flash), alpha, brightness, phase
uniform vec4 uView;
uniform float uTime;
out vec2 vUV; out vec4 vT1; out vec4 vT2; out vec4 vMisc;
void main() {
  int id = gl_VertexID;
  vec2 c = vec2(float(id & 1), float((id >> 1) & 1));
  int fl = int(aMisc.x + 0.5);
  vec2 wp = aRect.xy + c * aRect.zw;
  if ((fl & 2) != 0 && c.y < 0.5) wp.x += sin(uTime * 1.3 + aMisc.w) * 0.06 * aRect.w;
  vec2 ndc = (wp - uView.xy) / uView.zw;
  gl_Position = vec4(ndc.x * 2.0 - 1.0, 1.0 - ndc.y * 2.0, 0.0, 1.0);
  vec2 uc = c; if ((fl & 1) != 0) uc.x = 1.0 - uc.x;
  vUV = mix(aUV.xy, aUV.zw, uc);
  vT1 = aT1; vT2 = aT2; vMisc = aMisc;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vT1; in vec4 vT2; in vec4 vMisc;
uniform sampler2D uAtlas;
uniform float uLight;
out vec4 o;
void main() {
  vec4 t = texture(uAtlas, vUV);
  if (t.a < 0.02) discard;
  vec3 c = t.rgb; float a = t.a; float glow = 0.0;
  if (a > 0.75 && a < 0.85) { c = vT1.rgb * (t.r * 1.6); a = 1.0; }
  else if (a > 0.55 && a < 0.65) { c = vT2.rgb * (t.r * 1.6); a = 1.0; }
  else if (a > 0.35 && a < 0.45) { glow = 1.0; a = 1.0; }
  int fl = int(vMisc.x + 0.5);
  vec3 lit = c * uLight * vMisc.z;
  if (glow > 0.0) lit = mix(c * 0.75, c * 1.15, 1.0 - uLight);
  if ((fl & 4) != 0) lit = mix(lit, vec3(1.0, 0.95, 0.9), 0.7);
  o = vec4(lit, a * vMisc.y);
}`;

const FLOATS = 20;   // per instance (colours stored as floats for simplicity)

export class SpriteRenderer {
  gl: WebGL2RenderingContext; prog: WebGLProgram; u: Record<string, WebGLUniformLocation>;
  vao: WebGLVertexArrayObject; buf: WebGLBuffer;
  data = new Float32Array(FLOATS * 4096); n = 0;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = compile(gl, VS, FS);
    this.u = uniforms(gl, this.prog);
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const attr = (name: string, off: number) => {
      const loc = gl.getAttribLocation(this.prog, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, FLOATS * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr('aRect', 0); attr('aUV', 4); attr('aT1', 8); attr('aT2', 12); attr('aMisc', 16);
    gl.bindVertexArray(null);
  }
  begin() { this.n = 0; }
  /** draw sprite s with its anchor at world (x, y); scale = world units per art pixel */
  push(s: Sprite, x: number, y: number, scale: number, t1: number, t2: number, flags = 0, alpha = 1, bright = 1, phase = 0) {
    if (this.n * FLOATS >= this.data.length) { const nd = new Float32Array(this.data.length * 2); nd.set(this.data); this.data = nd; }
    const d = this.data, o = this.n * FLOATS;
    const flip = flags & 1;
    const ax = flip ? s.w - s.ax : s.ax;
    d[o] = x - ax * scale; d[o + 1] = y - s.ay * scale; d[o + 2] = s.w * scale; d[o + 3] = s.h * scale;
    d[o + 4] = s.u0; d[o + 5] = s.v0; d[o + 6] = s.u1; d[o + 7] = s.v1;
    d[o + 8] = ((t1 >> 16) & 255) / 255; d[o + 9] = ((t1 >> 8) & 255) / 255; d[o + 10] = (t1 & 255) / 255; d[o + 11] = 1;
    d[o + 12] = ((t2 >> 16) & 255) / 255; d[o + 13] = ((t2 >> 8) & 255) / 255; d[o + 14] = (t2 & 255) / 255; d[o + 15] = 1;
    d[o + 16] = flags; d[o + 17] = alpha; d[o + 18] = bright; d[o + 19] = phase;
    this.n++;
  }
  flush(atlas: WebGLTexture, view: { x0: number; y0: number; w: number; h: number }, time: number, light: number) {
    if (!this.n) return;
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.n * FLOATS), gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(u.uAtlas, 0);
    gl.uniform4f(u.uView, view.x0, view.y0, view.w, view.h);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uLight, light);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}
