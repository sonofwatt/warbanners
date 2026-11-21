import { afterEach, expect, test, vi } from 'vitest';
import { SAMPLE_FILES, SOUNDS, isMuted, pickTake, play, resetSound, sampleUrl, setMuted, soundFor } from './sound';

afterEach(() => {
  vi.unstubAllGlobals();
  setMuted(false);
  resetSound();
});

test('the sounds are short and quiet', () => {
  for (const s of Object.values(SOUNDS)) {
    expect(s.ms).toBeLessThanOrEqual(400);
    expect(s.gain).toBeLessThanOrEqual(0.3);
    expect(s.notes.length).toBeGreaterThanOrEqual(1);
    expect(s.notes.length).toBeLessThanOrEqual(4);
    for (const n of s.notes) {
      expect(n).toBeGreaterThanOrEqual(100);
      expect(n).toBeLessThanOrEqual(2000);
    }
  }
});

const ALL = new Set([1, 2, 3]);

test('one sound per action, the most important one', () => {
  expect(soundFor([{ type: 'moved', unit: 1, from: '0,0', to: '1,0' }], ALL)).toBe('move');
  expect(soundFor([{ type: 'attacked', unit: 1, target: 2, damage: 3, counter: 0 }, { type: 'died', unit: 2 }], ALL)).toBe('fall');
  expect(soundFor([{ type: 'died', unit: 2 }, { type: 'matchOver', winner: 0 }], ALL)).toBe('win');
  expect(soundFor([{ type: 'researched', tech: 'bronze' }], ALL)).toBe('research');
  expect(soundFor([{ type: 'captured', city: 0, by: 1 }, { type: 'died', unit: 2 }], ALL)).toBe('capture');
  expect(soundFor([{ type: 'splashed', target: 2, damage: 1 }, { type: 'moved', unit: 1, from: '0,0', to: '1,0' }], ALL)).toBe('hit');
  expect(soundFor([{ type: 'turnStarted', player: 1 }], ALL)).toBeNull();
  expect(soundFor([], ALL)).toBeNull();
});

test('a sound tells nothing about a unit the viewer cannot see', () => {
  // A Catapult (unit 1) hits a seen target (2) and its splash kills an unseen scout (3) beside it.
  const splashKill = [
    { type: 'attacked', unit: 1, target: 2, damage: 3, counter: 0 },
    { type: 'splashed', target: 3, damage: 2 },
    { type: 'died', unit: 3 },
  ] as const;
  expect(soundFor(splashKill, new Set([1, 2]))).toBe('hit');
  expect(soundFor(splashKill, ALL)).toBe('fall');
  // Only the hidden unit was touched: nothing to hear at all.
  expect(soundFor([{ type: 'splashed', target: 3, damage: 2 }, { type: 'died', unit: 3 }], new Set([1, 2]))).toBeNull();
  expect(soundFor([{ type: 'attacked', unit: 1, target: 3, damage: 3, counter: 0 }], new Set([1]))).toBeNull();
});

test('sound is safe where there is no audio', () => {
  expect(() => play('tap')).not.toThrow();
  expect(isMuted()).toBe(false);
});

test('muting is remembered and silences play', () => {
  const ctor = vi.fn();
  vi.stubGlobal('AudioContext', ctor);
  setMuted(true);
  expect(isMuted()).toBe(true);
  play('tap');
  expect(ctor).not.toHaveBeenCalled();
  setMuted(false);
  expect(isMuted()).toBe(false);
});

test('mute falls back to memory when storage throws', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  });
  setMuted(true);
  expect(isMuted()).toBe(true);
});

test('a melee advance sounds like a move, but only for a unit the viewer can see', () => {
  const step = { type: 'advanced', unit: 1, from: '0,0', to: '1,0' } as const;
  expect(soundFor([step], ALL)).toBe('move');
  expect(soundFor([step], new Set([2]))).toBeNull();
});

test('new events have their own sounds', () => {
  expect(soundFor([{ type: 'trained', unit: 1, at: '0,0' }], ALL)).toBe('train');
  expect(soundFor([{ type: 'researched', tech: 'bronze' }], ALL)).toBe('research');
  expect(soundFor([{ type: 'treasure', at: '0,0', outcome: 'gold' } as never], ALL)).toBe('treasure');
  expect(soundFor([{ type: 'heroTrait', unit: 1, trait: 'fierce', hero: false }], ALL)).toBe('levelUp');
  expect(soundFor([{ type: 'chainCost', unit: 1, damage: 1 }], ALL)).toBe('chainCost');
  expect(soundFor([{ type: 'built', at: '0,0', what: 'road' }], ALL)).toBe('build');
});

