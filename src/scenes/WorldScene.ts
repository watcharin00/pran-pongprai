// Map, player, monsters, particles and glow. Owns the game loop: gathers input,
// steps the core simulation, then turns simulation events into feel
// (hitstop, shake, flashes, numbers, toasts) and draws.
import Phaser from 'phaser';
import { CROPS, MATERIALS, MONSTERS, NPCS, REQUESTS, SKILLS, TUNING, WEAPON_TYPES, WEAPONS } from '../data';
import type { AreaId, MaterialId, NpcId, PartId } from '../data/types';
import { autoIntent, createAutoPilot, type AutoPilotState } from '../core/autoPilot';
import { findMonster } from '../core/combat';
import { isRipe, plant, plotProgress } from '../core/farm';
import { ANVIL, BOARD, FARM, FARM_CENTER, PADDY_CENTER, POND_CENTER, MH, MW, PLAZA, POT, T, Tile, tileAt, zoneAtPx, type WorldMap } from '../core/mapgen';
import { npcLine, npcNear } from '../core/npc';
import { claimRequest, requestReady } from '../core/requests';
import { loadFromStorage, serialize } from '../core/save';
import { createGame, step } from '../core/sim';
import type { GameState, MonsterState } from '../core/state';
import { contextAction, type ContextAction } from '../core/village';
import type { StaticLight } from '../art/buildings';
import { Joystick } from '../input/joystick';
import { Keyboard, type KeyCommand } from '../input/keyboard';
import { emptyHuman, IntentMixer, normaliseMove, type HumanInput } from '../input/intent';
import { ActionPad } from '../ui/actionPad';
import { fmtItems } from '../ui/format';
import { Hud } from '../ui/hud';
import { Sheet } from '../ui/sheet';
import * as th from '../i18n/th';
import { readKey, removeKey, writeKey } from '../storage';
import { PlayerView } from '../entities/Player';
import { MonsterView } from '../entities/Monster';
import { NpcView } from '../entities/Npc';
import { lineText, requestText } from '../ui/talk';
import { Effects } from './Effects';
import { TextLayer, type ScreenMapper } from './TextLayer';
import { TEX } from './textures';
import { buildTerrain } from '../art/terrain';
import { distanceGain, parseSoundSettings, Sfx, type SfxName } from '../audio/sfx';

// Draw order (CLAUDE.md): ground → plants/nodes → telegraphs → skill fx → entities (y-sorted)
// → canopy → monster bars → particles → cloud shadows → glow → text → vignette.
const D = {
  ground: 0,
  groundFx: 1,
  nodes: 2,
  nodeFx: 3,
  tele: 4,
  fx: 5,
  shadow: 6,
  corpse: 7,
  canopy: 5000,
  bars: 5001,
  particles: 5002,
  clouds: 5004,
  glow: 5005,
} as const;

interface Corpse {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  t: number;
}

interface SceneData {
  map: WorldMap;
  lights: StaticLight[];
}

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** localStorage key for the sound on/off + volume (kept out of the game save) */
const SOUND_KEY = 'pranpongprai-sound';
const vibrate = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};

export class WorldScene extends Phaser.Scene implements ScreenMapper {
  private s!: GameState;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  // scale
  dpr = 1;
  private S = 3;
  private VW = 400;
  private VH = 240;
  private camX = 0;
  private camY = 0;
  private camFX = 0;
  private camFY = 0;
  private shake = 0;
  private hitstop = 0;
  private clock = 0;

  // views
  private playerView!: PlayerView;
  private monsterViews = new Map<number, MonsterView>();
  /** paddy / pond crop images by plot index */
  private cropImgs = new Map<number, Phaser.GameObjects.Image>();
  private npcViews = new Map<NpcId, NpcView>();
  /** which line each villager is on (advances when the kid is tapped) */
  private talkN: Partial<Record<NpcId, number>> = {};
  private nodeImgs = new Map<number, Phaser.GameObjects.Image>();
  private corpses: Corpse[] = [];
  private effects!: Effects;
  private text!: TextLayer;
  private gGround!: Phaser.GameObjects.Graphics;
  private gNodeFx!: Phaser.GameObjects.Graphics;
  private gTele!: Phaser.GameObjects.Graphics;
  private gShadow!: Phaser.GameObjects.Graphics;
  private gShadowAdd!: Phaser.GameObjects.Graphics;
  private gBars!: Phaser.GameObjects.Graphics;
  private gClouds!: Phaser.GameObjects.Graphics;
  private glows: { l: StaticLight; img: Phaser.GameObjects.Image }[] = [];
  private dynGlows = new Map<number, Phaser.GameObjects.Image>();
  private clouds: { x: number; y: number; rx: number; ry: number; v: number }[] = [];
  private groundImg!: Phaser.GameObjects.Image;
  private canopyImg!: Phaser.GameObjects.Image;
  /** static lights per area, filled when an area's terrain is first built */
  private areaLights = new Map<AreaId, StaticLight[]>();

  // input + ui
  private joystick!: Joystick;
  private keyboard!: Keyboard;
  private mixer = new IntentMixer();
  private auto: AutoPilotState = createAutoPilot();
  private pending: HumanInput = emptyHuman();
  private padAttackHeld = false;
  private hud!: Hud;
  private pad!: ActionPad;
  private sheet!: Sheet;
  private sfx!: Sfx;
  private ctx: ContextAction | null = null;
  private uiT = 0;
  private saveT: number = TUNING.save.intervalSeconds;
  private autoHintShown = false;
  private noSave = false;

  constructor() {
    super('World');
  }

  // ---------------------------------------------------------------- setup

  create(data: SceneData): void {
    const save = loadFromStorage(readKey, TUNING.save.key, TUNING.save.legacyKey);
    this.s = createGame({ rngSeed: (Date.now() ^ 0x5f3759df) >>> 0 || 1, now: Date.now(), save, map: data.map });
    // dev only: lets browser smoke tests drive the live game (stripped from production builds)
    if (import.meta.env.DEV) (window as unknown as { __pranGame?: GameState }).__pranGame = this.s;
    this.input.enabled = false;

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.uiCam = this.cameras.add(0, 0, 10, 10, false, 'ui');
    this.cameras.main.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);
    this.cameras.main.setBackgroundColor('#15202b');

