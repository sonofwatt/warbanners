import { expect, test } from 'vitest';
import { AMBIENT_FPS, createAmbientLoop, QUIET_MS, REST_MS, RISE_MS } from './ambient';
import type { AmbientEnv } from './ambient';

/** A page with a hand-cranked display: frames run only when the test calls flush(ms). */
function page(o: { hidden?: boolean; reduce?: boolean } = {}) {
  let hidden = o.hidden ?? false, reduce = o.reduce ?? false, now = 0, next = 1;
  const queue = new Map<number, (t: number) => void>();
  const vis = new Set<() => void>(), pref = new Set<() => void>();
  const env: AmbientEnv = {
    raf: (cb) => { const id = next++; queue.set(id, cb); return id; },
    caf: (id) => { queue.delete(id); },
    now: () => now,
    hidden: () => hidden,
    reducedMotion: () => reduce,
    onVisibility: (cb) => { vis.add(cb); return () => vis.delete(cb); },
    onMotionPref: (cb) => { pref.add(cb); return () => pref.delete(cb); },
  };
  return {
    env,
    now: () => now,
    pending: () => queue.size,
    listeners: () => vis.size + pref.size,
    /** Run the display at 60 Hz for ms. */
    flush(ms: number) {
      for (const end = now + ms; now < end;) {
        now += 1000 / 60;
        const cbs = [...queue.values()];
        queue.clear();
        for (const cb of cbs) cb(now);
      }
    },
    hide(h: boolean) { hidden = h; for (const cb of vis) cb(); },
    prefer(r: boolean) { reduce = r; for (const cb of pref) cb(); },
  };
}

test('it draws at about 20 frames a second while something animates, and stops when nothing does', () => {
  expect(AMBIENT_FPS).toBe(20);
  const p = page();
  let frames = 0, more = true;
  const loop = createAmbientLoop(p.env, () => { frames++; return more; });
  expect(loop.running(), 'nothing runs until kicked').toBe(false);
  loop.kick();
  p.flush(1000);
  expect(frames).toBeGreaterThanOrEqual(18);
  expect(frames).toBeLessThanOrEqual(21);
  more = false;
  p.flush(100);
  const at = frames;
  p.flush(1000);
  expect(frames, 'nothing on screen animates: no more frames').toBe(at);
  expect(loop.running()).toBe(false);
  more = true;
  loop.kick();
  p.flush(200);
  expect(frames).toBeGreaterThan(at);
  loop.stop();
});

test('after a quiet spell the motion eases to rest, one still frame is drawn and the loop stops', () => {
  const p = page();
  const levels: number[] = [];
  const loop = createAmbientLoop(p.env, (_t, level) => { levels.push(level); return true; });
  loop.kick();
  p.flush(QUIET_MS - 500);
  expect(levels.at(-1), 'full motion through the quiet spell').toBe(1);
  p.flush(500 + REST_MS / 2);
  const mid = levels.at(-1)!;
  expect(mid, 'easing down').toBeGreaterThan(0.2);
  expect(mid).toBeLessThan(0.8);
  p.flush(REST_MS);
  expect(levels.at(-1), 'the last frame is still').toBe(0);
  expect(loop.running(), 'and the loop has stopped').toBe(false);
  expect(loop.level()).toBe(0);
  const n = levels.length;
  p.flush(10_000);
  expect(levels.length, 'no frames while resting').toBe(n);
  // Downward steps only, no jump.
  for (let i = 1; i < levels.length; i++) expect(levels[i - 1]! - levels[i]!).toBeLessThan(0.1);
  loop.stop();
});

test('any input or game event wakes it from rest, and the motion eases back in', () => {
  const p = page();
  const levels: number[] = [];
  const loop = createAmbientLoop(p.env, (_t, level) => { levels.push(level); return true; });
  loop.kick();
  p.flush(QUIET_MS + REST_MS + 500);
  expect(loop.running()).toBe(false);
  const n = levels.length;
  loop.kick(); // a tap, a pan, a unit moving
  p.flush(RISE_MS / 2);
  expect(levels.length).toBeGreaterThan(n);
  const rising = levels.at(-1)!;
  expect(rising).toBeGreaterThan(0);
  expect(rising).toBeLessThan(1);
  p.flush(RISE_MS);
  expect(levels.at(-1)).toBe(1);
  // A camera frame drawn by the board counts too, and it starts a new quiet spell.
  p.flush(QUIET_MS - 1000);
  loop.drew();
  p.flush(QUIET_MS - 1000);
  expect(levels.at(-1), 'still awake: the camera frame woke it').toBe(1);
  expect(loop.running()).toBe(true);
  loop.stop();
});

test('a frame the board drew itself is not drawn again by the loop', () => {
  const p = page();
  let frames = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; });
  loop.kick();
  p.flush(500);
  // The board draws every display frame (a pan): the loop draws nothing on top.
  loop.drew();
  const at = frames;
  for (let i = 0; i < 30; i++) { p.flush(1000 / 60); loop.drew(); }
  expect(frames).toBe(at);
  p.flush(200);
  expect(frames, 'once the pan stops it carries on').toBeGreaterThan(at);
  loop.stop();
});

test('it pauses while a sheet covers the board and wakes when it goes', () => {
  const p = page();
  let frames = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; });
  loop.kick();
  p.flush(200);
  loop.cover(true);
  expect(p.pending()).toBe(0);
  const at = frames;
  loop.kick();
  p.flush(2000);
  expect(frames, 'covered: no frames, even when kicked').toBe(at);
  loop.cover(false);
  p.flush(200);
  expect(frames).toBeGreaterThan(at);
  loop.stop();
});

test('it pauses while the tab is hidden and comes back when shown', () => {
  const p = page();
  let frames = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; });
  loop.kick();
  p.flush(200);
  p.hide(true);
  expect(p.pending(), 'the frame is cancelled').toBe(0);
  const at = frames;
  loop.kick();
  p.flush(2000);
  expect(frames, 'hidden: no frames, even when kicked').toBe(at);
  p.hide(false);
  p.flush(200);
  expect(frames).toBeGreaterThan(at);
  loop.stop();
});

test('a hidden tab at the start never starts it', () => {
  const p = page({ hidden: true });
  let frames = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; });
  loop.kick();
  p.flush(500);
  expect(frames).toBe(0);
  loop.stop();
});

test('reduced motion: no frames, one still pose when it is turned on, and back when it is off', () => {
  const p = page({ reduce: true });
  let frames = 0, stills = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; }, () => { stills++; });
  expect(loop.motion()).toBe(false);
  expect(loop.level()).toBe(0);
  loop.kick();
  p.flush(500);
  expect(frames).toBe(0);
  p.prefer(false);
  expect(loop.motion()).toBe(true);
  p.flush(200);
  expect(frames).toBeGreaterThan(0);
  p.prefer(true);
  expect(stills).toBe(1);
  expect(p.pending()).toBe(0);
  const at = frames;
  p.flush(500);
  expect(frames).toBe(at);
  loop.stop();
});

test('stop ends it for good and stops listening', () => {
  const p = page();
  let frames = 0;
  const loop = createAmbientLoop(p.env, () => { frames++; return true; });
  loop.kick();
  p.flush(100);
  expect(p.listeners()).toBe(2);
  loop.stop();
  expect(p.listeners()).toBe(0);
  expect(p.pending()).toBe(0);
  const at = frames;
  loop.kick();
  loop.cover(false);
  p.hide(false);
  p.flush(500);
  expect(frames).toBe(at);
});
