import confetti from 'canvas-confetti';
import { useStore } from '@/store/store';
import { ACCENTS } from '@/lib/colors';

export type SoundName =
  | 'tick'
  | 'complete'
  | 'undo'
  | 'perfect'
  | 'levelUp'
  | 'achievement'
  | 'relapse'
  | 'timerStart'
  | 'timerStop';

const MASTER_GAIN = 0.15;
// drops the repeat from a fast double tap
const RETRIGGER_GUARD_MS = 35;

interface AudioEngine {
  ctx: AudioContext;
  out: AudioNode;
}

let engine: AudioEngine | null = null;
let audioUnsupported = false;
const lastPlayedAt = new Map<SoundName, number>();

// created on first use so it starts inside a user gesture (autoplay policy)
function getAudio(): AudioEngine | null {
  if (audioUnsupported) return null;
  if (!engine) {
    if (typeof window === 'undefined') {
      audioUnsupported = true;
      return null;
    }
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      audioUnsupported = true;
      return null;
    }
    try {
      const ctx = new Ctor();
      // master -> low-pass -> compressor so stacked chords never clip
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      const warmth = ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = 6500;
      warmth.Q.value = 0.5;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      master.connect(warmth);
      warmth.connect(limiter);
      limiter.connect(ctx.destination);
      engine = { ctx, out: master };
    } catch {
      audioUnsupported = true;
      return null;
    }
  }
  if (engine.ctx.state !== 'running') {
    engine.ctx.resume().catch(() => undefined);
  }
  return engine;
}

interface Voice {
  freq: number;
  at?: number; // seconds after the sound starts
  decay?: number;
  attack?: number;
  gain?: number;
  type?: OscillatorType;
  glideTo?: number;
  detune?: number; // cents
}

