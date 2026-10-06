// The single menu: bottom sheet on phones, side drawer on wide screens.
// The game pauses while it is open.
import { ARMOR, ARMOR_IDS, CROPS, MATERIALS, MATERIAL_IDS, MEALS, MONSTERS, MONSTER_IDS, SKILLS, TUNING, WEAPONS, WEAPONS_DATA } from '../data';
import { ARMOR_SLOTS, MEDALS, type AreaId, type ArmorId, type ArmorSlot, type WeaponType, type CropId, type ItemBag, type MaterialId, type MealId, type MonsterId, type PartId, type PerkId, type WeaponId } from '../data/types';
import { plantAll, plotProgress, tapPlot } from '../core/farm';
import { weaponSkills } from '../core/skills';
import { AREA_IDS } from '../core/areas';
import { ELDER_HOUSE, FARM_CENTER, PADDY_CENTER, POND_CENTER, INN, MH, MW, SMITH, T } from '../core/mapgen';
import { allRequestsDone, currentRequest } from '../core/requests';
import { hasMedal, medalCount } from '../core/medals';
import { requestText, rewardText } from './talk';
import { fastTravelHome, inFight } from '../core/travel';
import { areaThumbUrl } from '../art/mapThumb';
import { activeMeal, activePerks, attackMul, upgradeCost, upgradeWeapon, weaponLevel, weaponPower, brewPotion, canAfford, cookMeal, craftArmor, craftWeapon, damageReduction, defenseOf, equipArmor, equipWeapon, goalIndex, unequipArmor } from '../core/inventory';
import type { GameState } from '../core/state';
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
const WEAPON_TYPE_ORDER: readonly WeaponType[] = ['sword', 'hammer', 'greatsword', 'spear', 'bow'];
/** first weapon of each type, used as that type's tab icon */
const TYPE_ICON_WEAPON: Record<WeaponType, WeaponId> = Object.fromEntries(
  WEAPON_TYPE_ORDER.map((t) => [t, (Object.keys(WEAPONS) as WeaponId[]).find((k) => WEAPONS[k].type === t) ?? 'bone']),
) as Record<WeaponType, WeaponId>;
const SKILL_ICONS = ICONS as Readonly<Record<string, string>>;
export const TABS: readonly Tab[] = ['bag', 'forge', 'kitchen', 'farm', 'book', 'map'];

