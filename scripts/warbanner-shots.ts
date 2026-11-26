// The war banners on a mixed board, in the svg look and the 3D look, at 412 x 915: a saved pass-the-phone match
// (seed 7) with Spartan units round their capital (full, damaged, spent, hunkered, a hero, hidden scouts fresh and
// spent) and Mongol units next to them (one spent, which must not darken). Run after `vite build`:
// npx tsx scripts/warbanner-shots.ts [out dir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState } from '../src/engine';
import { freshDeeds, freshWear, UNITS } from '../src/engine';
import type { HexKey, MatchState, PlayerId, Unit, UnitTypeId } from '../src/engine';

// Scripts reach the engine only through its index (src/boundaries.test.ts), so the testkit's addUnit is not used:
// a unit ready to act, made from the exported data.
function addUnit(s: MatchState, type: UnitTypeId, owner: PlayerId, q: number, r: number, patch?: Partial<Unit>): Unit {
  const u: Unit = {
    id: s.nextUnitId++, type, owner, pos: `${q},${r}`, hp: UNITS[type].hp, mp: 2 * UNITS[type].move, bonusMp: 0,
    attacks: UNITS[type].atk === 0 ? 0 : 1, home: null, enteredTurn: 0, moved: false, acted: false, rested: false,
    taunted: false, blinded: false, lure: null, fresh: false, deeds: freshDeeds(), heroTraits: [], wear: freshWear(), item: null,
    hunkered: false, momentum: 0, turnEnded: false, itemTurn: null, ...patch,
  };
  s.units.push(u);
  return u;
}
import { frames, openApp } from '../src/browser/harness';

const SPENT: Partial<Unit> = { mp: 0, bonusMp: 0, attacks: 0, moved: true, acted: true };
type Place = [UnitTypeId, 0 | 1, number, number, Partial<Unit>];
// Offsets from the Spartan capital.
const PLACES: Place[] = [
  ['hoplite', 0, 0, 0, { heroTraits: ['fierce', 'tireless'], hp: 17 }],
  ['archer', 0, 1, -1, { ...SPENT, hp: 4 }],
  ['knight', 0, 1, 0, SPENT],
  ['defender', 0, 0, -1, { hunkered: true, hp: 13 }],
  ['scout', 0, -1, 0, {}],
  ['scout', 0, -1, 1, SPENT],
  ['catapult', 0, 0, 1, {}],
  ['swordsman', 0, 2, -1, { hp: 8, item: 'draught' }],
  ['horseman', 1, 2, -2, { hp: 6 }],
  ['khansGuard', 1, 3, -2, {}],
  ['horseArcher', 1, 1, -2, SPENT],
  ['camp', 1, 2, 0, { hp: 9 }],
];

function match(): [string, string][] {
  const state = createMatch({ seed: 7, factions: ['spartans', 'mongols'] });
  const cap = state.cities.find((c) => c.owner === 0)!;
  const [cq, cr] = cap.pos.split(',').map(Number) as [number, number];
  state.units = [];
  for (const [type, owner, dq, dr, patch] of PLACES) {
    const k: HexKey = `${cq + dq},${cr + dr}`;
    const t = state.tiles[k];
    if (t === undefined) continue;
    if (t.terrain === 'water') state.tiles[k] = { ...t, terrain: 'field', resource: null };
    addUnit(state, type, owner, cq + dq, cr + dr, patch);
  }
  const all = Object.keys(state.tiles).sort();
  for (const p of state.players) p.explored = all;
  const base = newRecord('warbanner', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/warbanner';
mkdirSync(out, { recursive: true });
const entries = match();
const app = await openApp('', {
  width: 412, height: 915, webgl: true,
  beforeOpen: (c) => { void c.addInitScript((items: [string, string][]) => { for (const [k, v] of items) localStorage.setItem(k, v); }, entries); },
});
try {
  const { page } = app;
  const toggle = async (): Promise<void> => {
    await page.getByTestId('open-menu').tap();
    await page.getByTestId('toggle-terrain3d').tap();
    await page.getByTestId('close-sheet').tap();
    await frames(page);
  };
  await page.getByTestId('continue').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const zoomIn = async (): Promise<void> => {
    const b = await page.locator('[data-unit]').first().boundingBox();
    if (b === null) return;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -120); await frames(page); }
    await page.waitForTimeout(400);
  };
  await page.screenshot({ path: join(out, 'board-svg.png') });
  await toggle();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, 'board-3d.png') });
  await zoomIn();
  await page.screenshot({ path: join(out, 'board-3d-zoomed.png') });
  await toggle();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, 'board-svg-zoomed.png') });
  console.log('wrote', out);
} finally {
  await app.close();
}
