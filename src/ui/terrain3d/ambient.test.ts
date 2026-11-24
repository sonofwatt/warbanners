import { expect, test } from 'vitest';
import { createAmbientLoop } from './ambient';
import type { AmbientEnv } from './ambient';

/** A page with a hand-cranked display: frames run only when the test calls flush(ms). */
function page(o: { hidden?: boolean; reduce?: boolean } = {}) {
  let hidden = o.hidden ?? false, reduce = o.reduce ?? false, now = 0, next = 1;
  const queue = new Map<number, (t: number) => void>();
  const vis = new Set<() => void>(), pref = new Set<() => void>();
  const env: AmbientEnv = {
    raf: (cb) => { const id = next++; queue.set(id, cb); return id; },
    caf: (id) => { queue.delete(id); },
    hidden: () => hidden,
    reducedMotion: () => reduce,
    onVisibility: (cb) => { vis.add(cb); return () => vis.delete(cb); },
    onMotionPref: (cb) => { pref.add(cb); return () => pref.delete(cb); },
  };
  return {
    env,
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

test('it draws at about 30 frames a second while something animates, and stops when nothing does', () => {
  const p = page();
  let frames = 0, more = true;
  const loop = createAmbientLoop(p.env, () => { frames++; return more; });
  expect(loop.running(), 'nothing runs until kicked').toBe(false);
  loop.kick();
  p.flush(1000);
  expect(frames).toBeGreaterThanOrEqual(28);
  expect(frames).toBeLessThanOrEqual(31);
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
  p.hide(false);
  p.flush(500);
  expect(frames).toBe(at);
});
