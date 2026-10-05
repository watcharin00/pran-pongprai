// Renders one villager from NpcState (same proportions and feet line as the player).
import Phaser from 'phaser';
import type { NpcState } from '../core/state';
import { TEX } from '../scenes/textures';
import { ENTITY_DEPTH } from './Player';

export class NpcView {
  readonly img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, n: NpcState) {
    this.img = add(scene.add.image(n.x, n.y, TEX.npc(n.id, 0)));
  }

  update(n: NpcState, time: number): void {
    const step = Math.floor(n.walkT);
    const frame = n.moving ? 1 + (step % 2) : 0;
    const bob = n.moving && step % 2 ? -1 : 0;
    // standing villagers breathe a little so the village never looks frozen
    const breathe = n.moving ? 1 : 1 + Math.sin(time * 2.4 + n.hx) * 0.025;
    const img = this.img.setTexture(TEX.npc(n.id, frame));
    img.setOrigin(Math.floor(img.width / 2) / img.width, 1);
    img.setPosition(Math.round(n.x), Math.round(n.y + 9 + bob)).setScale(n.face, breathe).setDepth(ENTITY_DEPTH + n.y);
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }
}
