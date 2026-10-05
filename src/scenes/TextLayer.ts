// Screen-space text (damage numbers, station labels, "!" warnings) and the vignette.
// Lives on a separate zoom-1 camera so text stays crisp at device resolution.
import Phaser from 'phaser';
import * as th from '../i18n/th';

interface Float {
  x: number;
  y: number;
  t: number;
  big: boolean;
  text: Phaser.GameObjects.Text;
}

export interface ScreenMapper {
  /** world → device pixels */
  toScreen(x: number, y: number): { x: number; y: number };
  dpr: number;
}

const PIXEL_FONT = "'Pixelify Sans', 'IBM Plex Sans Thai', sans-serif";
const DISPLAY_FONT = "'Mitr', 'IBM Plex Sans Thai', sans-serif";

export class TextLayer {
  private floats: Float[] = [];
  private readonly warnings = new Map<number, Phaser.GameObjects.Text>();
  private readonly bubbles = new Map<string, { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics; seen: boolean }>();
  private readonly labels: { text: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics }[] = [];
  private vignette: Phaser.GameObjects.Image | null = null;
  private readonly deathShade: Phaser.GameObjects.Rectangle;
  private readonly deathText: Phaser.GameObjects.Text;
  private labelsUsed = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  ) {
    this.deathShade = add(scene.add.rectangle(0, 0, 10, 10, 0x0a0e18, 0.55).setOrigin(0).setDepth(30).setVisible(false));
    this.deathText = add(scene.add.text(0, 0, th.hud.knockedOut, { fontFamily: DISPLAY_FONT, color: '#f7ecd0' }).setOrigin(0.5).setDepth(31).setVisible(false));
  }

  float(x: number, y: number, txt: string | number, color = '#ffffff', big = false, dpr = 1): void {
    const text = this.add(
      this.scene.add
        .text(0, 0, String(txt), { fontFamily: PIXEL_FONT, fontSize: `${(big ? 16 : 13) * dpr}px`, fontStyle: 'bold', color, stroke: 'rgba(20,14,10,0.92)', strokeThickness: 4 * dpr })
        .setOrigin(0.5, 0.8)
        .setDepth(10),
    );
    this.floats.push({ x, y, t: 1, big, text });
  }

  /** Called once per frame before `label`s are drawn. */
  begin(): void {
    this.labelsUsed = 0;
  }

  label(m: ScreenMapper, txt: string, wx: number, wy: number, color: string): void {
    let l = this.labels[this.labelsUsed];
    if (!l) {
      const bg = this.add(this.scene.add.graphics().setDepth(5));
      const text = this.add(this.scene.add.text(0, 0, '', { fontFamily: DISPLAY_FONT }).setOrigin(0.5).setDepth(6));
      l = { text, bg };
      this.labels.push(l);
    }
    this.labelsUsed++;
    const { x, y } = m.toScreen(wx, wy);
    const dpr = m.dpr;
    // Text style changes re-render the texture, so only touch them when they differ.
    if (l.text.text !== txt) l.text.setText(txt);
    if (l.text.getData('dpr') !== dpr) l.text.setFontSize(12 * dpr).setData('dpr', dpr);
    if (l.text.style.color !== color) l.text.setColor(color);
    l.text.setPosition(x, y + dpr).setVisible(true);
    const w = l.text.width + 14 * dpr;
    const h = 19 * dpr;
    l.bg.clear().fillStyle(0x141a2a, 0.8).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2).setVisible(true);
  }

  /** Hide labels not used this frame. */
  endLabels(): void {
    for (let i = this.labelsUsed; i < this.labels.length; i++) {
      const l = this.labels[i];
      l?.text.setVisible(false);
      l?.bg.setVisible(false);
    }
  }

  warning(m: ScreenMapper, id: number, wx: number, wy: number, time: number): void {
    let t = this.warnings.get(id);
    if (!t) {
      t = this.add(this.scene.add.text(0, 0, '!', { fontFamily: PIXEL_FONT, fontStyle: 'bold', color: '#ff5a3c', stroke: '#1a0806' }).setOrigin(0.5, 0.8).setDepth(8));
      this.warnings.set(id, t);
    }
    const { x, y } = m.toScreen(wx, wy);
    if (t.getData('dpr') !== m.dpr) t.setFontSize(18 * m.dpr).setStroke('#1a0806', 4 * m.dpr).setData('dpr', m.dpr);
    t.setPosition(x, y + Math.sin(time * 20) * 2 * m.dpr);
    t.setData('seen', true);
  }

  /**
   * A villager's speech bubble above (wx, wy): white rounded box with a tail.
   * Keyed so each villager keeps one bubble; call every frame it should stay visible.
   */
  bubble(m: ScreenMapper, key: string, name: string, line: string, wx: number, wy: number): void {
    let b = this.bubbles.get(key);
    if (!b) {
      const bg = this.add(this.scene.add.graphics().setDepth(5));
      const text = this.add(this.scene.add.text(0, 0, '', { fontFamily: "'IBM Plex Sans Thai', sans-serif", color: '#2a2018', align: 'center' }).setOrigin(0.5, 1).setDepth(6));
      b = { text, bg, seen: true };
      this.bubbles.set(key, b);
    }
    b.seen = true;
    const dpr = m.dpr;
    const content = `${name}\n${line}`;
    // style changes re-render the text texture, so only touch them when something differs
    if (b.text.getData('dpr') !== dpr) {
      b.text.setFontSize(12 * dpr).setLineSpacing(2 * dpr).setWordWrapWidth(170 * dpr).setData('dpr', dpr);
      b.text.setData('content', '');
    }
    if (b.text.getData('content') !== content) b.text.setText(content).setData('content', content);
    const { x, y } = m.toScreen(wx, wy);
    const pad = 7 * dpr;
    const tail = 6 * dpr;
    const w = b.text.width + pad * 2;
    const h = b.text.height + pad * 2;
    const top = y - tail - h;
    b.text.setPosition(x, y - tail - pad).setVisible(true);
    b.bg
      .clear()
      .fillStyle(0x1a1410, 0.35)
      .fillRoundedRect(x - w / 2, top + 2 * dpr, w, h, 8 * dpr)
      .fillStyle(0xfffbf0, 0.97)
      .fillRoundedRect(x - w / 2, top, w, h, 8 * dpr)
      .fillTriangle(x - tail, y - tail - 1, x + tail, y - tail - 1, x, y)
      .lineStyle(Math.max(1, dpr), 0x5a3418, 0.9)
      .strokeRoundedRect(x - w / 2, top, w, h, 8 * dpr)
      .setVisible(true);
  }

  /** Hide bubbles not refreshed this frame. */
  endBubbles(): void {
    for (const b of this.bubbles.values()) {
      if (!b.seen) {
        b.text.setVisible(false);
        b.bg.setVisible(false);
      }
      b.seen = false;
    }
  }

  /** Drop warnings that were not refreshed this frame. */
  endWarnings(): void {
    for (const [id, t] of this.warnings) {
      if (t.getData('seen')) t.setData('seen', false);
      else {
        t.destroy();
        this.warnings.delete(id);
      }
    }
  }

  update(m: ScreenMapper, rawDt: number): void {
    for (const f of this.floats) {
      f.t -= rawDt * 0.9;
      const { x, y } = m.toScreen(f.x, f.y - (1 - f.t) * 16);
      const pop = 1 + Math.max(0, f.t - 0.82) * 3;
      f.text.setPosition(x, y).setScale(pop).setAlpha(Math.max(0, Math.min(1, f.t * 2.5)));
      if (f.t <= 0) f.text.destroy();
    }
    this.floats = this.floats.filter((f) => f.t > 0);
  }

  setDead(dead: boolean, w: number, h: number, dpr: number): void {
    if (this.deathShade.visible === dead && !dead) return;
    this.deathShade.setVisible(dead).setSize(w, h);
    this.deathText.setVisible(dead).setPosition(w / 2, h / 2);
    if (this.deathText.getData('dpr') !== dpr) this.deathText.setFontSize(22 * dpr).setData('dpr', dpr);
  }

  /** Soft dark edge so the bright world doesn't bleed into the HUD. */
  resize(w: number, h: number): void {
    const key = 'vignette';
    if (this.scene.textures.exists(key)) {
      this.vignette?.destroy();
      this.vignette = null;
      this.scene.textures.remove(key);
    }
    const tex = this.scene.textures.createCanvas(key, w, h);
    const ctx = tex?.getContext();
    if (!tex || !ctx) return;
    const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.78);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(10,20,30,0.32)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
    this.vignette = this.add(this.scene.add.image(0, 0, key).setOrigin(0).setDepth(20));
  }
}