function playVoice({ ctx, out }: AudioEngine, start: number, v: Voice): void {
  const t0 = start + (v.at ?? 0);
  const attack = v.attack ?? 0.006;
  const decay = v.decay ?? 0.14;
  const peak = Math.max(0.0002, v.gain ?? 0.5);

  const osc = ctx.createOscillator();
  osc.type = v.type ?? 'sine';
  osc.frequency.setValueAtTime(v.freq, t0);
  if (v.glideTo) osc.frequency.exponentialRampToValueAtTime(v.glideTo, t0 + attack + decay * 0.8);
  if (v.detune) osc.detune.setValueAtTime(v.detune, t0);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

  osc.connect(env);
  env.connect(out);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

function bell(freq: number, at: number, decay: number, gain: number): Voice[] {
  return [
    { freq, at, decay, gain },
    { freq: freq * 2, at, decay: decay * 0.55, gain: gain * 0.22, type: 'triangle' },
  ];
}

function pad(freq: number, at: number, decay: number, gain: number): Voice[] {
  return [
    { freq, at, decay, gain: gain * 0.6, attack: 0.02, detune: -5 },
    { freq, at, decay, gain: gain * 0.6, attack: 0.02, detune: 5 },
  ];
}

const N = {
  G3: 196.0, A3: 220.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, Gs6: 1661.22, B6: 1975.53, C7: 2093.0, E7: 2637.02,
} as const;

const SOUNDS: Record<SoundName, () => Voice[]> = {
  tick: () => [{ freq: N.G5, glideTo: N.C6, decay: 0.09, gain: 0.55 }],
  undo: () => [{ freq: N.G5, glideTo: N.C5, decay: 0.12, gain: 0.4 }],
  complete: () => [
    ...bell(N.G5, 0, 0.22, 0.45),
    ...bell(N.C6, 0.075, 0.28, 0.45),
    ...bell(N.E6, 0.15, 0.45, 0.4),
  ],
  perfect: () => [
    // strummed Cmaj9 with a little sparkle on top
    ...[N.C5, N.E5, N.G5, N.B5, N.D6].flatMap((f, i) => pad(f, i * 0.04, 1.3, 0.3)),
    ...bell(N.G6, 0.28, 0.5, 0.14),
    ...bell(N.C7, 0.36, 0.7, 0.12),
  ],
  levelUp: () => [
    ...[N.C5, N.E5, N.G5, N.C6].flatMap((f, i) => bell(f, i * 0.075, 0.2, 0.4)),
    ...[N.C5, N.E5, N.G5, N.C6, N.E6].flatMap((f) => pad(f, 0.32, 1.1, 0.24)),
    ...bell(N.G6, 0.4, 0.7, 0.12),
  ],
  achievement: () => [
    ...[N.E6, N.Gs6, N.B6, N.E7].flatMap((f, i) => [
      { freq: f, at: i * 0.055, decay: 0.3, gain: 0.26, type: 'triangle' as const },
      { freq: f, at: i * 0.055 + 0.012, decay: 0.22, gain: 0.08, detune: 12 },
    ]),
    ...bell(N.E7, 0.26, 0.8, 0.16),
    ...bell(N.B6, 0.3, 0.6, 0.1),
  ],
  relapse: () => [
    { freq: N.A3, glideTo: N.G3, attack: 0.04, decay: 0.55, gain: 0.5 },
    { freq: N.A3 * 2, glideTo: N.G3 * 2, attack: 0.05, decay: 0.35, gain: 0.08 },
  ],
  timerStart: () => [
    { freq: N.G5, decay: 0.08, gain: 0.4 },
    { freq: N.D6, at: 0.08, decay: 0.12, gain: 0.4 },
  ],
  timerStop: () => [
    { freq: N.D6, decay: 0.08, gain: 0.4 },
    { freq: N.G5, at: 0.08, decay: 0.16, gain: 0.4 },
  ],
};

function settings() {
  return useStore.getState().data.settings;
}

export function playSound(name: SoundName): void {
  if (!settings().soundEnabled) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const last = lastPlayedAt.get(name);
  if (last !== undefined && now - last < RETRIGGER_GUARD_MS) return;
  const audio = getAudio();
  if (!audio) return;
  lastPlayedAt.set(name, now);
  try {
    const start = audio.ctx.currentTime + 0.01;
    for (const voice of SOUNDS[name]()) playVoice(audio, start, voice);
  } catch {
    // context can be closed by the browser; sound is optional anyway
  }
}

const GOLD = '#fbbf24';
const LIGHT_GOLD = '#fde68a';
const CONFETTI_Z_INDEX = 9999;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function prefersReducedMotion(): boolean {
  if (settings().reduceMotion) return true;
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function confettiAllowed(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
    && settings().confettiEnabled && !prefersReducedMotion();
}

// canvas-confetti only takes hex, but computed styles can come back as rgb()
function toHex(value: string): string | null {
  const v = value.trim();
  if (HEX_RE.test(v)) return v;
  const m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(v);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((c) => Math.min(255, Math.round(Number(c))).toString(16).padStart(2, '0')).join('')}`;
}

function accentColors(): [string, string] {
  const fallback = ACCENTS[settings().accent]?.hex ?? ACCENTS.violet.hex;
  try {
    const style = getComputedStyle(document.documentElement);
    const accent = toHex(style.getPropertyValue('--accent')) ?? fallback;
    const accent2 = toHex(style.getPropertyValue('--accent-2')) ?? accent;
    return [accent, accent2];
  } catch {
    return [fallback, fallback];
  }
}

function defaultColors(): string[] {
  const [accent, accent2] = accentColors();
  return [accent, accent2, GOLD];
}

function resolveColors(colors?: string[]): string[] {
  const valid = (colors ?? []).map(toHex).filter((c): c is string => c !== null);
  return valid.length > 0 ? valid : defaultColors();
}

function fire(options: confetti.Options): void {
  try {
    void confetti({ zIndex: CONFETTI_Z_INDEX, disableForReducedMotion: true, ...options });
  } catch {
    // no canvas, fine to skip
  }
}

/** origin is in viewport pixels. */
export function confettiBurst(origin?: { x: number; y: number }, colors?: string[]): void {
  if (!confettiAllowed()) return;
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  const point = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)
    ? { x: Math.min(1, Math.max(0, origin.x / width)), y: Math.min(1, Math.max(0, origin.y / height)) }
    : { x: 0.5, y: 0.55 };
  const palette = resolveColors(colors);
  fire({
    particleCount: 38,
    spread: 70,
    startVelocity: 26,
    gravity: 1.1,
    decay: 0.9,
    ticks: 130,
    scalar: 0.8,
    origin: point,
    colors: palette,
  });
  fire({
    particleCount: 10,
    spread: 100,
    startVelocity: 18,
    gravity: 0.8,
    ticks: 100,
    scalar: 0.6,
    shapes: ['circle'],
    origin: point,
    colors: palette,
  });
}

export function confettiFromElement(el: Element | null, colors?: string[]): void {
  if (!el || typeof el.getBoundingClientRect !== 'function') {
    confettiBurst(undefined, colors);
    return;
  }
  const rect = el.getBoundingClientRect();
  confettiBurst({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, colors);
}

function perfectCannons(colors: string[]): void {
  const durationMs = 1300;
  const frameMs = 1000 / 60;
  const start = performance.now();
  let lastFrame = 0;
  const side = (x: number, angle: number, particleCount: number, startVelocity: number) =>
    fire({ particleCount, angle, spread: 55, startVelocity, gravity: 1, ticks: 240, scalar: 0.95, origin: { x, y: 0.72 }, colors });
  side(0, 60, 26, 62);
  side(1, 120, 26, 62);
  const frame = (t: number) => {
    if (t - lastFrame >= frameMs) {
      lastFrame = t;
      side(0, 60, 2, 55);
      side(1, 120, 2, 55);
    }
    if (t - start < durationMs) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function levelUpStarburst(colors: string[]): void {
  const origin = { x: 0.5, y: 0.6 };
  const total = 260;
  const burst = (ratio: number, opts: confetti.Options) =>
    fire({ origin, colors, ticks: 260, ...opts, particleCount: Math.floor(total * ratio) });
  burst(0.25, { spread: 26, startVelocity: 58 });
  burst(0.2, { spread: 60 });
  burst(0.35, { spread: 100, decay: 0.91, scalar: 0.85 });
  burst(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  burst(0.1, { spread: 120, startVelocity: 45 });
  window.setTimeout(() => {
    fire({
      origin: { x: 0.5, y: 0.45 }, colors: [GOLD, LIGHT_GOLD, ...colors.slice(0, 2)], particleCount: 60,
      spread: 360, startVelocity: 32, gravity: 0.35, decay: 0.93, ticks: 140, scalar: 1.15, shapes: ['star'],
    });
  }, 260);
}

function achievementSparkle(colors: string[]): void {
  const palette = [GOLD, LIGHT_GOLD, ...colors.slice(0, 2)];
  const base: confetti.Options = {
    origin: { x: 0.5, y: 0.42 }, spread: 360, ticks: 80, gravity: 0, decay: 0.94, startVelocity: 26, colors: palette,
  };
  const shoot = () => {
    fire({ ...base, particleCount: 36, scalar: 1.25, shapes: ['star'] });
    fire({ ...base, particleCount: 14, scalar: 0.7, shapes: ['circle'] });
  };
  shoot();
  window.setTimeout(shoot, 110);
  window.setTimeout(shoot, 220);
}

export function confettiCelebration(kind: 'perfect' | 'levelUp' | 'achievement' = 'perfect'): void {
  if (!confettiAllowed()) return;
  const colors = defaultColors();
  if (kind === 'levelUp') levelUpStarburst(colors);
  else if (kind === 'achievement') achievementSparkle(colors);
  else perfectCannons(colors);
}

export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  // chrome blocks and logs vibrate() until the user has interacted with the page
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* unsupported */
  }
}