test('the most rewarding event wins', () => {
  const ev = {
    win: { type: 'matchOver', winner: 0 },
    capture: { type: 'captured', city: 0, by: 1 },
    levelUp: { type: 'heroTrait', unit: 1, trait: 'fierce', hero: false },
    fall: { type: 'died', unit: 2 },
    chainCost: { type: 'chainCost', unit: 1, damage: 1 },
    hit: { type: 'attacked', unit: 1, target: 2, damage: 3, counter: 0 },
    train: { type: 'trained', unit: 1, at: '0,0' },
    treasure: { type: 'treasure', at: '0,0', outcome: 'gold' },
    build: { type: 'built', at: '0,0', what: 'road' },
    research: { type: 'researched', tech: 'bronze' },
    move: { type: 'moved', unit: 1, from: '0,0', to: '1,0' },
  } as const;
  const order = Object.keys(ev) as (keyof typeof ev)[];
  for (let i = 0; i < order.length; i++) {
    const rest = order.slice(i).reverse().map((k) => ev[k] as never);
    expect(soundFor(rest, ALL)).toBe(order[i]);
  }
});

test('chain cost and level up are heard only for a unit the viewer can see', () => {
  const seen = new Set([2]);
  expect(soundFor([{ type: 'chainCost', unit: 1, damage: 1 }], seen)).toBeNull();
  expect(soundFor([{ type: 'heroTrait', unit: 1, trait: 'fierce', hero: false }], seen)).toBeNull();
  expect(soundFor([{ type: 'chainCost', unit: 1, damage: 1 }], new Set([1]))).toBe('chainCost');
});

test('the take picker never repeats the last take when there are three', () => {
  for (let last = 0; last < 3; last++) {
    for (let i = 0; i < 100; i++) {
      const t = pickTake(3, last, i / 100);
      expect(t).not.toBe(last);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(3);
    }
  }
  expect(pickTake(3, null, 0.99)).toBe(2);
  expect(pickTake(1, 0, 0.5)).toBe(0);
});

test('sample urls follow the base path and every file is named', () => {
  expect(sampleUrl('hit', 2)).toMatch(/\/sounds\/hit-2\.m4a$/);
  expect(SAMPLE_FILES.win).toBeNull();
  expect(SAMPLE_FILES.levelUp?.file).toBe('level-up');
});

// A fake Web Audio and fetch where every take decodes.
function fakeAudio() {
  const sources: { buffer: unknown; start: ReturnType<typeof vi.fn> }[] = [];
  const osc = vi.fn(() => ({
    type: '', frequency: { setValueAtTime: vi.fn() }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn(),
  }));
  class FakeCtx {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn();
    createOscillator = osc;
    createGain = () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n });
    createBufferSource = () => {
      const s = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
      sources.push(s);
      return s;
    };
    decodeAudioData = (d: ArrayBuffer) => Promise.resolve({ id: d.byteLength });
  }
  vi.stubGlobal('AudioContext', FakeCtx);
  const fetchMock = vi.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
  vi.stubGlobal('fetch', fetchMock);
  return { sources, osc, fetchMock };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('no audio object is made when the module loads', async () => {
  const ctor = vi.fn();
  vi.stubGlobal('AudioContext', ctor);
  vi.resetModules();
  await import('./sound');
  expect(ctor).not.toHaveBeenCalled();
});

test('until a sample is decoded the synth plays, then the sample', async () => {
  const { sources, osc, fetchMock } = fakeAudio();
  play('hit');
  expect(osc).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(0);
  expect(fetchMock).toHaveBeenCalledTimes(36);
  await settle();
  play('hit');
  expect(osc).toHaveBeenCalledTimes(1);
  expect(sources).toHaveLength(1);
  expect(sources[0]?.start).toHaveBeenCalled();
});

test('a failed load falls back to the synth, and a sound with no files is synth', async () => {
  const { sources, osc, fetchMock } = fakeAudio();
  fetchMock.mockImplementation(() => Promise.resolve({ ok: false, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }) as never);
  play('tap');
  await settle();
  play('tap');
  expect(osc).toHaveBeenCalledTimes(2);
  expect(sources).toHaveLength(0);
});

test('a sound with no files is always the synth', async () => {
  const { sources, osc } = fakeAudio();
  play('win');
  await settle();
  play('win');
  expect(osc).toHaveBeenCalledTimes(2);
  expect(sources).toHaveLength(0);
});

test('mute stops samples too', async () => {
  const { sources, osc } = fakeAudio();
  play('move');
  await settle();
  setMuted(true);
  play('move');
  expect(sources).toHaveLength(0);
  expect(osc).toHaveBeenCalledTimes(1);
});

test('the same take is not played twice in a row', async () => {
  const { sources } = fakeAudio();
  play('move');
  await settle();
  for (let i = 0; i < 30; i++) play('move');
  for (let i = 1; i < sources.length; i++) expect(sources[i]?.buffer).not.toBe(sources[i - 1]?.buffer);
});
