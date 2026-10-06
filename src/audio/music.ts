// Background music synthesised with Web Audio, like the sound effects: no audio files.
// Thai-flavoured: pentatonic tunes on a ranat (xylophone) and pi (reed flute), ching cymbals
// marking the beat ("ching" open, "chap" damped) and klong drums. Four moods crossfade into
// each other: village, wild, battle and boss.

export type Mood = 'village' | 'wild' | 'battle' | 'boss' | 'silent';

export interface MoodInput {
  dead: boolean;
  inVillage: boolean;
  /** some monster is chasing the player */
  hunted: boolean;
  /** one of the chasers is a boss (has a rage phase) */
  bossHunted: boolean;
}

/** Seconds of calm before battle music gives way, so a short break in a fight does not flip the track. */
export const BATTLE_LINGER = 4;

/**
 * Next mood from the current one. `calm` is how long (s) nothing has chased the player.
 * Pure so it can be unit tested.
 */
export function nextMood(prev: Mood, input: MoodInput, calm: number): Mood {
  if (input.dead) return 'silent';
  if (input.bossHunted) return 'boss';
  if (input.hunted) return prev === 'boss' ? 'boss' : 'battle';
  if ((prev === 'battle' || prev === 'boss') && calm < BATTLE_LINGER && !input.inVillage) return prev;
  return input.inVillage ? 'village' : 'wild';
}

// ---------------------------------------------------------------- score

/**
 * A part is one line of 16th-note steps. Tokens (space separated):
 * a scale degree (`0`..`9`, may carry `+`/`-` octave marks, e.g. `2+`), `.` rest, `_` hold the previous note.
 */
interface Part {
  inst: Instrument;
  /** one string per bar */
  bars: readonly string[];
  gain: number;
  /** semitone transpose of the whole part */
  octave?: number;
}

type Instrument = 'ranat' | 'pi' | 'khim' | 'bass' | 'ching' | 'klong' | 'thon' | 'gong';

interface Song {
  bpm: number;
  /** semitones above A3 (220 Hz) of the scale root */
  root: number;
  /** semitone offsets of the five scale degrees */
  scale: readonly number[];
  parts: readonly Part[];
  /** overall level of this mood */
  level: number;
}

// Thai music sits close to an equidistant 7-tone scale; a pentatonic subset gives the familiar colour.
const PENTA = [0, 2, 4, 7, 9] as const;
// darker "pi chawa" flavour for the boss: minor pentatonic
const MINOR = [0, 3, 5, 7, 10] as const;

const rep = (s: string, n: number): string[] => Array.from({ length: n }, () => s);

