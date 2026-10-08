// The single menu: bottom sheet on phones, side drawer on wide screens.
// The game pauses while it is open.
import { ARMOR, ARMOR_IDS, ARMOR_UPGRADE, CROPS, MATERIALS, MATERIAL_IDS, MEALS, MONSTERS, MONSTER_IDS, SKILLS, TUNING, WEAPONS, WEAPONS_DATA } from '../data';
import { ARMOR_SLOTS, MEDALS, type CropBed, type MealEffect, type AreaId, type ArmorId, type ArmorSlot, type WeaponType, type CropId, type ItemBag, type MaterialId, type MealId, type MonsterId, type PartId, type PerkId, type WeaponId } from '../data/types';
import { freePlotsFor, plantAll, plantOne, plotProgress, tapPlot } from '../core/farm';
import { weaponSkills } from '../core/skills';
import { AREA_IDS, areaMap } from '../core/areas';
import { ELDER_HOUSE, FARM_CENTER, PADDY_CENTER, POND_CENTER, INN, MH, MW, SMITH, T } from '../core/mapgen';
import { allRequestsDone, currentRequest } from '../core/requests';
import { hasMedal, medalCount } from '../core/medals';
import { requestText, rewardText } from './talk';
import { fastTravelCamp, fastTravelHome, inFight } from '../core/travel';
import { areaThumbUrl } from '../art/mapThumb';
import { armorLevel, armorStat, armorUpgradeCost, upgradeArmor, activeMeal, activePerks, attackMul, upgradeCost, upgradeWeapon, weaponLevel, weaponPower, brewPotion, canAfford, cookMeal, craftArmor, craftWeapon, damageReduction, defenseOf, equipArmor, equipWeapon, goalIndex, unequipArmor } from '../core/inventory';
import type { GameState } from '../core/state';
import { exportCode, parseCode, type SaveData } from '../core/save';
import { armorIconUrl, armorSlotIconUrl, materialIconUrl, mealIconUrl, monsterIconUrl, monsterPortrait, playerIconUrl, potionIconUrl, weaponIconUrl } from '../art/icons';
import * as th from '../i18n/th';
import { $, ICONS, fmtTime } from './format';
import type { Hud } from './hud';
import type { SfxName, SoundSettings } from '../audio/sfx';
import { gearTier, itemSources, itemUses, monsterWhere, type ItemSource, type ItemUse } from './itemInfo';

type BagFilter = 'all' | 'gear' | 'material' | 'seed';
const FILTERS: BagFilter[] = ['all', 'gear', 'material', 'seed'];
/** Empty cells pad the grid so it reads as a bag even when nearly empty. */
const MIN_CELLS = 18;

/** A bag entry: `m:<material>`, `w:<weapon>`, `a:<armor>` or `potion`. */
type ItemKey = `m:${MaterialId}` | `w:${WeaponId}` | `a:${ArmorId}` | 'potion';

interface BagItem {
  key: ItemKey;
  icon: string;
  name: string;
  /** corner badge: stack count, or `+N` for an upgraded weapon */
  count: number | string | null;
  rarity: 0 | 1 | 2;
  equipped: boolean;
}

const img = (src: string, cls = 'ico'): string => `<img class="${cls}" src="${src}" alt="" draggable="false">`;

/** Set / single-piece bonus lines for an armor piece, marked when currently active. */
function perkLines(s: GameState, id: ArmorId): string {
  const a = ARMOR[id];
  const on = activePerks(s);
  const M = th.menu;
  const line = (perk: PerkId, label: string, hint: string): string => {
    const active = on.includes(perk) && s.armor[a.slot] === id;
    return `<p class="perk${active ? ' on' : ''}"><b>${label}</b> ${th.perks[perk].desc}${active ? ` · ${M.perkOn}` : hint ? ` · ${hint}` : ''}</p>`;
  };
  return (a.set ? line(a.set, M.setBonus(th.perks[a.set].name), M.setHint) : '') + (a.perk ? line(a.perk, M.pieceBonus(th.perks[a.perk].name), '') : '');
}

/** "Strong against" line for a weapon: monsters weak to its type that the player has already hunted. */
function strongVs(s: GameState, id: WeaponId): string {
  const type = WEAPONS[id].type;
  const names = MONSTER_IDS.filter((k) => MONSTERS[k].weakTo === type && (s.kills[k] ?? 0) > 0).map((k) => th.monsters[k].name);
  return names.length ? `<p class="perk">${th.menu.strongVs(names.join(' '))}</p>` : '';
}

export type Tab = 'bag' | 'forge' | 'kitchen' | 'farm' | 'book' | 'map';
type ForgeSub = 'craft' | 'upgrade' | 'armor';
type BagSub = 'items' | 'hunt' | 'settings';
type MealFilter = 'all' | 'hp' | 'atk' | 'def' | 'st';
type BedFilter = 'all' | CropBed;
const BED_FILTERS: readonly BedFilter[] = ['all', 'soil', 'paddy', 'pond'];
const MEAL_FILTERS: readonly MealFilter[] = ['all', 'hp', 'atk', 'def', 'st'];
/** Which effect groups a meal belongs to (a meal can be in several). */
function mealGroups(e: MealEffect): MealFilter[] {
  const out: MealFilter[] = [];
  if (e.maxHpBonus) out.push('hp');
  if (e.attackMul) out.push('atk');
  if (e.defense) out.push('def');
  if (e.staminaRegenMul || e.dodgeCost) out.push('st');
  return out;
}
const WEAPON_TYPE_ORDER: readonly WeaponType[] = ['sword', 'hammer', 'greatsword', 'spear', 'bow'];
/** first weapon of each type, used as that type's tab icon */
const TYPE_ICON_WEAPON: Record<WeaponType, WeaponId> = Object.fromEntries(
  WEAPON_TYPE_ORDER.map((t) => [t, (Object.keys(WEAPONS) as WeaponId[]).find((k) => WEAPONS[k].type === t) ?? 'bone']),
) as Record<WeaponType, WeaponId>;
const SKILL_ICONS = ICONS as Readonly<Record<string, string>>;
export const TABS: readonly Tab[] = ['bag', 'forge', 'kitchen', 'farm', 'book', 'map'];

/**
 * Island centres on the world-map board (% of width, % of height). Hand-placed as an archipelago,
 * but every neighbour keeps the direction of the exit between them (swamp south of home, peat west
 * of the deep wild, ...); vertical gaps leave room for each island's label.
 */
const AREA_POS: Record<AreaId, [number, number]> = {
  peat: [14, 22],
  deepwild: [40, 13],
  bamboo: [40, 31],
  cave: [71, 29],
  home: [38, 51],
  limestone: [68, 50],
  savanna: [84, 69],
  swamp: [34, 71],
  mangrove: [18, 87],
};

/** Goal step (1-based) whose hunt happens in each area, shown instead of a level. */
const AREA_STEP: Record<AreaId, number> = { home: 1, bamboo: 5, swamp: 6, limestone: 7, deepwild: 8, cave: 9, mangrove: 10, peat: 11, savanna: 12 };
/** Where the current goal is hunted: the area whose step range holds the goal index (null after the last area). */
function goalArea(goal: number): AreaId | null {
  if (goal >= Math.max(...Object.values(AREA_STEP))) return null;
  let best: AreaId = 'home';
  for (const id of AREA_IDS) if (AREA_STEP[id] - 1 <= goal && AREA_STEP[id] >= AREA_STEP[best]) best = id;
  return best;
}

/** Connections drawn between world-map nodes (the area exits). */
const WORLD_LINKS: readonly [AreaId, AreaId][] = [
  ['deepwild', 'bamboo'],
  ['peat', 'deepwild'],
  ['bamboo', 'home'],
  ['home', 'limestone'],
  ['limestone', 'cave'],
  ['limestone', 'savanna'],
  ['home', 'swamp'],
  ['swamp', 'mangrove'],
];

/** Integer pixel scale that makes a portrait roughly `target` px wide. */
const portraitScale = (w: number, target: number): number => Math.max(2, Math.min(5, Math.floor(target / w)));

export interface SheetHooks {
  /** something changed that should be saved */
  changed: () => void;
  /** wipe the save and reload */
  reset: () => void;
  /** replace the save with an imported one and reload */
  load: (d: SaveData) => void;
  opened: () => void;
  closed: () => void;
  /** world feedback for crafting (sparks at the anvil etc.) */
  crafted: () => void;
  /** sound on/off + volume, stored outside the game save */
  sound: { get: () => SoundSettings; set: (v: SoundSettings) => void };
  /** UI feedback sounds */
  sfx: (name: SfxName) => void;
}

export class Sheet {
  tab: Tab = 'bag';
  private readonly scrim: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly body: HTMLElement;
  private resetArm = 0;
  private loadArm = 0;
  /** text in the import box, kept across re-renders */
  private codeDraft = '';
  private filter: BagFilter = 'all';
  private sel: ItemKey | null = null;
  private bookSel: MonsterId | null = null;
  private forgeSub: ForgeSub = 'craft';
  private forgeType: WeaponType = 'sword';
  private forgeSel: WeaponId | null = null;
  private armorSlot: ArmorSlot = 'head';
  private armorSel: ArmorId | null = null;
  private mealFilter: MealFilter = 'all';
  private mealSel: MealId | null = null;
  private bedFilter: BedFilter = 'all';
  private mapSel: AreaId | null = null;
  private bagSub: BagSub = 'items';
  private bookArea: AreaId | 'all' = 'all';
  private dirty = false;
  private refreshT = 0;

