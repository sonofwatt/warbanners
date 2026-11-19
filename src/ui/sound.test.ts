import { afterEach, expect, test, vi } from 'vitest';
import { SOUNDS, isMuted, play, setMuted, soundFor } from './sound';

afterEach(() => {
  vi.unstubAllGlobals();
  setMuted(false);
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

test('one sound per action, the most important one', () => {
  expect(soundFor([{ type: 'moved', unit: 1, from: '0,0', to: '1,0' }])).toBe('move');
  expect(soundFor([{ type: 'attacked', unit: 1, target: 2, damage: 3, counter: 0 }, { type: 'died', unit: 2 }])).toBe('fall');
  expect(soundFor([{ type: 'died', unit: 2 }, { type: 'matchOver', winner: 0 }])).toBe('win');
  expect(soundFor([{ type: 'researched', tech: 'bronze' }])).toBe('build');
  expect(soundFor([{ type: 'captured', city: 0, by: 1 }, { type: 'died', unit: 2 }])).toBe('capture');
  expect(soundFor([{ type: 'splashed', target: 2, damage: 1 }, { type: 'moved', unit: 1, from: '0,0', to: '1,0' }])).toBe('hit');
  expect(soundFor([{ type: 'turnStarted', player: 1 }])).toBeNull();
  expect(soundFor([])).toBeNull();
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
