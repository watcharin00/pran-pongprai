// Renders the player from PlayerState: body, weapon (idle/swing/spin/slam/dash), swing arc, dash ghosts.
import Phaser from 'phaser';
import { SKILLS, TUNING, WEAPONS } from '../data';
import type { GameState } from '../core/state';
import { TEX } from '../scenes/textures';
import type { View } from '../scenes/view';

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

  update(s: GameState, time: number, dt: number, v: View): void {
    for (const g of this.ghosts) {
      g.t -= dt;
      g.img.setAlpha(Math.max(0, g.t * 2));
      if (g.t <= 0) g.img.destroy();
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) if ((this.ghosts[i]?.t ?? 0) <= 0) this.ghosts.splice(i, 1);

    const p = s.player;
    // screen position of the feet and the facing on screen (the map may be drawn isometric)
    const X = v.x(p.x, p.y);
    const Y = v.y(p.x, p.y);
    const face = v.iso ? v.face(p.fx, p.fy, p.face) : p.face;
    const ang = (a: number): number => v.angle(a);
    const moving = p.moving && p.roll <= 0;
    const step = Math.floor(p.walkT);
    const frame = moving ? 1 + (step % 2) : 0;
    const bob = moving && step % 2 ? -1 : 0;
    const feet = Y + 8;
    const depth = ENTITY_DEPTH + Y;
    const body = this.body;
    body.setTexture(TEX.player(frame));
    const w = body.width;
    const h = body.height;
    this.arc.clear();

    if (p.dead) {
      body.setOrigin(0.5, 0.5).setPosition(Math.round(X), Math.round(feet - 3)).setRotation((Math.PI / 2) * face).setScale(1).setAlpha(0.5).clearTint();
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
      rot = k * Math.PI * 2 * (v.face(p.rdx, p.rdy, face) >= 0 ? 1 : -1);
    }
    if (p.cast) y -= Math.round((1 - p.cast.t / p.cast.total) * 4);
    body.setPosition(Math.round(X), Math.round(y)).setRotation(rot).setScale(face, 1).setDepth(depth);
    body.setAlpha(p.hurtIF > 0 && Math.floor(time * 20) % 2 === 0 ? 0.45 : 1);
    if (p.hurt > 0) body.setTintFill(0xffffff);
    else body.clearTint();

    // weapon
    const wpn = this.weapon;
    wpn.setTexture(TEX.weapon(p.weapon)).setVisible(true).setScale(1).setAlpha(1);
    const ww = wpn.width;
    const wh = wpn.height;
    const hx = X;
    const hy = Y + 1;
    const inAction = p.swing > 0 || p.roll > 0 || p.spin > 0 || p.cast || p.dash;
    if (!inAction) {
      // carried on the back, behind the body
      wpn.setOrigin(3 / ww, Math.floor(wh / 2) / wh).setPosition(Math.round(X - face * 2), Math.round(Y + 2 + bob)).setScale(face, 1).setRotation(face * -2.2).setDepth(depth - 0.01);
      return;
    }
    wpn.setOrigin(1 / ww, Math.floor(wh / 2) / wh).setDepth(depth + 0.01);
    if (p.spin > 0) wpn.setPosition(Math.round(hx), Math.round(hy)).setRotation(time * 30);
    else if (p.cast && SKILLS[p.cast.skill].kind === 'windupLine') {
      // drawn back during the wind-up, then jabbed forward on each strike
      const back = p.cast.t > 0 && p.cast.hits > 0 ? (p.cast.t / p.cast.total) * 5 : 0;
      const a = ang(Math.atan2(p.cast.uy, p.cast.ux));
      wpn.setPosition(Math.round(hx - Math.cos(a) * back), Math.round(hy - Math.sin(a) * back)).setRotation(a);
    } else if (p.cast) wpn.setPosition(Math.round(hx), Math.round(hy - 4)).setRotation(-Math.PI / 2 - 0.4 * face);
    else if (p.dash) wpn.setPosition(Math.round(hx), Math.round(hy)).setRotation(ang(Math.atan2(p.dash.dy, p.dash.dx)));
    else if (p.swing > 0 && WEAPONS[p.weapon].projectile) {
      // ranged: hold the bow toward the shot, no swing arc
      const k = 1 - p.swing / 0.2;
      const sa = ang(p.swingAng);
      wpn.setOrigin(0.5, 0.5).setPosition(Math.round(hx + Math.cos(sa) * (4 - k * 2)), Math.round(hy + Math.sin(sa) * (4 - k * 2))).setRotation(sa);
    } else if (p.swing > 0) {
      const k = 1 - p.swing / 0.2;
      const sa = ang(p.swingAng);
      const dir = Math.cos(sa) >= 0 ? 1 : -1;
      const a0 = sa - 1.4 * dir;
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
