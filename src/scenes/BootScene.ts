import Phaser from 'phaser';
import { MONSTER_IDS, NPC_IDS, WEAPONS } from '../data';
import type { WeaponId } from '../data/types';
import { areaMap } from '../core/areas';
import { MONSTER_FRAME_COUNT } from '../core/state';
import { buildGlow, buildHerb, buildOre, buildNpcFrames, buildHenFrames, buildChickFrames, buildPlayerFrames, buildWeapon, MONSTER_SPRITES } from '../art/sprites';
import { buildLotus, buildRiceSection } from '../art/fields';
import type { StaticLight } from '../art/buildings';
import { TEX } from './textures';
import homePainting from '../assets/maps/home.jpg';

/** Warm glow over the smithy's forge on the painted home map. */
const HOME_LIGHTS: StaticLight[] = [{ x: 26.6 * 16, y: 18.6 * 16, r: 20, c: '255,150,60', ga: 0.22 }];

const FONTS = ["600 16px 'Mitr'", "400 16px 'IBM Plex Sans Thai'", "700 16px 'Pixelify Sans'"];
const FONT_TIMEOUT_MS = 2500;

/** Builds every procedural texture, then hands the map over to WorldScene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // the home map is a painting (src/core/homeLayout.ts traces its collision); wild areas are still painted in code
    this.load.image(TEX.ground, homePainting);
  }

  create(): void {
    const map = areaMap('home');
    const t = this.textures;
    t.get(TEX.ground).setFilter(Phaser.Textures.FilterMode.LINEAR);
    // home has no separate canopy layer: trees are part of the painting
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
      t.addCanvas(TEX.rice(st, false), buildRiceSection(st, false));
      t.addCanvas(TEX.lotus(st), buildLotus(st));
    }
    t.addCanvas(TEX.rice(3, true), buildRiceSection(3, true));

    const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fontsReady, timeout]).then(() => this.scene.start('World', { map, lights: HOME_LIGHTS }));
  }
}
