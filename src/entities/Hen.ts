// Renders one coop chicken from Hen state: a chick until it is grown, then a hen.
import Phaser from 'phaser';
import { isGrown } from '../core/ranch';
import type { Hen } from '../core/state';
import { TEX } from '../scenes/textures';
import { ENTITY_DEPTH } from './Player';
import type { View } from '../scenes/view';

export class HenView {
  readonly img: Phaser.GameObjects.Image;
  private lastX = 0;
  private face = 1;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, h: Hen) {
    this.img = add(scene.add.image(h.x, h.y, TEX.hen(0)));
  }

  update(h: Hen, now: number, v: View): void {
    const X = v.x(h.x, h.y);
    const Y = v.y(h.x, h.y);
    if (!v.iso) this.face = h.face;
    else if (h.moving && Math.abs(X - this.lastX) > 0.05) this.face = X > this.lastX ? 1 : -1;
    this.lastX = X;
    const grown = isGrown(h, now);
    const step = Math.floor(h.walkT);
    const frame = h.peck > 0 ? (grown ? 3 : 2) : h.moving ? 1 + (step % 2) : 0;
    const img = this.img.setTexture(grown ? TEX.hen(grown ? frame : 0) : TEX.chick(Math.min(frame, 2)));
    img.setOrigin(0.5, 1);
    const bob = h.moving && step % 2 ? -1 : 0;
    img.setPosition(Math.round(X), Math.round(Y + 3 + bob)).setScale(this.face, 1).setDepth(ENTITY_DEPTH + Y);
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }

  destroy(): void {
    this.img.destroy();
  }
}
