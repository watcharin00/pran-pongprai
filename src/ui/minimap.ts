// Small round minimap under the HP bar. North is always up; the player arrow
// turns to the walking direction. Fades out while a monster is hunting the
// player so the screen stays clear for dodging. Tapping it opens the map tab.
import { MONSTERS } from '../data';
import type { AreaId } from '../data/types';
import { MH, MW, T } from '../core/mapgen';
import type { GameState } from '../core/state';
import { areaThumbUrl } from '../art/mapThumb';
import { FLAT, ISO } from '../scenes/view';
import homeGround from '../assets/village/ground.webp';

/** image px per screen px in the isometric home ground (tools/village/build_ground.py R) */
const HOME_GROUND_SCALE = 1.25;

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
      img.src = s.area === 'home' ? homeGround : areaThumbUrl(s.map);
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

    // the home village is drawn isometric: the minimap turns with it, like the screen
    const v = s.area === 'home' ? ISO : FLAT;
    const scale = px / (RADIUS_TILES * 2 * T); // canvas px per screen px
    const cx = v.x(p.x, p.y);
    const cy = v.y(p.x, p.y);
    const toX = (wx: number, wy: number): number => px / 2 + (v.x(wx, wy) - cx) * scale;
    const toY = (wx: number, wy: number): number => px / 2 + (v.y(wx, wy) - cy) * scale;
    g.clearRect(0, 0, px, px);
    g.save();
    g.beginPath();
    g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2c5a2a';
    g.fillRect(0, 0, px, px);
    const img = this.ensureThumb(s);
    if (img) {
      // take the square around the player (home: the isometric ground image; others: 4px per tile)
      const tp = v.iso ? HOME_GROUND_SCALE : img.naturalWidth / (MW * T);
      const sw = RADIUS_TILES * 2 * T * tp;
      g.imageSmoothingEnabled = true;
      g.drawImage(img, cx * tp - sw / 2, cy * tp - sw / 2, sw, sw, 0, 0, px, px);
    }
    // exits: gold triangles where the map opens
    g.fillStyle = '#ffd166';
    for (const e of s.villageOnly ? [] : s.map.exits) {
      const mid = (e.at + e.width / 2) * T;
      const ex = e.edge === 'n' || e.edge === 's' ? mid : e.edge === 'w' ? T : MW * T - T;
      const ey = e.edge === 'e' || e.edge === 'w' ? mid : e.edge === 'n' ? T : MH * T - T;
      const x = Math.max(6 * dpr, Math.min(px - 6 * dpr, toX(ex, ey)));
      const y = Math.max(6 * dpr, Math.min(px - 6 * dpr, toY(ex, ey)));
      g.beginPath();
      g.arc(x, y, 3.2 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    for (const m of s.monsters) {
      const x = toX(m.x, m.y);
      const y = toY(m.x, m.y);
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
    const a = v.angle(Math.atan2(p.fy || 0, p.fx || p.face));
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
