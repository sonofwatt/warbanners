// Which moves slide and which snap, in the real app with the 3D look on: a saved match against the hard AI is opened,
// the person makes a few moves and ends the turn, and the page logs every unit that changes tile (data-at), appears
// or leaves, every slide and lunge started on a unit (Element.animate), and every camera transform written.
// The actions of both turns are then replayed in Node to name each move (moved, advanced, lured).
// Run after `vite build`: npx tsx scripts/motion3d-probe.ts [seed] [turns]
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { LEVEL_DIAL } from '../src/ai/types';
import { applyAction, hashState, legalActions, playerView } from '../src/engine';
import type { Action, MatchState } from '../src/engine';
import { randomPlayout } from '../src/engine/testkit';
import { effectsFor, seenBy } from '../src/ui/board/effects';
import { frames, openApp } from '../src/browser/harness';

const seed = Number(process.argv[2] ?? 1);
const turns = Number(process.argv[3] ?? 40);
const state0 = randomPlayout(seed, turns);
const base = newRecord('probe', { seed, factions: ['spartans', 'mongols'] }, ['Person', {
  name: 'Hard', kind: 'ai', level: 'hard', salt: 12345, adapt: { dial: LEVEL_DIAL.hard, trend: 0 },
}], 1_000_000);
const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state0), state: state0 } };
const map = new Map<string, string>();
writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state0);
map.set('warbanners.terrain3d', '1');

interface Log { t: number; kind: string; unit?: number; detail?: string }
const app = await openApp('', {
  webgl: true,
  beforeOpen: (c) => {
    void c.addInitScript((items: [string, string][]) => {
      for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v);
      const log: Log[] = [];
      (window as unknown as { probeLog: Log[] }).probeLog = log;
      const real = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, kf: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) {
        const u = this.closest('[data-unit]');
        if (u !== null) {
          const o = typeof opts === 'object' ? opts : { duration: opts };
          const what = this.classList.contains('unit-body') ? 'lunge' : 'slide';
          log.push({ t: performance.now(), kind: what, unit: Number(u.getAttribute('data-unit')), detail: `dur ${String(o.duration)} delay ${String(o.delay ?? 0)} ${JSON.stringify(kf).slice(0, 120)}` });
        }
        return real.call(this, kf, opts as KeyframeAnimationOptions);
      };
      const realSet = Element.prototype.setAttribute;
      let lastCam = '';
      Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
        if (name === 'transform' && this.getAttribute('data-camera') === 'true' && value !== lastCam) {
          lastCam = value;
          log.push({ t: performance.now(), kind: 'camera', detail: value });
        }
        return realSet.call(this, name, value);
      };
      const watch = (): void => {
        const ov = document.body;
        if (ov === null) { setTimeout(watch, 50); return; }
        new MutationObserver((ms) => {
          for (const m of ms) {
            const now = performance.now();
            if (m.type === 'attributes' && m.attributeName === 'data-at') {
              const el = m.target as Element;
              log.push({ t: now, kind: 'tile', unit: Number(el.getAttribute('data-unit')), detail: `${m.oldValue} -> ${el.getAttribute('data-at')}` });
            } else if (m.type === 'attributes' && m.attributeName === 'transform' && (m.target as Element).getAttribute('data-camera') === 'true') {
              log.push({ t: now, kind: 'camera', detail: (m.target as Element).getAttribute('transform') ?? '' });
            } else if (m.type === 'childList') {
              m.addedNodes.forEach((n) => { if (n instanceof Element && n.hasAttribute('data-unit') && m.target instanceof Element && m.target.getAttribute('data-camera') === 'units') log.push({ t: now, kind: 'appear', unit: Number(n.getAttribute('data-unit')), detail: n.getAttribute('data-at') ?? '' }); });
              m.removedNodes.forEach((n) => { if (n instanceof Element && n.hasAttribute('data-unit') && m.target instanceof Element && m.target.getAttribute('data-camera') === 'units') log.push({ t: now, kind: 'leave', unit: Number(n.getAttribute('data-unit')), detail: n.getAttribute('data-at') ?? '' }); });
            }
          }
        }).observe(ov, { subtree: true, attributes: true, attributeOldValue: true, childList: true, attributeFilter: ['data-at', 'transform'] });
      };
      setTimeout(watch, 0);
    }, [...map.entries()]);
  },
});
try {
  const { page } = app;
  await page.getByTestId('continue').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.locator('[data-units3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(500);
  // The person's moves: the store is not reachable, so tap Next unit and then a marked tile, a few times.
  for (let i = 0; i < 4; i++) {
    const next = page.getByTestId('next-unit');
    if (await next.isDisabled()) break;
    await next.tap();
    await frames(page);
    const target = page.locator('[data-mark="move"], [data-mark="attack"]').first();
    if (await target.count() === 0) continue;
    const hex = await target.evaluate((el) => el.closest('[data-hex]')?.getAttribute('data-hex') ?? '');
    const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
    if (box === null) continue;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
  }
  (await page.evaluate(() => { (window as unknown as { probeLog: Log[] }).probeLog.push({ t: performance.now(), kind: 'endturn' }); }));
  await page.getByTestId('end-turn').tap();
  // Wait for the AI turn to finish (End turn comes back).
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => !(document.querySelector('[data-testid="end-turn"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 120_000 });
  await page.waitForTimeout(800);
  const log = await page.evaluate(() => (window as unknown as { probeLog: Log[] }).probeLog);
  const saved = await page.evaluate(() => {
    const ids = JSON.parse(localStorage.getItem('warbanners.saves.v1') ?? '[]') as { id: string }[];
    return JSON.parse(localStorage.getItem(`warbanners.save.${ids[0]?.id ?? ''}`) ?? 'null') as { actions: Action[] } | null;
  });
  // Replay the actions to name the moves.
  let s: MatchState = state0;
  const named: string[] = [];
  for (const a of saved?.actions ?? []) {
    const r = applyAction(s, a);
    if (!r.ok) { named.push(`refused ${a.type}`); continue; }
    const seenBefore = new Set(playerView(s, 0).units.map((u) => u.id));
    const seenAfter = new Set(playerView(r.state, 0).units.map((u) => u.id));
    for (const e of r.events) {
      if (e.type === 'moved' || e.type === 'advanced' || e.type === 'lured') {
        named.push(`${s.current === 0 ? 'person' : 'AI'} ${e.type} unit ${e.unit} ${e.from} -> ${e.to} seen before ${seenBefore.has(e.unit)} after ${seenAfter.has(e.unit)}`);
      }
      if (e.type === 'attacked') named.push(`${s.current === 0 ? 'person' : 'AI'} attacked ${e.unit} -> ${e.target} counter ${e.counter}`);
      if (e.type === 'died') named.push(`  died ${e.unit}`);
    }
    const { visible, seenUnits } = seenBy(s, r.state, 0);
    const fx = effectsFor(r.events, s, r.state, visible, seenUnits, 0, seenBy(s, r.state, 0).visibleBefore).filter((f) => f.kind === 'lunge' || f.kind === 'move');
    if (fx.length > 0) named.push(`  effects ${JSON.stringify(fx)}`);
    s = r.state;
  }
  void legalActions;
  console.log('--- engine ---');
  for (const n of named) console.log(n);
  console.log('--- page ---');
  const t0 = log[0]?.t ?? 0;
  for (const l of log) console.log(`${(l.t - t0).toFixed(0).padStart(7)} ${l.kind.padEnd(7)} ${l.unit ?? ''} ${l.detail ?? ''}`);
} finally {
  await app.close();
}
