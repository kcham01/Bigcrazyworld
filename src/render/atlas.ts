// The sprite atlas: sprites are painted on first use and packed into one big texture.
import { Pix } from './pixels';

export interface Sprite { u0: number; v0: number; u1: number; v1: number; w: number; h: number; ax: number; ay: number }

export class Atlas {
  gl: WebGL2RenderingContext; tex: WebGLTexture;
  size = 2048;
  map = new Map<string, Sprite>();
  x = 1; y = 1; rowH = 0;
  budget = 0;            // new sprites allowed this frame
  pending = 0;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  /** get a sprite, painting it if needed (ax, ay = anchor pixel). null if over this frame's budget */
  get(key: string, paint: () => { pix: Pix; ax: number; ay: number }): Sprite | null {
    const s = this.map.get(key);
    if (s) return s;
    if (this.budget <= 0) { this.pending++; return null; }
    this.budget--;
    const { pix, ax, ay } = paint();
    return this.add(key, pix, ax, ay);
  }
  add(key: string, pix: Pix, ax: number, ay: number): Sprite {
    const gl = this.gl;
    if (this.x + pix.w + 1 > this.size) { this.x = 1; this.y += this.rowH + 1; this.rowH = 0; }
    if (this.y + pix.h + 1 > this.size) this.reset();
    const s: Sprite = { u0: this.x / this.size, v0: this.y / this.size, u1: (this.x + pix.w) / this.size, v1: (this.y + pix.h) / this.size, w: pix.w, h: pix.h, ax, ay };
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, this.x, this.y, pix.w, pix.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pix.d.buffer));
    this.x += pix.w + 1;
    this.rowH = Math.max(this.rowH, pix.h);
    this.map.set(key, s);
    return s;
  }
  reset() {
    this.map.clear(); this.x = 1; this.y = 1; this.rowH = 0;
  }
}