    const w = this.inWorld;
    this.groundImg = w(this.add.image(0, 0, TEX.ground).setOrigin(0).setDepth(D.ground));
    this.areaLights.set('home', data.lights);
    this.gGround = w(this.add.graphics().setDepth(D.groundFx));
    this.makeNodeImages();
    this.gNodeFx = w(this.add.graphics().setDepth(D.nodeFx));
    this.gTele = w(this.add.graphics().setDepth(D.tele));
    this.gShadow = w(this.add.graphics().setDepth(D.shadow));
    this.gShadowAdd = w(this.add.graphics().setDepth(D.shadow + 0.1).setBlendMode(Phaser.BlendModes.ADD));
    this.playerView = new PlayerView(this, w);
    for (const n of this.s.npcs) this.npcViews.set(n.id, new NpcView(this, w, n));
    this.canopyImg = w(this.add.image(0, 0, TEX.canopy).setOrigin(0).setDepth(D.canopy));
    this.gBars = w(this.add.graphics().setDepth(D.bars));
    this.effects = new Effects(this, w, { fx: D.fx, particles: D.particles });
    this.gClouds = w(this.add.graphics().setDepth(D.clouds));
    this.makeGlows(data.lights);
    this.clouds = Array.from({ length: 5 }, () => ({ x: Math.random() * MW * T, y: Math.random() * MH * T, rx: 60 + Math.random() * 50, ry: 28 + Math.random() * 17, v: 5 + Math.random() * 4 }));
    this.text = new TextLayer(this, this.inUi);

