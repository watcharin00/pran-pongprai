// Small round minimap under the HP bar. North is always up; the player arrow
// turns to the walking direction. Fades out while a monster is hunting the
// player so the screen stays clear for dodging. Tapping it opens the map tab.
import { MONSTERS } from '../data';
import type { AreaId } from '../data/types';
import { MH, MW, T } from '../core/mapgen';
import type { GameState } from '../core/state';
import { areaThumbUrl } from '../art/mapThumb';

/** Tiles visible from the centre to the rim. */
const RADIUS_TILES = 14;

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D | null;
  private thumb: HTMLImageElement | null = null;
  private thumbArea: AreaId | null = null;
  private size = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d');
  }

  private ensureThumb(s: GameState): HTMLImageElement | null {
    if (this.thumbArea !== s.area) {
      this.thumbArea = s.area;
      const img = new Image();
      img.src = areaThumbUrl(s.map);
      this.thumb = img;
    }
    return this.thumb && this.thumb.complete ? this.thumb : null;
  }

  draw(s: GameState): void {
    const g = this.ctx;
    if (!g) return;
    const css = this.canvas.clientWidth;
    if (!css) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (px !== this.size) {
      this.size = px;
      this.canvas.width = this.canvas.height = px;
    }
    const p = s.player;
    const hunted = s.monsters.some((m) => m.aggro);
    this.canvas.classList.toggle('dim', hunted);

    const scale = px / (RADIUS_TILES * 2 * T); // canvas px per world px
    const toX = (wx: number): number => px / 2 + (wx - p.x) * scale;
    const toY = (wy: number): number => px / 2 + (wy - p.y) * scale;
    g.clearRect(0, 0, px, px);
    g.save();
    g.beginPath();
    g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2c5a2a';
    g.fillRect(0, 0, px, px);
    const img = this.ensureThumb(s);
    if (img) {
      // take the square around the player (the home thumbnail is the full painting, others 4px per tile)
      const tp = img.naturalWidth / MW;
      const sx = (p.x / T - RADIUS_TILES) * tp;
      const sy = (p.y / T - RADIUS_TILES) * tp;
      const sw = RADIUS_TILES * 2 * tp;
      g.imageSmoothingEnabled = true;
      g.drawImage(img, sx, sy, sw, sw, 0, 0, px, px);
    }
    // exits: gold triangles where the map opens
    g.fillStyle = '#ffd166';
    for (const e of s.map.exits) {
      const mid = (e.at + e.width / 2) * T;
      const ex = e.edge === 'n' || e.edge === 's' ? mid : e.edge === 'w' ? T : MW * T - T;
      const ey = e.edge === 'e' || e.edge === 'w' ? mid : e.edge === 'n' ? T : MH * T - T;
      const x = Math.max(6 * dpr, Math.min(px - 6 * dpr, toX(ex)));
      const y = Math.max(6 * dpr, Math.min(px - 6 * dpr, toY(ey)));
      g.beginPath();
      g.arc(x, y, 3.2 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of s.monsters) {
      const x = toX(m.x);
      const y = toY(m.y);
      if (x < 0 || y < 0 || x > px || y > px) continue;
      const boss = MONSTERS[m.kind].rage !== null;
      g.fillStyle = boss ? '#c9a0ff' : '#ef5b4c';
      // veterans get a gold rim, alphas a crimson one (a plain gold dot means an exit)
      g.strokeStyle = m.alpha ? '#ff4a6a' : m.vet ? '#ffcf4a' : '#151c2b';
      g.lineWidth = (m.vet ? 1.6 : 1) * dpr;
      g.beginPath();
      g.arc(x, y, (boss ? 3.6 : 2.4) * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.restore();
    // player arrow, pointing where the hunter last walked
    const a = Math.atan2(p.fy || 0, p.fx || p.face);
    g.save();
    g.translate(px / 2, px / 2);
    g.rotate(a);
    g.fillStyle = '#ffd166';
    g.strokeStyle = '#151c2b';
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    g.moveTo(6 * dpr, 0);
    g.lineTo(-4 * dpr, -4 * dpr);
    g.lineTo(-2 * dpr, 0);
    g.lineTo(-4 * dpr, 4 * dpr);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
