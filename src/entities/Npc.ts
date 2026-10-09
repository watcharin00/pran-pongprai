// Renders one villager from NpcState (same proportions and feet line as the player).
import Phaser from 'phaser';
import type { NpcState } from '../core/state';
import { TEX } from '../scenes/textures';
import { ENTITY_DEPTH } from './Player';
import type { View } from '../scenes/view';

export class NpcView {
  readonly img: Phaser.GameObjects.Image;
  private lastX = 0;
  private face = 1;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, n: NpcState) {
    this.img = add(scene.add.image(n.x, n.y, TEX.npc(n.id, 0)));
  }

  /** `lookX`: screen x of what a standing villager faces (the player). */
  update(n: NpcState, time: number, v: View, lookX: number): void {
    const X = v.x(n.x, n.y);
    const Y = v.y(n.x, n.y);
    // on screen they face the way they walk, or the player while standing
    if (!v.iso) this.face = n.face;
    else if (n.moving && Math.abs(X - this.lastX) > 0.05) this.face = X > this.lastX ? 1 : -1;
    else if (!n.moving && Math.abs(lookX - X) > 2) this.face = lookX > X ? 1 : -1;
    this.lastX = X;
    const step = Math.floor(n.walkT);
    const frame = n.moving ? 1 + (step % 2) : 0;
    const bob = n.moving && step % 2 ? -1 : 0;
    // standing villagers breathe a little so the village never looks frozen
    const breathe = n.moving ? 1 : 1 + Math.sin(time * 2.4 + n.hx) * 0.025;
    const img = this.img.setTexture(TEX.npc(n.id, frame));
    img.setOrigin(Math.floor(img.width / 2) / img.width, 1);
    img.setPosition(Math.round(X), Math.round(Y + 9 + bob)).setScale(this.face, breathe).setDepth(ENTITY_DEPTH + Y);
  }

  setVisible(v: boolean): void {
    this.img.setVisible(v);
  }
}
