// Map, player, monsters, particles and glow. Owns the game loop: gathers input,
// steps the core simulation, then turns simulation events into feel
// (hitstop, shake, flashes, numbers, toasts) and draws.
import Phaser from 'phaser';
import { CROPS, MATERIALS, MONSTERS, NPCS, REQUESTS, SKILLS, TUNING, WEAPON_TYPES, WEAPONS } from '../data';
import type { AreaId, MaterialId, NpcId, PartId } from '../data/types';
import { autoIntent, createAutoPilot, type AutoPilotState } from '../core/autoPilot';
import { findMonster } from '../core/combat';
import { harvest, isRipe, plant, plotAt, plotProgress } from '../core/farm';
import { PlotPopup } from '../ui/plotPopup';
import { ANVIL, BOARD, COOP_CENTER, FARM_CENTER, NEST, TROUGH, POND_CENTER, MH, MW, POT, T, Tile, tileAt, zoneAtPx, type WorldMap } from '../core/mapgen';
import { areaBoss, nextBoss, npcActive, npcLine, npcNear } from '../core/npc';
import { SIGN_READ_RADIUS, signposts, type Signpost } from '../core/signs';
import { claimRequest, requestReady } from '../core/requests';
import { loadFromStorage, serialize } from '../core/save';
import { brewPotion } from '../core/inventory';
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
import { HenView } from '../entities/Hen';
import { basketCount, feedTrough, FEED_ITEMS, hatchEgg, petHen, canLove } from '../core/ranch';
import { lineText, requestText } from '../ui/talk';
import { Effects } from './Effects';
import { TextLayer, type ScreenMapper } from './TextLayer';
import { VillageView } from './VillageView';
import { TEX } from './textures';
import { FLAT, ISO, type View } from './view';
import { canShadeGround, GroundTiles } from './groundShader';
import { buildNorthFill, buildSouthFill, buildTerrain, EDGE_FILL_ROWS } from '../art/terrain';
import { distanceGain, parseSoundSettings, Sfx, type SfxName } from '../audio/sfx';
import { Music, nextMood } from '../audio/music';

const SIGN_ARROWS = { n: '↑', s: '↓', e: '→', w: '←' } as const;

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

/**
 * Portrait screens stack HP, goal, minimap, monster bar and toasts down the top-left column,
 * and the joystick + action pad along the bottom. Near the map's north / south edge the clamped
 * camera would push the player under them, so the camera may scroll this fraction of the view
 * past the edge (filled by a forest strip).
 */
