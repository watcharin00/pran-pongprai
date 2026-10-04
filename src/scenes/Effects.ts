// Presentation-only effects: particles, impact rings and ambient life.
// Uses Math.random freely: nothing here affects the simulation.
import Phaser from 'phaser';
import type { Vec2 } from '../core/events';
import { CHIMNEY, PLAZA, POT, T } from '../core/mapgen';

export type ParticleKind = 'spark' | 'dust' | 'chunk' | 'glow' | 'fly' | 'leaf' | 'ember' | 'smoke';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  max: number;
  col: number;
  kind: ParticleKind;
  grav: number;
  ph: number;
}

type Fx = { kind: 'ring'; x: number; y: number; r: number; t: number } | { kind: 'shock'; x: number; y: number; r: number; t: number } | { kind: 'whirl'; t: number };

export const MAX_PARTICLES = 450;
const rr = (a: number, b: number): number => a + Math.random() * (b - a);
const ri = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a + 1));
const col = (hex: string): number => parseInt(hex.slice(1), 16);

export class Effects {
  private parts: Particle[] = [];
  private fx: Fx[] = [];
  private readonly gNormal: Phaser.GameObjects.Graphics;
  private readonly gAdd: Phaser.GameObjects.Graphics;
  private readonly gFx: Phaser.GameObjects.Graphics;
  private readonly gFxAdd: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, depths: { fx: number; particles: number }) {
    this.gFx = add(scene.add.graphics().setDepth(depths.fx));
    this.gFxAdd = add(scene.add.graphics().setDepth(depths.fx + 0.1).setBlendMode(Phaser.BlendModes.ADD));
    this.gNormal = add(scene.add.graphics().setDepth(depths.particles));
    this.gAdd = add(scene.add.graphics().setDepth(depths.particles + 0.1).setBlendMode(Phaser.BlendModes.ADD));
  }

  get count(): number {
    return this.parts.length;
  }

  push(p: Omit<Particle, 'grav' | 'ph'> & { grav?: number; ph?: number }): void {
    this.parts.push({ grav: 0, ph: 0, ...p });
  }

  burst(x: number, y: number, color: string, n: number, spd = 70, kind: ParticleKind = 'spark'): void {
    const c = col(color);
    for (let i = 0; i < n; i++) {
      const a = rr(0, Math.PI * 2);
      const s = rr(spd * 0.3, spd);
      this.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'chunk' ? 40 : 0), t: rr(0.3, 0.6), max: 0.6, col: c, kind, grav: kind === 'chunk' ? 160 : 0 });
    }
  }

  ring(x: number, y: number, r: number): void {
    this.fx.push({ kind: 'ring', x, y, r, t: 0.3 });
  }

  shock(x: number, y: number, r: number): void {
    this.fx.push({ kind: 'shock', x, y, r, t: 0.35 });
  }

  whirl(): void {
    this.fx.push({ kind: 'whirl', t: 0.3 });
  }

  healGlow(x: number, y: number): void {
    for (let i = 0; i < 10; i++) this.push({ x: x + rr(-5, 5), y: y + rr(-2, 6), vx: 0, vy: rr(-30, -15), t: rr(0.5, 0.8), max: 0.8, col: 0xb4ff9a, kind: 'glow' });
  }

  walkDust(x: number, y: number): void {
    this.push({ x: x + rr(-2, 2), y: y + 7, vx: rr(-8, 8), vy: rr(-8, -2), t: 0.35, max: 0.35, col: 0xe8d8b0, kind: 'dust' });
  }

  dashDust(x: number, y: number, color: string): void {
    this.push({ x: x + rr(-4, 4), y, vx: rr(-15, 15), vy: rr(-25, -5), t: 0.4, max: 0.4, col: col(color), kind: 'dust' });
  }

  /** Butterflies and falling leaves in green zones, rising embers in the canyon, smoke from chimney and pot. */
  ambient(dt: number, view: Phaser.Geom.Rectangle, zone: string, player: Vec2): void {
    const { x: cx, y: cy, width: VW, height: VH } = view;
    if (zone !== 'canyon') {
      if (Math.random() < dt * 0.9) {
        const c = [0xffffff, 0xffb040, 0x8ac8ff, 0xffd84a][ri(0, 3)] ?? 0xffffff;
        this.push({ x: cx + rr(0, VW), y: cy + rr(0, VH), vx: rr(-10, 10), vy: rr(-10, 10), t: rr(5, 8), max: 8, col: c, kind: 'fly', ph: rr(0, 9) });
      }
      if (zone === 'forest' && Math.random() < dt * 1.5) this.push({ x: cx + rr(0, VW), y: cy - 4, vx: rr(4, 14), vy: rr(10, 18), t: 4, max: 4, col: Math.random() < 0.5 ? 0x7fc85a : 0xe8c050, kind: 'leaf' });
    } else if (Math.random() < dt * 6) {
      this.push({ x: cx + rr(0, VW), y: cy + VH + 2, vx: rr(-4, 4), vy: rr(-26, -12), t: rr(2, 4), max: 4, col: Math.random() < 0.6 ? 0xff8a3d : 0xffd35c, kind: 'ember' });
    }
    // fountain mist
    const fx = PLAZA.x * T;
    const fy = PLAZA.y * T;
    if (Math.hypot(fx - player.x, fy - player.y) < 220 && Math.random() < dt * 14) {
      this.push({ x: fx + rr(-3, 3), y: fy - 11, vx: rr(-8, 8), vy: rr(-20, -10), t: 0.5, max: 0.5, col: 0xd8fff4, kind: 'chunk', grav: 60 });
    }
    if (Math.hypot(POT.x - player.x, POT.y - player.y) < 260 && Math.random() < dt * 1.5) {
      this.push({ x: POT.x + rr(-2, 2), y: POT.y - 5, vx: rr(-2, 3), vy: rr(-12, -6), t: 1.8, max: 1.8, col: 0xf4f4f8, kind: 'smoke' });
    }
    if (Math.hypot(CHIMNEY.x - player.x, CHIMNEY.y - player.y) < 260 && Math.random() < dt * 1.6) {
      this.push({ x: CHIMNEY.x + rr(-1, 1), y: CHIMNEY.y, vx: rr(3, 8), vy: rr(-14, -8), t: 2.2, max: 2.2, col: 0xd8d8de, kind: 'smoke' });
    }
  }

  update(dt: number, time: number): void {
    for (const q of this.parts) {
      q.t -= dt;
      switch (q.kind) {
        case 'leaf':
          q.x += (q.vx + Math.sin(time * 2 + q.y * 0.1) * 10) * dt;
          q.y += q.vy * dt;
          break;
        case 'fly':
          q.vx = Math.max(-14, Math.min(14, q.vx + rr(-40, 40) * dt));
          q.vy = Math.max(-10, Math.min(10, q.vy + rr(-40, 40) * dt));
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          break;
        case 'ember':
          q.x += (q.vx + Math.sin(time * 3 + q.y * 0.2) * 6) * dt;
          q.y += q.vy * dt;
          break;
        case 'smoke':
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          break;
        default:
          q.vy += q.grav * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= 0.9;
          if (!q.grav) q.vy *= 0.9;
      }
    }
    this.parts = this.parts.filter((q) => q.t > 0);
    if (this.parts.length > MAX_PARTICLES) this.parts.splice(0, this.parts.length - MAX_PARTICLES);
    for (const f of this.fx) f.t -= dt;
    this.fx = this.fx.filter((f) => f.t > 0);
  }

  draw(time: number, player: Vec2): void {
    const g = this.gFx;
    const ga = this.gFxAdd;
    g.clear();
    ga.clear();
    for (const f of this.fx) {
      if (f.kind === 'ring') {
        g.lineStyle(2, 0xffe6b4, Math.min(1, f.t * 3));
        g.strokeCircle(f.x, f.y, f.r * (1 + (0.3 - f.t)));
      } else if (f.kind === 'shock') {
        const k = 1 - f.t / 0.35;
        const rx = f.r * k + 4;
        g.lineStyle(3, 0xfff0c8, Math.min(1, f.t * 2.5));
        g.strokeEllipse(f.x, f.y, rx * 2, rx * 0.55 * 2);
      } else {
        const k = 1 - f.t / 0.3;
        ga.lineStyle(3, 0xc8f0ff, Math.min(1, f.t * 2.5));
        ga.beginPath();
        ga.arc(player.x, player.y, 14 + k * 22, time * 20, time * 20 + 4.5);
        ga.strokePath();
      }
    }

    const n = this.gNormal;
    const a = this.gAdd;
    n.clear();
    a.clear();
    for (const q of this.parts) {
      const alpha = Math.min(1, (q.t / (q.max || 0.5)) * 1.5);
      if (q.kind === 'fly') {
        const up = Math.floor(time * 10 + q.ph) % 2;
        n.fillStyle(0x3a2a1a, 1).fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
        n.fillStyle(q.col, 1).fillRect(Math.round(q.x) - 1, Math.round(q.y) - up, 1, 1).fillRect(Math.round(q.x) + 1, Math.round(q.y) - up, 1, 1);
        continue;
      }
      const size = q.kind === 'smoke' ? 2 + Math.round((1 - q.t / q.max) * 2) : q.kind === 'chunk' ? 2 : 1;
      const target = q.kind === 'glow' || q.kind === 'ember' ? a : n;
      target.fillStyle(q.col, alpha).fillRect(Math.round(q.x), Math.round(q.y), size, size);
    }
  }
}
