import Phaser from 'phaser';

const FONTS = ["600 16px 'Mitr'", "400 16px 'IBM Plex Sans Thai'", "700 16px 'Pixelify Sans'"];
const FONT_TIMEOUT_MS = 2500;

/**
 * Builds every procedural texture, then hands over to WorldScene.
 * Phase 0: only waits for the web fonts so canvas text never renders in a fallback face.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const fontsReady = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
    void Promise.race([fontsReady, timeout]).then(() => this.scene.start('World'));
  }
}