    this.sfx = new Sfx(parseSoundSettings(readKey(SOUND_KEY)));
    this.setupUi();
    this.subscribe();
    this.resize();
    window.addEventListener('resize', this.resize);
    const persist = (): void => this.save();
    window.addEventListener('pagehide', persist);
    const vis = (): void => {
      if (document.hidden) this.save();
    };
    document.addEventListener('visibilitychange', vis);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.resize);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', vis);
      this.keyboard.destroy();
    });

    const p = this.s.player;
    this.camFX = Phaser.Math.Clamp(p.x - this.VW / 2, 0, Math.max(0, MW * T - this.VW));
    this.camFY = Phaser.Math.Clamp(p.y - this.VH / 2, 0, Math.max(0, MH * T - this.VH));
    if (save) this.hud.toast(th.log.loaded, 'gold');
    else this.hud.toast(th.log.welcome);
    this.hud.showZone(th.zones[p.zone ?? 'village']);
    this.hud.update(this.s);
  }

  private makeNodeImages(): void {
    for (const img of this.nodeImgs.values()) img.destroy();
    this.nodeImgs.clear();
    for (const n of this.s.nodes) this.nodeImgs.set(n.id, this.inWorld(this.add.image(n.x, n.y, n.kind === 'ore' ? TEX.ore : TEX.herb).setDepth(D.nodes)));
  }

  private makeGlows(lights: readonly StaticLight[]): void {
    for (const g of this.glows) g.img.destroy();
    this.glows = [];
    const extra: StaticLight[] = this.s.area === 'home' ? [{ x: POT.x, y: POT.y + 4, r: 16, c: '255,150,60', ga: 0.18 }] : [];
    for (const l of lights.concat(extra)) this.glows.push({ l, img: this.makeGlow(l.c) });
  }

  /** Swaps terrain, nodes, glows and entity views after core/travel.ts changed the area. */
  private enterArea(): void {
    const s = this.s;
    const area = s.area;
    const gKey = area === 'home' ? TEX.ground : `${TEX.ground}:${area}`;
    const cKey = area === 'home' ? TEX.canopy : `${TEX.canopy}:${area}`;
    if (!this.textures.exists(gKey)) {
      // painted once per area on first visit, then reused
      const art = buildTerrain(s.map);
      this.textures.addCanvas(gKey, art.ground);
      this.textures.addCanvas(cKey, art.canopy);
      this.areaLights.set(area, art.lights);
    }
    this.groundImg.setTexture(gKey);
    this.canopyImg.setTexture(cKey);
    this.makeNodeImages();
    this.makeGlows(this.areaLights.get(area) ?? []);
    for (const v of this.monsterViews.values()) v.destroy();
    this.monsterViews.clear();
    for (const img of this.dynGlows.values()) img.destroy();
    this.dynGlows.clear();
    for (const c of this.corpses) c.img.destroy();
    this.corpses = [];
    this.auto = createAutoPilot();
    for (const v of this.npcViews.values()) v.setVisible(area === 'home');
    const p = s.player;
    this.camFX = Phaser.Math.Clamp(p.x - this.VW / 2, 0, Math.max(0, MW * T - this.VW));
    this.camFY = Phaser.Math.Clamp(p.y - this.VH / 2, 0, Math.max(0, MH * T - this.VH));
    this.cameras.main.fadeIn(260, 21, 32, 43);
    this.save();
  }

  private inWorld = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    this.worldLayer.add(o);
    return o;
  };

  private inUi = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    this.uiLayer.add(o);
    return o;
  };

  private makeGlow(rgb: string): Phaser.GameObjects.Image {
    const [r, g, b] = rgb.split(',').map(Number);
    return this.inWorld(this.add.image(0, 0, TEX.glow).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.glow).setTint(Phaser.Display.Color.GetColor(r ?? 255, g ?? 255, b ?? 255)));
  }

  private setupUi(): void {
    const overlay = document.getElementById('ui');
    const surface = document.getElementById('game');
    if (!overlay || !surface) throw new Error('missing #ui/#game');
    overlay.innerHTML = '';
    this.hud = new Hud(overlay, {
      onAuto: () => this.toggleAuto(),
      onMenu: (tab) => this.sheet.open(tab),
      onGoal: () => this.sheet.open('bag'),
    });
    this.pad = new ActionPad(overlay, {
      attackDown: () => {
        if (this.sheet.isOpen) return;
        if (this.ctx) this.runContext(this.ctx);
        else this.padAttackHeld = true;
      },
      attackUp: () => {
        this.padAttackHeld = false;
      },
      dodge: () => (this.pending.dodge = true),
      skill: (i) => (this.pending.skills[i as 0 | 1 | 2] = true),
      potion: () => (this.pending.potion = true),
    });
    this.sheet = new Sheet(overlay, () => this.s, this.hud, {
      changed: () => this.save(),
      reset: () => {
        this.noSave = true;
        removeKey(TUNING.save.key);
        removeKey(TUNING.save.legacyKey);
        location.reload();
      },
      opened: () => {
        this.sfx.play('ui');
        this.padAttackHeld = false;
        this.keyboard.reset();
        this.joystick.release();
      },
      closed: () => surface.focus({ preventScroll: true }),
      crafted: () => {
        this.effects.burst(ANVIL.x, ANVIL.y - 3, '#ffd35c', 16, 90);
        this.sfx.play('craft');
      },
      sound: {
        get: () => this.sfx.current,
        set: (v) => {
          this.sfx.set(v);
          writeKey(SOUND_KEY, JSON.stringify(v));
        },
      },
      sfx: (name) => this.sfx.play(name),
    });
    surface.tabIndex = 0;
    surface.setAttribute('aria-label', th.game.canvasLabel);
    this.joystick = new Joystick(surface, overlay, (cx, cy) => this.tapWorld(cx, cy), () => !this.sheet.isOpen);
    this.keyboard = new Keyboard((c) => this.onKey(c), () => this.sheet.isOpen);
  }

  private onKey(c: KeyCommand): void {
    switch (c) {
      case 'close':
        this.sheet.close();
        break;
      case 'menu':
        this.sheet.toggle();
        break;
      case 'attackDown':
        if (this.ctx) this.runContext(this.ctx);
        break;
      case 'dodge':
        this.pending.dodge = true;
        break;
      case 'skill0':
      case 'skill1':
      case 'skill2':
        this.pending.skills[Number(c.slice(-1)) as 0 | 1 | 2] = true;
        break;
      case 'potion':
        this.pending.potion = true;
        break;
      case 'auto':
        this.toggleAuto();
        break;
    }
  }

  private toggleAuto(): void {
    this.s.autoOn = !this.s.autoOn;
    if (this.s.autoOn && !this.autoHintShown) {
      this.autoHintShown = true;
      this.hud.toast(th.log.autoHint, 'gold');
    }
    this.hud.update(this.s);
    this.save();
  }

  private runContext(c: ContextAction): void {
    if (c.kind === 'plant') {
      if (plant(this.s, c.plot)) this.save();
    } else if (c.kind === 'npc') this.talkTo(c.npc);
    else this.sheet.open(c.kind);
  }

  /** The context button next to a villager. */
  private talkTo(id: NpcId): void {
    switch (NPCS[id].role) {
      case 'forge':
        this.sheet.open('forge');
        break;
      case 'kitchen':
        this.sheet.open('kitchen');
        break;
      case 'requests':
        // a finished request is handed in on the spot; otherwise show it in the bag tab
        if (requestReady(this.s)) claimRequest(this.s);
        else this.sheet.openRequests();
        break;
      case 'tips':
        this.talkN[id] = (this.talkN[id] ?? 0) + 1;
        this.sfx.play('ui');
        break;
    }
  }

  /** Tapping directly on a monster locks onto it. */
  private tapWorld(clientX: number, clientY: number): boolean {
    const wx = (clientX * this.dpr) / this.S + this.camX;
    const wy = (clientY * this.dpr) / this.S + this.camY;
    let hit: MonsterState | null = null;
    let bd = Infinity;
    for (const m of this.s.monsters) {
      const d = Math.hypot(wx - m.x, wy - m.y);
      if (d < MONSTERS[m.kind].size + 12 && d < bd) {
        bd = d;
        hit = m;
      }
    }
    if (!hit) return false;
    this.pending.lockId = hit.id;
    return true;
  }

  private resize = (): void => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const Wd = Math.max(1, Math.round(innerWidth * this.dpr));
    const Hd = Math.max(1, Math.round(innerHeight * this.dpr));
    const short = Math.min(innerWidth, innerHeight);
    // ~215 game pixels on the short side of phones, ~250 on larger screens
    this.S = Math.max(2, Math.round(Math.min(Wd, Hd) / (short < 520 ? 215 : 250)));
    this.VW = Wd / this.S;
    this.VH = Hd / this.S;
    this.scale.setZoom(1 / this.dpr);
    this.scale.resize(Wd, Hd);
    this.cameras.main.setSize(Wd, Hd).setZoom(this.S);
    this.uiCam.setSize(Wd, Hd);
    this.text.resize(Wd, Hd);
    this.pad.layout();
    this.joystick.placeIdle();
  };

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.camX) * this.S, y: (y - this.camY) * this.S };
  }

  private save(): void {
    if (this.noSave) return;
    writeKey(TUNING.save.key, serialize(this.s));
  }

  // ---------------------------------------------------------------- events → feel

  private subscribe(): void {
    const ev = this.s.events;
    const fx = this.effects;
    const hud = this.hud;
    const float = (x: number, y: number, t: string | number, c?: string, big?: boolean): void => this.text.float(x, y, t, c, big, this.dpr);
    const bump = (hitstop: number, shake: number): void => {
      this.hitstop = Math.max(this.hitstop, hitstop);
      this.shake = Math.max(this.shake, shake);
    };
    // sounds fade with distance from the player
    const snd = (name: SfxName, at?: { x: number; y: number }, gain = 1): void => {
      const p = this.s.player;
      this.sfx.play(name, at ? gain * distanceGain(Math.hypot(at.x - p.x, at.y - p.y)) : gain);
    };
    const monName = (k: keyof typeof th.monsters): string => th.monsters[k].name;
    const partName = (k: keyof typeof th.monsters, p: PartId): string => (th.monsters[k].parts as Partial<Record<PartId, string>>)[p] ?? p;

    ev.on('monster:spawned', (e) => fx.burst(e.at.x, e.at.y, '#fff8e0', 8, 40, 'dust'));
    ev.on('player:attack', (e) => {
      const w = WEAPONS[e.weapon];
      const type = WEAPON_TYPES[w.type];
      bump(type.hitstop, type.shake);
      snd(w.projectile ? 'bow' : w.type === 'hammer' || w.type === 'greatsword' ? 'swingHeavy' : 'swing');
    });
    ev.on('monster:hit', (e) => {
      if (this.s.player.dash) bump(0.05, 0);
      snd(e.big || e.gold ? 'hitHeavy' : 'hit', e.at);
      if (e.tip && e.part !== 'body') float(e.at.x, e.at.y - 18, partName(e.kind, e.part), '#ffe08a');
      float(e.at.x + (Math.random() * 6 - 3), e.at.y - 8, e.damage, e.gold ? '#ffd35c' : '#ffffff', e.big);
      fx.burst(e.at.x, e.at.y, '#ffffff', 4, 90);
      fx.burst(e.at.x, e.at.y, e.color, 4, 60);
    });
    ev.on('part:broken', (e) => {
      float(e.at.x, e.at.y - 18, th.floats.broken, '#ffd35c', true);
      fx.burst(e.at.x, e.at.y, '#ffd35c', 14, 100);
      fx.burst(e.at.x, e.at.y, e.part === 'head' ? '#ece2c6' : '#ff9a40', 8, 80, 'chunk');
      bump(TUNING.combat.partBreakHitstop, 0.22);
      snd('partBreak');
      hud.toast(th.log.partBroken(partName(e.kind, e.part), monName(e.kind), fmtItems(e.drops)), 'gold');
    });
    ev.on('monster:stunned', (e) => {
      float(e.at.x, e.at.y - MONSTERS[e.kind].size - 10, th.floats.stunned, '#ffd35c', true);
      hud.toast(th.log.stunned(monName(e.kind)), 'gold');
      snd('stun', e.at);
    });
    ev.on('monster:enraged', (e) => {
      float(e.at.x, e.at.y - MONSTERS[e.kind].size - 12, th.floats.enraged, '#ff6b5e', true);
      hud.toast(th.log.enraged(monName(e.kind)), 'bad');
      snd('enrage', e.at);
      bump(0, 0.3);
    });
    ev.on('monster:strike', (e) => {
      const heavy = MONSTERS[e.kind].size >= 12;
      fx.ring(e.at.x, e.at.y, e.radius);
      fx.burst(e.at.x, e.at.y, heavy ? '#ff8a3d' : '#c8b890', e.radius > 30 ? 18 : 8, e.radius * 2, 'dust');
      if (heavy) bump(0, 0.14);
      snd('strike', e.at, heavy ? 1 : 0.6);
    });
    ev.on('monster:telegraph', (e) => {
      const m = findMonster(this.s, e.id);
      if (m) snd(MONSTERS[e.kind].size >= 12 ? 'telegraphBig' : 'telegraph', m);
    });
    ev.on('monster:dashEnd', (e) => {
      if (MONSTERS[e.kind].size >= 12) bump(0, 0.14);
    });
    ev.on('monster:killed', (e) => {
      float(e.at.x, e.at.y - MONSTERS[e.kind].size - 14, th.floats.hunted, '#ffd166', true);
      fx.burst(e.at.x, e.at.y, '#ffd166', 20, 110);
      const img = this.inWorld(this.add.image(e.at.x, e.at.y, TEX.monster(e.kind, e.corpse.frame, e.corpse.headBroken, e.corpse.tailBroken)).setDepth(D.corpse));
      this.corpses.push({ img, x: e.at.x, y: e.at.y, t: 1 });
      bump(TUNING.combat.killHitstop, 0.22);
      snd('kill');
      hud.toast(th.log.hunted(monName(e.kind), fmtItems(e.drops)));
      if (e.rare) hud.toast(th.log.rareDrop(th.materials[e.rare]), 'gold');
      this.corpses.at(-1)?.img.setScale(e.corpse.dirX, 1);
      this.save();
    });
    ev.on('monster:fled', (e) => {
      fx.burst(e.at.x, e.at.y, '#fff8e0', 14, 60, 'dust');
      hud.toast(th.log.huntTimeout(monName(e.kind)), 'bad');
    });
    ev.on('player:hurt', (e) => {
      float(e.at.x, e.at.y - 16, `-${e.damage}`, '#ff6b5e', true);
      fx.burst(e.at.x, e.at.y, '#ff6b5e', 8);
      bump(0.06, e.heavy ? 0.25 : 0.14);
      vibrate(40);
      snd('hurt');
    });
    ev.on('player:dodged', (e) => {
      float(e.at.x, e.at.y - 18, th.floats.dodged, '#ffd35c', true);
      fx.burst(e.at.x, e.at.y, '#fff3c4', 6, 60);
      snd('dodge');
    });
    ev.on('player:roll', (e) => {
      fx.burst(e.at.x, e.at.y + 6, '#e8d8b0', 6, 40, 'dust');
      snd('roll');
    });
    ev.on('player:tired', (e) => float(e.at.x, e.at.y - 16, th.floats.tired, '#c8c2b0'));
    ev.on('player:drink', (e) => {
      float(e.at.x, e.at.y - 16, `+${e.heal}`, '#8ff08a', true);
      fx.healGlow(e.at.x, e.at.y);
      snd('drink');
    });
    ev.on('player:noPotion', () => {
      hud.toast(th.log.noPotion, 'bad');
      snd('error');
    });
    ev.on('player:knockedOut', () => hud.toast(th.log.knockedOut, 'bad'));
    ev.on('area:changed', () => this.enterArea());
    ev.on('player:revived', (e) => {
      this.camFX = e.at.x - this.VW / 2;
      this.camFY = e.at.y - this.VH / 2;
    });
    ev.on('skill:cast', (e) => {
      const def = SKILLS[e.skill];
      snd(def.kind === 'radial' ? 'swingHeavy' : 'skill');
      if (def.kind === 'radial') {
        fx.whirl();
        bump(def.hitstop, def.shake);
      }
    });
    ev.on('skill:impact', (e) => {
      const def = SKILLS[e.skill];
      bump(def.hitstop, def.shake);
      if (e.line) {
        snd('swingHeavy');
        fx.slash(e.line.from.x, e.line.from.y, e.line.ux, e.line.uy, e.line.len, e.line.wd);
        return;
      }
      fx.shock(e.at.x, e.at.y, e.radius);
      fx.burst(e.at.x, e.at.y, '#e8d0a0', 18, 110, 'dust');
      vibrate(30);
      snd('impact');
    });
    ev.on('shot:blocked', (e) => fx.burst(e.at.x, e.at.y - 4, '#e8d8b0', 4, 40, 'dust'));
    ev.on('crop:planted', (e) => {
      float(e.at.x, e.at.y - 10, th.floats.planted(th.crops[e.crop].name), CROPS[e.crop].color);
      fx.burst(e.at.x, e.at.y + 3, '#a8754a', 6, 40, 'dust');
      snd('plant');
      this.sheet.markDirty();
      this.save();
    });
    ev.on('crop:harvested', (e) => {
      float(e.at.x, e.at.y - 12, th.floats.harvested, '#ffd166', true);
      fx.burst(e.at.x, e.at.y, CROPS[e.crop].color, 12, 70, 'chunk');
      snd('harvest');
      hud.toast(th.log.harvested(th.crops[e.crop].name, fmtItems(e.drops)), 'gold');
      this.sheet.markDirty();
      this.save();
    });
    ev.on('farm:noSeed', (e) => {
      snd('error');
      hud.toast(th.log.noSeed(th.materials[CROPS[e.crop].seed], th.crops[e.crop].source), 'bad');
    });
    ev.on('item:gathered', (e) => {
      const c = MATERIALS[e.item as MaterialId].color;
      float(e.at.x, e.at.y - 10, `+${e.amount}`, c, true);
      fx.burst(e.at.x, e.at.y, c, 8, 50);
      snd('pickup');
      hud.toast(th.log.gathered(fmtItems({ [e.item]: e.amount })));
      if (e.bonusSeed) hud.toast(th.log.herbSeedBonus);
    });
    ev.on('zone:entered', (e) => hud.showZone(th.zones[e.zone]));
    ev.on('meal:expired', (e) => hud.toast(th.log.mealExpired(th.meals[e.meal].name)));
    const reqById = (id: string) => REQUESTS.find((r) => r.id === id);
    ev.on('request:progress', (e) => {
      const r = reqById(e.id);
      if (r && e.progress < e.count) hud.toast(th.request.progressLog(requestText(r), e.progress, e.count));
      this.sheet.markDirty();
    });
    ev.on('request:ready', () => {
      const p = this.s.player;
      float(p.x, p.y - 22, th.request.done, '#ffd166', true);
      hud.toast(th.request.readyLog, 'gold');
      snd('craft');
    });
    ev.on('request:claimed', (e) => {
      // the elder's bubble sits above both heads, so the celebration goes low, by the player's feet
      const at = this.s.player;
      const got = [fmtItems(e.items), e.potions ? th.request.potions(e.potions) : ''].filter(Boolean).join(', ');
      hud.toast(th.request.claimedLog(got), 'gold');
      float(at.x, at.y + 4, th.request.done, '#ffd166', true);
      fx.burst(at.x, at.y, '#ffd35c', 18, 90);
      snd('craft');
      this.sheet.markDirty();
      this.save();
    });
  }

  // ---------------------------------------------------------------- loop

  override update(_t: number, deltaMs: number): void {
    const raw = Math.min(0.05, deltaMs / 1000 || 0.016);
    const s = this.s;
    this.clock += raw;
    this.shake -= raw;
    let dt = raw;
    if (this.hitstop > 0) {
      this.hitstop -= raw;
      dt = 0;
    }
    const paused = this.sheet.isOpen;

    if (!paused) {
      const intent = this.mixer.mix(this.collectHuman(), s.autoOn ? () => autoIntent(s, this.auto, dt) : null, dt);
      step(s, intent, dt, Date.now());
      if (dt > 0) {
        if (s.player.dash) this.playerView.addGhost(s.player.x, s.player.y, s.player.face);
        if (s.player.moving && Math.random() < dt * 4) this.effects.walkDust(s.player.x, s.player.y);
        for (const m of s.monsters) if (m.mode === 'dash' && Math.random() < 0.7) this.effects.dashDust(m.x, m.y + MONSTERS[m.kind].size * 0.6, MONSTERS[m.kind].size >= 12 ? '#c8905a' : '#c8b890');
        this.effects.ambient(dt, this.viewRect(), zoneAtPx(s.map, this.camX + this.VW / 2, this.camY + this.VH / 2), s.player);
        this.effects.update(dt, this.clock);
        for (const c of this.clouds) {
          c.x += c.v * dt;
          if (c.x - c.rx > MW * T) {
            c.x = -c.rx;
            c.y = Math.random() * MH * T;
          }
        }
        for (const c of this.corpses) c.t -= dt * 1.1;
      }
    }
    this.pending = emptyHuman();

    this.updateCamera(raw);
    this.draw();
    this.text.update(this, raw);
    this.hud.minimap.draw(s);

    this.uiT -= raw;
    if (this.uiT <= 0) {
      this.uiT = 0.1;
      this.ctx = contextAction(s);
      this.hud.update(s);
      this.pad.update(s, this.ctx);
    }
    this.sheet.tick(raw);
    this.saveT -= raw;
    if (this.saveT <= 0) {
      this.saveT = TUNING.save.intervalSeconds;
      this.save();
    }
  }

  private collectHuman(): HumanInput {
    const h = this.pending;
    const kv = this.keyboard.vector();
    let move = normaliseMove(kv.x, kv.y);
    if (this.joystick.active) {
      const jm = normaliseMove(this.joystick.vx, this.joystick.vy, TUNING.input.joystickDeadzone);
      if (jm) move = jm;
    }
    return { ...h, move, attackHeld: this.padAttackHeld || (this.keyboard.attackHeld && !this.ctx) };
  }

  private viewRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.camX, this.camY, this.VW, this.VH);
  }

  private updateCamera(rdt: number): void {
    const p = this.s.player;
    const maxX = MW * T - this.VW;
    const maxY = MH * T - this.VH;
    const clampX = (v: number): number => (maxX < 0 ? maxX / 2 : Phaser.Math.Clamp(v, 0, maxX));
    const clampY = (v: number): number => (maxY < 0 ? maxY / 2 : Phaser.Math.Clamp(v, 0, maxY));
    const k = Math.min(1, rdt * 7);
    this.camFX += (clampX(p.x - this.VW / 2) - this.camFX) * k;
    this.camFY += (clampY(p.y - this.VH / 2) - this.camFY) * k;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0 && !reduceMotion) {
      sx = Phaser.Math.Between(-2, 2);
      sy = Phaser.Math.Between(-2, 2);
    }
    this.camX = clampX(Math.round(this.camFX + sx));
    this.camY = clampY(Math.round(this.camFY + sy));
    this.cameras.main.centerOn(this.camX + this.VW / 2, this.camY + this.VH / 2);
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const s = this.s;
    const time = this.clock;
    this.drawGround(time);
    this.drawNodes(time);
    this.drawTelegraphs(time);
    this.drawEntities(time);
    this.drawOverlays(time);
    this.effects.draw(time, s.player, s.shots);
    this.drawClouds();
    this.drawGlows(time);
    this.drawText(time);
  }

  private inView(x: number, y: number, pad: number): boolean {
    return x > this.camX - pad && y > this.camY - pad && x < this.camX + this.VW + pad && y < this.camY + this.VH + pad;
  }

  private drawGround(time: number): void {
    const g = this.gGround.clear();
    const px = (x: number, y: number, c: number, w = 1, h = 1, a = 1): void => {
      g.fillStyle(c, a).fillRect(x, y, w, h);
    };
    // water sparkle
    const x0 = Math.floor(this.camX / T);
    const y0 = Math.floor(this.camY / T);
    for (let yy = y0; yy <= y0 + this.VH / T + 1; yy++) {
      for (let xx = x0; xx <= x0 + this.VW / T + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= MW || yy >= MH || tileAt(this.s.map, xx, yy) !== Tile.WATER) continue;
        const o = (xx * 7 + yy * 13) % 16;
        if (Math.sin(time * 2 + o) > 0.3) px(xx * T + 3 + ((o + Math.floor(time * 4)) % 9), yy * T + 7 + ((o * 5) % 6), 0xc8fff0, 2, 1);
      }
    }
    if (this.s.area !== 'home') {
      // field crop images live in world space: hide them or they show up on every other map
      for (const img of this.cropImgs.values()) img.setVisible(false);
      return;
    }
    // fountain spray + pot fire
    const fx = PLAZA.x * T;
    const fy = PLAZA.y * T;
    px(fx - 1, fy - 12 - Math.round(Math.sin(time * 8)), 0xd8fff4, 2, 3);
    for (let i = 0; i < 5; i++) {
      const ox = i - 2;
      const hg = Math.max(1, Math.round((3 - Math.abs(ox)) * 1.3 + Math.sin(time * 13 + i * 1.7)));
      for (let k = 0; k < hg; k++) px(POT.x + ox, POT.y + 5 - k, k / hg < 0.5 ? 0xffd35c : 0xff6a2a);
    }
    // crops
    this.s.plots.forEach((pl, i) => {
      const img = this.cropImgs.get(i);
      if (!pl.crop) {
        img?.setVisible(false);
        return;
      }
      const pr = plotProgress(pl, this.s.now);
      const stage = pr < 0.25 ? 0 : pr < 0.6 ? 1 : pr < 1 ? 2 : 3;
      if (pl.bed !== 'soil') {
        this.drawFieldCrop(i, pl.crop, pl.x, pl.y, stage, time);
        if (pr >= 1 && Math.floor(time * 3 + i) % 4 === 0) {
          px(pl.x + 9, pl.y - 12, 0xfffbe0, 1, 3);
          px(pl.x + 8, pl.y - 11, 0xfffbe0, 3, 1);
        }
        return;
      }
      const X = pl.tx * T;
      const Y = pl.ty * T;
      for (let k = 0; k < 3; k++) drawPlant(px, X + 4 + k * 4, Y + 12 - (k % 2), pl.crop, stage);
      if (pr >= 1) {
        if (Math.floor(time * 4 + pl.tx) % 3 === 0) {
          px(X + 13, Y + 1, 0xfffbe0, 1, 3);
          px(X + 12, Y + 2, 0xfffbe0, 3, 1);
        }
      } else {
        px(X + 2, Y + 14, 0x1e1008, 12, 2, 0.85);
        px(X + 2, Y + 14, parseInt(CROPS[pl.crop].color.slice(1), 16), Math.max(1, Math.round(12 * pr)), 2);
      }
    });
  }

  /**
   * Paddy and pond crops: rice and lotus are textures swapped by stage (no progress bars on the
   * field; the menu and the ripe label carry that), fish are a few shadows circling under ripples.
   */
  private drawFieldCrop(i: number, crop: string, x: number, y: number, stage: number, time: number): void {
    let img = this.cropImgs.get(i);
    if (crop === 'fish') {
      img?.setVisible(false);
      const g = this.gGround;
      const n = stage + 1;
      for (let k = 0; k < n; k++) {
        const a = time * (0.8 + k * 0.17) + k * 2.1 + i;
        const fx = x + Math.cos(a) * (5 + k * 1.5);
        const fy = y + Math.sin(a) * 3;
        g.fillStyle(0x0c4846, 0.55).fillRect(Math.round(fx) - 2, Math.round(fy), 5, 2);
        g.fillStyle(0x0c4846, 0.55).fillRect(Math.round(fx - Math.cos(a + 1.57) * 3), Math.round(fy), 1, 1);
      }
      const k = (time * 0.6 + i * 0.37) % 1;
      g.lineStyle(1, 0xc8fff0, 0.6 * (1 - k)).strokeEllipse(x + 3, y - 2, 4 + k * 12, 2 + k * 6);
      if (stage === 3 && Math.sin(time * 2.1 + i) > 0.75) {
        const hop = Math.round((Math.sin(time * 2.1 + i) - 0.75) * 24);
        g.fillStyle(0x9aaab8, 1).fillRect(Math.round(x) - 2, Math.round(y) - 3 - hop, 5, 2);
        g.fillStyle(0x7a8a9a, 1).fillRect(Math.round(x) + 3, Math.round(y) - 4 - hop, 1, 3);
      }
      return;
    }
    const key = crop === 'rice' ? TEX.rice(stage, stage === 3 && Math.sin(time * 1.4 + i) > 0) : TEX.lotus(stage);
    if (!img) {
      img = this.inWorld(this.add.image(x, y, key).setDepth(D.groundFx + 0.5));
      this.cropImgs.set(i, img);
    }
    // rice sections are centred on their 2x2 tiles; lotus sits on the water at its slot
    img.setTexture(key).setPosition(Math.round(x), Math.round(crop === 'rice' ? y : y - 4)).setVisible(true);
  }

  private drawNodes(time: number): void {
    const g = this.gNodeFx.clear();
    const p = this.s.player;
    for (const n of this.s.nodes) {
      const img = this.nodeImgs.get(n.id);
      if (!img) continue;
      img.setVisible(n.ready);
      if (!n.ready) {
        g.fillStyle(0x000000, 0.18).fillRect(n.x - 3, n.y + 2, 6, 2);
        continue;
      }
      const bob = n.kind === 'herb' ? Math.round(Math.sin(time * 2 + n.tx) * 0.6) : 0;
      img.setPosition(Math.round(n.x), Math.round(n.y - 1 + bob));
      g.fillStyle(0x142814, 0.25).fillEllipse(n.x, n.y + 4, 10, 3.2);
      if ((Math.floor(time * 1.5) + n.tx) % 4 === 0) g.fillStyle(0xfffbe0, 1).fillRect(n.x + 3, n.y - 7 - Math.round(((time * 6) % 1) * 2), 1, 1);
      if (p.gatherNode === n.id && p.gatherT > 0) {
        g.lineStyle(2, 0xffd166, 1);
        g.beginPath();
        g.arc(n.x, n.y - 1, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.gatherT / TUNING.gather.holdTime));
        g.strokePath();
      }
    }
  }

  private drawTelegraphs(time: number): void {
    const g = this.gTele.clear();
    const pulse = 0.55 + 0.45 * Math.sin(time * 22);
    const edge = Phaser.Display.Color.GetColor(255, Math.round(80 + pulse * 100), 70);
    for (const m of this.s.monsters) {
      const sh = m.shape;
      if (m.mode !== 'tele' || !sh) continue;
      const prog = Math.min(1, 1 - m.t / m.tt);
      if (sh.kind === 'circle') {
        g.fillStyle(0xe6281e, 0.2).fillCircle(sh.cx, sh.cy, sh.r);
        g.fillStyle(0xff3c28, 0.38).fillCircle(sh.cx, sh.cy, sh.r * prog);
        g.lineStyle(1, edge, 1).strokeCircle(sh.cx, sh.cy, sh.r);
      } else {
        const quad = (len: number): Phaser.Types.Math.Vector2Like[] => {
          const nx = -sh.uy * (sh.wd / 2);
          const ny = sh.ux * (sh.wd / 2);
          const ex = sh.sx + sh.ux * len;
          const ey = sh.sy + sh.uy * len;
          return [{ x: sh.sx + nx, y: sh.sy + ny }, { x: ex + nx, y: ey + ny }, { x: ex - nx, y: ey - ny }, { x: sh.sx - nx, y: sh.sy - ny }];
        };
        g.fillStyle(0xe6281e, 0.2).fillPoints(quad(sh.len), true);
        g.fillStyle(0xff3c28, 0.38).fillPoints(quad(sh.len * prog), true);
        g.lineStyle(1, edge, 1).strokePoints(quad(sh.len), true);
      }
    }
  }

  private drawEntities(time: number): void {
    const s = this.s;
    const sh = this.gShadow.clear();
    const sa = this.gShadowAdd.clear();
    const p = s.player;
    sh.fillStyle(0x142814, 0.3).fillEllipse(p.x, p.y + 8, 12, 4);

    const alive = new Set<number>();
    for (const m of s.monsters) {
      alive.add(m.id);
      let v = this.monsterViews.get(m.id);
      if (!v) {
        v = new MonsterView(this, this.inWorld, m);
        this.monsterViews.set(m.id, v);
      }
      v.update(m, time);
      const size = MONSTERS[m.kind].size;
      const feet = MonsterView.feet(m, v.img.height);
      sh.fillStyle(0x142814, 0.3).fillEllipse(m.x, feet, size * 1.9, size * 0.64);
      if (m.rage) sa.fillStyle(0xff501e, 0.14 + 0.08 * Math.sin(time * 10)).fillEllipse(m.x, m.y, (size + 6) * 2, size * 1.6);
    }
    for (const [id, v] of this.monsterViews) {
      if (alive.has(id)) continue;
      v.destroy();
      this.monsterViews.delete(id);
    }
    if (s.area === 'home') {
      for (const n of s.npcs) {
        this.npcViews.get(n.id)?.update(n, time);
        sh.fillStyle(0x142814, 0.3).fillEllipse(n.x, n.y + 8, 12, 4);
      }
    }
    this.playerView.update(s, time, this.hitstop > 0 ? 0 : Math.min(0.05, this.game.loop.delta / 1000));

    for (const c of this.corpses) {
      const t = Math.max(0, c.t);
      c.img.setAlpha(t);
      const h = c.img.height;
      c.img.setOrigin(0.5, (h - 2) / h).setPosition(Math.round(c.x), Math.round(c.y + h / 2 - 2 + (1 - t) * 3));
      c.img.scaleY = 1 - (1 - t) * 0.3;
      if (c.t <= 0) c.img.destroy();
    }
    this.corpses = this.corpses.filter((c) => c.t > 0);
  }

  private drawOverlays(time: number): void {
    const g = this.gBars.clear();
    const s = this.s;
    const lock = findMonster(s, s.player.lockId);
    if (lock) {
      const sz = MONSTERS[lock.kind].size + 5;
      g.fillStyle(0xffd166, 0.6 + 0.4 * Math.sin(time * 8));
      for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = Math.round(lock.x + qx * sz);
        const cy = Math.round(lock.y + qy * sz * 0.8);
        g.fillRect(cx - (qx > 0 ? 2 : 0), cy, 3, 1);
        g.fillRect(cx, cy - (qy > 0 ? 2 : 0), 1, 3);
      }
    }
    for (const m of s.monsters) {
      const v = this.monsterViews.get(m.id);
      if (!v) continue;
      const def = MONSTERS[m.kind];
      if (m.mode === 'stun') {
        for (let i = 0; i < 3; i++) {
          const a = time * 5 + i * 2.09;
          g.fillStyle(0xffd35c, 1).fillRect(Math.round(m.x + Math.cos(a) * 9), Math.round(m.y - v.img.height / 2 - 4 + Math.sin(a) * 2), 2, 2);
        }
      }
      if (!(m.aggro || lock === m)) continue;
      const bw = def.size * 2;
      const yy = Math.round(m.y - v.img.height / 2 - 5);
      g.fillStyle(0x151c2b, 1).fillRect(m.x - bw / 2 - 1, yy - 1, bw + 2, 4);
      g.fillStyle(0xf08a3c, 1).fillRect(m.x - bw / 2, yy, Math.max(0, Math.round((bw * m.hp) / def.hp)), 2);
    }
  }

  private drawClouds(): void {
    const g = this.gClouds.clear();
    g.fillStyle(0x14283c, 0.07);
    for (const c of this.clouds) {
      if (!this.inView(c.x, c.y, c.rx * 2)) continue;
      g.fillEllipse(c.x, c.y, c.rx * 2, c.ry * 2);
      g.fillEllipse(c.x + c.rx * 0.5, c.y - c.ry * 0.4, c.rx * 1.2, c.ry * 1.4);
    }
  }

  /** Additive warm glows; anything off-screen is hidden so it costs nothing. */
  private drawGlows(time: number): void {
    const place = (img: Phaser.GameObjects.Image, x: number, y: number, r: number, alpha: number): void => {
      const rr = r + Math.sin(time * 5 + x) * 1.5;
      const vis = this.inView(x, y, rr);
      img.setVisible(vis);
      if (vis) img.setPosition(x, y).setScale((rr * 2) / img.width).setAlpha(alpha);
    };
    for (const { l, img } of this.glows) place(img, l.x, l.y, l.r, l.ga);
    const seen = new Set<number>();
    for (const m of this.s.monsters) {
      if (m.kind !== 'gaur') continue;
      seen.add(m.id);
      let img = this.dynGlows.get(m.id);
      if (!img) {
        img = this.makeGlow('255,110,40');
        this.dynGlows.set(m.id, img);
      }
      place(img, m.x, m.y, m.rage ? 40 : 28, m.rage ? 0.24 : 0.12);
    }
    for (const [id, img] of this.dynGlows) {
      if (seen.has(id)) continue;
      img.destroy();
      this.dynGlows.delete(id);
    }
  }

  private drawText(time: number): void {
    const s = this.s;
    const p = s.player;
    const t = this.text;
    t.begin();
    // villagers within earshot talk; their station's name label steps aside for the bubble
    // only the nearest one talks, so two bubbles never overlap
    const nearest = s.area === 'home' && !p.dead ? npcNear(s, TUNING.village.npcBubbleRadius) : null;
    const talking = nearest ? [nearest] : [];
    const roleTalking = (role: string): boolean => talking.some((n) => NPCS[n.id].role === role);
    if (p.inVillage && !p.dead) {
      const near = (o: { x: number; y: number }): boolean => Math.hypot(o.x - p.x, o.y - p.y) < 90;
      if (near(ANVIL) && !roleTalking('forge')) t.label(this, th.places.forge, ANVIL.x, ANVIL.y - 14, '#ffe7a6');
      if (near(POT) && !roleTalking('kitchen')) t.label(this, th.places.kitchen, POT.x, POT.y - 16, '#ffe7a6');
      if (near(FARM_CENTER)) {
        const ripe = s.plots.filter((pl) => isRipe(pl, s.now)).length;
        t.label(this, ripe ? th.places.farmRipe(ripe) : th.places.farm, FARM_CENTER.x, (FARM.y0 - 1) * T - 4, ripe ? '#ffe08a' : '#ffe7a6');
      }
      for (const [bed, at, name] of [['paddy', PADDY_CENTER, th.places.paddy], ['pond', POND_CENTER, th.places.pond]] as const) {
        if (!near(at)) continue;
        const ripe = s.plots.filter((pl) => pl.bed === bed && isRipe(pl, s.now)).length;
        t.label(this, ripe ? th.places.bedRipe(name, ripe) : name, at.x, at.y - 30, ripe ? '#ffe08a' : '#ffe7a6');
      }
    }
    if (s.area === 'home' && p.inVillage && !p.dead && !roleTalking('requests') && Math.hypot(BOARD.x * T + 8 - p.x, BOARD.y * T + 8 - p.y) < 90) {
      t.label(this, requestReady(s) ? th.places.boardReady : th.places.board, BOARD.x * T + 8, BOARD.y * T - 6, requestReady(s) ? '#ffe08a' : '#ffe7a6');
    }
    t.endLabels();
    {
      const reqById = (id: string) => REQUESTS.find((r) => r.id === id);
      for (const n of talking) {
        const line = lineText(npcLine(s, n.id, this.talkN[n.id] ?? 0), reqById);
        t.bubble(this, n.id, th.npcs[n.id].name, line, n.x, n.y - 16);
      }
    }
    t.endBubbles();
    for (const m of s.monsters) {
      const v = this.monsterViews.get(m.id);
      if (m.mode === 'tele' && v) t.warning(this, m.id, m.x, m.y - v.img.height / 2 - 10, time);
    }
    t.endWarnings();
    t.setDead(p.dead, this.scale.width, this.scale.height, this.dpr);
  }
}

