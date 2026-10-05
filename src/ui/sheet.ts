// The single menu: bottom sheet on phones, side drawer on wide screens.
// The game pauses while it is open.
import { ARMOR, ARMOR_IDS, CROPS, MATERIALS, MATERIAL_IDS, MEALS, SKILLS, TUNING, WEAPONS } from '../data';
import { ARMOR_SLOTS, type ArmorId, type CropId, type ItemBag, type MaterialId, type MealId, type WeaponId } from '../data/types';
import { plantAll, plotProgress, tapPlot } from '../core/farm';
import { weaponSkills } from '../core/skills';
import { activeMeal, attackMul, brewPotion, canAfford, cookMeal, craftArmor, craftWeapon, damageReduction, defenseOf, equipArmor, equipWeapon, goalIndex, unequipArmor } from '../core/inventory';
import type { GameState } from '../core/state';
import { armorIconUrl, armorSlotIconUrl, materialIconUrl, mealIconUrl, monsterIconUrl, playerIconUrl, potionIconUrl, weaponIconUrl } from '../art/icons';
import * as th from '../i18n/th';
import { $, ICONS, fmtTime } from './format';
import type { Hud } from './hud';
import { itemSources, itemUses, type ItemSource, type ItemUse } from './itemInfo';

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
  count: number | null;
  rarity: 0 | 1 | 2;
  equipped: boolean;
}

const img = (src: string, cls = 'ico'): string => `<img class="${cls}" src="${src}" alt="" draggable="false">`;

export type Tab = 'bag' | 'forge' | 'kitchen' | 'farm';
const TABS: Tab[] = ['bag', 'forge', 'kitchen', 'farm'];

export interface SheetHooks {
  /** something changed that should be saved */
  changed: () => void;
  /** wipe the save and reload */
  reset: () => void;
  opened: () => void;
  closed: () => void;
  /** world feedback for crafting (sparks at the anvil etc.) */
  crafted: () => void;
}

