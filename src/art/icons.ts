// 18×18 item icons for the DOM menus (bag, forge, kitchen, farm).
// Drawn with the same pixel buffer + finish() as the world sprites so the
// outline and shading match, then cached as data URLs.
import { ARMOR, MATERIALS, MEALS, WEAPONS } from '../data';
import type { ArmorId, ArmorSlot, IconShape, MaterialId, MealId, MonsterId, WeaponDef, WeaponId } from '../data/types';
import { createBuffer, ell, finish, line, rect, rgb, sp, type PixelBuffer } from './pixelBuffer';
import { buildPlayerFrames, MONSTER_SPRITES } from './sprites';

export const ICON_SIZE = 18;

/** Mixes `hex` toward white (t > 0) or black (t < 0). */
function tint(hex: string, t: number): string {
  const [r, g, b] = rgb(hex);
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const ch = (v: number): string => Math.round(v + (to - v) * k).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

/** Thick diagonal stroke from (x0,y0) to (x1,y1). */
function thick(b: PixelBuffer, x0: number, y0: number, x1: number, y1: number, c: string, w: number): void {
  for (let i = 0; i < w; i++) line(b, x0 + i, y0, x1 + i, y1, c);
}

type ShapeDrawer = (b: PixelBuffer, c: string) => void;

const SHAPES: Record<IconShape, ShapeDrawer> = {
  pelt: (b, c) => {
    ell(b, 9, 9, 5.5, 5, c);
    ([[3, 4], [14, 4], [3, 14], [14, 14]] as const).forEach(([x, y]) => rect(b, x, y, 2, 2, c));
    ell(b, 9, 9, 3, 2.6, tint(c, 0.25));
    sp(b, 7, 8, tint(c, -0.35));
    sp(b, 11, 10, tint(c, -0.35));
  },
  fang: (b, c) => {
    for (let y = 3; y <= 14; y++) {
      const w = Math.max(1, Math.round(4 - (y - 3) * 0.32));
      const x = 6 + Math.round((y - 3) * 0.35);
      rect(b, x, y, w, 1, y < 5 ? tint(c, -0.2) : c);
    }
    sp(b, 7, 6, '#ffffff');
  },
  ore: (b, c) => {
    ell(b, 9, 11, 6.5, 4.2, '#6c7078');
    ell(b, 7.5, 10, 3.6, 2.4, '#8a8f98');
    ([[6, 7], [7, 6], [7, 7], [8, 5], [11, 7], [11, 8], [12, 6], [9, 11], [10, 11]] as const).forEach(([x, y]) => sp(b, x, y, c));
    sp(b, 8, 5, '#ffffff');
    sp(b, 12, 6, '#ffffff');
  },
  leaf: (b, c) => {
    line(b, 9, 15, 9, 7, tint(c, -0.35));
    ell(b, 6, 9, 3, 1.6, c);
    ell(b, 12, 8, 3, 1.6, c);
    ell(b, 9, 5, 1.8, 2.8, tint(c, 0.15));
    sp(b, 5, 6, '#ff4a5a');
    sp(b, 13, 5, '#ff4a5a');
  },
  scale: (b, c) => {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3 - (row % 2); col++) {
        const x = 5 + col * 4 + (row % 2) * 2;
        const y = 6 + row * 3;
        ell(b, x, y, 2.4, 2.2, row % 2 ? tint(c, -0.15) : c);
        sp(b, x - 1, y - 1, tint(c, 0.35));
      }
    }
  },
  horn: (b, c) => {
    const pts: [number, number][] = [[4, 14], [5, 13], [6, 12], [7, 11], [8, 9], [9, 8], [10, 6], [11, 5], [12, 4], [13, 3]];
    pts.forEach(([x, y], i) => {
      const w = Math.max(1, 4 - Math.floor(i / 3));
      rect(b, x, y, w, 2, i < 2 ? tint(c, -0.3) : c);
    });
    sp(b, 9, 9, tint(c, 0.4));
  },
  tail: (b, c) => {
    const pts: [number, number][] = [[3, 13], [5, 12], [7, 12], [9, 11], [10, 9], [11, 8], [12, 7]];
    pts.forEach(([x, y]) => rect(b, x, y, 2, 2, '#4a3a3a'));
    ell(b, 13, 5, 2.4, 3, c);
    sp(b, 13, 4, '#ffe070');
    sp(b, 14, 2, c);
  },
  orb: (b, c) => {
    ell(b, 9, 9, 5.5, 5.5, tint(c, -0.25));
    ell(b, 9, 9, 4.2, 4.2, c);
    ell(b, 8, 8, 1.8, 1.8, tint(c, 0.6));
    sp(b, 7, 7, '#ffffff');
  },
  root: (b, c) => {
    ell(b, 9, 11, 6, 3.6, c);
    ell(b, 8, 10, 3.5, 1.6, tint(c, 0.2));
    sp(b, 6, 12, tint(c, -0.35));
    sp(b, 12, 11, tint(c, -0.35));
    line(b, 8, 7, 7, 4, '#3fa34a');
    line(b, 10, 7, 11, 4, '#3fa34a');
  },
  chili: (b, c) => {
    for (let i = 0; i < 9; i++) ell(b, 5 + i, 13 - i * 0.9 + Math.sin(i * 0.5), 1.8 - i * 0.08, 1.8 - i * 0.08, c);
    sp(b, 7, 11, tint(c, 0.45));
    rect(b, 13, 4, 2, 2, '#3fa34a');
    sp(b, 15, 3, '#3fa34a');
  },
  seed: (b, c) => {
    ([[6, 7], [11, 6], [9, 12]] as const).forEach(([x, y]) => {
      ell(b, x, y, 2.2, 3, tint(c, -0.15));
      sp(b, x - 1, y - 1, tint(c, 0.4));
    });
  },
  bulb: (b, c) => {
    ell(b, 9, 11, 4.5, 3.6, c);
    sp(b, 7, 10, tint(c, 0.35));
    line(b, 9, 7, 9, 4, '#3fa34a');
    ell(b, 11, 4, 1.8, 1, '#5fc26a');
  },
  feather: (b, c) => {
    for (let i = 0; i < 10; i++) {
      const x = 4 + i;
      const y = 14 - i;
      const w = i < 2 ? 1 : i > 7 ? 2 : 3;
      ell(b, x, y, w * 0.7, w * 0.7, i % 3 === 0 ? tint(c, -0.2) : c);
    }
    line(b, 3, 15, 13, 5, tint(c, 0.5));
  },
  meat: (b, c) => {
    ell(b, 8, 9, 5.5, 4.5, c);
    ell(b, 7, 8, 2.5, 1.8, tint(c, 0.35));
    rect(b, 12, 11, 3, 2, '#f4eed4');
    ell(b, 15, 11, 1.6, 1.6, '#f4eed4');
    ell(b, 15, 13, 1.6, 1.6, '#f4eed4');
  },
  stalk: (b, c) => {
    ([[6, -1], [9, 0], [12, 1]] as const).forEach(([x, lean]) => {
      line(b, x, 15, x + lean * 2, 3, c);
      line(b, x + 1, 15, x + 1 + lean * 2, 5, tint(c, -0.25));
    });
    rect(b, 5, 13, 9, 2, '#f0e0b0');
  },
  grain: (b, c) => {
    ell(b, 9, 11, 6, 3.5, '#8a5530');
    ell(b, 9, 10, 5, 2.6, c);
    ([[6, 9], [9, 8], [12, 9], [8, 11], [11, 11]] as const).forEach(([x, y]) => sp(b, x, y, tint(c, 0.5)));
    rect(b, 3, 12, 13, 2, '#6b4a2e');
  },
  fish: (b, c) => {
    ell(b, 8, 9, 5.5, 3, c);
    ell(b, 7, 8, 3.5, 1.4, tint(c, 0.3));
    ([[13, 9], [14, 7], [14, 11], [15, 6], [15, 12]] as const).forEach(([x, y]) => sp(b, x, y, tint(c, -0.25)));
    rect(b, 13, 8, 2, 3, tint(c, -0.25));
    sp(b, 5, 8, '#16202e');
    rect(b, 7, 11, 4, 1, tint(c, -0.3));
  },
  sack: (b, c) => {
    ell(b, 9, 11, 5.5, 4.5, c);
    rect(b, 7, 5, 4, 3, c);
    rect(b, 6, 7, 6, 1, tint(c, -0.4));
    ell(b, 8, 10, 2, 1.5, tint(c, 0.25));
    ([[7, 12], [10, 13], [12, 10]] as const).forEach(([x, y]) => sp(b, x, y, '#5a8a3a'));
  },
  egg: (b, c) => {
    // egg, narrower at the top, lit from the upper left
    ell(b, 9, 10, 4.5, 5.5, c);
    ell(b, 9, 7, 3.5, 2.5, c);
    ell(b, 10, 12, 3, 2.5, tint(c, -0.12));
    ell(b, 7.5, 7.5, 1.4, 1.8, tint(c, 0.5));
    // jungle-fowl eggs are speckled
    if (c !== '#f6ead0') ([[11, 9], [8, 12], [11, 13], [7, 10]] as const).forEach(([x, y]) => sp(b, x, y, tint(c, -0.35)));
  },
};