type Px = (x: number, y: number, c: number, w?: number, h?: number, a?: number) => void;

function drawPlant(px: Px, x: number, y: number, kind: string, st: number): void {
  if (st === 0) {
    px(x - 1, y, 0x5a3418, 3, 1);
    px(x, y - 1, 0x6a4226);
    return;
  }
  if (st === 1) {
    px(x, y, 0x3f8a3a);
    px(x, y - 1, 0x3f8a3a);
    px(x - 1, y - 2, 0x7ad866);
    px(x + 1, y - 2, 0x7ad866);
    return;
  }
  px(x, y - 3, 0x3f8a3a, 1, 4);
  px(x - 1, y - 2, 0x5fb84e);
  px(x - 2, y - 3, 0x5fb84e);
  px(x + 1, y - 3, 0x5fb84e);
  px(x + 2, y - 4, 0x5fb84e);
  px(x, y - 4, 0x6cc25a);
  px(x - 1, y - 5, 0x8ee070);
  px(x + 1, y - 5, 0x8ee070);
  if (st < 3) return;
  if (kind === 'herb') {
    px(x - 2, y - 4, 0xffffff);
    px(x + 2, y - 5, 0xffffff);
    px(x, y - 6, 0xffffff);
    px(x, y - 5, 0xffd84a);
  } else if (kind === 'yam') {
    px(x - 1, y - 1, 0xd0803e, 3, 2);
    px(x - 1, y - 1, 0xf0b070);
  } else {
    px(x - 2, y - 2, 0xff3a24);
    px(x - 2, y - 1, 0xb8281a);
    px(x + 2, y - 3, 0xff3a24);
    px(x + 2, y - 2, 0xb8281a);
    px(x + 1, y - 6, 0xff3a24);
  }
}