const SONGS: Record<Exclude<Mood, 'silent'>, Song> = {
  // gentle, bright: ranat tune over a khim and a slow ching-chap
  village: {
    bpm: 84,
    root: -2,
    scale: PENTA,
    level: 0.5,
    parts: [
      {
        inst: 'ranat',
        gain: 0.16,
        bars: [
          '4 . 3 . 2 . 3 . 4 . 4+ . 3+ . 2+ .',
          '1+ . 0+ . 4 . 3 . 2 _ _ . 3 . 4 .',
          '2+ . 1+ . 0+ . 4 . 3 . 4 . 2 . 3 .',
          '2 . 1 . 0 . 1 . 2 _ _ _ . . . .',
          '4 . 3 . 2 . 3 . 4 . 4+ . 3+ . 2+ .',
          '3+ . 2+ . 1+ . 0+ . 4 _ _ . 3 . 2 .',
          '1 . 2 . 3 . 4 . 3 . 2 . 1 . 2 .',
          '0 _ _ . . . . . 0+ . . . . . . .',
        ],
      },
      {
        inst: 'khim',
        gain: 0.07,
        octave: -12,
        bars: [
          '0 . 2 . 4 . 2 . 0 . 2 . 4 . 2 .',
          '3- . 0 . 2 . 0 . 3- . 0 . 2 . 0 .',
          '0 . 2 . 4 . 2 . 0 . 2 . 4 . 2 .',
          '1 . 3 . 0+ . 3 . 1 . 3 . 0+ . 3 .',
          '0 . 2 . 4 . 2 . 0 . 2 . 4 . 2 .',
          '3- . 0 . 2 . 0 . 3- . 0 . 2 . 0 .',
          '1 . 3 . 0+ . 3 . 1 . 3 . 0+ . 3 .',
          '0 . 2 . 4 . 2 . 0 . . . . . . .',
        ],
      },
      { inst: 'bass', gain: 0.12, octave: -24, bars: ['0 _ _ _ . . . . 4- _ _ _ . . . .', '3- _ _ _ . . . . 0 _ _ _ . . . .', '0 _ _ _ . . . . 4- _ _ _ . . . .', '1 _ _ _ . . . . 4- _ _ _ . . . .'] },
      { inst: 'ching', gain: 0.05, bars: ['. . . . 1 . . . . . . . 0 . . .'] },
    ],
  },
  // open forest: a lone pi over a drone, sparse ranat drops
  wild: {
    bpm: 72,
    root: 0,
    scale: PENTA,
    level: 0.42,
    parts: [
      {
        inst: 'pi',
        gain: 0.09,
        bars: [
          '2 _ _ _ _ _ 3 _ 4 _ _ _ _ _ _ _',
          '4 _ 3 _ 2 _ _ _ 1 _ _ _ _ _ _ _',
          '0 _ _ _ 1 _ 2 _ 3 _ _ _ 2 _ _ _',
          '. . . . . . . . . . . . . . . .',
          '4 _ _ _ _ _ 0+ _ 1+ _ _ _ 0+ _ 4 _',
          '3 _ _ _ _ _ _ _ 2 _ 3 _ 4 _ _ _',
          '2 _ 1 _ 0 _ _ _ _ _ _ _ _ _ _ _',
          '. . . . . . . . . . . . . . . .',
        ],
      },
      { inst: 'ranat', gain: 0.07, bars: [...rep('. . . . . . . . . . . . . . . .', 3), '. . 4+ . 3+ . 2+ . 0+ . . . . . . .'] },
      { inst: 'bass', gain: 0.1, octave: -24, bars: ['0 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', '0 _ _ _ _ _ _ _ 3- _ _ _ _ _ _ _'] },
      { inst: 'ching', gain: 0.035, bars: ['. . . . . . . . 1 . . . . . . .', '. . . . . . . . . . . . . . . .'] },
    ],
  },
  // driving: ranat 16ths, klong and thon drums, ching on every beat
  battle: {
    bpm: 132,
    root: 2,
    scale: PENTA,
    level: 0.48,
    parts: [
      {
        inst: 'ranat',
        gain: 0.12,
        bars: [
          '0+ 4 3 4 0+ 4 3 2 3 2 0 2 3 4 0+ 1+',
          '2+ 1+ 0+ 1+ 2+ 1+ 0+ 4 0+ 4 3 4 0+ 1+ 2+ 3+',
          '4+ 3+ 2+ 3+ 4+ 3+ 2+ 1+ 2+ 1+ 0+ 1+ 2+ 1+ 0+ 4',
          '3 4 0+ 1+ 0+ 4 3 2 3 _ 2 _ 0 _ . .',
        ],
      },
      { inst: 'pi', gain: 0.06, bars: ['0+ _ _ _ _ _ _ _ 4 _ _ _ 3 _ 4 _', '2+ _ _ _ 1+ _ 0+ _ 4 _ _ _ _ _ _ _', '4+ _ _ _ 3+ _ 2+ _ 1+ _ _ _ 0+ _ _ _', '3 _ 4 _ 0+ _ _ _ _ _ _ _ . . . .'] },
      { inst: 'bass', gain: 0.13, octave: -24, bars: ['0 . 0 . 0 . 0 . 3- . 3- . 4- . 4- .', '0 . 0 . 0 . 0 . 1 . 1 . 0 . 0 .'] },
      { inst: 'klong', gain: 0.22, bars: ['0 . . . 0 . 0 . . . 0 . 0 . . .'] },
      { inst: 'thon', gain: 0.1, bars: ['. . 0 . . . . 0 . . 0 . . 0 . 0'] },
      { inst: 'ching', gain: 0.045, bars: ['0 . . . 1 . . . 0 . . . 1 . . .'] },
    ],
  },
  // heavy and dark: minor pentatonic, gong on the bar, doubled drums
  boss: {
    bpm: 140,
    root: -3,
    scale: MINOR,
    level: 0.5,
    parts: [
      {
        inst: 'ranat',
        gain: 0.11,
        bars: [
          '0 1 2 1 0 1 2 3 2 1 0 1 2 3 4 3',
          '0+ 4 3 4 0+ 4 3 2 3 2 1 2 3 _ 2 _',
          '0 1 2 1 0 1 2 3 2 1 0 1 2 3 4 3',
          '4 3 2 1 2 1 0 4- 0 _ . . 0+ _ . .',
        ],
      },
      { inst: 'pi', gain: 0.07, bars: ['0 _ _ _ _ _ _ _ 1 _ 0 _ 4- _ _ _', '0+ _ _ _ 4 _ 3 _ 2 _ _ _ _ _ _ _', '0 _ _ _ _ _ 1 _ 2 _ 3 _ 2 _ 1 _', '0 _ _ _ _ _ _ _ _ _ _ _ . . . .'] },
      { inst: 'bass', gain: 0.15, octave: -24, bars: ['0 0 . 0 0 . 0 . 1 1 . 1 1 . 1 .', '4- 4- . 4- 4- . 4- . 0 . 0 . 0 . 0 .'] },
      { inst: 'klong', gain: 0.26, bars: ['0 . . 0 . . 0 . 0 . . 0 . . 0 0'] },
      { inst: 'thon', gain: 0.11, bars: ['. . 0 . . 0 . . . . 0 . 0 . . .'] },
      { inst: 'gong', gain: 0.1, octave: -24, bars: ['0 . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . . .'] },
      { inst: 'ching', gain: 0.05, bars: ['0 . 1 . 0 . 1 . 0 . 1 . 0 . 1 .'] },
    ],
  },
};

