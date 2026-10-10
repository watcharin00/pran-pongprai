import Phaser from 'phaser';
import { MONSTER_IDS, NPC_IDS, WEAPONS } from '../data';
import type { WeaponId } from '../data/types';
import { areaMap } from '../core/areas';
import { MONSTER_FRAME_COUNT } from '../core/state';
import { buildGlow, buildHerb, buildOre, buildNpcFrames, buildHenFrames, buildChickFrames, buildPlayerFrames, buildWeapon, MONSTER_SPRITES } from '../art/sprites';
import { buildLotus } from '../art/fields';
import type { StaticLight } from '../art/buildings';
import { TEX } from './textures';
import { deckLift, LAMP_LIGHT, VILLAGE_SPRITES, villageProps } from '../art/villageLayout';
import { T } from '../core/mapgen';
import { ISO, setIsoLift } from './view';
import { TERRAIN_TEX } from './groundShader';

// the painted village: the ground (a shader, or a small pre-painted picture without WebGL) plus a sprite per house / tree / lamp
const villageUrls = import.meta.glob<string>('../assets/village/*.webp', { eager: true, import: 'default' });
// the home ground's shader inputs (tools/village/build_ground.py): the owner's textures as tiles + baked fields
const terrainUrls = import.meta.glob<string>('../assets/terrain/*.webp', { eager: true, import: 'default' });
const terrainUrl = (file: string): string => {
  const url = terrainUrls[`../assets/terrain/${file}`];
  if (!url) throw new Error(`missing terrain ${file}`);
  return url;
};
const villageUrl = (name: string): string => {
  const url = villageUrls[`../assets/village/${name}.webp`];
  if (!url) throw new Error(`missing village art ${name}`);
  return url;
};

/** Warm glows on the home map (world px): the smithy's forge and the lamp lanterns. */
const HOME_LIGHTS: StaticLight[] = [
  { x: 26.2 * T, y: 15.6 * T, r: 18, c: '255,150,60', ga: 0.26 },
  ...villageProps()
    .filter((p) => p.key === 'lamp')
    .map((p) => {
      // the glow is drawn at a ground point: the one under the lantern on screen
      const w = ISO.toWorld(p.x + (p.flip ? -LAMP_LIGHT.dx : LAMP_LIGHT.dx), p.y + LAMP_LIGHT.dy);
      return { x: w.x, y: w.y, r: 12, c: '255,214,140', ga: 0.2 };
    }),
];
const FONTS = ["600 16px 'Mitr'", "400 16px 'IBM Plex Sans Thai'", "700 16px 'Pixelify Sans'"];
const FONT_TIMEOUT_MS = 2500;

/** Builds every procedural texture, then hands the map over to WorldScene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // the home map is painted art (src/core/homeLayout.ts is its collision); wild areas are still painted in code
    this.load.image(TEX.ground, villageUrl('ground'));
    for (const k of VILLAGE_SPRITES) this.load.image(TEX.village(k), villageUrl(k));
    for (const k of ['grass', 'dirt', 'water', 'soil', 'plaza'] as const) this.load.image(TERRAIN_TEX[k], terrainUrl(`tex-${k}.webp`));
    this.load.image(TERRAIN_TEX.masks, terrainUrl('masks.webp'));
  }

  create(): void {
    // walkers on the village bridges stand on the deck, not on the water below
    setIsoLift(deckLift);
    const map = areaMap('home');
    const t = this.textures;
    t.get(TEX.ground).setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const k of VILLAGE_SPRITES) t.get(TEX.village(k)).setFilter(Phaser.Textures.FilterMode.LINEAR);
    // home has no separate canopy layer: tree crowns are y-sorted sprites (VillageView)
    const noCanopy = document.createElement('canvas');
    noCanopy.width = noCanopy.height = 1;
    t.addCanvas(TEX.canopy, noCanopy);
    buildPlayerFrames().forEach((c, i) => t.addCanvas(TEX.player(i), c));
    for (const id of NPC_IDS) buildNpcFrames(id).forEach((c, i) => t.addCanvas(TEX.npc(id, i), c));
    buildHenFrames().forEach((c, i) => t.addCanvas(TEX.hen(i), c));
    buildChickFrames().forEach((c, i) => t.addCanvas(TEX.chick(i), c));
    for (const kind of MONSTER_IDS) {
      for (let f = 0; f < MONSTER_FRAME_COUNT; f++) {
        for (const hb of [false, true]) for (const tb of [false, true]) t.addCanvas(TEX.monster(kind, f, hb, tb), MONSTER_SPRITES[kind](f, hb, tb));
      }
    }
    for (const id of Object.keys(WEAPONS) as WeaponId[]) t.addCanvas(TEX.weapon(id), buildWeapon(WEAPONS[id]));
    t.addCanvas(TEX.ore, buildOre());
    t.addCanvas(TEX.herb, buildHerb());
    t.addCanvas(TEX.glow, buildGlow());
    for (let st = 0; st < 4; st++) {
      t.addCanvas(TEX.lotus(st), buildLotus(st));
    }

    const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fontsReady, timeout]).then(() => this.scene.start('World', { map, lights: HOME_LIGHTS }));
  }
}
