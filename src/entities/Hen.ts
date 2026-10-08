// Renders one coop chicken from Hen state: a chick until it is grown, then a hen.
import Phaser from 'phaser';
import { isGrown } from '../core/ranch';
import type { Hen } from '../core/state';
import { TEX } from '../scenes/textures';
import { ENTITY_DEPTH } from './Player';

export class HenView {
  readonly img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, h: Hen) {
    this.img = add(scene.add.image(h.x, h.y, TEX.hen(0)));
  }

  update(h: Hen, now: number): void {
    const grown = isGrown(h, now);
    const step = Math.floor(h.walkT);
    const frame = h.peck > 0 ? (grown ? 3 : 2) : h.moving ? 1 + (step % 2) : 0;
    const img = this.img.setTexture(grown ? TEX.hen(grown ? frame : 0) : TEX.chick(Math.min(frame, 2)));
    img.setOrigin(0.5, 1);
    const bob = h.moving && step % 2 ? -1 : 0;
    img.setPosition(Math.round(h.x), Math.round(h.y + 3 + bob)).setScale(h.face, 1).setDepth(ENTITY_DEPTH + h.y);
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }

  destroy(): void {
    this.img.destroy();
  }
}
