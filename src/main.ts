import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import './ui/hud.css';

// The canvas is sized in device pixels and shown at CSS size (zoom = 1/dpr),
// so pixel art stays crisp on high-DPI phones. WorldScene owns resizing.
const dpr = Math.min(window.devicePixelRatio || 1, 3);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#15202b',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: Math.round(window.innerWidth * dpr),
    height: Math.round(window.innerHeight * dpr),
    zoom: 1 / dpr,
  },
  // Input is handled with DOM pointer/keyboard events (src/input).
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, WorldScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
