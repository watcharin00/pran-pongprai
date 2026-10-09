// World → screen mapping for drawing. The simulation always works on a flat grid; the home map is
// drawn isometric (2:1 diamonds) to match the owner's painted art, the wild areas are drawn flat.
// Everything that puts something on screen goes through a View, so core never knows about it.
import { MH, MW, T } from '../core/mapgen';

export interface View {
  readonly iso: boolean;
  /** screen size of the whole map (world px of the drawing layer) */
  readonly width: number;
  readonly height: number;
  x(wx: number, wy: number): number;
  y(wx: number, wy: number): number;
  /** screen → world */
  toWorld(sx: number, sy: number): { x: number; y: number };
  /** a world direction → its screen angle */
  angle(a: number): number;
  /** a screen direction (joystick) → the world direction that moves that way on screen */
  dirToWorld(dx: number, dy: number): { x: number; y: number };
  /** which way a sprite faces on screen for a world facing (dx, dy) */
  face(dx: number, dy: number, fallback: number): 1 | -1;
  /** half-axes of the screen ellipse a world circle of radius r becomes */
  rx(r: number): number;
  ry(r: number): number;
}

export const FLAT: View = {
  iso: false,
  width: MW * T,
  height: MH * T,
  x: (wx) => wx,
  y: (_wx, wy) => wy,
  toWorld: (sx, sy) => ({ x: sx, y: sy }),
  angle: (a) => a,
  dirToWorld: (dx, dy) => ({ x: dx, y: dy }),
  face: (dx, _dy, f) => (dx > 0.01 ? 1 : dx < -0.01 ? -1 : f >= 0 ? 1 : -1),
  rx: (r) => r,
  ry: (r) => r,
};

/** Shift so the map's west corner sits at screen x 0. */
const OX = MH * T;

/** Isometric: world +x runs down-right on screen, world +y down-left; a 16px tile is a 32×16 diamond. */
export const ISO: View = {
  iso: true,
  width: (MW + MH) * T,
  height: ((MW + MH) * T) / 2,
  x: (wx, wy) => wx - wy + OX,
  y: (wx, wy) => (wx + wy) / 2,
  toWorld: (sx, sy) => {
    const u = sx - OX;
    return { x: sy + u / 2, y: sy - u / 2 };
  },
  angle: (a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return Math.atan2((c + s) / 2, c - s);
  },
  dirToWorld: (dx, dy) => {
    // invert the projection, then keep the stick's strength
    const x = dy + dx / 2;
    const y = dy - dx / 2;
    const len = Math.hypot(x, y);
    const mag = Math.min(1, Math.hypot(dx, dy));
    return len < 1e-6 ? { x: 0, y: 0 } : { x: (x / len) * mag, y: (y / len) * mag };
  },
  face: (dx, dy, f) => {
    const sx = dx - dy;
    return sx > 0.01 ? 1 : sx < -0.01 ? -1 : f >= 0 ? 1 : -1;
  },
  rx: (r) => r * Math.SQRT2,
  ry: (r) => r / Math.SQRT2,
};