function drawWeapon(w: WeaponDef): PixelBuffer {
  const b = createBuffer(ICON_SIZE, ICON_SIZE);
  const c = w.color;
  if (w.type === 'spear') {
    line(b, 2, 15, 12, 5, '#8a6a3a');
    line(b, 3, 15, 13, 5, '#6b4a2e');
    line(b, 11, 7, 14, 4, '#c9a24a');
    thick(b, 13, 4, 15, 2, c, 2);
    sp(b, 13, 3, tint(c, 0.45));
    return b;
  }
  if (w.type === 'bow' && w.look === 'crossbow') {
    thick(b, 3, 14, 11, 6, '#6b4a2e', 2);
    line(b, 6, 4, 14, 12, c);
    line(b, 7, 4, 15, 12, c);
    line(b, 6, 4, 9, 9, '#f4eed4');
    line(b, 9, 9, 14, 12, '#f4eed4');
    line(b, 11, 6, 15, 2, '#dfe6ee');
    return b;
  }
  if (w.type === 'bow') {
    ([[4, 2], [6, 2], [8, 3], [10, 4], [12, 6], [13, 8], [14, 10], [15, 12], [15, 14]] as const).forEach(([x, y]) => rect(b, x, y, 2, 2, c));
    line(b, 4, 3, 15, 14, '#f4eed4');
    line(b, 6, 11, 12, 5, '#8a6a3a');
    sp(b, 12, 4, '#dfe6ee');
    sp(b, 13, 5, '#dfe6ee');
    return b;
  }
  if (w.type === 'hammer') {
    thick(b, 3, 15, 10, 8, '#6b4a2e', 2);
    // head, drawn as a square block across the shaft end
    rect(b, 9, 3, 6, 7, c);
    rect(b, 9, 3, 6, 1, tint(c, 0.4));
    rect(b, 9, 9, 6, 1, tint(c, -0.35));
  } else {
    const great = w.type === 'greatsword';
    const bw = great ? 3 : 2;
    thick(b, 2, 15, 4, 13, '#6b4a2e', 2);
    // cross guard
    line(b, 3, 10, 7, 14, '#c9a24a');
    thick(b, 5, 12, 14, 3, c, bw);
    line(b, 5, 12, 14, 3, tint(c, 0.45));
    sp(b, 15, 2, c);
  }
  return b;
}

