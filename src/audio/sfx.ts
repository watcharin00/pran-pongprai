// Sound effects synthesised with Web Audio (no audio files, like the procedural sprites).
// The AudioContext only starts after the first tap/key press, as mobile browsers require.

export type SfxName =
  | 'swing'
  | 'swingHeavy'
  | 'bow'
  | 'hit'
  | 'hitHeavy'
  | 'partBreak'
  | 'kill'
  | 'telegraph'
  | 'telegraphBig'
  | 'strike'
  | 'stun'
  | 'enrage'
  | 'hurt'
  | 'dodge'
  | 'roll'
  | 'drink'
  | 'skill'
  | 'impact'
  | 'pickup'
  | 'plant'
  | 'harvest'
  | 'craft'
  | 'cook'
  | 'ui'
  | 'error';

export interface SoundSettings {
  on: boolean;
  /** 0..1 */
  volume: number;
}

export const DEFAULT_SOUND: SoundSettings = { on: true, volume: 0.7 };

/** Parses stored settings; anything malformed falls back to the defaults. */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return { ...DEFAULT_SOUND };
  try {
    const v = JSON.parse(raw) as Partial<SoundSettings>;
    const on = typeof v.on === 'boolean' ? v.on : DEFAULT_SOUND.on;
    const volume = typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_SOUND.volume;
    return { on, volume };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

/** Gain for a sound `dist` px from the player: full up close, quiet but audible at the screen edge. */
export function distanceGain(dist: number): number {
  const NEAR = 80;
  const FAR = 340;
  if (dist <= NEAR) return 1;
  return Math.max(0.15, 1 - (dist - NEAR) / (FAR - NEAR));
}

/** Minimum seconds between two plays of the same sound (stops hit spam from turning into noise). */
const THROTTLE: Partial<Record<SfxName, number>> = {
  swing: 0.05,
  swingHeavy: 0.05,
  bow: 0.05,
  hit: 0.035,
  hitHeavy: 0.035,
  telegraph: 0.08,
  roll: 0.1,
  pickup: 0.06,
  ui: 0.04,
};
const MAX_VOICES = 24;

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private voices = 0;
  private readonly last = new Map<SfxName, number>();
  private settings: SoundSettings;

  constructor(settings: SoundSettings) {
    this.settings = { ...settings };
    const unlock = (): void => {
      this.ensure();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
      }
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  get current(): SoundSettings {
    return { ...this.settings };
  }

  set(settings: SoundSettings): void {
    this.settings = { ...settings };
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.level(), this.ctx.currentTime);
  }

  /** Plays a sound; `gain` scales it (e.g. by distance). Silently does nothing before the first tap. */
  play(name: SfxName, gain = 1): void {
    if (!this.settings.on || this.settings.volume <= 0 || gain <= 0) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const gap = THROTTLE[name] ?? 0;
    if (gap > 0 && now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    RECIPES[name](this, now, gain);
  }

  private level(): number {
    // perceptual curve: the slider feels linear
    return this.settings.volume * this.settings.volume * 0.9;
  }

  private ensure(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 6;
        comp.connect(ctx.destination);
        const master = ctx.createGain();
        master.gain.value = this.level();
        master.connect(comp);
        const len = Math.floor(ctx.sampleRate * 0.6);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.master = master;
        this.noiseBuf = buf;
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      /* no audio on this device: the game stays silent */
    }
  }

  // ---------------------------------------------------------------- building blocks

  /** One oscillator with a pitch sweep and a quick attack / exponential decay. */
  tone(t: number, wave: Wave, f0: number, f1: number, dur: number, gain: number, attack = 0.005): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    this.track(osc, t, dur);
  }

  /** Filtered white noise with a swept cutoff: whooshes, thuds, crunches. */
  noise(t: number, filter: BiquadFilterType, f0: number, f1: number, dur: number, gain: number, q = 1): void {
    const ctx = this.ctx;
    const out = this.master;
    if (!ctx || !out || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq).connect(g).connect(out);
    this.track(src, t, dur);
  }

  private track(node: AudioScheduledSourceNode, t: number, dur: number): void {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
    node.start(t);
    node.stop(t + dur + 0.02);
  }
}

type Recipe = (s: Sfx, t: number, g: number) => void;

