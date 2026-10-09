// Renders one monster from MonsterState: squash on telegraph, stretch on dash,
// wobble when stunned, white flash on hit, broken parts removed from the sprite.
import Phaser from 'phaser';
import { MONSTER_FRAME_COUNT, type MonsterState } from '../core/state';
import { TEX } from '../scenes/textures';
import { ENTITY_DEPTH } from './Player';
import type { View } from '../scenes/view';

export class MonsterView {
  readonly img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, m: MonsterState) {
    this.img = add(scene.add.image(m.x, m.y, MonsterView.textureOf(m)));
  }

  static textureOf(m: MonsterState): string {
    return TEX.monster(m.kind, Math.floor(m.anim) % MONSTER_FRAME_COUNT, !!m.parts.head?.broken, !!m.parts.tail?.broken);
  }

  /** screen y of the feet, used for shadows/bars */
  static feet(m: MonsterState, h: number, v: View): number {
    return v.y(m.x, m.y) + h / 2 - 2;
  }

  update(m: MonsterState, time: number, v: View): void {
    const img = this.img;
    img.setTexture(MonsterView.textureOf(m));
    const w = img.width;
    const h = img.height;
    let sx = 1;
    let sy = 1;
    let ox = 0;
    let rot = 0;
    if (m.mode === 'tele') {
      const k = 1 - m.t / m.tt;
      sx = 1 + 0.1 * k;
      sy = 1 - 0.12 * k;
      ox = Math.round(Math.sin(time * 60) * k);
    } else if (m.mode === 'dash') {
      sx = 1.15;
      sy = 0.9;
    } else if (m.mode === 'recover') sy = 1 + 0.05 * Math.sin(m.t * 12);
    else if (m.mode === 'stun') rot = Math.sin(time * 6) * 0.14;
    else sy = 1 + Math.sin(time * 4 + m.id) * 0.03;
    // veterans stand a little taller with a warm golden cast
    if (m.vet) {
      const k = m.alpha ? 1.22 : 1.12;
      sx *= k;
      sy *= k;
    }
    const feet = MonsterView.feet(m, h, v);
    img.setOrigin(Math.round(w / 2) / w, (h - 2) / h);
    img.setPosition(Math.round(v.x(m.x, m.y) + ox), Math.round(feet)).setRotation(rot).setScale(m.dirX * sx, sy).setDepth(ENTITY_DEPTH + v.y(m.x, m.y));
    if (m.flash > 0) img.setTintFill(0xffffff);
    else if (m.alpha) img.setTint(0xffc8c8);
    else if (m.vet) img.setTint(0xffe6bc);
    else img.clearTint();
  }

  destroy(): void {
    this.img.destroy();
  }
}