const PORTRAIT_TOP_OVERSCROLL = 0.3;
const PORTRAIT_BOTTOM_OVERSCROLL = 0.25;
/** height (px) of the forest strips painted beyond the north and south edges */
const EDGE_FILL = EDGE_FILL_ROWS * T;

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
  /** pond crop images by plot index */
  private cropImgs = new Map<number, Phaser.GameObjects.Image>();
  /** signposts of the current area (labels show when the player walks up to one) */
  private signs: Signpost[] = [];
  private npcViews = new Map<NpcId, NpcView>();
  private henViews = new Map<number, HenView>();
  private village!: VillageView;
  /** how the current area is drawn: the home village is isometric, the wild areas flat */
  private v: View = FLAT;
  /** forest floor under the isometric village (fills the corners outside the map's diamond) */
  private floor!: Phaser.GameObjects.TileSprite;
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
  /** the home ground painted sharp by a shader into cached tiles (scenes/groundShader.ts); null without WebGL */
  private groundTiles: GroundTiles | null = null;
  private canopyImg!: Phaser.GameObjects.Image;
  /** forest strip drawn above the map, seen only when the camera overscrolls north */
  private northGround!: Phaser.GameObjects.Image;
  private northCanopy!: Phaser.GameObjects.Image;
  private southGround!: Phaser.GameObjects.Image;
  private southCanopy!: Phaser.GameObjects.Image;
  private gEdgeShade!: Phaser.GameObjects.Graphics;
  /** area whose forest strips are on the edge images (painted lazily: only portrait screens need them) */
  private edgeArea: AreaId | null = null;
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
  private plotPop!: PlotPopup;
  private sfx!: Sfx;
  private music!: Music;
  /** seconds since a monster last chased the player (battle music lingers a little) */
  private calm = 0;
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
    this.s = createGame({ rngSeed: (Date.now() ^ 0x5f3759df) >>> 0 || 1, now: Date.now(), save, map: data.map, villageOnly: TUNING.world.villageOnly });
    // dev only: lets browser smoke tests drive the live game (stripped from production builds)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __pranGame?: GameState; __pranToClient?: (x: number, y: number) => { x: number; y: number } };
      w.__pranGame = this.s;
      // smoke tests tap things in the world: world px → CSS px on screen
      w.__pranToClient = (x, y) => ({ x: ((this.v.x(x, y) - this.camX) * this.S) / this.dpr, y: ((this.v.y(x, y) - this.camY) * this.S) / this.dpr });
    }
    this.v = this.s.area === 'home' ? ISO : FLAT;
    this.input.enabled = false;

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.uiCam = this.cameras.add(0, 0, 10, 10, false, 'ui');
    this.cameras.main.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);
    this.cameras.main.setBackgroundColor('#15202b');

    const w = this.inWorld;
    this.floor = w(this.add.tileSprite(-400, -400, ISO.width + 800, ISO.height + 800, TEX.village('floor')).setOrigin(0).setDepth(D.ground - 1).setTileScale(0.25));
    this.groundImg = w(this.add.image(0, 0, TEX.ground).setOrigin(0).setDepth(D.ground));
    if (canShadeGround(this)) this.groundTiles = new GroundTiles(this, w, D.ground + 0.01);
    // hidden until syncEdgeFills() paints the strips (the placeholder texture is the whole map)
    this.northGround = w(this.add.image(0, -EDGE_FILL, TEX.ground).setOrigin(0).setDepth(D.ground).setVisible(false));
    this.southGround = w(this.add.image(0, (MH - 1) * T, TEX.ground).setOrigin(0).setDepth(D.ground).setVisible(false));
    this.areaLights.set('home', data.lights);
    this.signs = this.s.villageOnly ? [] : signposts(this.s.map);
    this.gGround = w(this.add.graphics().setDepth(D.groundFx));
    this.makeNodeImages();
    this.gNodeFx = w(this.add.graphics().setDepth(D.nodeFx));
    this.gTele = w(this.add.graphics().setDepth(D.tele));
    this.gShadow = w(this.add.graphics().setDepth(D.shadow));
    this.gShadowAdd = w(this.add.graphics().setDepth(D.shadow + 0.1).setBlendMode(Phaser.BlendModes.ADD));
    this.playerView = new PlayerView(this, w);
    for (const n of this.s.npcs) {
      const v = new NpcView(this, w, n);
      v.setVisible(npcActive(this.s, n.id));
      this.npcViews.set(n.id, v);
    }
    this.village = new VillageView(this, w, D.shadow - 0.5);
    this.canopyImg = w(this.add.image(0, 0, TEX.canopy).setOrigin(0).setDepth(D.canopy));
    this.northCanopy = w(this.add.image(0, -EDGE_FILL, TEX.canopy).setOrigin(0).setDepth(D.canopy).setVisible(false));
    this.southCanopy = w(this.add.image(0, (MH - 1) * T, TEX.canopy).setOrigin(0).setDepth(D.canopy).setVisible(false));
    this.gEdgeShade = w(this.add.graphics().setDepth(D.canopy + 0.5));
    this.fitGround();
    this.shadeEdgeFills();
    this.gBars = w(this.add.graphics().setDepth(D.bars));
    this.effects = new Effects(this, w, { fx: D.fx, particles: D.particles });
    this.effects.view = this.v;
    this.gClouds = w(this.add.graphics().setDepth(D.clouds));
    this.makeGlows(data.lights);
    this.clouds = Array.from({ length: 5 }, () => ({ x: Math.random() * MW * T, y: Math.random() * MH * T, rx: 60 + Math.random() * 50, ry: 28 + Math.random() * 17, v: 5 + Math.random() * 4 }));
    this.text = new TextLayer(this, this.inUi);

    this.sfx = new Sfx(parseSoundSettings(readKey(SOUND_KEY)));
    this.music = new Music(() => this.sfx.audio());
    this.applyMusicVolume();
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

    this.snapCamera();
    if (save) this.hud.toast(th.log.loaded, 'gold');
    else this.hud.toast(th.log.welcome);
    this.hud.showZone(th.zones[this.s.player.zone ?? 'village']);
    this.hud.update(this.s);
  }

  private makeNodeImages(): void {
    for (const img of this.nodeImgs.values()) img.destroy();
    this.nodeImgs.clear();
    for (const n of this.s.nodes) this.nodeImgs.set(n.id, this.inWorld(this.add.image(this.v.x(n.x, n.y), this.v.y(n.x, n.y), n.kind === 'ore' ? TEX.ore : TEX.herb).setDepth(D.nodes)));
  }

  private makeGlows(lights: readonly StaticLight[]): void {
    for (const g of this.glows) g.img.destroy();
    this.glows = [];
    for (const l of lights) this.glows.push({ l, img: this.makeGlow(l.c) });
  }

  /** Swaps terrain, nodes, glows and entity views after core/travel.ts changed the area. */
  private enterArea(): void {
    const s = this.s;
    const area = s.area;
    this.v = area === 'home' ? ISO : FLAT;
    this.effects.view = this.v;
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
    this.fitGround();
    this.signs = s.villageOnly && area === 'home' ? [] : signposts(s.map);
    this.makeNodeImages();
    this.makeGlows(this.areaLights.get(area) ?? []);
    for (const v of this.monsterViews.values()) v.destroy();
    this.monsterViews.clear();
    for (const img of this.dynGlows.values()) img.destroy();
    this.dynGlows.clear();
    for (const c of this.corpses) c.img.destroy();
    this.corpses = [];
    this.auto = createAutoPilot();
    for (const n of s.npcs) this.npcViews.get(n.id)?.setVisible(npcActive(s, n.id));
    this.snapCamera();
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
      load: (d) => {
        this.noSave = true;
        writeKey(TUNING.save.key, JSON.stringify(d));
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
        this.effects.burst(ANVIL.x, ANVIL.y, '#ffd35c', 16, 90);
        this.sfx.play('craft');
      },
      sound: {
        get: () => this.sfx.current,
        set: (v) => {
          this.sfx.set(v);
          this.applyMusicVolume();
          writeKey(SOUND_KEY, JSON.stringify(v));
        },
      },
      sfx: (name) => this.sfx.play(name),
    });
    surface.tabIndex = 0;
    surface.setAttribute('aria-label', th.game.canvasLabel);
    this.plotPop = new PlotPopup(overlay, {
      state: () => this.s,
      changed: () => {
        this.save();
        this.hud.update(this.s);
      },
      toast: (msg, cls) => this.hud.toast(msg, cls),
      sfx: (name) => this.sfx.play(name),
    });
    this.joystick = new Joystick(surface, overlay, (cx, cy) => this.tapWorld(cx, cy), () => !this.sheet.isOpen, (cx, cy) => this.tapPlot(cx, cy));
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
    else if (c.kind === 'brew') {
      // one tap at the camp fire brews one potion from herbs
      if (brewPotion(this.s).ok) {
        this.hud.toast(th.log.brewed);
        this.sfx.play('cook');
        this.save();
      } else {
        this.hud.toast(th.log.brewNeedHerbs(TUNING.player.potion.herbCost), 'bad');
        this.sfx.play('error');
      }
      this.hud.update(this.s);
    } else if (c.kind === 'hatch' || c.kind === 'feed' || c.kind === 'pet') this.runCoop(c);
    else this.sheet.open(c.kind);
  }

  /** Coop buttons: one tap = one egg in the nest / one crop in the trough / one pat. */
  private runCoop(c: Extract<ContextAction, { kind: 'hatch' | 'feed' | 'pet' }>): void {
    const s = this.s;
    const R = TUNING.ranch;
    if (c.kind === 'hatch') {
      if (hatchEgg(s)) this.save();
      else {
        this.hud.toast(s.inv.jfegg > 0 ? th.ranch.full_coop(R.maxHens) : th.ranch.noEgg, 'bad');
        this.sfx.play('error');
      }
    } else if (c.kind === 'feed') {
      const r = feedTrough(s);
      if (r.ok) this.save();
      else {
        this.hud.toast(r.reason === 'full' ? th.ranch.full : th.ranch.noFeed(FEED_ITEMS.map((k) => th.materials[k]).join(' / ')), 'bad');
        this.sfx.play('error');
      }
    } else if (petHen(s, c.hen)) this.save();
    this.hud.update(s);
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
      case 'herbs':
        // brews on the spot when there are herbs, otherwise shows the farm
        if (brewPotion(this.s).ok) {
          this.hud.toast(th.log.brewed);
          this.sfx.play('harvest');
          this.save();
        } else this.sheet.open('farm');
        break;
      case 'farm':
        this.sheet.open('farm');
        break;
      case 'hunter': {
        const k = nextBoss(this.s);
        if (k) this.sheet.openBook(k);
        else this.sheet.open('book');
        break;
      }
      case 'ranger': {
        const k = areaBoss(this.s);
        if (k) this.sheet.openBook(k);
        else this.sheet.open('map');
        break;
      }
    }
  }

  /** Coop chickens: views follow the ranch state (hatching adds one), hidden away from home. */
  private updateHens(sh: Phaser.GameObjects.Graphics): void {
    const s = this.s;
    const home = s.area === 'home';
    const live = new Set<number>();
    for (const h of s.ranch.hens) {
      live.add(h.id);
      let v = this.henViews.get(h.id);
      if (!v) {
        v = new HenView(this, (o) => this.inWorld(o), h);
        this.henViews.set(h.id, v);
      }
      v.setVisible(home);
      if (!home) continue;
      v.update(h, s.now, this.v);
      sh.fillStyle(0x142814, 0.25).fillEllipse(this.v.x(h.x, h.y), this.v.y(h.x, h.y) + 3, 9, 3);
    }
    for (const [id, v] of this.henViews) {
      if (live.has(id)) continue;
      v.destroy();
      this.henViews.delete(id);
    }
  }

  /** A quick tap on a farm plot in the village: harvest it if ripe, otherwise open the plot popup. */
  private tapPlot(clientX: number, clientY: number): void {
    const s = this.s;
    if (this.sheet.isOpen || s.area !== 'home' || !s.player.inVillage || s.player.dead) return;
    const w = this.v.toWorld((clientX * this.dpr) / this.S + this.camX, (clientY * this.dpr) / this.S + this.camY);
    const i = plotAt(s, w.x, w.y);
    const plot = s.plots[i];
    if (!plot) return;
    if (isRipe(plot, s.now)) {
      if (harvest(s, i)) this.save();
      return;
    }
    this.plotPop.open(i);
  }

  /** Tapping directly on a monster locks onto it. */
  private tapWorld(clientX: number, clientY: number): boolean {
    const { x: wx, y: wy } = this.v.toWorld((clientX * this.dpr) / this.S + this.camX, (clientY * this.dpr) / this.S + this.camY);
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
    // a floating number/word over a world point, nudged in screen px (dx, dy)
    const float = (at: { x: number; y: number }, dx: number, dy: number, t: string | number, c?: string, big?: boolean): void =>
      this.text.float(this.v.x(at.x, at.y) + dx, this.v.y(at.x, at.y) + dy, t, c, big, this.dpr);
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

    ev.on('monster:spawned', (e) => {
      fx.burst(e.at.x, e.at.y, e.alpha ? '#ff6a7a' : e.vet ? '#ffcf4a' : '#fff8e0', e.vet ? 16 : 8, 40, 'dust');
      if (e.vet) {
        hud.toast(e.alpha ? th.log.alphaAppeared(monName(e.kind)) : th.log.veteranAppeared(monName(e.kind)), 'bad');
        snd('enrage', undefined, 0.5);
      }
    });
    ev.on('medal:earned', (e) => {
      hud.toast(th.log.medal(th.medals[e.medal].name, monName(e.kind)), 'gold');
      snd('harvest');
    });
    ev.on('player:attack', (e) => {
      const w = WEAPONS[e.weapon];
      const type = WEAPON_TYPES[w.type];
      bump(type.hitstop, type.shake);
      snd(w.projectile ? 'bow' : w.type === 'hammer' || w.type === 'greatsword' ? 'swingHeavy' : 'swing');
    });
    ev.on('monster:hit', (e) => {
      if (this.s.player.dash) bump(0.05, 0);
      snd(e.big || e.gold ? 'hitHeavy' : 'hit', e.at);
      if (e.tip && e.part !== 'body') float(e.at, 0, -18, partName(e.kind, e.part), '#ffe08a');
      float(e.at, Math.random() * 6 - 3, -8, e.damage, e.gold ? '#ffd35c' : '#ffffff', e.big);
      fx.burst(e.at.x, e.at.y, '#ffffff', 4, 90);
      fx.burst(e.at.x, e.at.y, e.color, 4, 60);
    });
    ev.on('part:broken', (e) => {
      float(e.at, 0, -18, th.floats.broken, '#ffd35c', true);
      fx.burst(e.at.x, e.at.y, '#ffd35c', 14, 100);
      fx.burst(e.at.x, e.at.y, e.part === 'head' ? '#ece2c6' : '#ff9a40', 8, 80, 'chunk');
      bump(TUNING.combat.partBreakHitstop, 0.22);
      snd('partBreak');
      hud.toast(th.log.partBroken(partName(e.kind, e.part), monName(e.kind), fmtItems(e.drops)), 'gold');
    });
    ev.on('monster:stunned', (e) => {
      float(e.at, 0, -MONSTERS[e.kind].size - 10, th.floats.stunned, '#ffd35c', true);
      hud.toast(th.log.stunned(monName(e.kind)), 'gold');
      snd('stun', e.at);
    });
    ev.on('monster:enraged', (e) => {
      float(e.at, 0, -MONSTERS[e.kind].size - 12, th.floats.enraged, '#ff6b5e', true);
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
    // shell clinks and out-of-reach swings repeat on every hit: say it at most every 0.8 s per monster
    const said = new Map<number, number>();
    const once = (id: number): boolean => {
      const last = said.get(id) ?? -9;
      if (this.s.time - last < 0.8) return false;
      said.set(id, this.s.time);
      return true;
    };
    ev.on('monster:guarded', (e) => {
      fx.burst(e.at.x, e.at.y, '#e8f0ff', 5, 50, 'spark');
      if (once(e.id)) float(e.at, 0, -12, th.monsterFx.guarded, '#c8d4e8');
      snd('strike');
    });
    ev.on('monster:airborne', (e) => {
      if (once(e.id)) float(e.at, 0, -26, th.monsterFx.airborne, '#c8d4e8');
    });
    ev.on('monster:howl', (e) => {
      float(e.at, 0, -16, th.monsterFx.howl(e.joined), '#ffb070', true);
      snd('enrage');
    });
    ev.on('monster:stole', (e) => {
      float(e.at, 0, -16, th.monsterFx.stole, '#ff8fb0', true);
      hud.toast(th.monsterFx.stoleLog(th.monsters[e.kind].name, e.potions), 'bad');
      snd('pickup');
    });
    ev.on('monster:returned', (e) => {
      float(e.at, 0, -26, th.monsterFx.returned(e.potions), '#ff8fb0', true);
      hud.toast(th.monsterFx.returned(e.potions), 'gold');
    });
    ev.on('player:grabbed', (e) => {
      float(e.at, 0, -22, th.monsterFx.grabbed, '#ff6b5e', true);
      vibrate(60);
    });
    ev.on('player:escaped', (e) => {
      float(e.at, 0, -18, th.monsterFx.escaped, '#9fe07a', true);
      fx.burst(e.at.x, e.at.y, '#8a7a4a', 10, 60, 'dust');
    });
    ev.on('monster:burrow', (e) => {
      fx.burst(e.at.x, e.at.y, '#8a6a4a', 14, 70, 'dust');
      snd('roll');
    });
    ev.on('monster:emerge', (e) => {
      fx.burst(e.at.x, e.at.y, '#8a6a4a', 22, 110, 'chunk');
      bump(0, 0.16);
    });
    ev.on('monster:dashEnd', (e) => {
      if (MONSTERS[e.kind].size >= 12) bump(0, 0.14);
    });
    ev.on('monster:killed', (e) => {
      float(e.at, 0, -MONSTERS[e.kind].size - 14, th.floats.hunted, '#ffd166', true);
      fx.burst(e.at.x, e.at.y, '#ffd166', 20, 110);
      const cx = this.v.x(e.at.x, e.at.y);
      const cy = this.v.y(e.at.x, e.at.y);
      const img = this.inWorld(this.add.image(cx, cy, TEX.monster(e.kind, e.corpse.frame, e.corpse.headBroken, e.corpse.tailBroken)).setDepth(D.corpse));
      this.corpses.push({ img, x: cx, y: cy, t: 1 });
      bump(TUNING.combat.killHitstop, 0.22);
      snd('kill');
      hud.toast(th.log.hunted(monName(e.kind), fmtItems(e.drops)));
      if (e.rare) hud.toast(th.log.rareDrop(th.materials[e.rare]), 'gold');
      // first jungle-fowl egg: point the way to the coop
      if ((e.drops.jfegg ?? 0) > 0 && this.s.ranch.hens.length + this.s.ranch.nest.length === 0) hud.toast(th.ranch.firstEgg, 'gold');
      this.corpses.at(-1)?.img.setScale(e.corpse.dirX, 1);
      this.save();
    });
    ev.on('ranch:incubate', (e) => {
      fx.burst(e.at.x, e.at.y - 2, '#f6ead0', 8, 40, 'dust');
      snd('plant');
      hud.toast(th.ranch.incubate(this.s.inv.jfegg));
    });
    let lastHatch = -1;
    ev.on('ranch:hatched', (e) => {
      // several eggs can hatch in the same frame (e.g. after reopening the game): one message
      if (this.s.time !== lastHatch) float(e.at, 0, -10, th.ranch.hatched, '#ffe08a', true);
      lastHatch = this.s.time;
      fx.burst(e.at.x, e.at.y, '#ffd84a', 12, 60, 'chunk');
      snd('harvest');
      this.save();
    });
    ev.on('ranch:grown', (e) => {
      if (this.s.area === 'home') hud.toast(th.ranch.grown, 'gold');
      fx.burst(e.at.x, e.at.y, '#e09858', 8, 40, 'dust');
    });
    ev.on('ranch:fed', (e) => {
      fx.burst(e.at.x, e.at.y - 2, '#e8d890', 8, 40, 'chunk');
      snd('plant');
      hud.toast(th.ranch.fed(th.materials[e.item], e.trough, TUNING.ranch.troughMax));
      this.sheet.markDirty();
    });
    ev.on('ranch:petted', (e) => {
      float(e.at, 0, -14, e.loved ? `♥ ${e.love}/${TUNING.ranch.maxLove}` : th.ranch.happy, e.loved ? '#ff8fb0' : '#fff3c4', e.loved);
      if (e.loved) fx.burst(e.at.x, e.at.y - 6, '#ff8fb0', 6, 30, 'dust');
      snd(e.loved ? 'pickup' : 'ui');
    });
    ev.on('ranch:laid', (e) => {
      if (this.s.area === 'home') fx.burst(e.at.x, e.at.y, '#f6ead0', 4, 25, 'dust');
    });
    ev.on('ranch:collected', (e) => {
      float(e.at, 0, -12, fmtItems(e.items), '#ffd166', true);
      fx.burst(e.at.x, e.at.y, '#f6ead0', 10, 60, 'chunk');
      snd('harvest');
      hud.toast(th.ranch.collected(fmtItems(e.items)), 'gold');
      this.sheet.markDirty();
      this.save();
    });
    ev.on('monster:fled', (e) => {
      fx.burst(e.at.x, e.at.y, '#fff8e0', 14, 60, 'dust');
      hud.toast(th.log.huntTimeout(monName(e.kind)), 'bad');
    });
    ev.on('player:hurt', (e) => {
      float(e.at, 0, -16, `-${e.damage}`, '#ff6b5e', true);
      fx.burst(e.at.x, e.at.y, '#ff6b5e', 8);
      bump(0.06, e.heavy ? 0.25 : 0.14);
      vibrate(40);
      snd('hurt');
    });
    ev.on('player:dodged', (e) => {
      float(e.at, 0, -18, th.floats.dodged, '#ffd35c', true);
      fx.burst(e.at.x, e.at.y, '#fff3c4', 6, 60);
      snd('dodge');
    });
    ev.on('player:roll', (e) => {
      fx.burst(e.at.x, e.at.y + 6, '#e8d8b0', 6, 40, 'dust');
      snd('roll');
    });
    ev.on('player:tired', (e) => float(e.at, 0, -16, th.floats.tired, '#c8c2b0'));
    ev.on('player:drink', (e) => {
      float(e.at, 0, -16, `+${e.heal}`, '#8ff08a', true);
      fx.healGlow(e.at.x, e.at.y);
      snd('drink');
      if (e.auto) hud.toast(th.log.autoDrank(this.s.player.potions));
    });
    ev.on('player:noPotion', (e) => {
      hud.toast(e.auto ? th.log.autoNoPotion : th.log.noPotion, 'bad');
      snd('error');
    });
    ev.on('player:knockedOut', () => hud.toast(this.s.map.camp ? th.log.knockedOutCamp : th.log.knockedOut, 'bad'));
    ev.on('area:changed', () => this.enterArea());
    ev.on('player:revived', (e) => {
      this.camFX = this.v.x(e.at.x, e.at.y) - this.VW / 2;
      this.camFY = this.v.y(e.at.x, e.at.y) - this.VH / 2;
      if (e.camp) hud.toast(th.log.revivedCamp, 'gold');
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
      float(e.at, 0, -10, th.floats.planted(th.crops[e.crop].name), CROPS[e.crop].color);
      fx.burst(e.at.x, e.at.y + 3, '#a8754a', 6, 40, 'dust');
      snd('plant');
      this.sheet.markDirty();
      this.save();
    });
    ev.on('crop:harvested', (e) => {
      float(e.at, 0, -12, th.floats.harvested, '#ffd166', true);
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
      float(e.at, 0, -10, `+${e.amount}`, c, true);
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
      float(p, 0, -22, th.request.done, '#ffd166', true);
      hud.toast(th.request.readyLog, 'gold');
      snd('craft');
    });
    ev.on('request:claimed', (e) => {
      // the elder's bubble sits above both heads, so the celebration goes low, by the player's feet
      const at = this.s.player;
      const got = [fmtItems(e.items), e.potions ? th.request.potions(e.potions) : ''].filter(Boolean).join(', ');
      hud.toast(th.request.claimedLog(got), 'gold');
      float(at, 0, 4, th.request.done, '#ffd166', true);
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
        if (s.player.dash) this.playerView.addGhost(this.v.x(s.player.x, s.player.y), this.v.y(s.player.x, s.player.y), this.v.iso ? this.v.face(s.player.fx, s.player.fy, s.player.face) : s.player.face);
        if (s.player.moving && Math.random() < dt * 4) this.effects.walkDust(s.player.x, s.player.y);
        for (const m of s.monsters) if (m.mode === 'dash' && Math.random() < 0.7) this.effects.dashDust(m.x, m.y + MONSTERS[m.kind].size * 0.6, MONSTERS[m.kind].size >= 12 ? '#c8905a' : '#c8b890');
        const mid = this.v.toWorld(this.camX + this.VW / 2, this.camY + this.VH / 2);
        this.effects.ambient(dt, this.viewRect(), zoneAtPx(s.map, mid.x, mid.y), s.player);
        this.effects.update(dt, this.clock);
        for (const c of this.clouds) {
          c.x += c.v * dt;
          if (c.x - c.rx > this.v.width) {
            c.x = -c.rx;
            c.y = Math.random() * this.v.height;
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
    if (this.sheet.isOpen) this.plotPop.close();
    this.plotPop.update((wx, wy) => ({ x: ((this.v.x(wx, wy) - this.camX) * this.S) / this.dpr, y: ((this.v.y(wx, wy) - this.camY) * this.S) / this.dpr }));

    this.uiT -= raw;
    if (this.uiT <= 0) {
      this.uiT = 0.1;
      this.ctx = contextAction(s);
      this.hud.update(s);
      this.pad.update(s, this.ctx);
      // villagers' speech bubbles keep clear of the HUD's right column
      const col = document.querySelector('.rcol')?.getBoundingClientRect();
      this.text.avoid = col && col.width > 0 ? [{ x0: col.left * this.dpr, y0: col.top * this.dpr, x1: col.right * this.dpr, y1: col.bottom * this.dpr }] : [];
      const hunted = s.monsters.some((m) => m.aggro);
      this.calm = hunted ? 0 : this.calm + 0.1;
      const mood = nextMood(this.music.current, { dead: s.player.dead, inVillage: s.player.inVillage || s.player.inCamp, hunted, bossHunted: s.monsters.some((m) => m.aggro && MONSTERS[m.kind].rage !== null) }, this.calm);
      this.music.play(mood);
    }
    this.sheet.tick(raw);
    this.saveT -= raw;
    if (this.saveT <= 0) {
      this.saveT = TUNING.save.intervalSeconds;
      this.save();
    }
  }

  private applyMusicVolume(): void {
    const v = this.sfx.current;
    this.music.setVolume(v.on ? v.music : 0);
  }

  private collectHuman(): HumanInput {
    const h = this.pending;
    const kv = this.keyboard.vector();
    let move = normaliseMove(kv.x, kv.y);
    if (this.joystick.active) {
      const jm = normaliseMove(this.joystick.vx, this.joystick.vy, TUNING.input.joystickDeadzone);
      if (jm) move = jm;
    }
    // the stick points on screen; on the isometric map that is a diagonal in the world
    if (move && this.v.iso) move = this.v.dirToWorld(move.x, move.y);
    return { ...h, move, attackHeld: this.padAttackHeld || (this.keyboard.attackHeld && !this.ctx) };
  }

  private viewRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(this.camX, this.camY, this.VW, this.VH);
  }

  /** How far (px) the camera may scroll above the map's north edge: portrait screens only. */
  private topOverscroll(): number {
    return this.VH > this.VW && !this.v.iso ? Math.min(EDGE_FILL, Math.round(this.VH * PORTRAIT_TOP_OVERSCROLL)) : 0;
  }

  /** How far (px) the camera may scroll below the map's south edge: portrait screens only. */
  private bottomOverscroll(): number {
    return this.VH > this.VW && !this.v.iso ? Math.min(EDGE_FILL, Math.round(this.VH * PORTRAIT_BOTTOM_OVERSCROLL)) : 0;
  }

  private clampCamY(v: number): number {
    if (this.v.iso) return Phaser.Math.Clamp(v, -this.VH * 0.25, this.v.height - this.VH * 0.75);
    const maxY = MH * T - this.VH;
    return maxY < 0 ? maxY / 2 : Phaser.Math.Clamp(v, -this.topOverscroll(), maxY + this.bottomOverscroll());
  }

  /** Points the edge strips at the current area's forest fill, painting them on first use. */
  private syncEdgeFills(): void {
    const area = this.s.area;
    if (this.edgeArea === area) return;
    this.edgeArea = area;
    const key = `${TEX.ground}:north:${area}`;
    const south = `${TEX.ground}:south:${area}`;
    if (area === 'home') {
      // the painted map mirrored past its top and bottom edges, so trees and roads carry on
      if (!this.textures.exists(key)) {
        this.textures.addCanvas(key, mirroredStrip(this.textures.get(TEX.ground).getSourceImage() as HTMLImageElement, 'top'));
        this.textures.addCanvas(south, mirroredStrip(this.textures.get(TEX.ground).getSourceImage() as HTMLImageElement, 'bottom'));
        for (const k of [key, south]) this.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      this.northGround.setTexture(key).setDisplaySize(MW * T, EDGE_FILL).setVisible(true);
      this.southGround.setTexture(south).setCrop().setY(MH * T).setDisplaySize(MW * T, EDGE_FILL).setVisible(true);
      this.northCanopy.setVisible(false);
      this.southCanopy.setVisible(false);
      return;
    }
    if (!this.textures.exists(key)) {
      const art = buildNorthFill(this.s.map);
      this.textures.addCanvas(key, art.ground);
      this.textures.addCanvas(`${key}:canopy`, art.canopy);
      const sa = buildSouthFill(this.s.map);
      this.textures.addCanvas(south, sa.ground);
      this.textures.addCanvas(`${south}:canopy`, sa.canopy);
    }
    this.northGround.setTexture(key).setScale(1).setVisible(true);
    this.northCanopy.setTexture(`${key}:canopy`).setVisible(true);
    // south strip row 0 overlaps the map's last row: ground from row 1, canopy (crowns poking up) from row 0
    this.southGround.setTexture(south).setScale(1).setY((MH - 1) * T).setCrop(0, T, MW * T, EDGE_FILL).setVisible(true);
    this.southCanopy.setTexture(`${south}:canopy`).setVisible(true);
  }

  /** The home ground is the painted map stretched over the tile grid; other areas are 1:1 pixel art with a canopy layer. */
  private fitGround(): void {
    const home = this.s.area === 'home';
    if (home) this.groundImg.setDisplaySize(this.v.width, this.v.height);
    else this.groundImg.setScale(1);
    this.canopyImg.setVisible(!home);
    // the shader's tiles also cover the forest beyond the map's diamond
    this.floor.setVisible(home && !this.groundTiles);
    this.groundTiles?.setVisible(home);
    this.groundImg.setVisible(!home || !this.groundTiles);
    this.village.setVisible(home);
    for (const img of [this.northGround, this.southGround, this.northCanopy, this.southCanopy]) if (home) img.setVisible(false);
    this.gEdgeShade?.setVisible(!home);
    if (!home) this.edgeArea = null;
  }

  /** Darkens both strips away from the map so they read as deep forest beyond the area, not open ground. */
  private shadeEdgeFills(): void {
    const g = this.gEdgeShade.clear();
    const steps = 12;
    const h = EDGE_FILL / steps;
    for (let i = 0; i < steps; i++) {
      const a = 0.5 * ((i + 1) / steps);
      g.fillStyle(0x16202e, a).fillRect(0, -(i + 1) * h, MW * T, h);
      g.fillStyle(0x16202e, a).fillRect(0, MH * T + i * h, MW * T, h);
    }
  }

  private updateCamera(rdt: number): void {
    const p = this.s.player;
    if (this.topOverscroll() > 0) this.syncEdgeFills();
    const clampX = (v: number): number => this.clampCamX(v);
    const clampY = (v: number): number => this.clampCamY(v);
    const k = Math.min(1, rdt * 7);
    this.camFX += (clampX(this.v.x(p.x, p.y) - this.VW / 2) - this.camFX) * k;
    this.camFY += (clampY(this.v.y(p.x, p.y) - this.VH / 2) - this.camFY) * k;
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

  private clampCamX(v: number): number {
    // the isometric map is a diamond: let the view slide a little past its corners
    if (this.v.iso) return Phaser.Math.Clamp(v, -this.VW * 0.25, this.v.width - this.VW * 0.75);
    const maxX = MW * T - this.VW;
    return maxX < 0 ? maxX / 2 : Phaser.Math.Clamp(v, 0, maxX);
  }

  /** Puts the camera straight on the player (load, area change). */
  private snapCamera(): void {
    const p = this.s.player;
    this.camFX = this.clampCamX(this.v.x(p.x, p.y) - this.VW / 2);
    this.camFY = this.clampCamY(this.v.y(p.x, p.y) - this.VH / 2);
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

  /** Is screen point (x, y) on screen (with a margin)? */
  private inView(x: number, y: number, pad: number): boolean {
    return x > this.camX - pad && y > this.camY - pad && x < this.camX + this.VW + pad && y < this.camY + this.VH + pad;
  }

  /** Screen position of a world point. */
  private sp(x: number, y: number): { x: number; y: number } {
    return { x: this.v.x(x, y), y: this.v.y(x, y) };
  }

  private drawGround(time: number): void {
    const g = this.gGround.clear();
    // px draws in screen space; anchors come from sp()
    const px = (x: number, y: number, c: number, w = 1, h = 1, a = 1): void => {
      g.fillStyle(c, a).fillRect(x, y, w, h);
    };
    // water sparkle (the flat wild maps; the village stream has its own painted ripples)
    if (!this.v.iso) {
      const x0 = Math.floor(this.camX / T);
      const y0 = Math.floor(this.camY / T);
      for (let yy = y0; yy <= y0 + this.VH / T + 1; yy++) {
        for (let xx = x0; xx <= x0 + this.VW / T + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= MW || yy >= MH || tileAt(this.s.map, xx, yy) !== Tile.WATER) continue;
          const o = (xx * 7 + yy * 13) % 16;
          if (Math.sin(time * 2 + o) > 0.3) px(xx * T + 3 + ((o + Math.floor(time * 4)) % 9), yy * T + 7 + ((o * 5) % 6), this.s.map.biome === 'peat' ? 0xfff0c8 : 0xc8fff0, 2, 1);
        }
      }
    }
    const camp = this.s.map.camp;
    if (camp) {
      const f = this.sp(camp.fire.x, camp.fire.y);
      if (this.inView(f.x, f.y, 40)) {
        // campfire flames
        for (let i = 0; i < 5; i++) {
          const ox = i - 2;
          const hg = Math.max(1, Math.round((4 - Math.abs(ox)) * 1.4 + Math.sin(time * 11 + i * 1.9)));
          for (let k = 0; k < hg; k++) px(f.x + ox, f.y + 1 - k, k / hg < 0.45 ? 0xffd35c : 0xff6a2a);
        }
        if (Math.floor(time * 6) % 3 === 0) px(f.x + Math.round(Math.sin(time * 3) * 2), f.y - 7, 0xffe08a, 1, 1);
      }
    }
    if (this.s.area !== 'home') {
      // field crop images live in world space: hide them or they show up on every other map
      for (const img of this.cropImgs.values()) img.setVisible(false);
      return;
    }
    this.drawCoopLive(px, time);
    // crops
    this.s.plots.forEach((pl, i) => {
      const img = this.cropImgs.get(i);
      if (!pl.crop) {
        img?.setVisible(false);
        return;
      }
      const pr = plotProgress(pl, this.s.now);
      const stage = pr < 0.25 ? 0 : pr < 0.6 ? 1 : pr < 1 ? 2 : 3;
      const at = this.sp(pl.x, pl.y);
      if (pl.bed !== 'soil') {
        this.drawFieldCrop(i, pl.crop, at.x, at.y, stage, time);
        if (pr >= 1 && Math.floor(time * 3 + i) % 4 === 0) {
          px(at.x + 9, at.y - 12, 0xfffbe0, 1, 3);
          px(at.x + 8, at.y - 11, 0xfffbe0, 3, 1);
        }
        return;
      }
      const c = this.sp((pl.tx + 0.5) * T, (pl.ty + 0.5) * T);
      for (let k = 0; k < 3; k++) drawPlant(px, Math.round(c.x - 4 + k * 4), Math.round(c.y + 3 - (k % 2)), pl.crop, stage);
      if (pr >= 1) {
        if (Math.floor(time * 4 + pl.tx) % 3 === 0) {
          px(c.x + 5, c.y - 7, 0xfffbe0, 1, 3);
          px(c.x + 4, c.y - 6, 0xfffbe0, 3, 1);
        }
      } else {
        px(c.x - 6, c.y + 5, 0x1e1008, 12, 2, 0.85);
        px(c.x - 6, c.y + 5, parseInt(CROPS[pl.crop].color.slice(1), 16), Math.max(1, Math.round(12 * pr)), 2);
      }
    });
  }

  /** Eggs in the nest (laid ones and ones still hatching), feed in the trough, love hearts. */
  private drawCoopLive(px: (x: number, y: number, c: number, w?: number, h?: number, a?: number) => void, time: number): void {
    const r = this.s.ranch;
    const R = TUNING.ranch;
    const fill = Math.min(1, r.trough / R.troughMax);
    const tr = this.sp(TROUGH.x, TROUGH.y);
    if (fill > 0) {
      const w = Math.max(2, Math.round(12 * fill));
      px(tr.x - 6, tr.y - 2, 0xe8d890, w, 2);
      for (let k = 0; k < w; k += 3) px(tr.x - 6 + k, tr.y - 3, 0xc8a050, 1, 1);
    }
    // eggs: up to 5 drawn, the label carries the count
    const ne = this.sp(NEST.x, NEST.y);
    const eggs = Math.min(5, basketCount(r));
    const spots = [[-3, -2], [1, -2], [-1, -3], [3, -3], [-4, -3]] as const;
    for (let i = 0; i < eggs; i++) {
      const [dx, dy] = spots[i] ?? [0, 0];
      px(ne.x + dx, ne.y + dy, 0xf6ead0, 2, 3);
      px(ne.x + dx, ne.y + dy, 0xffffff, 1, 1);
    }
    // eggs still hatching wobble now and then
    r.nest.forEach((_, i) => {
      const wob = Math.sin(time * 9 + i * 2) > 0.85 ? 1 : 0;
      const x = ne.x + 4 - i * 4 + wob;
      px(x, ne.y - 4, 0xd8b88a, 3, 4);
      px(x + 1, ne.y - 3, 0x9a7a4a, 1, 1);
    });
    // a heart over hens that can be petted again (only once the player is close)
    const p = this.s.player;
    if (Math.hypot(COOP_CENTER.x - p.x, COOP_CENTER.y - p.y) < 70) {
      for (const h of r.hens) {
        if (!canLove(h, this.s.now)) continue;
        const hp = this.sp(h.x, h.y);
        const y = Math.round(hp.y - 14 + Math.sin(time * 3 + h.id) * 1.2);
        const x = Math.round(hp.x);
        px(x - 2, y, 0xff6a8a, 2, 2);
        px(x + 1, y, 0xff6a8a, 2, 2);
        px(x - 1, y + 2, 0xff6a8a, 3, 1);
        px(x, y + 3, 0xff6a8a, 1, 1);
        px(x - 1, y, 0xffd0dc, 1, 1);
      }
    }
  }

  /**
   * Pond crops (x, y on screen): lotus is a texture swapped by stage, fish are a
   * few shadows circling under ripples.
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
    const key = TEX.lotus(stage);
    if (!img) {
      img = this.inWorld(this.add.image(x, y, key).setDepth(D.groundFx + 0.5));
      this.cropImgs.set(i, img);
    }
    // lotus sits on the water at its slot
    img.setTexture(key).setPosition(Math.round(x), Math.round(y - 4)).setVisible(true);
  }

  private drawNodes(time: number): void {
    const g = this.gNodeFx.clear();
    const p = this.s.player;
    for (const n of this.s.nodes) {
      const img = this.nodeImgs.get(n.id);
      if (!img) continue;
      img.setVisible(n.ready);
      const at = this.sp(n.x, n.y);
      if (!n.ready) {
        g.fillStyle(0x000000, 0.18).fillRect(at.x - 3, at.y + 2, 6, 2);
        continue;
      }
      const bob = n.kind === 'herb' ? Math.round(Math.sin(time * 2 + n.tx) * 0.6) : 0;
      img.setPosition(Math.round(at.x), Math.round(at.y - 1 + bob));
      g.fillStyle(0x142814, 0.25).fillEllipse(at.x, at.y + 4, 10, 3.2);
      if ((Math.floor(time * 1.5) + n.tx) % 4 === 0) g.fillStyle(0xfffbe0, 1).fillRect(at.x + 3, at.y - 7 - Math.round(((time * 6) % 1) * 2), 1, 1);
      if (p.gatherNode === n.id && p.gatherT > 0) {
        g.lineStyle(2, 0xffd166, 1);
        g.beginPath();
        g.arc(at.x, at.y - 1, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.gatherT / TUNING.gather.holdTime));
        g.strokePath();
      }
    }
  }

  private drawTelegraphs(time: number): void {
    const g = this.gTele.clear();
    const v = this.v;
    const pulse = 0.55 + 0.45 * Math.sin(time * 22);
    const edge = Phaser.Display.Color.GetColor(255, Math.round(80 + pulse * 100), 70);
    for (const m of this.s.monsters) {
      const sh = m.shape;
      if (m.mode !== 'tele' || !sh) continue;
      const prog = Math.min(1, 1 - m.t / m.tt);
      if (sh.kind === 'circle') {
        // a world circle is an ellipse on the isometric map
        const cx = v.x(sh.cx, sh.cy);
        const cy = v.y(sh.cx, sh.cy);
        g.fillStyle(0xe6281e, 0.2).fillEllipse(cx, cy, v.rx(sh.r) * 2, v.ry(sh.r) * 2);
        g.fillStyle(0xff3c28, 0.38).fillEllipse(cx, cy, v.rx(sh.r * prog) * 2, v.ry(sh.r * prog) * 2);
        g.lineStyle(1, edge, 1).strokeEllipse(cx, cy, v.rx(sh.r) * 2, v.ry(sh.r) * 2);
      } else {
        const quad = (len: number): Phaser.Types.Math.Vector2Like[] => {
          const nx = -sh.uy * (sh.wd / 2);
          const ny = sh.ux * (sh.wd / 2);
          const ex = sh.sx + sh.ux * len;
          const ey = sh.sy + sh.uy * len;
          return [[sh.sx + nx, sh.sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sh.sx - nx, sh.sy - ny]].map(([x, y]) => ({ x: v.x(x ?? 0, y ?? 0), y: v.y(x ?? 0, y ?? 0) }));
        };
        g.fillStyle(0xe6281e, 0.2).fillPoints(quad(sh.len), true);
        g.fillStyle(0xff3c28, 0.38).fillPoints(quad(sh.len * prog), true);
        g.lineStyle(1, edge, 1).strokePoints(quad(sh.len), true);
      }
    }
  }

  private drawEntities(time: number): void {
    const s = this.s;
    const v = this.v;
    const sh = this.gShadow.clear();
    const sa = this.gShadowAdd.clear();
    const p = s.player;
    const ps = this.sp(p.x, p.y);
    sh.fillStyle(0x142814, 0.3).fillEllipse(ps.x, ps.y + 8, 12, 4);

    const alive = new Set<number>();
    for (const m of s.monsters) {
      alive.add(m.id);
      let mv = this.monsterViews.get(m.id);
      if (!mv) {
        mv = new MonsterView(this, this.inWorld, m);
        this.monsterViews.set(m.id, mv);
      }
      mv.update(m, time, v);
      const size = MONSTERS[m.kind].size;
      const ms = this.sp(m.x, m.y);
      mv.img.setVisible(!m.burrow);
      // fliers circle well above their shadow
      if (m.air) mv.img.y -= 16 + Math.round(Math.sin(time * 4 + m.id) * 2);
      if (m.burrow) {
        // underground: a moving ridge of loose earth instead of the sprite
        for (let i = 0; i < 4; i++) {
          const k = Math.sin(time * 14 + i * 1.7);
          sh.fillStyle(i % 2 ? 0x8a6a4a : 0x6a4a30, 0.85).fillEllipse(ms.x - m.dirX * i * 3, ms.y + 2 - Math.max(0, k), 6 - i, 3);
        }
        continue;
      }
      const feet = MonsterView.feet(m, mv.img.height, v);
      sh.fillStyle(0x142814, 0.3).fillEllipse(ms.x, feet, size * 1.9, size * 0.64);
      if (m.rage) sa.fillStyle(0xff501e, 0.14 + 0.08 * Math.sin(time * 10)).fillEllipse(ms.x, ms.y, (size + 6) * 2, size * 1.6);
      if (m.vet) {
        // veteran: a slow golden ring at the feet; alpha: a faster crimson one
        const k = 0.5 + 0.5 * Math.sin(time * (m.alpha ? 6 : 3) + m.id);
        sa.lineStyle(m.alpha ? 1.5 : 1, m.alpha ? 0xff4a6a : 0xffcf4a, 0.35 + 0.25 * k).strokeEllipse(ms.x, feet, size * 2.3 + k * 3, size * 0.8 + k);
      }
    }
    for (const [id, mv] of this.monsterViews) {
      if (alive.has(id)) continue;
      mv.destroy();
      this.monsterViews.delete(id);
    }
    this.updateHens(sh);
    if (s.area === 'home') this.groundTiles?.update(this.viewRect(), this.S);
    if (s.area === 'home') this.village.update(ps.x, ps.y, time, Math.min(0.05, this.game.loop.delta / 1000), this.cameras.main.worldView);
    for (const n of s.npcs) {
      if (!npcActive(s, n.id)) continue;
      this.npcViews.get(n.id)?.update(n, time, v, ps.x);
      sh.fillStyle(0x142814, 0.3).fillEllipse(v.x(n.x, n.y), v.y(n.x, n.y) + 8, 12, 4);
    }
    this.playerView.update(s, time, this.hitstop > 0 ? 0 : Math.min(0.05, this.game.loop.delta / 1000), v);

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
    const pl = this.s.player;
    if (pl.grab) {
      // the python's coils around the player
      const ps = this.sp(pl.x, pl.y);
      for (let i = 0; i < 3; i++) {
        const y = ps.y - 2 - i * 5 + Math.sin(time * 9 + i) * 0.6;
        g.lineStyle(3, 0x8a7a4a, 1).strokeEllipse(ps.x, y, 16 - i, 6);
        g.lineStyle(1, 0xd8c890, 1).strokeEllipse(ps.x, y - 1, 14 - i, 4);
      }
    }
    const s = this.s;
    const lock = findMonster(s, s.player.lockId);
    if (lock) {
      const sz = MONSTERS[lock.kind].size + 5;
      const ls = this.sp(lock.x, lock.y);
      g.fillStyle(0xffd166, 0.6 + 0.4 * Math.sin(time * 8));
      for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = Math.round(ls.x + qx * sz);
        const cy = Math.round(ls.y + qy * sz * 0.8);
        g.fillRect(cx - (qx > 0 ? 2 : 0), cy, 3, 1);
        g.fillRect(cx, cy - (qy > 0 ? 2 : 0), 1, 3);
      }
    }
    for (const m of s.monsters) {
      const mv = this.monsterViews.get(m.id);
      if (!mv) continue;
      const def = MONSTERS[m.kind];
      const ms = this.sp(m.x, m.y);
      if (m.mode === 'stun') {
        for (let i = 0; i < 3; i++) {
          const a = time * 5 + i * 2.09;
          g.fillStyle(0xffd35c, 1).fillRect(Math.round(ms.x + Math.cos(a) * 9), Math.round(ms.y - mv.img.height / 2 - 4 + Math.sin(a) * 2), 2, 2);
        }
      }
      if (!(m.aggro || lock === m) || m.burrow) continue;
      const bw = def.size * 2;
      const yy = Math.round(ms.y - mv.img.height / 2 - 5);
      g.fillStyle(0x151c2b, 1).fillRect(ms.x - bw / 2 - 1, yy - 1, bw + 2, 4);
      g.fillStyle(0xf08a3c, 1).fillRect(ms.x - bw / 2, yy, Math.max(0, Math.round((bw * m.hp) / m.maxHp)), 2);
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

  /** Additive warm glows; anything off-screen is hidden so it costs nothing. Light positions are world px. */
  private drawGlows(time: number): void {
    const place = (img: Phaser.GameObjects.Image, wx: number, wy: number, r: number, alpha: number): void => {
      const x = this.v.x(wx, wy);
      const y = this.v.y(wx, wy);
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
    // labels are placed in screen px: world anchor projected, then nudged up by dy
    const label = (text: string, at: { x: number; y: number }, dy: number, color: string): void => t.label(this, text, this.v.x(at.x, at.y), this.v.y(at.x, at.y) + dy, color);
    t.begin();
    // villagers within earshot talk; their station's name label steps aside for the bubble
    // only the nearest one talks, so two bubbles never overlap
    const nearest = !p.dead ? npcNear(s, TUNING.village.npcBubbleRadius) : null;
    const talking = nearest ? [nearest] : [];
    const roleTalking = (role: string): boolean => talking.some((n) => NPCS[n.id].role === role);
    if (p.inVillage && !p.dead) {
      const near = (o: { x: number; y: number }): boolean => Math.hypot(o.x - p.x, o.y - p.y) < 90;
      if (near(ANVIL) && !roleTalking('forge')) label(th.places.forge, ANVIL, -14, '#ffe7a6');
      if (near(POT) && !roleTalking('kitchen')) label(th.places.kitchen, POT, -22, '#ffe7a6');
      if (near(FARM_CENTER)) {
        const ripe = s.plots.filter((pl) => isRipe(pl, s.now)).length;
        label(ripe ? th.places.farmRipe(ripe) : th.places.farm, FARM_CENTER, -20, ripe ? '#ffe08a' : '#ffe7a6');
      }
      if (near(COOP_CENTER)) {
        const eggs = basketCount(s.ranch);
        label(eggs ? th.places.coopEggs(eggs) : th.places.coop, COOP_CENTER, -26, eggs ? '#ffe08a' : '#ffe7a6');
      }
      for (const [bed, at, name] of [['pond', POND_CENTER, th.places.pond]] as const) {
        if (!near(at)) continue;
        const ripe = s.plots.filter((pl) => pl.bed === bed && isRipe(pl, s.now)).length;
        label(ripe ? th.places.bedRipe(name, ripe) : name, at, -30, ripe ? '#ffe08a' : '#ffe7a6');
      }
    }
    const board = { x: (BOARD.x + 1) * T, y: (BOARD.y + 0.5) * T };
    if (s.area === 'home' && p.inVillage && !p.dead && !roleTalking('requests') && Math.hypot(board.x - p.x, board.y - p.y) < 90) {
      label(requestReady(s) ? th.places.boardReady : th.places.board, board, -30, requestReady(s) ? '#ffe08a' : '#ffe7a6');
    }
    if (s.map.camp && !p.dead && !roleTalking('ranger') && Math.hypot(s.map.camp.x - p.x, s.map.camp.y - p.y) < 110) {
      const c = s.map.camp;
      label(th.places.camp, { x: (c.tent.x + c.tent.w / 2) * T, y: c.tent.y * T }, -8, '#ffe7a6');
    }
    if (!p.dead) {
      // signposts: one label per arm, stacked above the post in the order the arms are painted
      for (const sg of this.signs) {
        if (Math.hypot(sg.x - p.x, sg.y - p.y) > SIGN_READ_RADIUS) continue;
        // a villager talking right by the sign has the floor; the sign reads again once they stop
        if (talking.some((n) => Math.hypot(n.x - sg.x, n.y - sg.y) < 120)) continue;
        const n = sg.arms.length;
        // labels are 19 screen px tall: step by screen px so they stack snugly at any zoom
        const gap = (21 * this.dpr) / this.S;
        sg.arms.forEach((a, i) => label(`${SIGN_ARROWS[a.edge]} ${th.areas[a.to]}`, sg, -18 - n * 5 - (n - 1 - i) * gap, '#fff3c4'));
      }
    }
    t.endLabels();
    {
      const reqById = (id: string) => REQUESTS.find((r) => r.id === id);
      for (const n of talking) {
        const line = lineText(npcLine(s, n.id, this.talkN[n.id] ?? 0), reqById);
        t.bubble(this, n.id, th.npcs[n.id].name, line, this.v.x(n.x, n.y), this.v.y(n.x, n.y) - 16);
      }
    }
    t.endBubbles();
    for (const m of s.monsters) {
      const mv = this.monsterViews.get(m.id);
      if (m.mode === 'tele' && mv) t.warning(this, m.id, this.v.x(m.x, m.y), this.v.y(m.x, m.y) - mv.img.height / 2 - 10, time);
    }
    t.endWarnings();
    t.setDead(p.dead, this.scale.width, this.scale.height, this.dpr, !!this.s.map.camp);
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
  } else if (kind === 'rice') {
    // golden ears bowing over
    px(x - 2, y - 5, 0xe8c050);
    px(x - 1, y - 6, 0xf0d870);
    px(x + 2, y - 6, 0xe8c050);
    px(x + 1, y - 7, 0xf0d870);
    px(x, y - 6, 0xd0a83a);
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

/** A strip of the painted map's top or bottom edge, flipped, to show beyond that edge (EDGE_FILL tall in world px). */
function mirroredStrip(img: HTMLImageElement, edge: 'top' | 'bottom'): HTMLCanvasElement {
  const w = img.width;
  const h = Math.round((EDGE_FILL * img.height) / (MH * T));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return c;
  g.translate(0, h);
  g.scale(1, -1);
  g.drawImage(img, 0, edge === 'top' ? 0 : img.height - h, w, h, 0, 0, w, h);
  return c;
}
