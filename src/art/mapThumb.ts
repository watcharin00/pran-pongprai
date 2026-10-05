// One pixel per tile overview of an area, for the map tab. Cached per area.
import type { AreaId } from '../data/types';
import { MH, MW, Tile, tileAt, inCanyon, type Biome, type WorldMap } from '../core/mapgen';

const GROUND: Record<Biome, string> = {
  home: '#78bb4b',
  bamboo: '#99cc60',
  swamp: '#5f9a52',
  limestone: '#8aa965',
  deepwild: '#4b9640',
};

function tileColour(map: WorldMap, x: number, y: number): string {
  const t = tileAt(map, x, y);
  switch (t) {
    case Tile.WALL:
      return '#2c5a2a';
    case Tile.TREE:
      return map.biome === 'bamboo' ? '#5a9a3a' : '#2f6e36';
    case Tile.BUSH:
      return '#3f7d3a';
    case Tile.WATER:
      return '#2db2a6';
    case Tile.BRIDGE:
      return '#c08242';
    case Tile.SAND:
      return inCanyon(map, x, y) ? '#e0b070' : map.biome === 'limestone' ? '#d8d3c4' : '#ebcb89';
    case Tile.ROCK:
      return inCanyon(map, x, y) ? '#a8462a' : '#8d9098';
    case Tile.CLIFF:
      return '#a5622e';
    case Tile.HOUSE:
      return '#e2763a';
    case Tile.STONE:
    case Tile.FOUNTAIN:
      return '#d8d0b6';
    case Tile.SOIL:
    case Tile.FENCE:
      return '#8f5e34';
    default:
      return GROUND[map.biome];
  }
}

const cache = new Map<AreaId, string>();

export function areaThumbUrl(map: WorldMap): string {
  let url = cache.get(map.area);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = MW;
  c.height = MH;
  const g = c.getContext('2d');
  if (g) {
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        g.fillStyle = tileColour(map, x, y);
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  url = c.toDataURL();
  cache.set(map.area, url);
  return url;
}