export class Sheet {
  tab: Tab = 'bag';
  private readonly scrim: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly body: HTMLElement;
  private resetArm = 0;
  private filter: BagFilter = 'all';
  private sel: ItemKey | null = null;
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
        this.render();
        this.body.scrollTop = 0;
      }),
    );
    $(overlay, '#sheetClose').addEventListener('click', () => this.close());
    this.scrim.addEventListener('click', () => this.close());
    this.body.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.id === 'useFert') this.s().useFert = t.checked;
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
    const s = this.s();
    const html = this.tab === 'bag' ? this.bag(s) : this.tab === 'forge' ? this.forge(s) : this.tab === 'kitchen' ? this.kitchen(s) : this.farm(s);
    this.body.innerHTML = html;
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
    let h = `<div class="eqp"><div class="slots">${wslot}${head}</div><div class="hero">${img(playerIconUrl(), 'portrait')}</div><div class="slots">${body}${charm}</div></div>`;
    const atk = Math.round(WEAPONS[p.weapon].damage * attackMul(s));
    const def = defenseOf(s);
    h += `<div class="stats"><div><span>${M.stats.attack}</span><b>${atk}</b></div><div title="${M.reduction(Math.round(damageReduction(s) * 100))}"><span>${M.stats.defense}</span><b>${def}</b></div><div><span>${M.stats.hp}</span><b>${p.maxHp}</b></div><div><span>${M.stats.stamina}</span><b>${p.maxSt}</b></div></div>`;

    // filters, detail card, item grid
    h += `<div class="filters">${FILTERS.map((f) => `<button type="button" class="chipbtn${this.filter === f ? ' on' : ''}" data-filter="${f}">${M.filters[f]}</button>`).join('')}</div>`;
    const items = this.bagItems(s).filter((it) => this.matches(it.key));
    if (this.sel && this.sel !== wkey && !this.sel.startsWith('a:') && !items.some((it) => it.key === this.sel)) this.sel = null;
    h += this.sel ? this.detail(s, this.sel) : `<p class="note">${items.length ? M.bagHelp : M.bagEmpty}</p>`;
    const cells = items.map(
      (it) =>
        `<button type="button" class="cell r${it.rarity}${this.sel === it.key ? ' sel' : ''}${it.equipped ? ' eq' : ''}" data-item="${it.key}" aria-label="${it.name}">${img(it.icon)}${it.count !== null ? `<b>${it.count}</b>` : ''}</button>`,
    );
    for (let i = cells.length; i < MIN_CELLS; i++) cells.push('<div class="cell blank"></div>');
    h += `<div class="grid">${cells.join('')}</div>`;

    if (goal) h += `<div class="goalbox"><b>${goal.title}</b><p>${goal.desc}</p></div>`;
    h += `<h3 class="sec">${M.skills}</h3><div class="skl">${weaponSkills(p.weapon)
      .map((id) => `<div><b>${th.skills[id].name}</b><span class="meta">${th.skills[id].desc} · ${M.cooldown(SKILLS[id].cooldown)}</span></div>`)
      .join('')}<div><b>${M.partsTitle}</b><span class="meta">${M.partsHelp}</span></div></div>`;
    const armed = Date.now() - this.resetArm < 3000;
    h += `<div class="row"><h3 class="sec">${M.log}</h3><button type="button" class="btn" id="btnReset">${armed ? M.confirmNewGame : M.newGame}</button></div>`;
    h += `<ul class="log">${this.hud.log.map((l) => `<li class="${l.cls}">${escapeHtml(l.msg)}</li>`).join('')}</ul>`;
    return h;
  }

  /** Everything the player holds: owned weapons, potions, then materials with a count. */
  private bagItems(s: GameState): BagItem[] {
    const out: BagItem[] = [];
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      if (s.owned.has(id)) out.push({ key: `w:${id}`, icon: weaponIconUrl(id), name: th.weapons[id].name, count: null, rarity: 0, equipped: s.player.weapon === id });
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
      return `<div class="detail">${img(weaponIconUrl(id), 'ico lg')}<div><b>${th.weapons[id].name}</b><p class="meta">${M.weaponStats(th.weaponTypes[w.type], w.damage, speed)} · ${th.weapons[id].desc}</p>${btn}</div></div>`;
    }
    if (key.startsWith('a:')) {
      const id = key.slice(2) as ArmorId;
      const a = ARMOR[id];
      const on = s.armor[a.slot] === id;
      const btn = `<button type="button" class="btn" ${on ? `data-unequip="${id}"` : `data-wear="${id}"`} ${s.player.inVillage ? '' : 'disabled'}>${on ? M.unequip : M.wear}</button>`;
      return `<div class="detail">${img(armorIconUrl(id), 'ico lg')}<div><b>${th.armor[id].name}</b><p class="meta">${M.armorMeta(M.slots[a.slot], a.defense, a.maxHp, a.stamina)} · ${th.armor[id].desc}</p>${btn}</div></div>`;
    }
    const id = key.slice(2) as MaterialId;
    const m = MATERIALS[id];
    const tag = m.rarity ? ` <span class="tag">${th.rarity[m.rarity]}</span>` : '';
    const src = itemSources(id).map((x) => `<li>${sourceText(x)}</li>`).join('') || `<li class="meta">${M.noSource}</li>`;
    const use = itemUses(id).map((x) => `<li>${useText(x)}</li>`).join('') || `<li class="meta">${M.noUse}</li>`;
    return `<div class="detail">${img(materialIconUrl(id), 'ico lg')}<div><b>${th.materials[id]}</b>${tag}<p class="meta">${M.have(s.inv[id])}</p><div class="dcols"><div><h4>${M.sourcesTitle}</h4><ul>${src}</ul></div><div><h4>${M.usesTitle}</h4><ul>${use}</ul></div></div></div></div>`;
  }

  private forge(s: GameState): string {
    const p = s.player;
    const iv = p.inVillage;
    let h = `${this.villageNote(s)}<h3 class="sec">${th.menu.weaponsTitle}</h3><div class="recipes">`;
    for (const [k, w] of Object.entries(WEAPONS) as [WeaponId, (typeof WEAPONS)[WeaponId]][]) {
      const own = s.owned.has(k);
      const eq = p.weapon === k;
      let btn: string;
      if (eq) btn = `<button type="button" disabled>${th.menu.equipped}</button>`;
      else if (own) btn = `<button type="button" data-equip="${k}" ${iv ? '' : 'disabled'}>${th.menu.equip}</button>`;
      else btn = `<button type="button" class="primary" data-craft="${k}" ${iv && w.recipe && canAfford(s.inv, w.recipe) ? '' : 'disabled'}>${th.menu.craft}</button>`;
      const speed = w.rate < 0.5 ? th.menu.speed.fast : w.rate < 0.8 ? th.menu.speed.mid : th.menu.speed.slow;
      h += `<div class="rc${eq ? ' eq' : ''}"><h3>${img(weaponIconUrl(k))}${th.weapons[k].name}</h3><div class="meta">${th.menu.weaponMeta(th.weaponTypes[w.type], w.damage, speed, th.weapons[k].desc)}</div>${own || !w.recipe ? '' : `<div class="req">${this.req(s, w.recipe)}</div>`}${btn}</div>`;
    }
    h += `</div><h3 class="sec">${th.menu.armorTitle}</h3><div class="recipes">`;
    for (const id of ARMOR_IDS) {
      const a = ARMOR[id];
      const own = s.ownedArmor.has(id);
      const on = s.armor[a.slot] === id;
      let btn: string;
      if (on) btn = `<button type="button" data-unequip="${id}" ${iv ? '' : 'disabled'}>${th.menu.unequip}</button>`;
      else if (own) btn = `<button type="button" data-wear="${id}" ${iv ? '' : 'disabled'}>${th.menu.wear}</button>`;
      else btn = `<button type="button" class="primary" data-armorcraft="${id}" ${iv && canAfford(s.inv, a.recipe) ? '' : 'disabled'}>${th.menu.craftArmor}</button>`;
      h += `<div class="rc${on ? ' eq' : ''}"><h3>${img(armorIconUrl(id))}${th.armor[id].name}</h3><div class="meta">${th.menu.armorMeta(th.menu.slots[a.slot], a.defense, a.maxHp, a.stamina)}</div>${own ? '' : `<div class="req">${this.req(s, a.recipe)}</div>`}${btn}</div>`;
    }
    h += `</div><h3 class="sec">${th.menu.potionName}</h3><div class="recipes">`;
    const P = TUNING.player.potion;
    h += `<div class="rc"><h3>${img(potionIconUrl())}${th.menu.potionName}</h3><div class="meta">${th.menu.potionMeta(P.heal, p.potions)}</div><div class="req">${this.req(s, { herb: P.herbCost })}</div><button type="button" class="primary" data-potion="1" ${iv && s.inv.herb >= P.herbCost ? '' : 'disabled'}>${th.menu.brew}</button></div></div>`;
    return h;
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
    h += `<p class="note">${th.menu.growInfo(th.crops[s.selCrop].name, fmtTime(sel.growSeconds), th.crops[s.selCrop].source)}</p>`;
    h += `<label class="chk"><input type="checkbox" id="useFert" ${s.useFert ? 'checked' : ''}> ${th.menu.useFert(s.inv.fert)}</label>`;
    h += `<div class="row"><span class="note">${th.menu.plantAllHelp}</span><button type="button" class="btn" data-plantall="1" ${iv ? '' : 'disabled'}>${th.menu.plantAll}</button></div>`;
    h += `<div class="plotgrid">${s.plots
      .map((pl, i) => {
        if (!pl.crop) return `<button type="button" class="plot" data-plot="${i}" ${iv ? '' : 'disabled'}>${th.menu.plotEmpty}<span class="meta">${th.menu.plotTapToPlant}</span></button>`;
        const pr = plotProgress(pl, s.now);
        const ripe = pr >= 1;
        const left = th.menu.plotLeft(fmtTime((pl.dur - (s.now - pl.at)) / 1000));
        return `<button type="button" class="plot${ripe ? ' ripe' : ''}" data-plot="${i}" ${iv ? '' : 'disabled'}>${th.crops[pl.crop].name}<span class="meta">${ripe ? th.menu.plotRipe : left}</span><span class="pbar"><i style="width:${pr * 100}%;background:${CROPS[pl.crop].color}"></i></span></button>`;
      })
      .join('')}</div>`;
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
    if (d.filter) {
      this.filter = d.filter as BagFilter;
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
      if (equipWeapon(s, id).ok) this.hud.toast(th.log.equipped(th.weapons[id].name));
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
  if (x.kind === 'meal') return `${img(mealIconUrl(x.meal), 'ico sm')}${U.meal(th.meals[x.meal].name)}`;
  if (x.kind === 'potion') return `${img(potionIconUrl(), 'ico sm')}${U.potion}`;
  if (x.kind === 'plant') return U.plant(th.crops[x.crop].name);
  return U.fertilizer;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}
