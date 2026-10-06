import type { ItemBag, MaterialId } from '../data/types';
import * as th from '../i18n/th';

/** Seconds → m:ss */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtItems(bag: ItemBag): string {
  return Object.entries(bag)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k, n]) => th.log.itemCount(th.materials[k as MaterialId], n ?? 0))
    .join(', ');
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export function $(root: ParentNode, sel: string): HTMLElement {
  const e = root.querySelector<HTMLElement>(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e;
}

export const ICONS = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h4L13 5v14l-5-4.5H4z"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h4L13 5v14l-5-4.5H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  attack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M14.5 4H20v5.5L10 19.5 4.5 14z"/><path d="M7 12l5 5M4 20l2.5-2.5"/></svg>',
  dodge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>',
  whirl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4a8 8 0 1 1-7.4 5M4 4v5h5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13M13 7l5 5-5 5M3 7h5M3 17h5"/></svg>',
  slam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M8 8l4 4 4-4M4 20h16M6 16l-2 4M18 16l2 4M12 16v4"/></svg>',
  crosscut: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/><path d="M15 5h4v4M5 15v4h4" stroke-width="1.8"/></svg>',
  sweep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 0 16 0"/><rect x="15" y="4" width="6" height="5" rx="1"/><path d="M12 13l5-5"/></svg>',
  quake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="5" rx="1"/><path d="M12 8v6M3 19h18M6 15l3 4 3-3 3 3 3-4"/></svg>',
  cleave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v14M8 12l4 4 4-4"/><path d="M4 20h16"/><path d="M9 4h6" stroke-width="3"/></svg>',
  coreburst: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/></svg>',
  thrust: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h15M15 8l5 4-5 4"/><path d="M3 7h6M3 17h6" stroke-width="1.8"/></svg>',
  pierce: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h17M16 8l5 4-5 4"/><circle cx="9" cy="12" r="3"/></svg>',
  volley: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M16 9l3 3-3 3M4 12l13-7M14 4l3 1-1 3M4 12l13 7M16 16l1 3-3 1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13M13 8l4 4-4 4"/><path d="M20 5v14" stroke-width="2.6"/></svg>',
  piercer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h18M17 9l3 3-3 3"/><path d="M8 7v10M13 7v10" stroke-width="1.6"/></svg>',
  gore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14h9M3 9h6"/><path d="M13 16c5 0 8-3 8-8-2 3-4 4-8 4"/></svg>',
  tigerlunge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9h15M14 6l4 3-4 3M2 16h15M14 13l4 3-4 3"/></svg>',
  stripestorm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M8 6l2 4M14 5l-1 4M18 10l-4 2M17 16l-4-2M10 18l1-4"/></svg>',
  cobrastrike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18c3 0 3-4 6-4s3 4 6 4"/><path d="M12 10l8-4M17 4l3 2-2 3"/></svg>',
  deathroll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 1-8.5 6M3 3v6h6"/><path d="M8 12h8M10 15h4"/></svg>',
  cliffhorn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 13h17M16 10l4 3-4 3"/><path d="M4 9c2-4 5-5 8-4"/></svg>',
  bearmaul: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l2 6M12 3v7M17 4l-2 6"/><path d="M3 20h18M5 16l-1 4M19 16l1 4M8 14h8"/></svg>',
  forestwrath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 3 6 6 6 10a6 6 0 0 1-12 0c0-4 2-7 6-10z"/><path d="M12 9v9M9 13l3 2 3-2"/></svg>',
  kingcrush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 0-5 2-5 5 0 2 2 3 5 3s5-1 5-3c0-3-2-5-5-5z"/><path d="M12 11v5M4 20h16M7 17l-2 3M17 17l2 3"/></svg>',
  batstorm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10c3-3 6-3 7 0 1-2 5-2 6 0 1-3 4-3 7 0"/><path d="M5 17h14M15 14l4 3-4 3"/></svg>',
  nagafury: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c4 0 4-5 8-5s4 5 8 5"/><path d="M12 15V4M9 6l3-3 3 3M8 10h8"/></svg>',
  tidelunge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10h16M15 7l4 3-4 3"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>',
  crabpincer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-6 3-9 8-10M5 5c0 6 3 9 8 10"/><path d="M13 9l6-3M13 15l6 3"/></svg>',
  pearlrain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="3"/><path d="M10 8l10-3M10 12h11M10 16l10 3"/></svg>',
  stampede: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M14 9l3 3-3 3"/></svg>',
  catvolley: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l2-5 3 4M10 8l3-4 2 5"/><path d="M8 14l12-3M8 17h12M8 20l12 2"/></svg>',
  shadowcleave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20L20 3M7 20L20 7M3 16L16 3"/></svg>',
  hornrush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h15M15 9l4 3-4 3"/><path d="M5 7c2-3 5-3 7 0M5 17c2 3 5 3 7 0"/></svg>',
  plumedance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V10M12 10L5 4M12 10l7-6M12 10L4 9M12 10l8-1"/><circle cx="12" cy="10" r="1.5"/></svg>',
  herdcrush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5c-3 2-3 6 0 7M18 5c3 2 3 6 0 7M8 9h8"/><path d="M3 20h18M7 16l-2 4M17 16l2 4"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h19M18 9l3 3-3 3"/><path d="M4 6l4 6-4 6" stroke-width="1.8"/></svg>',
  // one icon per menu tab (HUD top-right)
  tab_bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M5 9h14l-1 11H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M9 13h6"/></svg>',
  tab_forge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M4 10h13a3 3 0 0 1-3 3H9l-1 3h8M6 20h12"/><path d="M14 3l4 4M12 5l2-2 4 4-2 2"/></svg>',
  tab_kitchen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M4 11h16v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z"/><path d="M2 11h20M9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4"/></svg>',
  tab_farm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M12 21v-9"/><path d="M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z"/><path d="M5 21h14"/></svg>',
  tab_book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M19 19v2H6"/><path d="M9 8c1.5-1 3.5-1 5 0M10 11h3"/></svg>',
  tab_map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  potion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M10 3h4M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3"/></svg>',
} as const;
