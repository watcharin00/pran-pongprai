import Phaser from 'phaser';
import { MONSTER_IDS, NPC_IDS, WEAPONS } from '../data';
import type { WeaponId } from '../data/types';
import { areaMap } from '../core/areas';
import { MONSTER_FRAME_COUNT } from '../core/state';
import { buildGlow, buildHerb, buildOre, buildNpcFrames, buildPlayerFrames, buildWeapon, MONSTER_SPRITES } from '../art/sprites';
import { buildTerrain } from '../art/terrain';
import { TEX } from './textures';

const FONTS = ["600 16px 'Mitr'", "400 16px 'IBM Plex Sans Thai'", "700 16px 'Pixelify Sans'"];
const FONT_TIMEOUT_MS = 2500;

/** Builds every procedural texture, then hands the map over to WorldScene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const map = areaMap('home');
    const terrain = buildTerrain(map);
    const t = this.textures;
    t.addCanvas(TEX.ground, terrain.ground);
    t.addCanvas(TEX.canopy, terrain.canopy);
    buildPlayerFrames().forEach((c, i) => t.addCanvas(TEX.player(i), c));
    for (const id of NPC_IDS) buildNpcFrames(id).forEach((c, i) => t.addCanvas(TEX.npc(id, i), c));
    for (const kind of MONSTER_IDS) {
      for (let f = 0; f < MONSTER_FRAME_COUNT; f++) {
        for (const hb of [false, true]) for (const tb of [false, true]) t.addCanvas(TEX.monster(kind, f, hb, tb), MONSTER_SPRITES[kind](f, hb, tb));
      }
    }
    for (const id of Object.keys(WEAPONS) as WeaponId[]) t.addCanvas(TEX.weapon(id), buildWeapon(WEAPONS[id]));
    t.addCanvas(TEX.ore, buildOre());
    t.addCanvas(TEX.herb, buildHerb());
    t.addCanvas(TEX.glow, buildGlow());

    const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fontsReady, timeout]).then(() => this.scene.start('World', { map, lights: terrain.lights }));
  }
}
