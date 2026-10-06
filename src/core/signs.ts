// Wooden signposts telling the player where each road leads.
import type { AreaId } from '../data/types';
import { MH, MW, T, Tile, tileAt, walkable, type Edge, type WorldMap } from './mapgen';

export interface Signpost {
  /** foot of the post (px) */
  x: number;
  y: number;
  /** one arm per destination, pointing towards that map edge */
  arms: readonly { edge: Edge; to: AreaId }[];
}

/** Crossroads post in the village, at the north-east corner of the plaza where the east road starts. */
export const VILLAGE_SIGN = { tx: 20, ty: 25 } as const;

/** How close (px) the player must be before a sign's destination label shows. */
export const SIGN_READ_RADIUS = 96;

const SIGN_GROUND = new Set<number>([Tile.GRASS, Tile.FLOWER, Tile.SAND]);

/** Signposts of a map: one beside every exit road, plus the village crossroads post on the home map. */
export function signposts(map: WorldMap): Signpost[] {
  const out: Signpost[] = [];
  for (const e of map.exits) {
    const spot = exitSignTile(map, e);
    if (spot) out.push({ x: spot[0] * T + 8, y: spot[1] * T + 14, arms: [{ edge: e.edge, to: e.to }] });
  }
  if (map.area === 'home') {
    // north, east, south in that order so the arms stack the way the roads go
    const order: Edge[] = ['n', 'e', 's', 'w'];
    const arms = [...map.exits].sort((a, b) => order.indexOf(a.edge) - order.indexOf(b.edge)).map((e) => ({ edge: e.edge, to: e.to }));
    out.push({ x: VILLAGE_SIGN.tx * T + 8, y: VILLAGE_SIGN.ty * T + 14, arms });
  }
  return out;
}

/** First open tile beside the exit road, a few tiles past the arrival point so it clears the HUD and the action pad at the screen edges. */
export function exitSignTile(map: Pick<WorldMap, 'tiles'>, e: { edge: Edge; at: number; width: number }): [number, number] | null {
  const vertical = e.edge === 'n' || e.edge === 's';
  for (const d of [7, 6, 8, 5, 9]) {
    for (const side of [e.at + e.width, e.at - 1]) {
      const along = d;
      const tx = vertical ? side : e.edge === 'w' ? along : MW - 1 - along;
      const ty = vertical ? (e.edge === 'n' ? along : MH - 1 - along) : side;
      if (SIGN_GROUND.has(tileAt(map, tx, ty)) && walkable(map, tx, ty)) return [tx, ty];
    }
  }
  return null;
}
