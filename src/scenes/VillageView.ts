// The painted village's sprites (houses, trees, fountain, lamps) on top of the painted ground.
// Each one is y-sorted with the characters; roofs and crowns turn see-through while the player
// stands behind them, trees sway, the fountain sparkles. Only exists on the home map.
import Phaser from 'phaser';
import { ENTITY_DEPTH } from '../entities/Player';
import { villageProps, type VillageProp } from '../art/villageLayout';
import { TEX } from './textures';

interface Placed {
  p: VillageProp;
  img: Phaser.GameObjects.Image;
  /** sprite box in world px */
  x0: number;
  x1: number;
  top: number;
  alpha: number;
  phase: number;
}

const SEE_THROUGH = 0.42;

export class VillageView {
  private readonly items: Placed[] = [];
  private readonly shadows: Phaser.GameObjects.Graphics;
  private visible = true;

  constructor(scene: Phaser.Scene, add: <O extends Phaser.GameObjects.GameObject>(o: O) => O, shadowDepth: number) {
    this.shadows = add(scene.add.graphics().setDepth(shadowDepth));
    for (const p of villageProps()) {
      const img = add(scene.add.image(p.x, p.y, TEX.village(p.key)).setOrigin(0.5, 1));
      const s = p.w / img.width;
      img.setScale(p.flip ? -s : s, s).setDepth(ENTITY_DEPTH + p.y);
      const h = img.height * s;
      this.items.push({ p, img, x0: p.x - p.w / 2, x1: p.x + p.w / 2, top: p.y - h, alpha: 1, phase: (p.x * 0.013 + p.y * 0.021) % 6.28 });
      // soft contact shadow under everything that stands on the ground
      const sw = p.key.startsWith('tree') ? p.w * 0.5 : p.key === 'lamp' ? 8 : p.w * 0.8;
      this.shadows.fillStyle(0x0e2410, 0.22).fillEllipse(p.x + 2, p.y - 1, sw, Math.max(3, sw * 0.28));
    }
  }

  setVisible(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.shadows.setVisible(v);
    for (const it of this.items) it.img.setVisible(v);
  }

  /** Fades what hides the player, sways trees on screen. */
  update(px: number, py: number, time: number, dt: number, view: Phaser.Geom.Rectangle): void {
    if (!this.visible) return;
    const k = Math.min(1, dt * 8);
    for (const it of this.items) {
      const { p, img } = it;
      const onScreen = it.x1 > view.x - 8 && it.x0 < view.right + 8 && p.y > view.y - 8 && it.top < view.bottom + 8;
      img.setVisible(onScreen);
      if (!onScreen) continue;
      if (p.fade) {
        const behind = py < p.y - 3 && py > it.top + 4 && px > it.x0 + p.w * 0.08 && px < it.x1 - p.w * 0.08;
        const want = behind ? SEE_THROUGH : 1;
        if (Math.abs(it.alpha - want) > 0.005) {
          it.alpha += (want - it.alpha) * k;
          img.setAlpha(it.alpha);
        }
      }
      if (p.sway) img.setRotation(Math.sin(time * 1.1 + it.phase) * 0.018);
    }
  }
}