interface Note {
  /** step within the bar */
  step: number;
  /** semitones from the song root, or the drum variant for percussion */
  pitch: number;
  /** length in steps */
  len: number;
}

/** Parses one bar of a part into notes. Exported for tests. */
export function parseBar(bar: string, scale: readonly number[]): Note[] {
  const toks = bar.trim().split(/\s+/);
  const notes: Note[] = [];
  let last: Note | null = null;
  toks.forEach((tok, step) => {
    if (tok === '_') {
      if (last) last.len++;
      return;
    }
    last = null;
    if (tok === '.') return;
    const m = /^(\d)([+-]*)$/.exec(tok);
    if (!m) return;
    const deg = Number(m[1]);
    const marks = m[2] ?? '';
    const oct = Math.floor(deg / scale.length) + [...marks].reduce((o, c) => o + (c === '+' ? 1 : -1), 0);
    const pitch = (scale[deg % scale.length] ?? 0) + oct * 12;
    last = { step, pitch, len: 1 };
    notes.push(last);
  });
  return notes;
}

const STEPS = 16;

// ---------------------------------------------------------------- player

interface Track {
  mood: Exclude<Mood, 'silent'>;
  bus: GainNode;
  song: Song;
  /** parsed bars per part */
  bars: Note[][][];
  bar: number;
  next: number;
}

/** Plays the mood picked by the scene; `audio()` hands over the context once sound is unlocked. */
export class Music {
  private mood: Mood = 'silent';
  private track: Track | null = null;
  private fading: Track[] = [];
  private timer: number | null = null;
  private volume = 0.5;
  private out: GainNode | null = null;

  constructor(private readonly audio: () => { ctx: AudioContext; dest: AudioNode } | null) {}

