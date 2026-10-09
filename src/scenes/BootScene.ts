import Phaser from 'phaser';
import { MONSTER_IDS, NPC_IDS, WEAPONS } from '../data';
import type { WeaponId } from '../data/types';
import { areaMap } from '../core/areas';
import { MONSTER_FRAME_COUNT } from '../core/state';
import { buildGlow, buildHerb, buildOre, buildNpcFrames, buildHenFrames, buildChickFrames, buildPlayerFrames, buildWeapon, MONSTER_SPRITES } from '../art/sprites';
import { buildLotus, buildRiceSection } from '../art/fields';
import type { StaticLight } from '../art/buildings';
import { TEX } from './textures';
import { setHomeThumb } from '../art/mapThumb';
import { LAMP_LIGHT, VILLAGE_SPRITES, villageProps } from '../art/villageLayout';
import { MH, MW, T } from '../core/mapgen';

// the painted village: one pre-painted ground image plus a sprite per house / tree / lamp
const villageUrls = import.meta.glob<string>('../assets/village/*.webp', { eager: true, import: 'default' });
const villageUrl = (name: string): string => {
  const url = villageUrls[`../assets/village/${name}.webp`];
  if (!url) throw new Error(`missing village art ${name}`);
  return url;
};

/** Warm glows on the painted home map: the smithy's forge and the lamp lanterns. */
const HOME_LIGHTS: StaticLight[] = [
  { x: 431, y: 252, r: 22, c: '255,150,60', ga: 0.26 },
  ...villageProps()
    .filter((p) => p.key === 'lamp')
    .map((p) => ({ x: p.x + (p.flip ? -LAMP_LIGHT.dx : LAMP_LIGHT.dx), y: p.y + LAMP_LIGHT.dy, r: 12, c: '255,214,140', ga: 0.2 })),
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
  }

  /** The home map as one small picture (ground + sprites) for the minimap and the map tab. */
  private homeThumb(): string {
    const c = document.createElement('canvas');
    c.width = MW * T;
    c.height = MH * T;
    const g = c.getContext('2d');
    if (!g) return '';
    const img = (key: string): HTMLImageElement => this.textures.get(key).getSourceImage() as HTMLImageElement;
    g.drawImage(img(TEX.ground), 0, 0, c.width, c.height);
    for (const p of [...villageProps()].sort((a, b) => a.y - b.y)) {
      if (p.y < 0 || p.y > c.height + 40) continue;
      const im = img(TEX.village(p.key));
      const h = (im.height * p.w) / im.width;
      g.save();
      g.translate(p.x, p.y);
      if (p.flip) g.scale(-1, 1);
      g.drawImage(im, -p.w / 2, -h, p.w, h);
      g.restore();
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  create(): void {
    const map = areaMap('home');
    const t = this.textures;
    t.get(TEX.ground).setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const k of VILLAGE_SPRITES) t.get(TEX.village(k)).setFilter(Phaser.Textures.FilterMode.LINEAR);
    setHomeThumb(this.homeThumb());
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
      t.addCanvas(TEX.rice(st, false), buildRiceSection(st, false));
      t.addCanvas(TEX.lotus(st), buildLotus(st));
    }
    t.addCanvas(TEX.rice(3, true), buildRiceSection(3, true));

    const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fontsReady, timeout]).then(() => this.scene.start('World', { map, lights: HOME_LIGHTS }));
  }
}
