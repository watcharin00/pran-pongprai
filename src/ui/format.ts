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
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h19M18 9l3 3-3 3"/><path d="M4 6l4 6-4 6" stroke-width="1.8"/></svg>',
  potion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M10 3h4M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3"/></svg>',
} as const;
