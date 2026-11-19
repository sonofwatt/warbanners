import type { GameEvent } from '../engine';

export type SoundName = 'tap' | 'move' | 'hit' | 'fall' | 'build' | 'capture' | 'turn' | 'win';

export const SOUNDS: Record<
  SoundName,
  { wave: 'sine' | 'triangle' | 'square'; notes: readonly number[]; ms: number; gain: number }
> = {
  tap: { wave: 'sine', notes: [660], ms: 60, gain: 0.08 },
  move: { wave: 'triangle', notes: [330, 392], ms: 140, gain: 0.12 },
  hit: { wave: 'square', notes: [220, 160], ms: 160, gain: 0.1 },
  fall: { wave: 'triangle', notes: [300, 220, 150], ms: 300, gain: 0.14 },
  build: { wave: 'sine', notes: [440, 554, 660], ms: 260, gain: 0.12 },
  capture: { wave: 'triangle', notes: [392, 494, 587, 784], ms: 380, gain: 0.14 },
  turn: { wave: 'sine', notes: [523, 659], ms: 200, gain: 0.1 },
  win: { wave: 'triangle', notes: [523, 659, 784, 1046], ms: 400, gain: 0.16 },
};

const ORDER: { name: SoundName; types: readonly GameEvent['type'][] }[] = [
  { name: 'win', types: ['matchOver'] },
  { name: 'capture', types: ['captured'] },
  { name: 'fall', types: ['died'] },
  { name: 'hit', types: ['attacked', 'splashed'] },
  { name: 'build', types: ['built', 'trained', 'researched', 'reward', 'cityLevel', 'treasure', 'ability'] },
  { name: 'move', types: ['moved', 'lured'] },
];

// One sound per action: the most important event wins.
export function soundFor(events: readonly GameEvent[]): SoundName | null {
  for (const { name, types } of ORDER) {
    if (events.some((e) => types.includes(e.type))) return name;
  }
  return null;
}

const MUTE_KEY = 'banners.muted';
let mutedMemory = false;

export function isMuted(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(MUTE_KEY);
      if (v !== null) return v === '1';
    }
  } catch {
    // storage blocked: fall back to memory
  }
  return mutedMemory;
}

export function setMuted(muted: boolean): void {
  mutedMemory = muted;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked: the in-memory value still holds
  }
}

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof window !== 'undefined'
        ? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

export function play(name: SoundName): void {
  if (isMuted()) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    const { wave, notes, ms, gain } = SOUNDS[name];
    const t0 = ac.currentTime;
    const dur = ms / 1000;
    const step = dur / notes.length;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = wave;
    notes.forEach((hz, i) => osc.frequency.setValueAtTime(hz, t0 + i * step));
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    // sound is a nicety: never let it break the game
  }
}