  constructor(
    overlay: HTMLElement,
    private readonly s: () => GameState,
    private readonly hud: Hud,
    private readonly hooks: SheetHooks,
  ) {
    overlay.insertAdjacentHTML(
      'beforeend',
      `<div id="scrim" hidden></div>
      <section id="sheet" hidden aria-label="${th.hud.menu}">
        <div class="grab"></div>
        <div class="shead">
          <div class="tabs">${TABS.map((t) => `<button class="tab" type="button" data-tab="${t}">${th.menu.tabs[t]}</button>`).join('')}</div>
          <button id="sheetSound" type="button"></button>
          <button id="sheetClose" type="button" aria-label="${th.hud.close}">${ICONS.close}</button>
        </div>
        <div id="sheetBody"></div>
      </section>`,
    );
    this.scrim = $(overlay, '#scrim');
    this.sheet = $(overlay, '#sheet');
    this.body = $(overlay, '#sheetBody');
    this.sheet.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.hooks.sfx('ui');
        this.render();
        this.body.scrollTop = 0;
      }),
    );
    $(overlay, '#sheetClose').addEventListener('click', () => this.close());
    // sound on/off sits in the menu header so it is one tap away on every tab (not on the HUD)
    $(overlay, '#sheetSound').addEventListener('click', () => {
      const v = this.hooks.sound.get();
      this.hooks.sound.set({ ...v, on: !v.on });
      this.hooks.sfx('ui');
      this.render();
    });
    this.scrim.addEventListener('click', () => this.close());
    this.body.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'useFert') this.s().useFert = t.checked;
      if (t.id === 'saveFile') this.readSaveFile(t);
      if (t.id === 'sndOn') {
        this.hooks.sound.set({ ...this.hooks.sound.get(), on: t.checked });
        this.hooks.sfx('ui');
        this.render();
      }
      // play a sample once the slider is let go, so the player hears the new level
      if (t.id === 'sndVol') this.hooks.sfx('pickup');
    });
    this.body.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'saveCode') this.codeDraft = t.value;
      if (t.id === 'sndVol') this.hooks.sound.set({ ...this.hooks.sound.get(), volume: Number(t.value) / 100 });
      if (t.id === 'sndMusic') this.hooks.sound.set({ ...this.hooks.sound.get(), music: Number(t.value) / 100 });
    });
    this.body.addEventListener('click', (e) => this.onClick(e));
    hud.onLog = () => {
      if (this.isOpen && this.tab === 'bag') this.dirty = true;
    };
  }

  get isOpen(): boolean {
    return !this.sheet.hidden;
  }

  open(tab: Tab = this.tab): void {
    this.tab = tab;
    this.sheet.hidden = false;
    this.scrim.hidden = false;
    this.hooks.opened();
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.sheet.hidden = true;
    this.scrim.hidden = true;
    this.hooks.closed();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Called every frame; re-renders when dirty, and the farm tab once a second for timers. */
  tick(dt: number): void {
    if (!this.isOpen) return;
    this.refreshT -= dt;
    if (this.dirty || (this.tab === 'farm' && this.refreshT <= 0)) {
      this.refreshT = 1;
      this.render();
    }
  }

  render(): void {
    this.dirty = false;
    this.sheet.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const on = this.hooks.sound.get().on;
    const sb = $(this.sheet, '#sheetSound');
    sb.innerHTML = on ? ICONS.soundOn : ICONS.soundOff;
    sb.classList.toggle('off', !on);
    sb.setAttribute('aria-pressed', String(on));
    sb.setAttribute('aria-label', on ? th.hud.soundOn : th.hud.soundOff);
    sb.title = on ? th.hud.soundOn : th.hud.soundOff;
    const s = this.s();
    const views: Record<Tab, (st: GameState) => string> = {
      bag: (st) => this.bag(st),
      forge: (st) => this.forge(st),
      kitchen: (st) => this.kitchen(st),
      farm: (st) => this.farm(st),
      book: (st) => this.book(st),
      map: (st) => this.worldMap(st),
    };
    const html = views[this.tab](s);
    const list = this.body.querySelector<HTMLElement>('.flist');
    const keep = list ? { left: list.scrollLeft, top: list.scrollTop } : null;
    this.body.innerHTML = html;
    const next = this.body.querySelector<HTMLElement>('.flist');
    if (keep && next) {
      next.scrollLeft = keep.left;
      next.scrollTop = keep.top;
    }
    // the chosen weapon-type / armor-slot tab may sit off the edge of the scrolling tab row on phones
    const tab = this.body.querySelector<HTMLElement>('.ftypes .on');
    if (tab?.parentElement) {
      const row = tab.parentElement;
      if (tab.offsetLeft < row.scrollLeft || tab.offsetLeft + tab.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = tab.offsetLeft - 8;
    }
  }

  private req(s: GameState, rec: ItemBag): string {
    return Object.entries(rec)
      .map(([k, n]) => {
        const have = s.inv[k as MaterialId];
        return `<span class="${have >= (n ?? 0) ? 'have' : 'miss'}">${img(materialIconUrl(k as MaterialId), 'ico sm')}${th.materials[k as MaterialId]} ${have}/${n}</span>`;
      })
      .join('');
  }

  private villageNote(s: GameState): string {
    return s.player.inVillage ? `<p class="note ok">${th.menu.inVillage}</p>` : `<p class="note warn">${th.menu.notInVillage}</p>`;
  }

  /** Bag tab: sub-menu (items / hunt / settings), then the chosen view. */
  private bag(s: GameState): string {
    const G = th.menu.bagTab;
    const subs: [BagSub, string, string][] = [
      ['items', ICONS.tab_bag, G.items],
      ['hunt', ICONS.tab_book, G.hunt],
      ['settings', ICONS.soundOn, G.settings],
    ];
    const nav = `<nav class="fsub">${subs.map(([k, ic, label]) => `<button type="button" class="${this.bagSub === k ? 'on' : ''}" data-bsub="${k}">${ic}<span>${label}</span></button>`).join('')}</nav>`;
    const body = this.bagSub === 'hunt' ? this.bagHunt(s) : this.bagSub === 'settings' ? this.bagSettings() : this.bagItemsView(s);
    return `<div class="forge bag2">${nav}${body}</div>`;
  }

  /** Character card: equipment slots around the portrait, stats, active armor perks. */
  private characterCard(s: GameState): string {
    const p = s.player;
    const M = th.menu;
    const wkey: ItemKey = `w:${p.weapon}`;
    const wslot = `<button type="button" class="slot${this.sel === wkey ? ' sel' : ''}" data-item="${wkey}" aria-label="${M.slots.weapon}">${img(weaponIconUrl(p.weapon))}<span>${M.slots.weapon}</span></button>`;
    const [head, body, charm] = ARMOR_SLOTS.map((k) => {
      const id = s.armor[k];
      if (!id) return `<div class="slot empty">${img(armorSlotIconUrl(k))}<span>${M.slots[k]}</span></div>`;
      const key: ItemKey = `a:${id}`;
      return `<button type="button" class="slot${this.sel === key ? ' sel' : ''}" data-item="${key}" aria-label="${th.armor[id].name}">${img(armorIconUrl(id))}<span>${M.slots[k]}</span></button>`;
    });
    let h = `<aside class="fcompare bagchar"><h4>${th.menu.bagTab.character}</h4><div class="eqp"><div class="slots">${wslot}${head}</div><div class="hero">${img(playerIconUrl(), 'portrait')}</div><div class="slots">${body}${charm}</div></div>`;
    const atk = Math.round(weaponPower(s, p.weapon) * attackMul(s));
    h += `<ul class="fstats">${this.statRow(M.stats.attack, `${atk}`)}${this.statRow(M.stats.defense, `${defenseOf(s)} · ${M.reduction(Math.round(damageReduction(s) * 100))}`)}${this.statRow(M.stats.hp, `${p.maxHp}`)}${this.statRow(M.stats.stamina, `${p.maxSt}`)}</ul>`;
    const perksOn = activePerks(s);
    if (perksOn.length) h += `<p class="perk on"><b>${M.activePerks}</b> ${perksOn.map((k) => th.perks[k].name).join(' · ')}</p>`;
    return `${h}</aside>`;
  }

  /** Display tier of a bag entry, for its glow colour. */
  private itemTier(key: ItemKey): number {
    if (key.startsWith('w:')) return gearTier(WEAPONS[key.slice(2) as WeaponId].recipe);
    if (key.startsWith('a:')) return gearTier(ARMOR[key.slice(2) as ArmorId].recipe);
    if (key.startsWith('m:')) {
      const r = MATERIALS[key.slice(2) as MaterialId].rarity ?? 0;
      return r === 2 ? 3 : r === 1 ? 2 : 0;
    }
    return 1;
  }

  private bagItemsView(s: GameState): string {
    const M = th.menu;
    const all = this.bagItems(s);
    const tabs = FILTERS.map((f) => {
      const n = all.filter((it) => f === 'all' || this.matchesFilter(it.key, f)).length;
      return `<button type="button" class="${this.filter === f ? 'on' : ''}" data-filter="${f}"><span>${M.filters[f]}</span><small>${n}</small></button>`;
    }).join('');
    const items = all.filter((it) => this.matches(it.key));
    const wkey: ItemKey = `w:${s.player.weapon}`;
    if (this.sel && this.sel !== wkey && !this.sel.startsWith('a:') && !items.some((it) => it.key === this.sel)) this.sel = null;
    const cells = items.map(
      (it) =>
        `<button type="button" class="cell t${this.itemTier(it.key)}${this.sel === it.key ? ' sel' : ''}${it.equipped ? ' eq' : ''}" data-item="${it.key}" aria-label="${it.name}">${img(it.icon)}${it.count !== null ? `<b>${it.count}</b>` : ''}</button>`,
    );
    for (let i = cells.length; i < MIN_CELLS; i++) cells.push('<div class="cell blank"></div>');
    const detail = this.sel ? this.detail(s, this.sel) : `<div class="fdetail empty"><p class="note">${items.length ? M.bagHelp : M.bagEmpty}</p></div>`;
    return `<section class="fmain"><div class="ftypes">${tabs}</div><div class="fbody"><div class="grid">${cells.join('')}</div>${detail}</div></section>${this.characterCard(s)}`;
  }

  /** Goal, the elder's request and the weapon's skills. */
  private bagHunt(s: GameState): string {
    const M = th.menu;
    const goal = th.goals[goalIndex(s)];
    let h = '<section class="fmain bagtext">';
    if (goal) h += `<div class="goalbox"><b>${goal.title}</b><p>${goal.desc}</p></div>`;
    h += this.requestCard(s);
    h += `<h3 class="sec">${M.skills}</h3><div class="skl">${weaponSkills(s.player.weapon)
      .map((id) => `<div><span class="sico">${SKILL_ICONS[id] ?? ''}</span><b>${th.skills[id].name}</b><span class="meta">${th.skills[id].desc} · ${M.cooldown(SKILLS[id].cooldown)}</span></div>`)
      .join('')}<div><span class="sico">${ICONS.attack}</span><b>${M.partsTitle}</b><span class="meta">${M.partsHelp}</span></div></div>`;
    return `${h}</section>`;
  }

  /** Sound, log and new game. */
  private bagSettings(): string {
    const M = th.menu;
    const snd = this.hooks.sound.get();
    let h = '<section class="fmain bagtext">';
    h += `<div class="sound"><h3 class="sec">${M.sound.title}</h3><label class="chk"><input type="checkbox" id="sndOn" ${snd.on ? 'checked' : ''}>${M.sound.on}</label><label class="vol"><span>${M.sound.volume}</span><input type="range" id="sndVol" min="0" max="100" step="5" value="${Math.round(snd.volume * 100)}" aria-label="${M.sound.volume}" ${snd.on ? '' : 'disabled'}></label><label class="vol"><span>${M.sound.music}</span><input type="range" id="sndMusic" min="0" max="100" step="5" value="${Math.round(snd.music * 100)}" aria-label="${M.sound.music}" ${snd.on ? '' : 'disabled'}></label></div>`;
    // auto-drink threshold: segmented buttons, one tap each
    const cur = this.s().autoPotion;
    const opts = TUNING.player.potion.autoOptions
      .map((v) => `<button type="button" class="seg${v === cur ? ' on' : ''}" data-autopot="${v}" aria-pressed="${v === cur}">${v === 0 ? M.autoPotion.off : `${Math.round(v * 100)}%`}</button>`)
      .join('');
    h += `<div class="autopot"><h3 class="sec">${M.autoPotion.title}</h3><p class="note">${M.autoPotion.help}</p><div class="segs">${opts}</div></div>`;
    const T = M.transfer;
    const loadArmed = Date.now() - this.loadArm < 3000;
    h += `<div class="transfer"><h3 class="sec">${T.title}</h3><p class="note">${T.help}</p><div class="tbtns"><button type="button" class="btn" id="btnCopySave">${T.copy}</button><button type="button" class="btn" id="btnDlSave">${T.download}</button></div><textarea id="saveCode" rows="3" spellcheck="false" autocomplete="off" placeholder="${T.placeholder}" aria-label="${T.placeholder}">${escapeHtml(this.codeDraft)}</textarea><div class="tbtns"><label class="btn" for="saveFile">${T.file}</label><input type="file" id="saveFile" accept=".txt,.json,text/plain,application/json" hidden><button type="button" class="btn${loadArmed ? ' warn' : ''}" id="btnLoadSave">${loadArmed ? T.confirmLoad : T.load}</button></div></div>`;
    const armed = Date.now() - this.resetArm < 3000;
    h += `<div class="row"><h3 class="sec">${M.log}</h3><button type="button" class="btn" id="btnReset">${armed ? M.confirmNewGame : M.newGame}</button></div>`;
    h += `<ul class="log">${this.hud.log.map((l) => `<li class="${l.cls}">${escapeHtml(l.msg)}</li>`).join('')}</ul>`;
    return `${h}</section>`;
  }

  /** Copies the transfer code; when the clipboard is blocked, shows it selected in the box instead. */
  private copySave(): void {
    const code = exportCode(this.s());
    const shown = (): void => {
      this.codeDraft = code;
      const box = this.body.querySelector<HTMLTextAreaElement>('#saveCode');
      if (box) {
        box.value = code;
        box.focus();
        box.select();
      }
    };
    const fail = (): void => {
      shown();
      this.hud.toast(th.menu.transfer.copyManual);
    };
    this.hooks.sfx('ui');
    try {
      navigator.clipboard.writeText(code).then(() => this.hud.toast(th.menu.transfer.copied, 'gold'), fail);
    } catch {
      fail();
    }
  }

  private downloadSave(): void {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportCode(this.s())], { type: 'text/plain' }));
    a.download = `pranpongprai-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.hooks.sfx('ui');
  }

  /** Puts a chosen save file's text in the import box (the player still confirms the import). */
  private readSaveFile(input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (!f || f.size > 1_000_000) return;
    void f.text().then((text) => {
      this.codeDraft = text.trim();
      const box = this.body.querySelector<HTMLTextAreaElement>('#saveCode');
      if (box) box.value = this.codeDraft;
      if (!parseCode(this.codeDraft)) {
        this.hooks.sfx('error');
        this.hud.toast(th.menu.transfer.bad, 'bad');
      }
    });
  }

  /** The elder's current hunt request with progress and reward. */
  private requestCard(s: GameState): string {
    const R = th.request;
    const r = currentRequest(s);
    if (!r) return `<div class="goalbox reqbox" id="reqbox"><b>${R.title}</b><p>${allRequestsDone(s) ? R.allDone : R.none}</p></div>`;
    const pct = Math.min(100, (s.requests.progress / r.goal.count) * 100);
    const ready = s.requests.progress >= r.goal.count;
    return `<div class="goalbox reqbox${ready ? ' ready' : ''}" id="reqbox"><b>${R.title}</b><p>${requestText(r)} <span class="n">${s.requests.progress}/${r.goal.count}</span></p><span class="reqbar"><i style="width:${pct}%"></i></span><p class="meta">${R.reward}: ${rewardText(r)}</p>${ready ? `<p class="note ok">${R.claimHint}</p>` : ''}</div>`;
  }

  /** Opens the bestiary on one monster (the hunters' tips). */
  openBook(k: MonsterId): void {
    this.bookArea = 'all';
    this.bookSel = k;
    this.open('book');
  }

  /** Opens the bag tab scrolled to the hunt request (talking to the elder). */
  openRequests(): void {
    this.bagSub = 'hunt';
    this.open('bag');
    this.body.querySelector('#reqbox')?.scrollIntoView({ block: 'center' });
  }

  /** Everything the player holds: owned weapons, potions, then materials with a count. */
  private bagItems(s: GameState): BagItem[] {
    const out: BagItem[] = [];
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (s.owned.has(id)) out.push({ key: `w:${id}`, icon: weaponIconUrl(id), name: th.weaponName(id, weaponLevel(s, id)), count: weaponLevel(s, id) ? `+${weaponLevel(s, id)}` : null, rarity: 0, equipped: s.player.weapon === id });
    }
    for (const id of ARMOR_IDS) {
      if (s.ownedArmor.has(id)) out.push({ key: `a:${id}`, icon: armorIconUrl(id), name: th.armorName(id, armorLevel(s, id)), count: null, rarity: 0, equipped: s.armor[ARMOR[id].slot] === id });
    }
    if (s.player.potions > 0) out.push({ key: 'potion', icon: potionIconUrl(), name: th.menu.potionName, count: s.player.potions, rarity: 0, equipped: false });
    for (const id of MATERIAL_IDS) {
      const n = s.inv[id];
      if (n > 0) out.push({ key: `m:${id}`, icon: materialIconUrl(id), name: th.materials[id], count: n, rarity: MATERIALS[id].rarity ?? 0, equipped: false });
    }
    return out;
  }

  private matches(key: ItemKey): boolean {
    return this.matchesFilter(key, this.filter);
  }

  private matchesFilter(key: ItemKey, f: BagFilter): boolean {
    if (f === 'all') return true;
    if (key === 'potion' || key.startsWith('w:') || key.startsWith('a:')) return f === 'gear';
    return MATERIALS[key.slice(2) as MaterialId].category === f;
  }

  /** Info card for the selected bag item, in the forge's detail style. */
  private detail(s: GameState, key: ItemKey): string {
    const M = th.menu;
    const G = th.menu.bagTab;
    if (key.startsWith('w:')) return this.weaponDetail(s, key.slice(2) as WeaponId, 'craft');
    if (key.startsWith('a:')) return this.armorDetail(s, key.slice(2) as ArmorId);
    if (key === 'potion') {
      return `<div class="fdetail t1"><div class="fhead"><div class="fhero">${img(potionIconUrl(), 'big')}</div><div><h3>${M.potionName}</h3><p class="meta">${M.have(s.player.potions)} · ${M.potionDesc(TUNING.player.potion.heal)}</p></div></div></div>`;
    }
    const id = key.slice(2) as MaterialId;
    const m = MATERIALS[id];
    const tier = this.itemTier(key);
    const badge = m.rarity ? `<span class="badge t${tier}">${th.rarity[m.rarity]}</span>` : '';
    const src = itemSources(id).map((x) => `<li>${sourceText(x)}</li>`).join('') || `<li class="meta">${M.noSource}</li>`;
    const use = itemUses(id).map((x) => `<li>${useText(x)}</li>`).join('') || `<li class="meta">${M.noUse}</li>`;
    return `<div class="fdetail t${tier}"><div class="fhead"><div class="fhero">${img(materialIconUrl(id), 'big')}</div><div><h3>${th.materials[id]}</h3>${badge}<p class="meta">${M.have(s.inv[id])}</p></div></div><h4>${G.sources}</h4><ul class="flines">${src}</ul><h4>${G.uses}</h4><ul class="flines">${use}</ul></div>`;
  }

  /** Materials as rows: icon, name, have/need, tick or cross. */
  private reqRows(s: GameState, rec: ItemBag): string {
    const rows = Object.entries(rec).map(([k, n]) => {
      const id = k as MaterialId;
      const need = n ?? 0;
      const have = s.inv[id];
      const ok = have >= need;
      return `<li class="${ok ? 'have' : 'miss'}">${img(materialIconUrl(id), 'ico sm')}<span>${th.materials[id]}</span><b>${have}/${need}</b><i>${ok ? '✓' : '✗'}</i></li>`;
    });
    return `<ul class="freq">${rows.join('')}</ul>`;
  }

  /** One stat row, with an optional difference against the gear in use. */
  private statRow(label: string, value: string, delta = 0): string {
    const d = Math.round(delta);
    const diff = d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</em>` : '';
    return `<li><span>${label}</span><b>${value}</b>${diff}</li>`;
  }

  private badge(tier: number): string {
    return `<span class="badge t${tier}">${th.menu.forge.tiers[tier] ?? ''}</span>`;
  }

  /** Forge tab: a sub-menu (craft / upgrade / armor), a filtered list, the selected item, and a comparison on wide screens. */
  private forge(s: GameState): string {
    const F = th.menu.forge;
    const subs: [ForgeSub, string, string][] = [
      ['craft', ICONS.tab_forge, F.craft],
      ['upgrade', ICONS.up, F.upgrade],
      ['armor', ICONS.shield, F.armor],
    ];
    const nav = subs.map(([k, ic, label]) => `<button type="button" class="${this.forgeSub === k ? 'on' : ''}" data-fsub="${k}">${ic}<span>${label}</span></button>`).join('');
    const body = this.forgeSub === 'armor' ? this.forgeArmor(s) : this.forgeWeapons(s);
    return `${this.villageNote(s)}<div class="forge"><nav class="fsub">${nav}${this.potionCard(s)}<p class="fhint">${F.hint}</p></nav>${body}</div>`;
  }

  private potionCard(s: GameState): string {
    const P = TUNING.player.potion;
    const ok = s.player.inVillage && s.inv.herb >= P.herbCost;
    return `<div class="fpotion">${img(potionIconUrl())}<div><b>${th.menu.potionName}</b><span>${th.menu.potionMeta(P.heal, s.player.potions)}</span><span class="${s.inv.herb >= P.herbCost ? 'have' : 'miss'}">${th.materials.herb} ${s.inv.herb}/${P.herbCost}</span></div><button type="button" data-potion="1" ${ok ? '' : 'disabled'}>${th.menu.brew}</button></div>`;
  }

  private forgeWeapons(s: GameState): string {
    const F = th.menu.forge;
    const p = s.player;
    const upgrading = this.forgeSub === 'upgrade';
    const tabs = WEAPON_TYPE_ORDER.map(
      (t) => `<button type="button" class="${this.forgeType === t ? 'on' : ''}" data-ftype="${t}">${img(weaponIconUrl(TYPE_ICON_WEAPON[t]), 'ico sm')}<span>${th.weaponTypes[t]}</span></button>`,
    ).join('');
    const list = (Object.keys(WEAPONS) as WeaponId[]).filter((k) => WEAPONS[k].type === this.forgeType && (!upgrading || s.owned.has(k)));
    const sel = this.forgeSel && list.includes(this.forgeSel) ? this.forgeSel : list.includes(p.weapon) ? p.weapon : (list[0] ?? null);
    this.forgeSel = sel;
    const items = list.map((k) => {
      const w = WEAPONS[k];
      const tier = gearTier(w.recipe);
      const state = p.weapon === k ? F.equipped : s.owned.has(k) ? F.owned : w.recipe && canAfford(s.inv, w.recipe) ? F.ready : '';
      const cls = p.weapon === k ? 'eq' : s.owned.has(k) ? 'own' : state ? 'ready' : '';
      return `<button type="button" class="fitem t${tier}${k === sel ? ' sel' : ''}" data-fsel="${k}">${img(weaponIconUrl(k))}<span class="fname">${th.weaponName(k, weaponLevel(s, k))}</span>${this.badge(tier)}${state ? `<span class="fstate ${cls}">${state}</span>` : ''}</button>`;
    });
    const detail = sel ? this.weaponDetail(s, sel) : `<p class="note">${F.noneOwned}</p>`;
    const hint = upgrading ? `<p class="note">${th.menu.upgradeHint(WEAPONS_DATA.upgrade.finalLevel, WEAPONS_DATA.upgrade.maxLevel)}</p>` : '';
    return `<section class="fmain"><div class="ftypes">${tabs}</div>${hint}<div class="fbody"><div class="flist">${items.join('')}</div>${detail}</div></section>${this.weaponCompare(s)}`;
  }

  private weaponDetail(s: GameState, k: WeaponId, mode: ForgeSub = this.forgeSub): string {
    const F = th.menu.forge;
    const p = s.player;
    const w = WEAPONS[k];
    const tier = gearTier(w.recipe);
    const own = s.owned.has(k);
    const eq = p.weapon === k;
    const iv = p.inVillage;
    const lv = weaponLevel(s, k);
    const UP = WEAPONS_DATA.upgrade;
    const upgrading = mode === 'upgrade';
    const power = weaponPower(s, k);
    const next = upgrading && lv < UP.maxLevel ? w.damage * (UP.damageMul[lv + 1] ?? 1) : null;
    const curPower = weaponPower(s, p.weapon);
    const speed = w.rate < 0.5 ? th.menu.speed.fast : w.rate < 0.8 ? th.menu.speed.mid : th.menu.speed.slow;
    let rows = '';
    if (next !== null) rows += this.statRow(F.power, `${Math.round(power)} → ${Math.round(next)}`, next - power);
    else rows += this.statRow(F.power, `${Math.round(power)}`, eq ? 0 : power - curPower);
    rows += this.statRow(F.speed, `${speed} · ${w.rate} วิ`);
    rows += this.statRow(F.head, `×${w.partMul.head}`);
    rows += this.statRow(F.tail, `×${w.partMul.tail}`);
    if (w.stun) rows += this.statRow(F.stun, `${w.stun}`);
    if (w.projectile) rows += this.statRow(F.range, `${w.range}`);
    if (own) rows += this.statRow(F.level, `+${lv} / +${UP.maxLevel}`);
    const sig = th.skills[w.signature];
    const sigHtml = `<div class="fsig">${SKILL_ICONS[w.signature] ?? ''}<div><b>${F.signature} · ${sig.name}</b><span>${sig.desc}</span></div></div>`;

    let mats = '';
    let btns = '';
    if (upgrading) {
      const cost = upgradeCost(s, k);
      mats = cost ? `<h4>${F.upgradeCost(lv + 1)}</h4>${this.reqRows(s, cost)}` : `<p class="note ok">${th.menu.maxLevel}</p>`;
      if (cost) btns += `<button type="button" class="fbtn primary" data-upgrade="${k}" ${iv && canAfford(s.inv, cost) ? '' : 'disabled'}>${ICONS.up}${th.menu.upgrade(lv + 1)}</button>`;
      if (!eq) btns += `<button type="button" class="fbtn" data-equip="${k}" ${iv ? '' : 'disabled'}>${th.menu.equip}</button>`;
    } else {
      if (!own) mats = w.recipe ? `<h4>${F.materials}</h4>${this.reqRows(s, w.recipe)}` : `<p class="note">${F.starter}</p>`;
      if (eq) btns = `<button type="button" class="fbtn" disabled>${th.menu.equipped}</button>`;
      else if (own) btns = `<button type="button" class="fbtn" data-equip="${k}" ${iv ? '' : 'disabled'}>${th.menu.equip}</button>`;
      else btns = `<button type="button" class="fbtn primary" data-craft="${k}" ${iv && w.recipe && canAfford(s.inv, w.recipe) ? '' : 'disabled'}>${ICONS.tab_forge}${th.menu.craft}</button>`;
    }
    return `<div class="fdetail t${tier}"><div class="fhead"><div class="fhero">${img(weaponIconUrl(k), 'big')}</div><div><h3>${th.weaponName(k, lv)}</h3>${this.badge(tier)}<p class="meta">${th.weaponTypes[w.type]} · ${th.weapons[k].desc}</p></div></div><ul class="fstats">${rows}</ul>${mats}<div class="fbtns">${btns}</div>${sigHtml}${strongVs(s, k)}</div>`;
  }

  /** Wide screens: the weapon in hand, to compare against. */
  private weaponCompare(s: GameState): string {
    const F = th.menu.forge;
    const k = s.player.weapon;
    const w = WEAPONS[k];
    const speed = w.rate < 0.5 ? th.menu.speed.fast : w.rate < 0.8 ? th.menu.speed.mid : th.menu.speed.slow;
    const rows = this.statRow(F.power, `${Math.round(weaponPower(s, k))}`) + this.statRow(F.speed, speed) + this.statRow(F.head, `×${w.partMul.head}`) + this.statRow(F.tail, `×${w.partMul.tail}`);
    return `<aside class="fcompare"><h4>${F.current}</h4><div class="fhero sm">${img(weaponIconUrl(k), 'big')}</div><b>${th.weaponName(k, weaponLevel(s, k))}</b>${this.badge(gearTier(w.recipe))}<ul class="fstats">${rows}</ul></aside>`;
  }

  private forgeArmor(s: GameState): string {
    const F = th.menu.forge;
    const tabs = ARMOR_SLOTS.map(
      (slot) => `<button type="button" class="${this.armorSlot === slot ? 'on' : ''}" data-aslot="${slot}">${img(armorSlotIconUrl(slot), 'ico sm')}<span>${th.menu.slots[slot]}</span></button>`,
    ).join('');
    const list = ARMOR_IDS.filter((id) => ARMOR[id].slot === this.armorSlot);
    const worn = s.armor[this.armorSlot];
    const sel = this.armorSel && list.includes(this.armorSel) ? this.armorSel : worn && list.includes(worn) ? worn : (list[0] ?? null);
    this.armorSel = sel;
    const items = list.map((id) => {
      const a = ARMOR[id];
      const tier = gearTier(a.recipe);
      const state = worn === id ? F.worn : s.ownedArmor.has(id) ? F.owned : canAfford(s.inv, a.recipe) ? F.ready : '';
      const cls = worn === id ? 'eq' : s.ownedArmor.has(id) ? 'own' : state ? 'ready' : '';
      return `<button type="button" class="fitem t${tier}${id === sel ? ' sel' : ''}" data-asel="${id}">${img(armorIconUrl(id))}<span class="fname">${th.armorName(id, armorLevel(s, id))}</span>${this.badge(tier)}${state ? `<span class="fstate ${cls}">${state}</span>` : ''}</button>`;
    });
    const detail = sel ? this.armorDetail(s, sel) : '';
    const cur = worn ? ARMOR[worn] : null;
    const compare = cur && worn
      ? `<aside class="fcompare"><h4>${F.current}</h4><div class="fhero sm">${img(armorIconUrl(worn), 'big')}</div><b>${th.armorName(worn, armorLevel(s, worn))}</b>${this.badge(gearTier(cur.recipe))}<ul class="fstats">${this.statRow(th.menu.stats.defense, `${armorStat(s, worn, 'defense')}`)}${this.statRow(th.menu.stats.hp, `+${armorStat(s, worn, 'maxHp')}`)}${this.statRow(th.menu.stats.stamina, `+${armorStat(s, worn, 'stamina')}`)}</ul></aside>`
      : `<aside class="fcompare"><h4>${F.current}</h4><p class="note">${F.nothingWorn}</p></aside>`;
    return `<section class="fmain"><div class="ftypes">${tabs}</div><p class="note">${th.menu.armorUpgradeHint(ARMOR_UPGRADE.maxLevel)}</p><div class="fbody"><div class="flist">${items.join('')}</div>${detail}</div></section>${compare}`;
  }

  private armorDetail(s: GameState, id: ArmorId): string {
    const a = ARMOR[id];
    const tier = gearTier(a.recipe);
    const iv = s.player.inVillage;
    const own = s.ownedArmor.has(id);
    const worn = s.armor[a.slot];
    const on = worn === id;
    const S = th.menu.stats;
    const lv = armorLevel(s, id);
    const up = own ? armorUpgradeCost(s, id) : null;
    const st = (k: 'defense' | 'maxHp' | 'stamina', l = lv): number => armorStat(s, id, k, l);
    const wornSt = (k: 'defense' | 'maxHp' | 'stamina'): number => (worn ? armorStat(s, worn, k) : 0);
    // owned pieces show what the next level adds; others compare against the piece worn now
    const row = (label: string, k: 'defense' | 'maxHp' | 'stamina', plus: string): string =>
      a[k] === 0 && wornSt(k) === 0 ? '' : up ? this.statRow(label, `${plus}${st(k)} → ${plus}${st(k, lv + 1)}`, st(k, lv + 1) - st(k)) : this.statRow(label, `${plus}${st(k)}`, on ? 0 : st(k) - wornSt(k));
    let rows = row(S.defense, 'defense', '') + row(S.hp, 'maxHp', '+') + row(S.stamina, 'stamina', '+');
    if (own) rows += this.statRow(th.menu.forge.level, `+${lv} / +${ARMOR_UPGRADE.maxLevel}`);
    let btn: string;
    if (on) btn = `<button type="button" class="fbtn" data-unequip="${id}" ${iv ? '' : 'disabled'}>${th.menu.unequip}</button>`;
    else if (own) btn = `<button type="button" class="fbtn" data-wear="${id}" ${iv ? '' : 'disabled'}>${th.menu.wear}</button>`;
    else btn = `<button type="button" class="fbtn primary" data-armorcraft="${id}" ${iv && canAfford(s.inv, a.recipe) ? '' : 'disabled'}>${ICONS.shield}${th.menu.craftArmor}</button>`;
    let mats = own ? '' : `<h4>${th.menu.forge.materials}</h4>${this.reqRows(s, a.recipe)}`;
    if (own && up) {
      mats = `<h4>${th.menu.forge.upgradeCost(lv + 1)}</h4>${this.reqRows(s, up)}`;
      btn = `<button type="button" class="fbtn primary" data-armorup="${id}" ${iv && canAfford(s.inv, up) ? '' : 'disabled'}>${ICONS.up}${th.menu.upgrade(lv + 1)}</button>${btn}`;
    } else if (own) mats = `<p class="note ok">${th.menu.maxLevel}</p>`;
    return `<div class="fdetail t${tier}"><div class="fhead"><div class="fhero">${img(armorIconUrl(id), 'big')}</div><div><h3>${th.armorName(id, lv)}</h3>${this.badge(tier)}<p class="meta">${th.menu.slots[a.slot]} · ${th.armor[id].desc}</p></div></div><ul class="fstats">${rows}</ul>${mats}<div class="fbtns">${btn}</div>${perkLines(s, id)}</div>`;
  }

  /** Effect rows of a meal, with differences against the meal being eaten now. */
  private mealRows(e: MealEffect, cur: MealEffect | null): string {
    const K = th.menu.cookTab;
    const pct = (m: number | undefined): number => Math.round(((m ?? 1) - 1) * 100);
    let rows = '';
    if (e.maxHpBonus) rows += this.statRow(K.hp, `+${e.maxHpBonus}`, cur ? e.maxHpBonus - (cur.maxHpBonus ?? 0) : 0);
    if (e.attackMul) rows += this.statRow(K.atk, `+${pct(e.attackMul)}%`, cur ? pct(e.attackMul) - pct(cur.attackMul) : 0);
    if (e.defense) rows += this.statRow(K.def, `+${e.defense}`, cur ? e.defense - (cur.defense ?? 0) : 0);
    if (e.staminaRegenMul) rows += this.statRow(K.regen, `×${e.staminaRegenMul}`);
    if (e.dodgeCost) rows += this.statRow(K.dodge, `${TUNING.player.roll.staminaCost} → ${e.dodgeCost}`);
    return rows;
  }

  /** Kitchen tab, laid out like the forge: what you are eating | filter, list, selected dish | comparison. */
  private kitchen(s: GameState): string {
    const K = th.menu.cookTab;
    const cur = activeMeal(s);
    const curFx = cur ? MEALS[cur].effect : null;
    const nowCard = cur && s.player.meal
      ? `<div class="fpotion fmeal" style="--tc:${MEALS[cur].color}">${img(mealIconUrl(cur))}<div><b>${K.current}</b><span class="now">${th.meals[cur].name}</span><span>${th.menu.mealLeft(fmtTime((s.player.meal.until - s.now) / 1000))}</span></div></div>`
      : `<div class="fpotion fmeal"><span class="fmeal-ico">${ICONS.bowl}</span><div><b>${K.current}</b><span>${K.none}</span></div></div>`;
    const nav = `<nav class="fsub">${nowCard}<p class="note">${K.rule}</p><p class="fhint">${K.hint}</p></nav>`;

    const icons: Record<MealFilter, string> = { all: ICONS.bowl, hp: ICONS.heart, atk: ICONS.attack, def: ICONS.shield, st: ICONS.dodge };
    const tabs = MEAL_FILTERS.map((f) => `<button type="button" class="${this.mealFilter === f ? 'on' : ''}" data-kfilter="${f}">${icons[f]}<span>${K.filters[f]}</span></button>`).join('');
    const ids = (Object.keys(MEALS) as MealId[]).filter((id) => this.mealFilter === 'all' || mealGroups(MEALS[id].effect).includes(this.mealFilter));
    const sel = this.mealSel && ids.includes(this.mealSel) ? this.mealSel : cur && ids.includes(cur) ? cur : (ids[0] ?? null);
    this.mealSel = sel;
    const iv = s.player.inVillage;
    const items = ids.map((id) => {
      const m = MEALS[id];
      const can = canAfford(s.inv, m.recipe);
      const on = cur === id;
      // the dish card selects; the small button cooks straight away (one tap, pillar 1)
      return `<div class="fcard${id === sel ? ' sel' : ''}${on ? ' eq' : ''}" style="--tc:${m.color}"><button type="button" class="fitem" data-ksel="${id}">${img(mealIconUrl(id))}<span class="fname">${th.meals[id].name}</span>${this.mealChips(m.effect)}</button><button type="button" class="fquick" data-meal="${id}" ${iv && can && !on ? '' : 'disabled'}>${on ? K.eating : K.cook}</button></div>`;
    });
    const detail = sel ? this.mealDetail(s, sel, curFx) : '';
    const compare = cur && curFx
      ? `<aside class="fcompare" style="--tc:${MEALS[cur].color}"><h4>${K.current}</h4><div class="fhero sm">${img(mealIconUrl(cur), 'big')}</div><b>${th.meals[cur].name}</b><ul class="fstats">${this.mealRows(curFx, null)}</ul></aside>`
      : `<aside class="fcompare"><h4>${K.current}</h4><p class="note">${K.none}</p></aside>`;
    return `${this.villageNote(s)}<div class="forge kitchen2">${nav}<section class="fmain"><div class="ftypes">${tabs}</div><div class="fbody"><div class="flist">${items.join('')}</div>${detail}</div>${this.pantry(s)}</section>${compare}</div>`;
  }

  /** Effects as icon + number chips (heart +30, sword +20% ...). */
  private mealChips(e: MealEffect): string {
    const pct = (m: number): number => Math.round((m - 1) * 100);
    const chips: string[] = [];
    if (e.maxHpBonus) chips.push(`<i class="hp">${ICONS.heart}+${e.maxHpBonus}</i>`);
    if (e.attackMul) chips.push(`<i class="atk">${ICONS.attack}+${pct(e.attackMul)}%</i>`);
    if (e.defense) chips.push(`<i class="def">${ICONS.shield}+${e.defense}</i>`);
    if (e.staminaRegenMul) chips.push(`<i class="st">${ICONS.dodge}×${e.staminaRegenMul}</i>`);
    else if (e.dodgeCost) chips.push(`<i class="st">${ICONS.dodge}${e.dodgeCost}</i>`);
    return `<span class="fchips">${chips.join('')}</span>`;
  }

  /** Every cooking ingredient the player holds (dimmed when out). */
  private pantry(s: GameState): string {
    const used = new Set<MaterialId>();
    for (const m of Object.values(MEALS)) for (const k of Object.keys(m.recipe)) used.add(k as MaterialId);
    const chips = [...used].map((id) => `<span class="${s.inv[id] > 0 ? '' : 'out'}">${img(materialIconUrl(id), 'ico sm')}${th.materials[id]}<b>${s.inv[id]}</b></span>`).join('');
    return `<div class="fpantry"><h4>${th.menu.cookTab.pantry}</h4><div>${chips}</div></div>`;
  }

  private mealDetail(s: GameState, id: MealId, curFx: MealEffect | null): string {
    const K = th.menu.cookTab;
    const m = MEALS[id];
    const on = activeMeal(s) === id;
    const iv = s.player.inVillage;
    // missing ingredients say where to get them (the farm feeds the hunt)
    const where = Object.entries(m.recipe)
      .filter(([k, n]) => s.inv[k as MaterialId] < (n ?? 0))
      .map(([k]) => {
        const src = itemSources(k as MaterialId)[0];
        return src ? `<li>${img(materialIconUrl(k as MaterialId), 'ico sm')}${th.materials[k as MaterialId]} · ${K.from(sourceText(src))}</li>` : '';
      })
      .join('');
    const btn = `<button type="button" class="fbtn primary" data-meal="${id}" ${iv && canAfford(s.inv, m.recipe) && !on ? '' : 'disabled'}>${ICONS.bowl}${on ? th.menu.eating : th.menu.cookAndEat}</button>`;
    return `<div class="fdetail" style="--tc:${m.color}"><div class="fhead"><div class="fhero">${img(mealIconUrl(id), 'big')}</div><div><h3>${th.meals[id].name}</h3><p class="meta">${th.meals[id].desc}</p></div></div><h4>${K.effects}</h4><ul class="fstats">${this.mealRows(m.effect, on ? null : curFx)}</ul><h4>${K.ingredients}</h4>${this.reqRows(s, m.recipe)}${where ? `<ul class="fwhere">${where}</ul>` : ''}<div class="fbtns">${btn}</div></div>`;
  }

  /** Farm tab: your plots (with timers) and the expected harvest | crop cards with a plant button each. */
  private farm(s: GameState): string {
    const F = th.menu.farmTab;
    const iv = s.player.inVillage;
    const note = iv ? `<p class="note ok">${th.menu.farmInVillage}</p>` : `<p class="note warn">${th.menu.farmNotInVillage}</p>`;

    // plots, one grid per bed
    let plots = `<h3 class="sec">${F.plots}</h3>`;
    for (const bed of ['soil', 'paddy', 'pond'] as const) {
      const idx = s.plots.map((pl, i) => [pl, i] as const).filter(([pl]) => pl.bed === bed);
      if (idx.length) plots += `<h4>${th.menu.beds[bed]}</h4>${this.plotGrid(s, idx)}`;
    }
    plots += this.expectedHarvest(s);
    plots += `<p class="fhint">${F.hint}</p>`;

    // crop cards, filtered by bed
    const tabs = BED_FILTERS.map((b) => `<button type="button" class="${this.bedFilter === b ? 'on' : ''}" data-bed="${b}"><span>${b === 'all' ? F.all : th.menu.beds[b]}</span></button>`).join('');
    const tools = `<div class="ftools"><label class="chk"><input type="checkbox" id="useFert" ${s.useFert ? 'checked' : ''}> ${th.menu.useFert(s.inv.fert)}</label><button type="button" class="btn" data-plantall="1" ${iv ? '' : 'disabled'}>${th.menu.plantAll} · ${th.crops[s.selCrop].name}</button></div>`;
    const ids = (Object.keys(CROPS) as CropId[]).filter((c) => this.bedFilter === 'all' || CROPS[c].bed === this.bedFilter);
    const cards = ids
      .map((c) => {
        const def = CROPS[c];
        const seeds = s.inv[def.seed];
        const free = freePlotsFor(s, c);
        const meals = itemUses(def.yield.item)
          .filter((u): u is Extract<ItemUse, { kind: 'meal' }> => u.kind === 'meal')
          .map((u) => th.meals[u.meal].name);
        const btn = free === 0 ? F.noFree : F.plant;
        return `<div class="fcard crop${s.selCrop === c ? ' sel' : ''}" style="--tc:${def.color}"><button type="button" class="fitem" data-seed="${c}">${img(materialIconUrl(def.yield.item))}<span class="fname">${th.crops[c].name}</span><span class="fdesc">${F.grow(fmtTime(def.growSeconds))} · ${th.menu.beds[def.bed]}</span>${meals.length ? `<span class="fuse">${F.usedIn(meals.join(' '))}</span>` : ''}</button><div class="fside"><span class="${seeds > 0 ? 'have' : 'miss'}">${F.seeds(seeds)}</span><button type="button" class="fquick" data-plantcrop="${c}" ${iv && seeds > 0 && free > 0 ? '' : 'disabled'}>${btn}</button></div></div>`;
      })
      .join('');
    const crops = `<h3 class="sec">${F.crops}</h3><div class="ftypes">${tabs}</div>${tools}<div class="fcrops">${cards}</div>`;
    return `${note}<div class="farm2"><section class="fplots">${plots}</section><section class="fcroplist">${crops}</section></div>`;
  }

  /** Expected harvest from everything growing: min–max per item. */
  private expectedHarvest(s: GameState): string {
    const F = th.menu.farmTab;
    const sum = new Map<MaterialId, [number, number]>();
    for (const pl of s.plots) {
      if (!pl.crop) continue;
      const y = CROPS[pl.crop].yield;
      const [a, b] = sum.get(y.item) ?? [0, 0];
      sum.set(y.item, [a + y.min, b + y.max]);
    }
    const rows = [...sum].map(([id, [a, b]]) => `<li>${img(materialIconUrl(id), 'ico sm')}<span>${th.materials[id]}</span><b>×${a === b ? a : `${a}–${b}`}</b></li>`).join('');
    return `<div class="fyield"><h4>${F.expected}</h4>${rows ? `<ul>${rows}</ul>` : `<p class="note">${F.nothingGrowing}</p>`}</div>`;
  }

  /** Plot buttons: crop picture, countdown and progress; "+" when empty; glowing when ripe. */
  private plotGrid(s: GameState, plots: readonly (readonly [GameState['plots'][number], number])[]): string {
    const iv = s.player.inVillage;
    const F = th.menu.farmTab;
    return `<div class="plotgrid">${plots
      .map(([pl, i]) => {
        if (!pl.crop) return `<button type="button" class="plot empty" data-plot="${i}" ${iv ? '' : 'disabled'} aria-label="${th.menu.plotTapToPlant}"><span class="plus">+</span></button>`;
        const pr = plotProgress(pl, s.now);
        const ripe = pr >= 1;
        const left = fmtTime((pl.dur - (s.now - pl.at)) / 1000);
        const def = CROPS[pl.crop];
        return `<button type="button" class="plot${ripe ? ' ripe' : ''}" style="--tc:${def.color}" data-plot="${i}" ${iv ? '' : 'disabled'} aria-label="${th.crops[pl.crop].name}">${img(materialIconUrl(def.yield.item))}<span class="ptime">${ripe ? F.harvest : left}</span><span class="pbar"><i style="width:${pr * 100}%;background:${def.color}"></i></span></button>`;
      })
      .join('')}</div>`;
  }

  /** Map tab: the current area with the player and its exits, then the world grid. */
  private worldMap(s: GameState): string {
    const M = th.menu.map;
    const sel = this.mapSel ?? s.area;
    this.mapSel = sel;
    const cx = (id: AreaId): number => AREA_POS[id][0];
    const cy = (id: AreaId): number => AREA_POS[id][1];

    // trails between connected areas (dashed), drawn under the islands
    const lines = WORLD_LINKS.map(([a, b]) => {
      const known = s.visited.has(a) && s.visited.has(b);
      return `<line x1="${cx(a)}" y1="${cy(a)}" x2="${cx(b)}" y2="${cy(b)}" class="${known ? 'known' : ''}"/>`;
    }).join('');
    const target = goalArea(goalIndex(s));
    const regions = AREA_IDS.map((id) => {
      const seen = s.visited.has(id);
      const here = s.area === id;
      const pic = seen ? `<img src="${areaThumbUrl(areaMap(id))}" alt="">` : `<span class="wfog">${ICONS.lock}</span>`;
      return `<button type="button" class="wreg${seen ? '' : ' locked'}${here ? ' here' : ''}${sel === id ? ' sel' : ''}${target === id ? ' goal' : ''}" style="left:${cx(id)}%;top:${cy(id)}%" data-area="${id}" aria-label="${th.areas[id]}"><span class="wisle">${pic}</span><span class="wlabel"><b>${th.areas[id]}</b>${target === id ? `<small class="wgoal">${M.goalNow}</small>` : ''}</span>${here ? `<span class="wpin">${ICONS.mappin}</span>` : ''}</button>`;
    }).join('');
    const board = `<div class="wboard"><svg class="wlinks" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${regions}<span class="wcompass">${ICONS.compass}</span></div>`;
    return `<div class="wmap">${board}${this.areaPanel(s, sel)}</div>`;
  }

  /** Details of one area: picture (live for the current one), description, monsters, drops, how to get there. */
  private areaPanel(s: GameState, id: AreaId): string {
    const M = th.menu.map;
    const seen = s.visited.has(id);
    const here = s.area === id;
    let h = `<aside class="wpanel"><h3>${here ? ICONS.mappin : seen ? ICONS.tab_map : ICONS.lock}${th.areas[id]}</h3>`;
    if (here) h += this.liveAreaMap(s);
    else if (seen) h += `<div class="amap"><img src="${areaThumbUrl(areaMap(id))}" alt=""></div>`;
    else h += `<div class="amap locked"><span>${ICONS.lock}${M.locked}</span></div>`;
    h += `<p class="wdesc">${seen ? th.areaInfo[id] : M.lockedDesc}</p>`;

    const rows: string[] = [];
    const target = goalArea(goalIndex(s));
    const goalTitle = target === id ? (th.goals[goalIndex(s)]?.title ?? '') : id === 'home' ? M.start : (th.goals[AREA_STEP[id] - 1]?.title ?? '');
    rows.push(`<li class="${target === id ? 'now' : ''}"><span>${target === id ? M.goalNow : M.goal}</span><b>${goalTitle}</b></li>`);
    const kinds = MONSTER_IDS.filter((k) => MONSTERS[k].area === id);
    if (kinds.length) {
      const mons = kinds.map((k) => ((s.kills[k] ?? 0) > 0 ? img(monsterIconUrl(k), 'ico mon') : `<img class="ico mon unk" src="${monsterIconUrl(k)}" alt="">`)).join('');
      rows.push(`<li><span>${M.monsters}</span><b class="wicons">${mons}</b></li>`);
      // notable drops: part drops and rare drops of the kinds already hunted
      const drops = new Set<MaterialId>();
      for (const k of kinds) {
        if (!(s.kills[k] ?? 0)) continue;
        const def = MONSTERS[k];
        for (const pd of Object.values(def.parts)) for (const m of Object.keys(pd?.drop ?? {})) drops.add(m as MaterialId);
        for (const m of Object.keys(def.rare)) drops.add(m as MaterialId);
      }
      const dropHtml = [...drops].map((m) => `<span title="${th.materials[m]}">${img(materialIconUrl(m), 'ico sm')}</span>`).join('');
      rows.push(`<li><span>${M.drops}</span><b class="wicons">${dropHtml || `<em>${M.unknownDrops}</em>`}</b></li>`);
    }
    if (id !== 'home') {
      // the way in: the neighbouring area whose exit leads here (prefer one already explored)
      const from = AREA_IDS.filter((a) => areaMap(a).exits.some((e) => e.to === id)).sort((a, b) => Number(s.visited.has(b)) - Number(s.visited.has(a)))[0];
      const exit = from ? areaMap(from).exits.find((e) => e.to === id) : undefined;
      if (from && exit) rows.push(`<li><span>${M.route}</span><b>${M.routeFrom(M.edges[exit.edge], th.areas[from])}</b></li>`);
    }
    h += `<ul class="winfo">${rows.join('')}</ul>`;
    if (id === 'home') {
      const marks = [M.forge, M.kitchen, M.farm, M.elder, M.paddy, M.pond].map((n) => `<span>${n}</span>`).join('');
      h += `<h4>${M.landmarks}</h4><div class="wmarks">${marks}</div>`;
    }
    const fight = inFight(s);
    // a hunter camp in this area: say so, and once found offer fast travel to it
    let noted = false;
    if (areaMap(id).camp) {
      if (seen) {
        noted = true;
        h += `<p class="note${fight ? ' warn' : ''}">${fight ? M.inFight : M.campHelp}</p><button type="button" class="fbtn primary" data-travel="${id}" ${fight || s.player.dead ? 'disabled' : ''}>${ICONS.tab_map}${M.goCamp}</button>`;
      } else h += `<p class="note">${M.campLocked}</p>`;
    }
    if (s.area !== 'home') {
      if (!noted) h += `<p class="note${fight ? ' warn' : ''}">${fight ? M.inFight : M.goHomeHelp}</p>`;
      h += `<button type="button" class="fbtn" data-travel="home" ${fight || s.player.dead ? 'disabled' : ''}>${ICONS.tab_map}${M.goHome}</button>`;
    }
    return `${h}</aside>`;
  }

  /** The current area's map with the player, monsters, village stations and exits (the old map tab view). */
  private liveAreaMap(s: GameState): string {
    const M = th.menu.map;
    const map = s.map;
    const pct = (v: number, max: number): string => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2)}%`;
    const W = MW * T;
    const H = MH * T;
    const exits = map.exits
      .map((e) => {
        const mid = e.at + e.width / 2;
        const pos =
          e.edge === 'n' ? `left:${pct(mid, MW)};top:0` : e.edge === 's' ? `left:${pct(mid, MW)};bottom:0` : e.edge === 'w' ? `left:0;top:${pct(mid, MH)}` : `right:0;top:${pct(mid, MH)}`;
        const arrow = { n: '▲', s: '▼', e: '▶', w: '◀' }[e.edge];
        return `<span class="mexit e-${e.edge}" style="${pos}">${arrow} ${th.areas[e.to]}</span>`;
      })
      .join('');
    const mons = s.monsters
      .map((m) => {
        const boss = MONSTERS[m.kind].rage !== null;
        return `<i class="mdot${boss ? ' boss' : ''}${m.aggro ? ' hunt' : ''}" style="left:${pct(m.x, W)};top:${pct(m.y, H)}" title="${th.monsters[m.kind].name}"></i>`;
      })
      .join('');
    const places =
      s.area === 'home'
        ? [
            [{ x: (SMITH.x + SMITH.w / 2) * T, y: (SMITH.y + 1) * T }, M.forge],
            [{ x: (INN.x + INN.w / 2) * T, y: (INN.y + 1) * T }, M.kitchen],
            [FARM_CENTER, M.farm],
            [{ x: (ELDER_HOUSE.x + ELDER_HOUSE.w / 2) * T, y: (ELDER_HOUSE.y + 1) * T }, M.elder],
            [PADDY_CENTER, M.paddy],
            [POND_CENTER, M.pond],
          ]
            .map(([o, name]) => `<span class="mplace" style="left:${pct((o as { x: number }).x, W)};top:${pct((o as { y: number }).y, H)}">${name as string}</span>`)
            .join('')
        : '';
    const me = `<span class="mme" style="left:${pct(s.player.x, W)};top:${pct(s.player.y, H)}"><i></i><b>${M.you}</b></span>`;
    let h = `<div class="amap"><img src="${areaThumbUrl(map)}" alt="">${places}${mons}${exits}${me}</div>`;
    h += `<div class="mlegend"><span><i class="lg-me"></i>${M.you}</span><span><i class="mdot"></i>${M.legendMonster}</span><span><i class="mdot boss"></i>${M.legendBoss}</span><span><i class="lg-sw path"></i>${M.legendPath}</span><span><i class="lg-sw woods"></i>${M.legendWoods}</span><span><i class="lg-sw water"></i>${M.legendWater}</span></div>`;
    return h;
  }

  /** Bestiary: progress card | area tabs, portrait list, entry. */
  private book(s: GameState): string {
    const B = th.menu.book;
    const known = MONSTER_IDS.filter((k) => (s.kills[k] ?? 0) > 0);
    const pct = Math.round((known.length / MONSTER_IDS.length) * 100);
    const medals = medalCount(s);
    const nav = `<nav class="fsub"><div class="fpotion bookprog"><div><b>${B.recorded}</b><span class="big">${known.length}/${MONSTER_IDS.length}</span><span class="reqbar"><i style="width:${pct}%"></i></span><b>${B.medals}</b><span class="big">${medals}/${MONSTER_IDS.length * MEDALS.length}</span></div></div><p class="fhint">${B.help}</p></nav>`;
    const areas: (AreaId | 'all')[] = ['all', ...AREA_IDS.filter((a) => MONSTER_IDS.some((k) => MONSTERS[k].area === a))];
    const tabs = areas
      .map((a) => {
        const kinds = MONSTER_IDS.filter((k) => a === 'all' || MONSTERS[k].area === a);
        const got = kinds.filter((k) => (s.kills[k] ?? 0) > 0).length;
        return `<button type="button" class="${this.bookArea === a ? 'on' : ''}" data-barea="${a}"><span>${a === 'all' ? B.all : th.areas[a]}</span><small>${got}/${kinds.length}</small></button>`;
      })
      .join('');
    const list = MONSTER_IDS.filter((k) => this.bookArea === 'all' || MONSTERS[k].area === this.bookArea);
    if (!this.bookSel || !list.includes(this.bookSel)) this.bookSel = list.find((k) => (s.kills[k] ?? 0) > 0) ?? list[0] ?? null;
    const cards = list
      .map((k) => {
        const p = monsterPortrait(k);
        const sc = portraitScale(p.w, 56);
        const seen = (s.kills[k] ?? 0) > 0;
        const boss = MONSTERS[k].rage !== null;
        return `<button type="button" class="bcard${seen ? '' : ' locked'}${boss ? ' boss' : ''}${this.bookSel === k ? ' sel' : ''}" data-mon="${k}"><img class="mport" src="${p.url}" alt="" style="width:${p.w * sc}px"><span>${seen ? th.monsters[k].name : B.unknown}</span>${seen ? medalPips(s, k) : ''}</button>`;
      })
      .join('');
    const entry = this.bookSel ? this.bookEntry(s, this.bookSel) : '';
    return `<div class="forge book2">${nav}<section class="fmain"><div class="ftypes">${tabs}</div><div class="fbody"><div class="flist bgrid">${cards}</div>${entry}</div></section></div>`;
  }

  private bookEntry(s: GameState, k: MonsterId): string {
    const B = th.menu.book;
    const def = MONSTERS[k];
    const t = th.monsters[k];
    const where = monsterWhere(k);
    const p = monsterPortrait(k);
    const sc = portraitScale(p.w, 140);
    const kills = s.kills[k] ?? 0;
    if (!kills) {
      return `<div class="bentry locked"><img class="mport" src="${p.url}" alt="" style="width:${p.w * sc}px"><div><b>${B.unknown}</b><p class="meta">${B.lockedHint(where)}</p></div></div>`;
    }
    const size = def.size >= 12 ? B.sizes.large : def.size >= 9 ? B.sizes.medium : B.sizes.small;
    const bag = (b: ItemBag): string =>
      Object.entries(b)
        .map(([m, n]) => `<span class="chipi">${img(materialIconUrl(m as MaterialId), 'ico sm')}${th.materials[m as MaterialId]} ×${n}</span>`)
        .join('');
    let h = `<div class="bentry"><div class="bhead"><img class="mport" src="${p.url}" alt="" style="width:${p.w * sc}px"><div><b>${t.name}</b><p class="meta">${B.hunted(kills)} · ${B.where} ${where}</p></div></div>`;
    h += `<div class="stats"><div><span>${B.hp}</span><b>${def.hp}</b></div><div><span>${B.size}</span><b class="txt">${size}</b></div><div><span>${B.huntTime}</span><b>${fmtTime(def.huntTime)}</b></div></div>`;
    if (def.weakTo) h += `<p class="note ok">${B.weakNote(th.weaponTypes[def.weakTo])}</p>`;
    if (def.rage) h += `<p class="note warn">${B.rage}</p>`;

    const parts = (Object.entries(def.parts) as [PartId, NonNullable<(typeof def.parts)[PartId]>][]).map(
      ([part, pd]) => `<li><b>${(t.parts as Partial<Record<PartId, string>>)[part] ?? part}</b> <span class="meta">HP ${pd.hp} · ${B.partHow[part]}</span><div class="req">${bag(pd.drop)}</div></li>`,
    );
    h += `<h4>${B.parts}</h4><ul class="blist">${parts.join('')}</ul>`;

    const atk = def.attacks.map((a) => {
      const shape = a.shape === 'line' ? `${B.shapes.line} ${a.length}` : a.offset === 0 ? `${B.shapes.ring} r${a.radius}` : `${B.shapes.front} r${a.radius}`;
      return `<li><b>${(t.attacks as Record<string, string>)[a.id] ?? a.id}</b> <span class="meta">${B.attackMeta(shape, a.telegraph * TUNING.combat.telegraphMul, a.damage)}</span></li>`;
    });
    h += `<h4>${B.attacks}</h4><ul class="blist">${atk.join('')}</ul>`;

    const drops = def.carve.map((c) => `<span class="chipi">${img(materialIconUrl(c.item), 'ico sm')}${th.materials[c.item]} ${c.min === c.max ? `×${c.max}` : `${c.min}–${c.max}`}</span>`);
    for (const [m, ch] of [...Object.entries(def.bonus), ...Object.entries(def.rare)]) {
      drops.push(`<span class="chipi${m in def.rare ? ' rare' : ''}">${img(materialIconUrl(m as MaterialId), 'ico sm')}${th.materials[m as MaterialId]} ${B.chance(Math.round((ch ?? 0) * 100))}</span>`);
    }
    h += `<h4>${B.drops}</h4><div class="req">${drops.join('')}</div>`;
    h += `<h4>${B.medals}</h4><ul class="blist medals">${MEDALS.map((md) => {
      const got = hasMedal(s, k, md);
      return `<li class="${got ? 'got' : ''}"><i class="medal ${md}${got ? ' got' : ''}"></i><b>${th.medals[md].name}</b> <span class="meta">${th.medals[md].desc}${got ? ` · ${B.medalEarned}` : ''}</span></li>`;
    }).join('')}</ul>`;
    h += `<div class="goalbox"><b>${B.tip}</b><p>${t.tip}</p></div></div>`;
    return h;
  }

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const s = this.s();
    const d = b.dataset;
    if (b.id === 'btnCopySave') {
      this.copySave();
      return;
    }
    if (b.id === 'btnDlSave') {
      this.downloadSave();
      return;
    }
    if (b.id === 'btnLoadSave') {
      const data = parseCode(this.codeDraft);
      if (!data) {
        this.hooks.sfx('error');
        this.hud.toast(th.menu.transfer.bad, 'bad');
        return;
      }
      if (Date.now() - this.loadArm > 3000) {
        this.loadArm = Date.now();
        b.textContent = th.menu.transfer.confirmLoad;
        b.classList.add('warn');
        setTimeout(() => {
          if (!b.isConnected) return;
          b.textContent = th.menu.transfer.load;
          b.classList.remove('warn');
        }, 3000);
        return;
      }
      this.hooks.load(data);
      return;
    }
    if (b.id === 'btnReset') {
      if (Date.now() - this.resetArm > 3000) {
        this.resetArm = Date.now();
        b.textContent = th.menu.confirmNewGame;
        setTimeout(() => {
          if (b.isConnected) b.textContent = th.menu.newGame;
        }, 3000);
        return;
      }
      this.hooks.reset();
      return;
    }
    if (d.autopot !== undefined) {
      const v = Number(d.autopot);
      if (TUNING.player.potion.autoOptions.includes(v)) {
        s.autoPotion = v;
        this.hooks.sfx('ui');
        this.render();
      }
      return;
    }
    if (d.travel) {
      const camp = d.travel !== 'home' && (AREA_IDS as readonly string[]).includes(d.travel);
      const r = camp ? fastTravelCamp(s, d.travel as AreaId) : fastTravelHome(s);
      if (r.ok) {
        this.hud.toast(camp ? th.menu.map.traveledCamp(th.areas[d.travel as AreaId]) : th.menu.map.traveled, 'gold');
        this.close();
      }
      return;
    }
    if (d.mon) {
      this.bookSel = d.mon as MonsterId;
      this.render();
      return;
    }
    if (d.filter) {
      this.filter = d.filter as BagFilter;
      this.render();
      return;
    }
    if (d.bsub || d.barea) {
      if (d.bsub) this.bagSub = d.bsub as BagSub;
      if (d.barea) this.bookArea = d.barea as AreaId | 'all';
      this.hooks.sfx('ui');
      this.render();
      return;
    }
    if (d.area) {
      this.mapSel = d.area as AreaId;
      this.hooks.sfx('ui');
      this.render();
      return;
    }
    if (d.bed) {
      this.bedFilter = d.bed as BedFilter;
      this.hooks.sfx('ui');
      this.render();
      return;
    }
    if (d.kfilter || d.ksel) {
      if (d.kfilter) this.mealFilter = d.kfilter as MealFilter;
      if (d.ksel) this.mealSel = d.ksel as MealId;
      this.hooks.sfx('ui');
      this.render();
      return;
    }
    if (d.fsub || d.ftype || d.fsel || d.aslot || d.asel) {
      if (d.fsub) this.forgeSub = d.fsub as ForgeSub;
      if (d.ftype) this.forgeType = d.ftype as WeaponType;
      if (d.fsel) this.forgeSel = d.fsel as WeaponId;
      if (d.aslot) this.armorSlot = d.aslot as ArmorSlot;
      if (d.asel) this.armorSel = d.asel as ArmorId;
      this.hooks.sfx('ui');
      this.render();
      return;
    }
    if (d.item) {
      this.sel = this.sel === d.item ? null : (d.item as ItemKey);
      this.render();
      return;
    }
    if (d.seed) {
      s.selCrop = d.seed as CropId;
      this.hooks.changed();
      this.render();
      return;
    }
    if (!s.player.inVillage) return;
    if (d.plot !== undefined) tapPlot(s, Number(d.plot));
    else if (d.plantcrop) {
      if (plantOne(s, d.plantcrop as CropId)) this.hud.toast(th.log.plantedMany(th.crops[d.plantcrop as CropId].name, 1));
    }
    else if (d.plantall) {
      const n = plantAll(s);
      if (n) this.hud.toast(th.log.plantedMany(th.crops[s.selCrop].name, n));
    } else if (d.craft) {
      const id = d.craft as WeaponId;
      if (craftWeapon(s, id).ok) {
        this.hud.toast(th.log.crafted(th.weapons[id].name), 'gold');
        this.hooks.crafted();
      }
    } else if (d.equip) {
      const id = d.equip as WeaponId;
      if (equipWeapon(s, id).ok) this.hud.toast(th.log.equipped(th.weaponName(id, weaponLevel(s, id))));
    } else if (d.upgrade) {
      const id = d.upgrade as WeaponId;
      if (upgradeWeapon(s, id).ok) {
        this.hud.toast(th.log.upgraded(th.weaponName(id, weaponLevel(s, id))), 'gold');
        this.hooks.crafted();
      }
    } else if (d.armorcraft) {
      const id = d.armorcraft as ArmorId;
      if (craftArmor(s, id).ok) {
        this.hud.toast(th.log.armorCrafted(th.armor[id].name), 'gold');
        this.hooks.crafted();
      }
    } else if (d.armorup) {
      const id = d.armorup as ArmorId;
      if (upgradeArmor(s, id).ok) {
        this.hud.toast(th.log.upgraded(th.armorName(id, armorLevel(s, id))), 'gold');
        this.hooks.crafted();
      }
    } else if (d.wear) {
      const id = d.wear as ArmorId;
      if (equipArmor(s, id).ok) this.hud.toast(th.log.armorOn(th.armor[id].name));
    } else if (d.unequip) {
      const id = d.unequip as ArmorId;
      if (unequipArmor(s, id).ok) this.hud.toast(th.log.armorOff(th.armor[id].name));
    } else if (d.potion) {
      if (brewPotion(s).ok) this.hud.toast(th.log.brewed);
    } else if (d.meal) {
      const id = d.meal as MealId;
      if (cookMeal(s, id).ok) this.hud.toast(th.log.ate(th.meals[id].name, th.meals[id].desc), 'gold');
    }
    this.hooks.changed();
    this.render();
  }
}

function sourceText(x: ItemSource): string {
  const S = th.menu.source;
  const pct = (c: number): number => Math.round(c * 100);
  if (x.kind === 'crop') return `${img(materialIconUrl(CROPS[x.crop].seed), 'ico sm')}${S.crop(th.crops[x.crop].name)}`;
  if (x.kind === 'gather') return x.chance >= 1 ? S.gather[x.node] : S.gatherChance(S.gather[x.node], pct(x.chance));
  if (x.kind === 'veteran') return S.veteran;
  if (x.kind === 'request') return S.request;
  if (x.kind === 'coop') return x.feather ? S.coopFeather : S.coop;
  const mon = th.monsters[x.monster];
  const icon = img(monsterIconUrl(x.monster), 'ico mon');
  if (x.kind === 'part') return `${icon}${S.part((mon.parts as Partial<Record<string, string>>)[x.part] ?? x.part, mon.name)}`;
  if (x.kind === 'carve') return `${icon}${S.carve(mon.name)}`;
  if (x.kind === 'bonus') return `${icon}${S.bonus(mon.name, pct(x.chance))}`;
  return `${icon}${S.rare(mon.name, pct(x.chance))}`;
}

function useText(x: ItemUse): string {
  const U = th.menu.use;
  if (x.kind === 'weapon') return `${img(weaponIconUrl(x.weapon), 'ico sm')}${U.weapon(th.weapons[x.weapon].name)}`;
  if (x.kind === 'armor') return `${img(armorIconUrl(x.armor), 'ico sm')}${U.armor(th.armor[x.armor].name)}`;
  if (x.kind === 'upgrade') return `${img(weaponIconUrl(x.weapon), 'ico sm')}${U.upgrade(th.weapons[x.weapon].name)}`;
  if (x.kind === 'masterUpgrade') return U.masterUpgrade(x.from, x.to);
  if (x.kind === 'meal') return `${img(mealIconUrl(x.meal), 'ico sm')}${U.meal(th.meals[x.meal].name)}`;
  if (x.kind === 'potion') return `${img(potionIconUrl(), 'ico sm')}${U.potion}`;
  if (x.kind === 'plant') return U.plant(th.crops[x.crop].name);
  if (x.kind === 'hatch') return U.hatch;
  if (x.kind === 'feed') return U.feed;
  return U.fertilizer;
}

/** Four small medal pips under a bestiary portrait. */
function medalPips(s: GameState, k: MonsterId): string {
  return `<span class="pips">${MEDALS.map((md) => `<i class="medal ${md}${hasMedal(s, k, md) ? ' got' : ''}"></i>`).join('')}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
