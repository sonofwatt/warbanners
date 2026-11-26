// The phone-size board (412 x 915) in Gritty, with several Hoplites (clean and worn) beside other units, in the svg
// look (the muted svg figures) and the 3D look (the realistic Hoplite, the muted toon figures).
// Run after `npx vite build`:  npx tsx scripts/hoplite3d-board.ts <out dir>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState, maxHpOf, neighbors, parseKey, key } from '../src/engine';
import type { MatchState, Unit, UnitTypeId } from '../src/engine';
import { cameraStill, frames, openApp } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/hoplite3d';
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState): [string, string][] {
  const base = newRecord('hoplite3d', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const state = advance(createMatch({ seed: 7, factions: ['spartans', 'mongols'] }), 12);
const me = state.current;
const capital = state.cities.find((c) => c.owner === me && c.capital) ?? state.cities.find((c) => c.owner === me)!;
// Units round the capital: Hoplites in several states of wear, and a few others of both sides.
const template = state.units.find((u) => u.owner === me)!;
const enemy = state.players.find((p) => p.id !== me)!.id;
const free = (k: string): boolean => {
  const t = state.tiles[k];
  return t !== undefined && t.terrain !== 'water' && t.terrain !== 'mountain' && !state.units.some((u) => u.pos === k);
};
const ring = [...neighbors(parseKey(capital.pos)).map(key), ...neighbors(parseKey(capital.pos)).flatMap((h) => neighbors(h).map(key))];
const spots = [...new Set(ring)].filter(free);
let id = Math.max(...state.units.map((u) => u.id)) + 1;
const place = (type: UnitTypeId, owner: number, hpFrac: number, wear: Unit['wear']): void => {
  const pos = spots.shift();
  if (pos === undefined) return;
  const u: Unit = structuredClone({ ...template, id: id++, type, owner, pos, wear, item: null, hunkered: false, heroTraits: [] }) as Unit;
  u.hp = Math.max(1, Math.round(maxHpOf(u) * hpFrac));
  state.units.push(u);
};
place('hoplite', me, 1, { battles: 0, scar: 0, bleeding: false });
place('hoplite', me, 0.6, { battles: 2, scar: 0, bleeding: false });
place('hoplite', me, 0.2, { battles: 6, scar: 0, bleeding: true });
place('hoplite', me, 1, { battles: 3, scar: 3, bleeding: false });
place('warrior', enemy, 0.4, { battles: 3, scar: 0, bleeding: true });
place('archer', enemy, 1, { battles: 1, scar: 0, bleeding: false });
place('horseman', enemy, 0.7, { battles: 2, scar: 0, bleeding: false });
console.log('player', me, 'capital', capital.pos, 'units placed', id);

for (const look of ['svg', '3d'] as const) {
  const app = await openApp('', {
    width: 412, height: 915, webgl: look === '3d',
    beforeOpen: (c) => {
      void c.addInitScript((items: [string, string][]) => {
        for (const [k, v] of items) localStorage.setItem(k, v);
        localStorage.setItem('banners.artMode', 'gritty');
      }, saveOf(state));
    },
  });
  const { page } = app;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    page.setDefaultTimeout(120_000);
    await page.getByTestId('continue').tap();
    await page.getByTestId('ready').tap();
    await page.getByTestId('match').waitFor();
    await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
    if (look === '3d') {
      await page.getByTestId('open-menu').tap();
      await page.getByTestId('toggle-terrain3d').tap();
      await page.getByTestId('close-sheet').tap();
      await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
      await page.waitForTimeout(1200);
    }
    await cameraStill(page);
    await frames(page);
    await page.screenshot({ path: join(out, `d-board-gritty-${look}-412x915.png`) });
    console.log('wrote', look);
  } finally {
    await app.close();
  }
}