/** Sound design: short, bright 16-bit style cues. Volumes are relative to each other. */
const RECIPES: Record<SfxName, Recipe> = {
  swing: (s, t, g) => s.noise(t, 'bandpass', 2400, 700, 0.1, 0.22 * g, 1.4),
  swingHeavy: (s, t, g) => s.noise(t, 'bandpass', 1100, 260, 0.18, 0.3 * g, 1.2),
  bow: (s, t, g) => {
    s.tone(t, 'triangle', 620, 330, 0.09, 0.18 * g);
    s.noise(t, 'highpass', 3000, 3000, 0.05, 0.08 * g);
  },
  hit: (s, t, g) => {
    s.tone(t, 'square', 240, 90, 0.07, 0.16 * g);
    s.noise(t, 'lowpass', 2600, 500, 0.06, 0.26 * g);
  },
  hitHeavy: (s, t, g) => {
    s.tone(t, 'square', 200, 70, 0.09, 0.18 * g);
    s.tone(t, 'sine', 130, 45, 0.16, 0.4 * g);
    s.noise(t, 'lowpass', 2000, 300, 0.1, 0.3 * g);
  },
  partBreak: (s, t, g) => {
    s.noise(t, 'lowpass', 4000, 300, 0.28, 0.4 * g);
    s.tone(t, 'square', 320, 70, 0.2, 0.2 * g);
    s.tone(t + 0.06, 'triangle', 988, 988, 0.12, 0.16 * g);
    s.tone(t + 0.12, 'triangle', 1319, 1319, 0.2, 0.16 * g);
  },
  kill: (s, t, g) => {
    [523, 659, 784, 1047].forEach((f, i) => s.tone(t + i * 0.075, 'triangle', f, f, i === 3 ? 0.32 : 0.12, 0.2 * g));
    s.tone(t + 0.225, 'square', 523, 523, 0.3, 0.05 * g);
  },
  // the dodge cue: clear but short so it never masks the hit sounds
  telegraph: (s, t, g) => {
    s.tone(t, 'square', 740, 740, 0.05, 0.1 * g);
    s.tone(t + 0.07, 'square', 988, 988, 0.07, 0.1 * g);
  },
  telegraphBig: (s, t, g) => {
    s.tone(t, 'sawtooth', 160, 320, 0.22, 0.14 * g, 0.02);
    s.tone(t, 'square', 660, 990, 0.18, 0.07 * g, 0.02);
  },
  strike: (s, t, g) => {
    s.tone(t, 'sine', 110, 38, 0.22, 0.42 * g);
    s.noise(t, 'lowpass', 900, 150, 0.2, 0.3 * g);
  },
  stun: (s, t, g) => {
    for (let i = 0; i < 4; i++) s.tone(t + i * 0.06, 'triangle', i % 2 ? 1568 : 1175, i % 2 ? 1568 : 1175, 0.08, 0.1 * g);
  },
  enrage: (s, t, g) => {
    s.tone(t, 'sawtooth', 140, 70, 0.5, 0.2 * g, 0.04);
    s.tone(t, 'sawtooth', 147, 72, 0.5, 0.14 * g, 0.04);
    s.noise(t, 'lowpass', 600, 200, 0.45, 0.16 * g);
  },
  hurt: (s, t, g) => {
    s.tone(t, 'square', 330, 110, 0.16, 0.2 * g);
    s.noise(t, 'bandpass', 1200, 400, 0.12, 0.24 * g, 0.8);
  },
  dodge: (s, t, g) => {
    s.tone(t, 'triangle', 1320, 1980, 0.1, 0.13 * g);
    s.tone(t + 0.05, 'sine', 2640, 2640, 0.12, 0.07 * g);
  },
  roll: (s, t, g) => s.noise(t, 'bandpass', 700, 260, 0.14, 0.16 * g, 0.9),
  drink: (s, t, g) => {
    for (let i = 0; i < 3; i++) s.tone(t + i * 0.07, 'sine', 380 + i * 90, 820 + i * 120, 0.07, 0.16 * g);
    s.tone(t + 0.24, 'triangle', 1047, 1568, 0.18, 0.1 * g);
  },
  skill: (s, t, g) => s.tone(t, 'sawtooth', 220, 660, 0.16, 0.08 * g, 0.03),
  impact: (s, t, g) => {
    s.tone(t, 'sine', 150, 36, 0.32, 0.5 * g);
    s.noise(t, 'lowpass', 1800, 180, 0.3, 0.36 * g);
  },
  pickup: (s, t, g) => {
    s.tone(t, 'triangle', 880, 880, 0.06, 0.14 * g);
    s.tone(t + 0.06, 'triangle', 1319, 1319, 0.1, 0.14 * g);
  },
  plant: (s, t, g) => {
    s.noise(t, 'lowpass', 900, 300, 0.1, 0.2 * g);
    s.tone(t + 0.04, 'sine', 520, 700, 0.08, 0.08 * g);
  },
  harvest: (s, t, g) => {
    [784, 988, 1175].forEach((f, i) => s.tone(t + i * 0.06, 'triangle', f, f, 0.1, 0.14 * g));
  },
  craft: (s, t, g) => {
    // anvil: two hammer strikes with inharmonic ringing partials
    for (const dt of [0, 0.16]) {
      s.tone(t + dt, 'square', 1180, 1150, 0.3, 0.07 * g);
      s.tone(t + dt, 'triangle', 1870, 1840, 0.36, 0.08 * g);
      s.tone(t + dt, 'sine', 2960, 2900, 0.22, 0.05 * g);
      s.noise(t + dt, 'highpass', 2500, 2500, 0.04, 0.14 * g);
    }
  },
  cook: (s, t, g) => {
    for (let i = 0; i < 5; i++) s.tone(t + i * 0.05, 'sine', 300 + ((i * 137) % 200), 600 + ((i * 89) % 300), 0.05, 0.12 * g);
    s.tone(t + 0.28, 'triangle', 784, 1175, 0.16, 0.1 * g);
  },
  ui: (s, t, g) => s.tone(t, 'triangle', 1100, 900, 0.035, 0.07 * g),
  error: (s, t, g) => {
    s.tone(t, 'square', 220, 200, 0.07, 0.08 * g);
    s.tone(t + 0.09, 'square', 180, 165, 0.09, 0.08 * g);
  },
};