const ARMOR_SHAPES: Record<ArmorSlot, ShapeDrawer> = {
  head: (b, c) => {
    ell(b, 9, 9, 6, 5, c);
    rect(b, 3, 9, 13, 3, c);
    rect(b, 2, 12, 15, 2, tint(c, -0.3));
    ell(b, 7, 6, 2, 1.2, tint(c, 0.4));
    rect(b, 8, 3, 2, 2, tint(c, 0.15));
  },
  body: (b, c) => {
    rect(b, 4, 4, 10, 11, c);
    rect(b, 2, 4, 3, 5, c);
    rect(b, 13, 4, 3, 5, c);
    rect(b, 7, 3, 4, 2, tint(c, -0.45));
    rect(b, 4, 10, 10, 1, tint(c, -0.35));
    rect(b, 5, 5, 2, 4, tint(c, 0.3));
  },
  charm: (b, c) => {
    line(b, 4, 2, 9, 8, '#8a6a3a');
    line(b, 14, 2, 9, 8, '#8a6a3a');
    ell(b, 9, 11, 3.6, 4, c);
    ell(b, 8, 10, 1.4, 1.6, tint(c, 0.55));
    sp(b, 9, 14, tint(c, -0.35));
  },
};

/** Empty-slot silhouette, drawn in a muted grey. */
export function armorSlotIconUrl(slot: ArmorSlot): string {
  return cached(`slot:${slot}`, () => {
    const b = createBuffer(ICON_SIZE, ICON_SIZE);
    ARMOR_SHAPES[slot](b, '#4a5470');
    return finish(b, false, '#2c3550');
  });
}

