// Shots of a Woodland turn on a phone in the 3D look: a Horseman's moves over two forests in a row (forest stride,
// rules 11), and a Smoke Keeper's smoke as it is used, then the Veiled line on a veiled friend's card. The save is
// built from the engine (seed 7, Woodland against Mongols) and the built app is opened from it.
// Run (after a build with GITHUB_PAGES_BASE=/warbanners/): GITHUB_PAGES_BASE=/warbanners/ npx tsx scripts/smoke-shots.ts [out dir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState, key, parseKey, range } from '../src/engine';
import { DIRS } from '../src/engine/hex';
import type { HexKey } from '../src/engine';
import { addUnit, setTile } from '../src/engine/testkit';
import { cameraStill, frames, openApp, tapTile } from '../src/browser/harness';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/bar-smoke';
mkdirSync(out, { recursive: true });

const s = createMatch({ seed: 7, factions: ['woodland', 'mongols'] });
const capital = parseKey(s.cities.find((c) => c.owner === 0)!.pos);
const taken = new Set<HexKey>(s.units.map((u) => u.pos));
const land = (k: HexKey): boolean => s.tiles[k] !== undefined && s.tiles[k]!.terrain !== 'water' && s.tiles[k]!.terrain !== 'mountain';
const free = (k: HexKey): boolean => land(k) && !taken.has(k) && s.cities.every((c) => c.pos !== k);
// The Horseman, with two tiles in a row ahead of it made forest.
let rider: { at: HexKey; a: HexKey; b: HexKey } | null = null;
for (const h of range(capital, 2)) {
  for (const d of DIRS) {
    const at = key(h), a = key({ q: h.q + d.q, r: h.r + d.r }), b = key({ q: h.q + 2 * d.q, r: h.r + 2 * d.r });
    if (rider === null && free(at) && free(a) && free(b)) rider = { at, a, b };
  }
}
if (rider === null) throw new Error('no room for the rider');
for (const k of [rider.a, rider.b]) { const p = parseKey(k); setTile(s, p.q, p.r, { terrain: 'forest' }); taken.add(k); }
const rp = parseKey(rider.at);
const horseman = addUnit(s, 'horseman', 0, rp.q, rp.r);
taken.add(rider.at);
// The Smoke Keeper and a Skirmisher beside it, on two more free tiles next to each other.
const spots = range(capital, 2).map(key).filter(free);
const keeperAt = spots.find((k) => DIRS.some((d) => { const p = parseKey(k); return spots.includes(key({ q: p.q + d.q, r: p.r + d.r })); }))!;
const kp = parseKey(keeperAt);
const friendAt = spots.find((k) => k !== keeperAt && DIRS.some((d) => key({ q: kp.q + d.q, r: kp.r + d.r }) === k))!;
const fp = parseKey(friendAt);
const keeper = addUnit(s, 'smokeKeeper', 0, kp.q, kp.r);
const friend = addUnit(s, 'skirmisher', 0, fp.q, fp.r);
const p0 = s.players[0]!;
p0.explored = [...new Set([...p0.explored, ...range(capital, 4).map(key).filter((k) => s.tiles[k] !== undefined)])].sort();

const settings = { seed: 7, factions: ['woodland', 'mongols'] as ['woodland', 'mongols'] };
const record: MatchRecord = { ...newRecord('smoke', settings, ['Ann', 'Ben'], 1_000_000), snapshot: { count: 0, hash: hashState(s), state: s } };
const map = new Map<string, string>();
if (!writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, s).saved) throw new Error('not saved');
const entries = [...map.entries()];

const { page, close } = await openApp('', {
  width: 412, height: 915, webgl: true,
  beforeOpen: (c) => {
    void c.addInitScript((items: [string, string][]) => {
      try { for (const [k, v] of items) if (localStorage.getItem(k) === null) localStorage.setItem(k, v); } catch { /* none */ }
    }, entries);
  },
});
try {
  page.on('pageerror', (e) => console.error(e));
  await page.getByTestId('continue').tap();
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-unit]').first().waitFor({ state: 'attached' });
  await page.getByTestId('open-menu').tap();
  await page.getByTestId('toggle-terrain3d').tap();
  await page.getByTestId('close-sheet').tap();
  await page.locator('[data-terrain3d="on"]').waitFor({ state: 'attached', timeout: 60_000 });
  await frames(page);
  await cameraStill(page);
  const shot = async (name: string): Promise<void> => { const path = join(out, name); await page.screenshot({ path }); console.log(path); };

  await tapTile(page, rider.at);
  await page.locator('.selection .unit-panel').waitFor();
  await cameraStill(page);
  await frames(page);
  console.log(`horseman ${horseman.id} on ${rider.at}, forests ${rider.a} and ${rider.b}`);
  await shot('woodland-horseman-forests.png');

  await tapTile(page, keeperAt);
  await page.locator('.selection .unit-panel').waitFor();
  await page.getByTestId('cmd-ability-smoke').tap();
  await frames(page);
  await tapTile(page, friendAt);
  await page.waitForTimeout(450);
  await shot('smoke-used.png');
  await page.waitForTimeout(1500);
  await tapTile(page, friendAt);
  await page.locator('.selection .unit-panel').waitFor();
  await page.getByTestId('sheet-handle').tap();
  await page.waitForTimeout(400);
  console.log(`keeper ${keeper.id} on ${keeperAt}, friend ${friend.id} on ${friendAt}`);
  await shot('smoke-veiled-card.png');
} finally {
  await close();
}
