// Small popup above a farm plot tapped in the world: pick a seed to plant there (or fill every
// empty plot of that bed), or see how long a growing crop has left and fertilise it.
// Ripe plots never open it: the tap harvests them straight away (see WorldScene).
import { CROPS } from '../data';
import type { CropId } from '../data/types';
import { cropFor, cropsForBed, fertilize, freePlotsFor, plant, plantAllOf, plotProgress } from '../core/farm';
import type { GameState } from '../core/state';
import { materialIconUrl } from '../art/icons';
import * as th from '../i18n/th';
import { fmtTime } from './format';

export interface PlotPopupHooks {
  state: () => GameState;
  /** after anything changed: save and refresh the HUD */
  changed: () => void;
  toast: (msg: string, cls?: 'gold' | 'bad') => void;
  sfx: (name: 'ui' | 'error' | 'plant') => void;
}

export class PlotPopup {
  private readonly el: HTMLDivElement;
  private index = -1;
  private renderKey = '';

  constructor(
    overlay: HTMLElement,
    private readonly hooks: PlotPopupHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'plotpop';
    this.el.hidden = true;
    overlay.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => this.onClick(e));
    // any press outside closes it
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.isOpen || this.el.contains(e.target as Node)) return;
        this.close();
      },
      true,
    );
  }

  get isOpen(): boolean {
    return this.index >= 0;
  }

  open(index: number): void {
    this.index = index;
    this.renderKey = '';
    this.el.hidden = false;
    this.hooks.sfx('ui');
  }

  close(): void {
    this.index = -1;
    this.el.hidden = true;
  }

  /** Every frame: follow the plot on screen, refresh the text, close when it no longer applies. */
  update(toClient: (wx: number, wy: number) => { x: number; y: number }): void {
    if (!this.isOpen) return;
    const s = this.hooks.state();
    const plot = s.plots[this.index];
    if (!plot || s.area !== 'home' || !s.player.inVillage || s.player.dead || plotProgress(plot, s.now) >= 1) {
      this.close();
      return;
    }
    this.render(s);
    const { x, y } = toClient(plot.x, plot.y - 10);
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2));
    // above the plot when there is room, otherwise below it
    const top = y - h - 14 > 8 ? y - h - 14 : y + 28;
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
    this.el.style.setProperty('--ax', `${Math.round(Math.max(14, Math.min(w - 14, x - left)))}px`);
    this.el.classList.toggle('below', top > y);
  }

  private render(s: GameState): void {
    const plot = s.plots[this.index];
    if (!plot) return;
    const M = th.menu;
    const P = th.plotPop;
    const seeds = cropsForBed(plot.bed).map((c) => s.inv[CROPS[c].seed]);
    const left = plot.crop ? Math.ceil((plot.at + plot.dur - s.now) / 1000) : 0;
    const key = `${this.index}|${plot.crop ?? ''}|${plot.fert}|${left}|${seeds.join()}|${s.inv.fert}|${s.useFert}|${s.selCrop}`;
    if (key === this.renderKey) return;
    this.renderKey = key;
    const bed = M.beds[plot.bed];
    let h: string;
    if (plot.crop) {
      const pct = Math.round(plotProgress(plot, s.now) * 100);
      h = `<div class="pp-head"><img class="ico" src="${materialIconUrl(CROPS[plot.crop].seed)}" alt=""><b>${th.crops[plot.crop].name}</b><span>${M.plotLeft(fmtTime(left))}</span></div>`;
      h += `<div class="pp-bar"><i style="width:${pct}%"></i></div>`;
      h += plot.fert
        ? `<p class="pp-note">${P.fertilized}</p>`
        : `<button type="button" class="pp-btn" data-fert="1" ${s.inv.fert > 0 ? '' : 'disabled'}>${P.fertilize(s.inv.fert)}</button>`;
    } else {
      h = `<div class="pp-head"><b>${P.empty(bed)}</b></div><div class="pp-seeds">`;
      for (const c of cropsForBed(plot.bed)) {
        const n = s.inv[CROPS[c].seed];
        h += `<button type="button" class="pp-seed${s.selCrop === c ? ' sel' : ''}" data-plant="${c}" ${n > 0 ? '' : 'disabled'} title="${n > 0 ? '' : P.noSeed(th.crops[c].source)}"><img class="ico" src="${materialIconUrl(CROPS[c].seed)}" alt=""><span>${th.crops[c].name}</span><em>×${n}</em></button>`;
      }
      h += '</div>';
      const pick = cropFor(s, plot.bed);
      if (pick && s.inv[CROPS[pick].seed] > 0 && freePlotsFor(s, pick) > 1) {
        h += `<button type="button" class="pp-btn" data-all="${pick}">${P.plantAll(th.crops[pick].name, Math.min(freePlotsFor(s, pick), s.inv[CROPS[pick].seed]))}</button>`;
      }
      if (s.inv.fert > 0) h += `<button type="button" class="pp-chip${s.useFert ? ' on' : ''}" data-usefert="1">${P.useFert(s.inv.fert, s.useFert)}</button>`;
    }
    this.el.innerHTML = h;
  }

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const s = this.hooks.state();
    const d = b.dataset;
    if (d.plant) {
      const crop = d.plant as CropId;
      s.selCrop = crop;
      if (plant(s, this.index, crop)) {
        this.close();
        this.hooks.changed();
      } else this.hooks.sfx('error');
      return;
    }
    if (d.all) {
      const n = plantAllOf(s, d.all as CropId);
      if (n > 0) {
        this.hooks.toast(th.plotPop.plantedAll(th.crops[d.all as CropId].name, n), 'gold');
        this.close();
        this.hooks.changed();
      }
      return;
    }
    if (d.fert) {
      if (fertilize(s, this.index)) {
        this.hooks.toast(th.plotPop.fertilizedLog, 'gold');
        this.hooks.sfx('plant');
        this.renderKey = '';
        this.hooks.changed();
      }
      return;
    }
    if (d.usefert) {
      s.useFert = !s.useFert;
      this.hooks.sfx('ui');
      this.renderKey = '';
    }
  }
}