  /** 0..1 (0 = music off). */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    const a = this.audio();
    if (this.out && a) this.out.gain.setTargetAtTime(this.level(), a.ctx.currentTime, 0.1);
  }

  get current(): Mood {
    return this.mood;
  }

  /** Switches mood (crossfades); call every frame, it only acts on a change. */
  play(mood: Mood): void {
    const a = this.audio();
    if (!a || a.ctx.state !== 'running') return;
    if (!this.out) {
      this.out = a.ctx.createGain();
      this.out.gain.value = this.level();
      this.out.connect(a.dest);
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 60);
    if (mood === this.mood) return;
    this.mood = mood;
    const t = a.ctx.currentTime;
    if (this.track) {
      this.track.bus.gain.cancelScheduledValues(t);
      this.track.bus.gain.setTargetAtTime(0.0001, t, 0.5);
      this.fading.push(this.track);
      this.track = null;
    }
    if (mood === 'silent') return;
    const song = SONGS[mood];
    const bus = a.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.setTargetAtTime(song.level, t, mood === 'battle' || mood === 'boss' ? 0.15 : 0.8);
    bus.connect(this.out);
    this.track = { mood, bus, song, bars: song.parts.map((p) => p.bars.map((b) => parseBar(b, song.scale))), bar: 0, next: t + 0.05 };
  }

  private level(): number {
    return this.volume * this.volume * 0.8;
  }

  /** Schedules the next bar of every playing track a little ahead of time. */
  private tick(): void {
    const a = this.audio();
    if (!a) return;
    const now = a.ctx.currentTime;
    // retire faded tracks
    this.fading = this.fading.filter((tr) => {
      if (now - tr.next < 3) return true;
      tr.bus.disconnect();
      return false;
    });
    const tr = this.track;
    if (!tr || this.volume <= 0) return;
    // after a suspend (tab hidden) do not try to catch up
    if (tr.next < now - 0.2) tr.next = now + 0.05;
    while (tr.next < now + 0.35) {
      const stepDur = 60 / tr.song.bpm / 4;
      tr.song.parts.forEach((part, pi) => {
        const bars = tr.bars[pi] ?? [];
        const notes = bars[tr.bar % Math.max(1, bars.length)] ?? [];
        for (const n of notes) this.voice(a.ctx, tr.bus, part, tr.song, n, tr.next + n.step * stepDur, n.len * stepDur);
      });
      tr.next += STEPS * stepDur;
      tr.bar++;
    }
  }

  private voice(ctx: AudioContext, bus: GainNode, part: Part, song: Song, n: Note, t: number, len: number): void {
    const freq = 220 * 2 ** ((song.root + n.pitch + (part.octave ?? 0)) / 12);
    const g = part.gain;
    switch (part.inst) {
      case 'ranat': {
        // wooden bar: bright attack, fast decay, a quiet octave partial
        osc(ctx, bus, 'triangle', freq, t, 0.32, g);
        osc(ctx, bus, 'sine', freq * 2, t, 0.12, g * 0.35);
        osc(ctx, bus, 'sine', freq * 4.2, t, 0.03, g * 0.25);
        break;
      }
      case 'khim': {
        osc(ctx, bus, 'triangle', freq, t, 0.5, g);
        osc(ctx, bus, 'triangle', freq * 1.004, t, 0.5, g * 0.6);
        break;
      }
      case 'pi': {
        // reed flute: soft attack, vibrato, held for the note length
        const o = ctx.createOscillator();
        const vib = ctx.createOscillator();
        const vg = ctx.createGain();
        const env = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        vib.frequency.value = 5.2;
        vg.gain.value = freq * 0.012;
        vib.connect(vg).connect(o.frequency);
        const dur = Math.max(0.2, len);
        env.gain.setValueAtTime(0.0001, t);
        env.gain.linearRampToValueAtTime(g, t + 0.08);
        env.gain.setValueAtTime(g, t + dur * 0.8);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
        o.connect(env).connect(bus);
        // a touch of reed buzz
        osc(ctx, bus, 'square', freq, t, Math.min(0.15, dur), g * 0.08, 0.03);
        for (const node of [o, vib]) {
          node.start(t);
          node.stop(t + dur + 0.15);
        }
        break;
      }
      case 'bass': {
        osc(ctx, bus, 'triangle', freq, t, Math.max(0.2, len * 0.95), g, 0.01, true);
        break;
      }
      case 'ching': {
        // 1 = open "ching" (rings), 0 = damped "chap"
        const open = n.pitch > 0;
        osc(ctx, bus, 'sine', 3520, t, open ? 0.6 : 0.06, g);
        osc(ctx, bus, 'sine', 5130, t, open ? 0.4 : 0.05, g * 0.6);
        osc(ctx, bus, 'sine', 7400, t, open ? 0.25 : 0.04, g * 0.4);
        break;
      }
      case 'klong': {
        const o = ctx.createOscillator();
        const env = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
        env.gain.setValueAtTime(g, t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o.connect(env).connect(bus);
        o.start(t);
        o.stop(t + 0.32);
        break;
      }
      case 'thon': {
        // small hand drum: higher, slapped
        osc(ctx, bus, 'sine', 320, t, 0.09, g);
        osc(ctx, bus, 'triangle', 210, t, 0.12, g * 0.6);
        break;
      }
      case 'gong': {
        osc(ctx, bus, 'sine', freq, t, 2.4, g);
        osc(ctx, bus, 'sine', freq * 2.76, t, 1.2, g * 0.4);
        osc(ctx, bus, 'sine', freq * 5.4, t, 0.6, g * 0.2);
        break;
      }
    }
  }
}

/** One enveloped oscillator; `sustain` holds the level until near the end (for bass lines). */
function osc(ctx: AudioContext, bus: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, gain: number, attack = 0.004, sustain = false): void {
  const o = ctx.createOscillator();
  const env = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  if (sustain) env.gain.setValueAtTime(gain, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(env).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Exposed for tests: every bar of every song has exactly 16 steps. */
export const SONG_BARS: readonly { mood: string; bar: string }[] = Object.entries(SONGS).flatMap(([mood, s]) => s.parts.flatMap((p) => p.bars.map((bar) => ({ mood, bar }))));
