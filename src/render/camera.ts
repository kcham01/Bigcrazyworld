// Camera: x,y = world tile at the centre of the screen; zoom = screen pixels per tile.
export class Camera {
  x = 0; y = 0; zoom = 4;
  vw = 1; vh = 1;            // viewport in CSS pixels
  dpr = 1;
  minZoom = 0.5; maxZoom = 72;
  // smooth follow / fly-to
  target: { x: number; y: number; zoom?: number } | null = null;

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + (sx - this.vw / 2) / this.zoom, this.y + (sy - this.vh / 2) / this.zoom];
  }
  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.vw / 2, (wy - this.y) * this.zoom + this.vh / 2];
  }
  zoomAt(sx: number, sy: number, factor: number) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const [nx, ny] = this.screenToWorld(sx, sy);
    this.x += wx - nx; this.y += wy - ny;
  }
  clamp(w: number, h: number) {
    const mx = Math.min(w / 2, this.vw / this.zoom / 2), my = Math.min(h / 2, this.vh / this.zoom / 2);
    this.x = Math.max(-mx * 0.6 + 0, Math.min(w + mx * 0.6, this.x));
    this.y = Math.max(-my * 0.6, Math.min(h + my * 0.6, this.y));
  }
  fit(w: number, h: number) {
    this.x = w / 2; this.y = h / 2;
    this.zoom = Math.min(this.vw / w, this.vh / h) * 0.98;
    this.minZoom = Math.min(this.zoom * 0.8, 1);
  }
  flyTo(x: number, y: number, zoom?: number) { this.target = { x, y, zoom }; }
  update(dt: number) {
    if (!this.target) return;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (this.target.x - this.x) * k; this.y += (this.target.y - this.y) * k;
    if (this.target.zoom) this.zoom += (this.target.zoom - this.zoom) * k;
    if (Math.abs(this.target.x - this.x) < 0.05 && Math.abs(this.target.y - this.y) < 0.05 && (!this.target.zoom || Math.abs(this.target.zoom - this.zoom) < 0.05)) this.target = null;
  }
}