/** World-map grid position (column, row) of each area, matching the exits. */
const WORLD_GRID: Record<AreaId, [number, number]> = {
  deepwild: [1, 1],
  peat: [0, 1],
  bamboo: [1, 2],
  home: [1, 3],
  limestone: [2, 3],
  cave: [2, 2],
  savanna: [3, 3],
  swamp: [1, 4],
  mangrove: [1, 5],
};

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
  private filter: BagFilter = 'all';
  private sel: ItemKey | null = null;
  private bookSel: MonsterId | null = null;
  private forgeSub: ForgeSub = 'craft';
  private forgeType: WeaponType = 'sword';
  private forgeSel: WeaponId | null = null;
  private armorSlot: ArmorSlot = 'head';
  private armorSel: ArmorId | null = null;
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

  private bag(s: GameState): string {
    const p = s.player;
    const M = th.menu;
    const goal = th.goals[goalIndex(s)];

    // equipment: slots either side of the character portrait
    const wkey: ItemKey = `w:${p.weapon}`;
    const wslot = `<button type="button" class="slot${this.sel === wkey ? ' sel' : ''}" data-item="${wkey}" aria-label="${M.slots.weapon}">${img(weaponIconUrl(p.weapon))}<span>${M.slots.weapon}</span></button>`;
    const [head, body, charm] = ARMOR_SLOTS.map((k) => {
      const id = s.armor[k];
      if (!id) return `<div class="slot empty">${img(armorSlotIconUrl(k))}<span>${M.slots[k]}</span></div>`;
      const key: ItemKey = `a:${id}`;
      return `<button type="button" class="slot${this.sel === key ? ' sel' : ''}" data-item="${key}" aria-label="${th.armor[id].name}">${img(armorIconUrl(id))}<span>${M.slots[k]}</span></button>`;
    });
    // two columns on wide screens: character + stats | filters + items
    let h = `<div class="bagcols"><div class="bagL"><div class="eqp"><div class="slots">${wslot}${head}</div><div class="hero">${img(playerIconUrl(), 'portrait')}</div><div class="slots">${body}${charm}</div></div>`;
    const atk = Math.round(weaponPower(s, p.weapon) * attackMul(s));
    const def = defenseOf(s);
    h += `<div class="stats"><div><span>${M.stats.attack}</span><b>${atk}</b></div><div title="${M.reduction(Math.round(damageReduction(s) * 100))}"><span>${M.stats.defense}</span><b>${def}</b></div><div><span>${M.stats.hp}</span><b>${p.maxHp}</b></div><div><span>${M.stats.stamina}</span><b>${p.maxSt}</b></div></div>`;
    const perksOn = activePerks(s);
    if (perksOn.length) h += `<p class="perk on"><b>${M.activePerks}</b> ${perksOn.map((k) => th.perks[k].name).join(' · ')}</p>`;

    // filters, detail card, item grid
    h += `</div><div class="bagR"><div class="filters">${FILTERS.map((f) => `<button type="button" class="chipbtn${this.filter === f ? ' on' : ''}" data-filter="${f}">${M.filters[f]}</button>`).join('')}</div>`;
    const items = this.bagItems(s).filter((it) => this.matches(it.key));
    if (this.sel && this.sel !== wkey && !this.sel.startsWith('a:') && !items.some((it) => it.key === this.sel)) this.sel = null;
    h += this.sel ? this.detail(s, this.sel) : `<p class="note">${items.length ? M.bagHelp : M.bagEmpty}</p>`;
    const cells = items.map(
      (it) =>
        `<button type="button" class="cell r${it.rarity}${this.sel === it.key ? ' sel' : ''}${it.equipped ? ' eq' : ''}" data-item="${it.key}" aria-label="${it.name}">${img(it.icon)}${it.count !== null ? `<b>${it.count}</b>` : ''}</button>`,
    );
    for (let i = cells.length; i < MIN_CELLS; i++) cells.push('<div class="cell blank"></div>');
    h += `<div class="grid">${cells.join('')}</div></div></div>`;

    if (goal) h += `<div class="goalbox"><b>${goal.title}</b><p>${goal.desc}</p></div>`;
    h += this.requestCard(s);
    h += `<h3 class="sec">${M.skills}</h3><div class="skl">${weaponSkills(p.weapon)
      .map((id) => `<div><b>${th.skills[id].name}</b><span class="meta">${th.skills[id].desc} · ${M.cooldown(SKILLS[id].cooldown)}</span></div>`)
      .join('')}<div><b>${M.partsTitle}</b><span class="meta">${M.partsHelp}</span></div></div>`;
    const snd = this.hooks.sound.get();
    h += `<div class="sound"><h3 class="sec">${M.sound.title}</h3><label class="chk"><input type="checkbox" id="sndOn" ${snd.on ? 'checked' : ''}>${M.sound.on}</label><label class="vol"><span>${M.sound.volume}</span><input type="range" id="sndVol" min="0" max="100" step="5" value="${Math.round(snd.volume * 100)}" aria-label="${M.sound.volume}" ${snd.on ? '' : 'disabled'}></label><label class="vol"><span>${M.sound.music}</span><input type="range" id="sndMusic" min="0" max="100" step="5" value="${Math.round(snd.music * 100)}" aria-label="${M.sound.music}" ${snd.on ? '' : 'disabled'}></label></div>`;
    const armed = Date.now() - this.resetArm < 3000;
    h += `<div class="row"><h3 class="sec">${M.log}</h3><button type="button" class="btn" id="btnReset">${armed ? M.confirmNewGame : M.newGame}</button></div>`;
    h += `<ul class="log">${this.hud.log.map((l) => `<li class="${l.cls}">${escapeHtml(l.msg)}</li>`).join('')}</ul>`;
    return h;
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

  /** Opens the bag tab scrolled to the hunt request (talking to the elder). */
  openRequests(): void {
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
      if (s.ownedArmor.has(id)) out.push({ key: `a:${id}`, icon: armorIconUrl(id), name: th.armor[id].name, count: null, rarity: 0, equipped: s.armor[ARMOR[id].slot] === id });
    }
    if (s.player.potions > 0) out.push({ key: 'potion', icon: potionIconUrl(), name: th.menu.potionName, count: s.player.potions, rarity: 0, equipped: false });
    for (const id of MATERIAL_IDS) {
      const n = s.inv[id];
      if (n > 0) out.push({ key: `m:${id}`, icon: materialIconUrl(id), name: th.materials[id], count: n, rarity: MATERIALS[id].rarity ?? 0, equipped: false });
    }
    return out;
  }

  private matches(key: ItemKey): boolean {
    if (this.filter === 'all') return true;
    if (key === 'potion' || key.startsWith('w:') || key.startsWith('a:')) return this.filter === 'gear';
    return MATERIALS[key.slice(2) as MaterialId].category === this.filter;
  }

  /** Info card for the selected bag item. */
  private detail(s: GameState, key: ItemKey): string {
    const M = th.menu;
    if (key === 'potion') {
      return `<div class="detail">${img(potionIconUrl(), 'ico lg')}<div><b>${M.potionName}</b><p class="meta">${M.have(s.player.potions)} · ${M.potionDesc(TUNING.player.potion.heal)}</p></div></div>`;
    }
    if (key.startsWith('w:')) {
      const id = key.slice(2) as WeaponId;
      const w = WEAPONS[id];
      const speed = w.rate < 0.5 ? M.speed.fast : w.rate < 0.8 ? M.speed.mid : M.speed.slow;
      const btn =
        s.player.weapon === id
          ? `<button type="button" class="btn" disabled>${M.equipped}</button>`
          : `<button type="button" class="btn" data-equip="${id}" ${s.player.inVillage ? '' : 'disabled'}>${M.equip}</button>`;
      return `<div class="detail">${img(weaponIconUrl(id), 'ico lg')}<div><b>${th.weaponName(id, weaponLevel(s, id))}</b><p class="meta">${M.weaponStats(th.weaponTypes[w.type], Math.round(weaponPower(s, id)), speed)} · ${th.weapons[id].desc}</p>${strongVs(s, id)}${btn}</div></div>`;
    }
    if (key.startsWith('a:')) {
      const id = key.slice(2) as ArmorId;
      const a = ARMOR[id];
      const on = s.armor[a.slot] === id;
      const btn = `<button type="button" class="btn" ${on ? `data-unequip="${id}"` : `data-wear="${id}"`} ${s.player.inVillage ? '' : 'disabled'}>${on ? M.unequip : M.wear}</button>`;
      return `<div class="detail">${img(armorIconUrl(id), 'ico lg')}<div><b>${th.armor[id].name}</b><p class="meta">${M.armorMeta(M.slots[a.slot], a.defense, a.maxHp, a.stamina)} · ${th.armor[id].desc}</p>${perkLines(s, id)}${btn}</div></div>`;
    }
    const id = key.slice(2) as MaterialId;
    const m = MATERIALS[id];
    const tag = m.rarity ? ` <span class="tag">${th.rarity[m.rarity]}</span>` : '';
    const src = itemSources(id).map((x) => `<li>${sourceText(x)}</li>`).join('') || `<li class="meta">${M.noSource}</li>`;
    const use = itemUses(id).map((x) => `<li>${useText(x)}</li>`).join('') || `<li class="meta">${M.noUse}</li>`;
    return `<div class="detail">${img(materialIconUrl(id), 'ico lg')}<div><b>${th.materials[id]}</b>${tag}<p class="meta">${M.have(s.inv[id])}</p><div class="dcols"><div><h4>${M.sourcesTitle}</h4><ul>${src}</ul></div><div><h4>${M.usesTitle}</h4><ul>${use}</ul></div></div></div></div>`;
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

  private weaponDetail(s: GameState, k: WeaponId): string {
    const F = th.menu.forge;
    const p = s.player;
    const w = WEAPONS[k];
    const tier = gearTier(w.recipe);
    const own = s.owned.has(k);
    const eq = p.weapon === k;
    const iv = p.inVillage;
    const lv = weaponLevel(s, k);
    const UP = WEAPONS_DATA.upgrade;
    const upgrading = this.forgeSub === 'upgrade';
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
      return `<button type="button" class="fitem t${tier}${id === sel ? ' sel' : ''}" data-asel="${id}">${img(armorIconUrl(id))}<span class="fname">${th.armor[id].name}</span>${this.badge(tier)}${state ? `<span class="fstate ${cls}">${state}</span>` : ''}</button>`;
    });
    const detail = sel ? this.armorDetail(s, sel) : '';
    const cur = worn ? ARMOR[worn] : null;
    const compare = cur && worn
      ? `<aside class="fcompare"><h4>${F.current}</h4><div class="fhero sm">${img(armorIconUrl(worn), 'big')}</div><b>${th.armor[worn].name}</b>${this.badge(gearTier(cur.recipe))}<ul class="fstats">${this.statRow(th.menu.stats.defense, `${cur.defense}`)}${this.statRow(th.menu.stats.hp, `+${cur.maxHp}`)}${this.statRow(th.menu.stats.stamina, `+${cur.stamina}`)}</ul></aside>`
      : `<aside class="fcompare"><h4>${F.current}</h4><p class="note">${F.nothingWorn}</p></aside>`;
    return `<section class="fmain"><div class="ftypes">${tabs}</div><div class="fbody"><div class="flist">${items.join('')}</div>${detail}</div></section>${compare}`;
  }

  private armorDetail(s: GameState, id: ArmorId): string {
    const a = ARMOR[id];
    const tier = gearTier(a.recipe);
    const iv = s.player.inVillage;
    const own = s.ownedArmor.has(id);
    const worn = s.armor[a.slot];
    const on = worn === id;
    const cur = worn ? ARMOR[worn] : null;
    const S = th.menu.stats;
    const rows =
      this.statRow(S.defense, `${a.defense}`, on ? 0 : a.defense - (cur?.defense ?? 0)) +
      this.statRow(S.hp, `+${a.maxHp}`, on ? 0 : a.maxHp - (cur?.maxHp ?? 0)) +
      this.statRow(S.stamina, `+${a.stamina}`, on ? 0 : a.stamina - (cur?.stamina ?? 0));
    let btn: string;
    if (on) btn = `<button type="button" class="fbtn" data-unequip="${id}" ${iv ? '' : 'disabled'}>${th.menu.unequip}</button>`;
    else if (own) btn = `<button type="button" class="fbtn" data-wear="${id}" ${iv ? '' : 'disabled'}>${th.menu.wear}</button>`;
    else btn = `<button type="button" class="fbtn primary" data-armorcraft="${id}" ${iv && canAfford(s.inv, a.recipe) ? '' : 'disabled'}>${ICONS.shield}${th.menu.craftArmor}</button>`;
    const mats = own ? '' : `<h4>${th.menu.forge.materials}</h4>${this.reqRows(s, a.recipe)}`;
    return `<div class="fdetail t${tier}"><div class="fhead"><div class="fhero">${img(armorIconUrl(id), 'big')}</div><div><h3>${th.armor[id].name}</h3>${this.badge(tier)}<p class="meta">${th.menu.slots[a.slot]} · ${th.armor[id].desc}</p></div></div><ul class="fstats">${rows}</ul>${mats}<div class="fbtns">${btn}</div>${perkLines(s, id)}</div>`;
  }

  private kitchen(s: GameState): string {
    const iv = s.player.inVillage;
    const cur = activeMeal(s);
    let h = this.villageNote(s);
    h += cur && s.player.meal
      ? `<p class="note">${th.menu.currentMeal} <b style="color:var(--gold)">${th.meals[cur].name}</b> ${th.menu.mealLeft(fmtTime((s.player.meal.until - s.now) / 1000))}</p>`
      : `<p class="note">${th.menu.mealRule}</p>`;
    h += '<div class="recipes">';
    for (const [id, ml] of Object.entries(MEALS) as [MealId, (typeof MEALS)[MealId]][]) {
      const on = cur === id;
      h += `<div class="rc${on ? ' eq' : ''}"><h3>${img(mealIconUrl(id))}${th.meals[id].name}</h3><div class="meta">${th.meals[id].desc}</div><div class="req">${this.req(s, ml.recipe)}</div><button type="button" class="primary" data-meal="${id}" ${iv && canAfford(s.inv, ml.recipe) && !on ? '' : 'disabled'}>${on ? th.menu.eating : th.menu.cookAndEat}</button></div>`;
    }
    return `${h}</div>`;
  }

  private farm(s: GameState): string {
    const iv = s.player.inVillage;
    const sel = CROPS[s.selCrop];
    let h = iv ? `<p class="note ok">${th.menu.farmInVillage}</p>` : `<p class="note warn">${th.menu.farmNotInVillage}</p>`;
    h += `<h3 class="sec">${th.menu.seedToPlant}</h3><div class="seeds">${(Object.keys(CROPS) as CropId[])
      .map((id) => `<button type="button" data-seed="${id}" class="${s.selCrop === id ? 'on' : ''}">${img(materialIconUrl(CROPS[id].seed), 'ico sm')}${th.crops[id].name} <b>${s.inv[CROPS[id].seed]}</b></button>`)
      .join('')}</div>`;
    h += `<p class="note">${th.menu.growInfo(th.crops[s.selCrop].name, fmtTime(sel.growSeconds), th.crops[s.selCrop].source)} · ${th.menu.growsIn(th.menu.beds[sel.bed])}</p>`;
    h += `<label class="chk"><input type="checkbox" id="useFert" ${s.useFert ? 'checked' : ''}> ${th.menu.useFert(s.inv.fert)}</label>`;
    h += `<div class="row"><span class="note">${th.menu.plantAllHelp}</span><button type="button" class="btn" data-plantall="1" ${iv ? '' : 'disabled'}>${th.menu.plantAll}</button></div>`;
    // one grid per bed: vegetable plots, rice paddy, fish pond
    for (const bed of ['soil', 'paddy', 'pond'] as const) {
      const idx = s.plots.map((pl, i) => [pl, i] as const).filter(([pl]) => pl.bed === bed);
      if (!idx.length) continue;
      h += `<h3 class="sec">${th.menu.beds[bed]}</h3>`;
      h += this.plotGrid(s, idx);
    }
    return h;
  }

  private plotGrid(s: GameState, plots: readonly (readonly [GameState['plots'][number], number])[]): string {
    const iv = s.player.inVillage;
    return `<div class="plotgrid">${plots
      .map(([pl, i]) => {
        if (!pl.crop) return `<button type="button" class="plot" data-plot="${i}" ${iv ? '' : 'disabled'}>${th.menu.plotEmpty}<span class="meta">${th.menu.plotTapToPlant}</span></button>`;
        const pr = plotProgress(pl, s.now);
        const ripe = pr >= 1;
        const left = th.menu.plotLeft(fmtTime((pl.dur - (s.now - pl.at)) / 1000));
        return `<button type="button" class="plot${ripe ? ' ripe' : ''}" data-plot="${i}" ${iv ? '' : 'disabled'}>${th.crops[pl.crop].name}<span class="meta">${ripe ? th.menu.plotRipe : left}</span><span class="pbar"><i style="width:${pr * 100}%;background:${CROPS[pl.crop].color}"></i></span></button>`;
      })
      .join('')}</div>`;
  }

  /** Map tab: the current area with the player and its exits, then the world grid. */
  private worldMap(s: GameState): string {
    const M = th.menu.map;
    const map = s.map;
    const pct = (v: number, max: number): string => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2)}%`;
    const W = MW * T;
    const H = MH * T;
    let h = `<div class="row"><h3 class="sec">${M.here(th.areas[s.area])}</h3></div>`;
    const exits = map.exits
      .map((e) => {
        const mid = e.at + e.width / 2;
        const pos =
          e.edge === 'n' ? `left:${pct(mid, MW)};top:0` : e.edge === 's' ? `left:${pct(mid, MW)};bottom:0` : e.edge === 'w' ? `left:0;top:${pct(mid, MH)}` : `right:0;top:${pct(mid, MH)}`;
        const arrow = { n: '▲', s: '▼', e: '▶', w: '◀' }[e.edge];
        return `<span class="mexit e-${e.edge}" style="${pos}">${arrow} ${th.areas[e.to]}</span>`;
      })
      .join('');
    // markers: monsters (bosses larger), village stations, then the player on top
    const mons = s.monsters
      .map((m) => {
        const boss = MONSTERS[m.kind].rage !== null;
        return `<i class="mdot${boss ? ' boss' : ''}${m.aggro ? ' hunt' : ''}" style="left:${pct(m.x, W)};top:${pct(m.y, H)}" title="${th.monsters[m.kind].name}"></i>`;
      })
      .join('');
    const places =
      s.area === 'home'
        ? [
            // labels sit on the buildings, which are far enough apart not to overlap on a phone
            [{ x: (SMITH.x + SMITH.w / 2) * T, y: (SMITH.y + 1) * T }, th.menu.map.forge],
            [{ x: (INN.x + INN.w / 2) * T, y: (INN.y + 1) * T }, th.menu.map.kitchen],
            [FARM_CENTER, th.menu.map.farm],
            [{ x: (ELDER_HOUSE.x + ELDER_HOUSE.w / 2) * T, y: (ELDER_HOUSE.y + 1) * T }, th.menu.map.elder],
            [PADDY_CENTER, th.menu.map.paddy],
            [POND_CENTER, th.menu.map.pond],
          ]
            .map(([o, name]) => `<span class="mplace" style="left:${pct((o as { x: number }).x, W)};top:${pct((o as { y: number }).y, H)}">${name as string}</span>`)
            .join('')
        : '';
    const me = `<span class="mme" style="left:${pct(s.player.x, W)};top:${pct(s.player.y, H)}"><i></i><b>${M.you}</b></span>`;
    h += `<div class="amap"><img src="${areaThumbUrl(map)}" alt="">${places}${mons}${exits}${me}</div>`;
    h += `<div class="mlegend"><span><i class="lg-me"></i>${M.you}</span><span><i class="mdot"></i>${M.legendMonster}</span><span><i class="mdot boss"></i>${M.legendBoss}</span><span><i class="lg-sw path"></i>${M.legendPath}</span><span><i class="lg-sw woods"></i>${M.legendWoods}</span><span><i class="lg-sw water"></i>${M.legendWater}</span></div>`;
    if (s.area !== 'home') {
      const fight = inFight(s);
      h += `<div class="row"><span class="note${fight ? ' warn' : ''}">${fight ? M.inFight : M.goHomeHelp}</span><button type="button" class="btn" data-travel="home" ${fight || s.player.dead ? 'disabled' : ''}>${M.goHome}</button></div>`;
    }

    // world diagram: one node per area with connector lines matching the exits
    h += `<h3 class="sec">${M.world}</h3><div class="wgraph">`;
    for (const id of AREA_IDS) {
      const [col, row] = WORLD_GRID[id];
      const seen = s.visited.has(id);
      const here = s.area === id;
      const kinds = MONSTER_IDS.filter((k) => MONSTERS[k].area === id);
      const monHtml = kinds.map((k) => ((s.kills[k] ?? 0) > 0 ? img(monsterIconUrl(k), 'ico mon') : `<img class="ico mon unk" src="${monsterIconUrl(k)}" alt="">`)).join('');
      h += `<div class="wnode${here ? ' here' : ''}${seen ? '' : ' unseen'}" style="grid-column:${col * 2 - 1};grid-row:${row * 2 - 1}"><b>${th.areas[id]}</b>${
        here ? `<span class="tag">${M.youAreHere}</span>` : seen ? '' : `<span class="meta">${M.unvisited}</span>`
      }<div class="wmons">${monHtml}</div></div>`;
    }
    for (const [a, b] of WORLD_LINKS) {
      const [c1, r1] = WORLD_GRID[a];
      const [c2, r2] = WORLD_GRID[b];
      const vertical = c1 === c2;
      h += `<i class="wlink ${vertical ? 'v' : 'h'}" style="grid-column:${vertical ? c1 * 2 - 1 : c1 * 2};grid-row:${vertical ? Math.min(r1, r2) * 2 : r1 * 2 - 1}"></i>`;
    }
    return `${h}</div>`;
  }

  /** Bestiary: portrait grid, then the selected entry. Entries unlock on the first successful hunt. */
  private book(s: GameState): string {
    const B = th.menu.book;
    const known = MONSTER_IDS.filter((k) => (s.kills[k] ?? 0) > 0);
    if (!this.bookSel) this.bookSel = known[0] ?? MONSTER_IDS[0] ?? null;
    let h = `<div class="row"><h3 class="sec">${B.progress(known.length, MONSTER_IDS.length)}</h3><span class="medalcount">${B.medalsProgress(medalCount(s), MONSTER_IDS.length * MEDALS.length)}</span></div><p class="note">${B.help}</p>`;
    h += `<div class="bgrid">${MONSTER_IDS.map((k) => {
      const p = monsterPortrait(k);
      const sc = portraitScale(p.w, 64);
      const seen = (s.kills[k] ?? 0) > 0;
      return `<button type="button" class="bcard${seen ? '' : ' locked'}${this.bookSel === k ? ' sel' : ''}" data-mon="${k}"><img class="mport" src="${p.url}" alt="" style="width:${p.w * sc}px"><span>${seen ? th.monsters[k].name : B.unknown}</span>${seen ? medalPips(s, k) : ''}</button>`;
    }).join('')}</div>`;
    if (this.bookSel) h += this.bookEntry(s, this.bookSel);
    return h;
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
    if (d.travel) {
      if (fastTravelHome(s).ok) {
        this.hud.toast(th.menu.map.traveled, 'gold');
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
  return U.fertilizer;
}

/** Four small medal pips under a bestiary portrait. */
function medalPips(s: GameState, k: MonsterId): string {
  return `<span class="pips">${MEDALS.map((md) => `<i class="medal ${md}${hasMedal(s, k, md) ? ' got' : ''}"></i>`).join('')}</span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
