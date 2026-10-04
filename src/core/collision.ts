// Axis-separated box-vs-tile movement so bodies slide along walls instead of sticking.
import { walkablePx, type WorldMap } from './mapgen';

export interface Body {
  x: number;
  y: number;
}

export function canStand(map: WorldMap, x: number, y: number, r: number): boolean {
  return walkablePx(map, x - r, y - r) && walkablePx(map, x + r, y - r) && walkablePx(map, x - r, y + r) && walkablePx(map, x + r, y + r);
}

/** Moves `e` by (dx, dy), each axis independently. Returns true if it moved at all. */
export function moveBody(map: WorldMap, e: Body, dx: number, dy: number, r: number): boolean {
  let moved = false;
  if (canStand(map, e.x + dx, e.y, r)) {
    e.x += dx;
    moved = true;
  }
  if (canStand(map, e.x, e.y + dy, r)) {
    e.y += dy;
    moved = true;
  }
  return moved;
}
