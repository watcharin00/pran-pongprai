import Phaser from 'phaser';
import { CROPS, MATERIAL_IDS, MEALS, MONSTER_IDS, SKILLS, WEAPONS } from '../data';
import * as th from '../i18n/th';

/**
 * Map, player, monsters, particles and glow.
 * Phase 0: placeholder that proves Phaser boots and the content data loads.
 */
export class WorldScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private info!: Phaser.GameObjects.Text;

  constructor() {
    super('World');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#6aae42');

    this.title = this.add
      .text(0, 0, th.game.title, { fontFamily: 'Mitr', fontSize: '40px', color: '#fff8e4', stroke: '#2a1a10', strokeThickness: 6 })
      .setOrigin(0.5);

    const monsterNames = MONSTER_IDS.map((id) => th.monsters[id].name).join(', ');
    const skillNames = SKILLS.order.map((id) => th.skills[id].name).join(' · ');
    this.info = this.add
      .text(
        0,
        0,
        [
          `มอน ${MONSTER_IDS.length}: ${monsterNames}`,
          `อาวุธ ${Object.keys(WEAPONS).length} · วัสดุ ${MATERIAL_IDS.length}`,
          `พืช ${Object.keys(CROPS).length} · อาหาร ${Object.keys(MEALS).length}`,
          `สกิล: ${skillNames}`,
        ].join('\n'),
        { fontFamily: 'IBM Plex Sans Thai', fontSize: '15px', color: '#f7ecd0', backgroundColor: 'rgba(20,26,42,0.74)', padding: { x: 12, y: 8 }, align: 'center' },
      )
      .setOrigin(0.5, 0);

    this.layout(this.scale.gameSize);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
  }

  private layout(size: Phaser.Structs.Size): void {
    const cx = size.width / 2;
    const cy = size.height / 2;
    this.title.setPosition(cx, cy - 50);
    this.info.setPosition(cx, cy - 10);
  }
}
