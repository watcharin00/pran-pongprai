// Renders the player from PlayerState: body, weapon (idle/swing/spin/slam/dash), swing arc, dash ghosts.
import Phaser from 'phaser';
import { TUNING } from '../data';
import type { GameState } from '../core/state';
import { TEX } from '../scenes/textures';

export const ENTITY_DEPTH = 100;

export class PlayerView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly weapon: Phaser.GameObjects.Image;
  private readonly arc: Phaser.GameObjects.Graphics;
  private readonly ghosts: { img: Phaser.GameObjects.Image; t: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ) {
    this.weapon = add(scene.add.image(0, 0, TEX.weapon('bone')));
    this.body = add(scene.add.image(0, 0, TEX.player(0)));
    this.arc = add(scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD));
  }

  /** Spawns a fading white after-image (used every frame while dashing). */
  addGhost(x: number, y: number, face: number): void {
    const img = this.add(this.scene.add.image(x, y + 8, TEX.player(0)));
    const h = img.height;
    img.setOrigin(7 / img.width, (h - 1) / h).setScale(face, 1).setTintFill(0xffffff).setDepth(ENTITY_DEPTH + y - 0.5);
    this.ghosts.push({ img, t: 0.18 });
  }

  update(s: GameState, time: number, dt: number): void {
    for (const g of this.ghosts) {
      g.t -= dt;
      g.img.setAlpha(Math.max(0, g.t * 2));
      if (g.t <= 0) g.img.destroy();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i]?.t ?? 0) <= 0) this.ghosts.splice(i, 1);

    const p = s.player;
    const moving = p.moving && p.roll <= 0;
    const step = Math.floor(p.walkT);
    const frame = moving ? 1 + (step % 2) : 0;
    const bob = moving && step % 2 ? -1 : 0;
    const feet = p.y + 8;
    const depth = ENTITY_DEPTH + p.y;
    const body = this.body;
    body.setTexture(TEX.player(frame));
    const w = body.width;
    const h = body.height;
    this.arc.clear();

    if (p.dead) {
      body.setOrigin(0.5, 0.5).setPosition(Math.round(p.x), Math.round(feet - 3)).setRotation((Math.PI / 2) * p.face).setScale(1).setAlpha(0.5).clearTint();
      body.setDepth(depth);
      this.weapon.setVisible(false);
      return;
    }

    // rotate around a point 7px above the feet, like the prototype's roll
    body.setOrigin(Math.floor(w / 2) / w, (h - 8) / h);
    let y = feet - 7 + bob;
    let rot = 0;
    if (p.roll > 0) {
      const k = 1 - p.roll / TUNING.player.roll.duration;
      rot = k * Math.PI * 2 * (p.rdx >= 0 ? 1 : -1);
    }
    if (p.cast) y -= Math.round((1 - p.cast.t / p.cast.total) * 4);
    body.setPosition(Math.round(p.x), Math.round(y)).setRotation(rot).setScale(p.face, 1).setDepth(depth);
    body.setAlpha(p.hurtIF > 0 && Math.floor(time * 20) % 2 === 0 ? 0.45 : 1);
    if (p.hurt > 0) body.setTintFill(0xffffff);
    else body.clearTint();

    // weapon
    const wpn = this.weapon;
    wpn.setTexture(TEX.weapon(p.weapon)).setVisible(true).setScale(1).setAlpha(1);
    const ww = wpn.width;
    const wh = wpn.height;
    const hx = p.x;
    const hy = p.y + 1;
    const inAction = p.swing > 0 || p.roll > 0 || p.spin > 0 || p.cast || p.dash;
    if (!inAction) {
      // carried on the back, behind the body
      wpn.setOrigin(3 / ww, Math.floor(wh / 2) / wh).setPosition(Math.round(p.x - p.face * 2), Math.round(p.y + 2 + bob)).setScale(p.face, 1).setRotation(p.face * -2.2).setDepth(depth - 0.01);
      return;
    }
    wpn.setOrigin(1 / ww, Math.floor(wh / 2) / wh).setDepth(depth + 0.01);
    if (p.spin > 0) wpn.setPosition(Math.round(hx), Math.round(hy)).setRotation(time * 30);
    else if (p.cast) wpn.setPosition(Math.round(hx), Math.round(hy - 4)).setRotation(-Math.PI / 2 - 0.4 * p.face);
    else if (p.dash) wpn.setPosition(Math.round(hx), Math.round(hy)).setRotation(Math.atan2(p.dash.dy, p.dash.dx));
    else if (p.swing > 0) {
      const k = 1 - p.swing / 0.2;
      const dir = Math.cos(p.swingAng) >= 0 ? 1 : -1;
      const a0 = p.swingAng - 1.4 * dir;
      const a = a0 + 2.8 * dir * Math.min(1, k * 1.4);
      this.arc.setDepth(depth + 0.02);
      this.arc.lineStyle(3, 0xfffff0, 0.75 * (1 - k));
      this.arc.beginPath();
      this.arc.arc(hx, hy, ww - 2, Math.min(a0, a), Math.max(a0, a));
      this.arc.strokePath();
      wpn.setPosition(Math.round(hx), Math.round(hy)).setRotation(a);
    } else wpn.setVisible(false); // rolling
  }
}
