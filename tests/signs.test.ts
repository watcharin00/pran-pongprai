import { describe, expect, it } from 'vitest';
import { AREA_IDS, areaMap } from '../src/core/areas';
import { T, Tile, tileAt, walkable } from '../src/core/mapgen';
import { signposts, VILLAGE_SIGN } from '../src/core/signs';

describe('signposts', () => {
  for (const id of AREA_IDS) {
    it(`${id}: a sign beside every exit road, on open ground near the edge`, () => {
      const map = areaMap(id);
      const signs = signposts(map);
      for (const e of map.exits) {
        const sg = signs.find((s) => s.arms.length === 1 && s.arms[0]?.to === e.to);
        expect(sg, `sign for ${e.to}`).toBeDefined();
        if (!sg) continue;
        const tx = Math.floor(sg.x / T);
        const ty = Math.floor(sg.y / T);
        expect(walkable(map, tx, ty)).toBe(true);
        expect(Math.hypot(sg.x - e.arrive.x, sg.y - e.arrive.y)).toBeLessThan(5 * T);
      }
    });
  }

  it('the village crossroads post points down every home road', () => {
    const map = areaMap('home');
    const post = signposts(map).find((s) => s.arms.length > 1);
    expect(post).toBeDefined();
    expect(post?.arms.map((a) => a.edge)).toEqual(['n', 's', 's']);
    expect(new Set(post?.arms.map((a) => a.to))).toEqual(new Set(map.exits.map((e) => e.to)));
    expect([Tile.GRASS, Tile.FLOWER]).toContain(tileAt(map, VILLAGE_SIGN.tx, VILLAGE_SIGN.ty));
  });
});
