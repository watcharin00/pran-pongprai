import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#15202b',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  input: { activePointers: 4 },
  scene: [BootScene, WorldScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