export function armorIconUrl(id: ArmorId): string {
  return cached(`a:${id}`, () => {
    const b = createBuffer(ICON_SIZE, ICON_SIZE);
    ARMOR_SHAPES[ARMOR[id].slot](b, ARMOR[id].color);
    return finish(b);
  });
}

function drawMeal(color: string): PixelBuffer {
  const b = createBuffer(ICON_SIZE, ICON_SIZE);
  ell(b, 9, 9, 6, 2.6, color);
  ell(b, 8, 8.5, 2.5, 1, tint(color, 0.35));
  ell(b, 9, 12, 6.5, 3.2, '#e8dcc0');
  rect(b, 3, 9, 13, 2, '#e8dcc0');
  rect(b, 4, 12, 11, 1, '#4a86b8');
  ([[6, 4], [7, 3], [11, 4], [12, 3]] as const).forEach(([x, y]) => sp(b, x, y, '#ffffff', 0.7));
  return b;
}

function drawPotion(): PixelBuffer {
  const b = createBuffer(ICON_SIZE, ICON_SIZE);
  rect(b, 7, 2, 4, 2, '#8a5530');
  rect(b, 7, 4, 4, 3, '#cfe8f0');
  ell(b, 9, 11, 5, 4.5, '#cfe8f0');
  ell(b, 9, 12, 4, 3.2, '#d84a62');
  sp(b, 7, 10, '#ffb0c0');
  sp(b, 6, 9, '#ffffff');
  return b;
}

// ---------- cache ----------

const cache = new Map<string, string>();

function cached(key: string, build: () => HTMLCanvasElement): string {
  let url = cache.get(key);
  if (!url) {
    url = build().toDataURL();
    cache.set(key, url);
  }
  return url;
}

export function materialIconUrl(id: MaterialId): string {
  return cached(`m:${id}`, () => {
    const def = MATERIALS[id];
    const b = createBuffer(ICON_SIZE, ICON_SIZE);
    SHAPES[def.icon](b, def.color);
    return finish(b);
  });
}

export function weaponIconUrl(id: WeaponId): string {
  return cached(`w:${id}`, () => finish(drawWeapon(WEAPONS[id])));
}

export function mealIconUrl(id: MealId): string {
  return cached(`f:${id}`, () => finish(drawMeal(MEALS[id].color)));
}

export function potionIconUrl(): string {
  return cached('potion', () => finish(drawPotion()));
}

/** Monster portrait: idle frame of the world sprite. */
export function monsterIconUrl(kind: MonsterId): string {
  return monsterPortrait(kind).url;
}

const portraits = new Map<MonsterId, { url: string; w: number; h: number }>();

/** Idle frame of a monster sprite with its pixel size, for integer-scaled display. */
export function monsterPortrait(kind: MonsterId): { url: string; w: number; h: number } {
  let p = portraits.get(kind);
  if (!p) {
    const c = MONSTER_SPRITES[kind](0, false, false);
    p = { url: c.toDataURL(), w: c.width, h: c.height };
    portraits.set(kind, p);
  }
  return p;
}

export function playerIconUrl(): string {
  return cached('player', () => buildPlayerFrames()[0] ?? document.createElement('canvas'));
}
