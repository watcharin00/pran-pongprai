// Readable overview of an area for the map tab: big flat shapes instead of
// per-tile noise. Woods are one colour, open ground another, roads and water
// stand out. 4 px per tile, cached per area.
import type { AreaId } from '../data/types';
import { MH, MW, Tile, tileAt, inCanyon, type Biome, type WorldMap } from '../core/mapgen';

const PX = 4;

interface ThumbPalette {
  ground: string;
  woods: string;
  path: string;
}

const PAL: Record<Biome, ThumbPalette> = {
  home: { ground: '#8fcf5e', woods: '#3f8a3e', path: '#f1d696' },
  bamboo: { ground: '#b2dc78', woods: '#5f9e3c', path: '#efdaa4' },
  swamp: { ground: '#7fb06a', woods: '#3d7841', path: '#c8ae7e' },
  limestone: { ground: '#a6c47f', woods: '#4f8a46', path: '#ebe7da' },
  deepwild: { ground: '#6cb85a', woods: '#2f6a2c', path: '#e8ca8e' },
  savanna: { ground: '#cdd27a', woods: '#7a9a46', path: '#f0d6a4' },
  peat: { ground: '#6aa85a', woods: '#285e30', path: '#b89a6e' },
  mangrove: { ground: '#7fae6a', woods: '#2f6a3a', path: '#b8a07a' },
  cave: { ground: '#e2d8bf', woods: '#9a8f78', path: '#f4ecd8' },
};

const isWoodsTile = (t: number): boolean => t === Tile.TREE || t === Tile.WALL || t === Tile.BUSH;

/** A tree counts as woods only inside a clump, so lone trees don't speckle the map. */
function woods(map: WorldMap, x: number, y: number): boolean {
  if (!isWoodsTile(tileAt(map, x, y))) return false;
  if (tileAt(map, x, y) === Tile.WALL) return true;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isWoodsTile(tileAt(map, x + dx, y + dy))) n++;
  return n >= 4;
}

function tileColour(map: WorldMap, x: number, y: number, p: ThumbPalette): string {
  const t = tileAt(map, x, y);
  if (t === Tile.WATER || t === Tile.POND) return '#3cbcb0';
  if (t === Tile.PADDY) return '#8ab070';
  if (t === Tile.BRIDGE) return '#b9773c';
  if (t === Tile.HOUSE) return '#e2763a';
  if (t === Tile.STONE || t === Tile.FOUNTAIN) return '#e6dfc8';
  if (t === Tile.SOIL || t === Tile.FENCE) return '#9a6a3c';
  if (t === Tile.CLIFF) return '#a5622e';
  if (t === Tile.MESA) return '#c8bfa6';
  if (inCanyon(map, x, y)) return '#e8be80';
  if (t === Tile.SAND) return p.path;
  if (woods(map, x, y)) return p.woods;
  return p.ground;
}

const cache = new Map<AreaId, string>();

export function areaThumbUrl(map: WorldMap): string {
  let url = cache.get(map.area);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = MW * PX;
  c.height = MH * PX;
  const g = c.getContext('2d');
  if (g) {
    const p = PAL[map.biome];
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        g.fillStyle = tileColour(map, x, y, p);
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
  }
  url = c.toDataURL();
  cache.set(map.area, url);
  return url;
}
