import { cityTile, seenBy } from './board/effects';
import type { GameEvent, HexKey, MatchState, PlayerId } from '../engine';

export type SoundName =
  | 'tap' | 'move' | 'hit' | 'fall' | 'build' | 'capture' | 'turn' | 'win'
  | 'train' | 'research' | 'treasure' | 'levelUp' | 'chainCost';

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
  train: { wave: 'triangle', notes: [392, 440, 523], ms: 220, gain: 0.12 },
  research: { wave: 'sine', notes: [587, 698], ms: 200, gain: 0.1 },
  treasure: { wave: 'sine', notes: [659, 784, 988], ms: 300, gain: 0.12 },
  levelUp: { wave: 'triangle', notes: [440, 554, 659, 880], ms: 360, gain: 0.14 },
  chainCost: { wave: 'square', notes: [200, 150], ms: 160, gain: 0.08 },
};

const ORDER: { name: SoundName; types: readonly GameEvent['type'][] }[] = [
  { name: 'win', types: ['matchOver'] },
  { name: 'capture', types: ['captured'] },
  { name: 'levelUp', types: ['heroTrait'] },
  { name: 'fall', types: ['died'] },
  { name: 'chainCost', types: ['chainCost'] },
  { name: 'hit', types: ['attacked', 'splashed'] },
  { name: 'train', types: ['trained'] },
  { name: 'treasure', types: ['treasure'] },
  { name: 'build', types: ['built', 'reward', 'cityLevel', 'ability', 'usedItem'] },
  { name: 'research', types: ['researched'] },
  { name: 'move', types: ['moved', 'lured', 'advanced'] },
];

// What one viewer may hear of one action: the same rule the board effects follow. `seenUnits` and `visible` come from
// seenBy; `actor` is the player who took the action; `cityAt` places a city event on the board.
export interface Hearing {
  viewer: PlayerId;
  actor: PlayerId;
  visible: ReadonlySet<HexKey>;
  seenUnits: ReadonlySet<number>;
  cityAt: (city: number) => HexKey | undefined;
}

export function hearingFor(before: MatchState, after: MatchState, viewer: PlayerId): Hearing {
  const { visible, seenUnits } = seenBy(before, after, viewer);
  return { viewer, actor: before.current, visible, seenUnits, cityAt: (id) => cityTile(before, after, id) };
}

// Whether the viewer may hear of an event: a sound tells nothing the board would not show. The viewer's own actions
// are always heard. Otherwise a unit event needs the unit in `seenUnits`, a tile event needs its tile visible, and
// an opponent's research (it has no place on the board) is never heard.
function heard(e: GameEvent, h: Hearing): boolean {
  if (h.actor === h.viewer) return true;
  const tile = (at: HexKey | undefined): boolean => at !== undefined && h.visible.has(at);
  switch (e.type) {
    case 'died':
    case 'heroTrait':
    case 'usedItem':
    case 'ability':
    case 'chainCost':
    case 'moved':
    case 'lured':
    case 'advanced': return h.seenUnits.has(e.unit);
    case 'trained': return h.seenUnits.has(e.unit) && tile(e.at);
    case 'attacked':
    case 'splashed': return h.seenUnits.has(e.target);
    case 'treasure':
    case 'built': return tile(e.at);
    case 'captured':
    case 'cityLevel':
    case 'reward': return tile(h.cityAt(e.city));
    case 'researched': return false;
    default: return true;
  }
}

// One sound per action: the most important event the viewer may know of wins.
export function soundFor(events: readonly GameEvent[], h: Hearing): SoundName | null {
  const known = events.filter((e) => heard(e, h));
  for (const { name, types } of ORDER) {
    if (known.some((e) => types.includes(e.type))) return name;
  }
  return null;
}

const MUTE_KEY = 'warbanners.muted';
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

// Recorded samples (Kenney, CC0): `<file>-<1..N>.m4a` in public/sounds, a few takes of each. The synth above is the
// fallback until a sample is decoded, if loading fails, and for a sound with no files.
export const SAMPLE_FILES: Record<SoundName, { file: string; takes: number } | null> = {
  tap: { file: 'tap', takes: 3 },
  move: { file: 'move', takes: 3 },
  hit: { file: 'hit', takes: 3 },
  fall: { file: 'fall', takes: 3 },
  build: { file: 'build', takes: 3 },
  capture: { file: 'capture', takes: 3 },
  turn: { file: 'turn', takes: 3 },
  win: null,
  train: { file: 'train', takes: 3 },
  research: { file: 'research', takes: 3 },
  treasure: { file: 'treasure', takes: 3 },
  levelUp: { file: 'level-up', takes: 3 },
  chainCost: { file: 'chain-cost', takes: 3 },
};

// Which take to play: a random one, never the one just played when there is another. `rand` is in [0, 1).
export function pickTake(count: number, last: number | null, rand: number): number {
  if (count <= 1) return 0;
  const n = Math.min(count - 1, Math.floor(rand * (count - 1)));
  if (last === null || last < 0 || last >= count) return Math.min(count - 1, Math.floor(rand * count));
  return n >= last ? n + 1 : n;
}

export function sampleUrl(file: string, take: number): string {
  const base = import.meta.env.BASE_URL;
  return `${base.endsWith('/') ? base : `${base}/`}sounds/${file}-${take}.m4a`;
}

const buffers = new Map<SoundName, AudioBuffer[]>();
const lastTake = new Map<SoundName, number>();
let loading = false;

// Fetch and decode every take, once, on the first play (which a user gesture caused). A take that fails is skipped.
function loadSamples(ac: AudioContext): void {
  if (loading || typeof fetch === 'undefined') return;
  loading = true;
  for (const [name, spec] of Object.entries(SAMPLE_FILES) as [SoundName, { file: string; takes: number } | null][]) {
    if (spec === null) continue;
    for (let take = 1; take <= spec.takes; take++) {
      void fetch(sampleUrl(spec.file, take))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((data) => ac.decodeAudioData(data))
        .then((buf) => {
          const list = buffers.get(name) ?? [];
          list.push(buf);
          buffers.set(name, list);
        })
        .catch(() => {
          // no sample: the synth covers it
        });
    }
  }
}

// For tests: forget the context, the decoded samples and the last takes.
export function resetSound(): void {
  ctx = null;
  loading = false;
  buffers.clear();
  lastTake.clear();
}

function playSample(ac: AudioContext, name: SoundName): boolean {
  const list = buffers.get(name);
  if (list === undefined || list.length === 0) return false;
  const take = pickTake(list.length, lastTake.get(name) ?? null, Math.random());
  lastTake.set(name, take);
  const src = ac.createBufferSource();
  src.buffer = list[take] ?? null;
  src.connect(ac.destination);
  src.start();
  return true;
}

export function play(name: SoundName): void {
  if (isMuted()) return;
  try {
    const ac = audioContext();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    loadSamples(ac);
    if (playSample(ac, name)) return;
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
