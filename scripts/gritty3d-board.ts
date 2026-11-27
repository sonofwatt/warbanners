// The phone-size board (412 x 915) in Gritty, with four of one unit type (clean, dented, broken and bleeding, healed and
// scarred) beside a Catapult and a few units of the other side, in the 3D look (and, with `svg`, the svg look too).
// Run after `npx vite build`:
//   npx tsx scripts/gritty3d-board.ts <out dir> [type] [name] [faction] [svg]
//   type: a unit type (default hoplite); name: the file (default <type>-board.png); faction: spartans or mongols, the
//   side the type is placed for (default spartans, the viewer's side); svg: also shoot the svg look (<name>-svg.png).
//   type `all`: every Gritty unit type at once, Spartans against Mongols at several wear stages, round the capital;
//   faction then names the side placed in front, nearer the viewer (default spartans).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { newRecord } from '../src/app/record';
import type { MatchRecord } from '../src/app/record';
import { writeSave } from '../src/app/saves';
import { createMatch, hashState, maxHpOf, neighbors, parseKey, key, range, visibleTiles } from '../src/engine';
import type { MatchState, Unit, UnitTypeId } from '../src/engine';
import { cameraStill, frames, openApp } from '../src/browser/harness';
import { advance } from '../src/ui/board/BoardDemo';
import { hexToBoard } from '../src/ui/board/layout';

const out = process.argv[2] ?? 'docs/superpowers/plans/shots/gritty3d';
const type = (process.argv[3] ?? 'hoplite') as UnitTypeId | 'all';
const name = process.argv[4] ?? `${type}-board.png`;
const side = process.argv[5] ?? 'spartans';
const withSvg = process.argv[6] === 'svg';
mkdirSync(out, { recursive: true });

function saveOf(state: MatchState): [string, string][] {
  const base = newRecord('gritty3d', { seed: 7, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 1_000_000);
  const record: MatchRecord = { ...base, snapshot: { count: 0, hash: hashState(state), state } };
  const map = new Map<string, string>();
  writeSave({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }, record, state);
  return [...map.entries()];
}

const state = advance(createMatch({ seed: 7, factions: ['spartans', 'mongols'] }), 12);
const me = state.current;
const capital = state.cities.find((c) => c.owner === me && c.capital) ?? state.cities.find((c) => c.owner === me)!;
// Units round the capital: four of the type in several states of wear, a Catapult, and a few others of both sides.
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
const mine = state.players[me]!.faction === side ? me : enemy;
const theirs = mine === me ? enemy : me;
if (type === 'all') {
  // Clear the ground round the capital, then fill it: the front side in the rows nearer the viewer, the other behind,
  // each side's own units and the shared ones split between them, at several wear stages.
  // The ground the phone shows: from a row in front of the capital to five behind it, two and a half tiles to each side.
  const centre = parseKey(capital.pos), cap = hexToBoard(capital.pos);
  const rowStep = Math.max(...neighbors(centre).map((h) => Math.abs(hexToBoard(key(h)).y - cap.y)));
  const colStep = Math.max(...neighbors(centre).map((h) => Math.abs(hexToBoard(key(h)).x - cap.x)));
  const onScreen = (k: string): boolean => {
    const p = hexToBoard(k);
    return Math.abs(p.x - cap.x) <= colStep * 2.6 && p.y - cap.y <= rowStep * 1.1 && cap.y - p.y <= rowStep * 5.5;
  };
  state.units = state.units.filter((u) => !onScreen(u.pos));
  const near = range(centre, 7).map(key).filter((k) => k !== capital.pos && onScreen(k) && free(k));
  near.sort((a, b) => hexToBoard(b).y - hexToBoard(a).y || hexToBoard(a).x - hexToBoard(b).x);
  console.log('spots', near.length);
  const sides: Record<string, UnitTypeId[]> = {
    spartans: ['hoplite', 'kingsGuard', 'piper', 'scout', 'knight', 'catapult', 'defender', 'swordsman', 'hoplite', 'archer'],
    mongols: ['horseman', 'horseArcher', 'khansGuard', 'skyCaller', 'camp', 'sellsword', 'spearman', 'warrior', 'archer', 'horseman'],
  };
  const WEARS: [number, Unit['wear']][] = [
    [1, { battles: 0, scar: 0, bleeding: false }], [0.6, { battles: 2, scar: 0, bleeding: false }], [0.2, { battles: 6, scar: 0, bleeding: true }],
    [1, { battles: 3, scar: 3, bleeding: false }], [0.4, { battles: 3, scar: 0, bleeding: true }], [0.8, { battles: 1, scar: 0, bleeding: false }],
  ];
  const front = side;
  const owner = (f: string): number => state.players.find((p) => p.faction === f)!.id;
  const fill = (f: string, at: string[]): void => {
    const list = sides[f]!;
    at.slice(0, list.length).forEach((pos, i) => {
      const [hp, wear] = WEARS[(i * 5 + (f === 'mongols' ? 2 : 0)) % WEARS.length]!;
      spots.splice(0, spots.length, pos);
      place(list[i]!, owner(f), hp, wear);
    });
  };
  // The viewer's side goes down first (its own rows, front or back); the other side then takes the rows on its side of
  // the line that the viewer's units and city can see, so none of it is hidden.
  const viewerFaction = state.players[me]!.faction, otherFaction = viewerFaction === 'spartans' ? 'mongols' : 'spartans';
  const n = sides[viewerFaction]!.length;
  // In front, the far-sighted ones (sight 2) stand at the back of the viewer's rows, to see the other side's.
  const far = new Set<UnitTypeId>(['archer', 'horseman', 'knight', 'kingsGuard', 'piper', 'scout', 'horseArcher', 'khansGuard', 'skyCaller']);
  if (viewerFaction === front) sides[viewerFaction] = [...sides[viewerFaction]!].sort((a, b) => Number(far.has(a)) - Number(far.has(b)));
  const mineAt = viewerFaction === front ? near.slice(0, n) : near.slice(near.length - n);
  fill(viewerFaction, mineAt);
  const seen = visibleTiles(state, me);
  const rest = near.filter((k) => !mineAt.includes(k) && seen.has(k));
  const theirsAt = otherFaction === front ? rest.slice(0, sides[otherFaction]!.length) : rest.slice(-sides[otherFaction]!.length);
  fill(otherFaction, theirsAt);
  console.log('placed', mineAt.length, 'of the viewer\'s,', theirsAt.length, 'of the other side\'s', rest.length, 'seen');
} else {
  place(type, mine, 1, { battles: 0, scar: 0, bleeding: false });
  if (type !== 'catapult') place('catapult', me, 0.6, { battles: 3, scar: 0, bleeding: false });
  place(type, mine, 0.6, { battles: 2, scar: 0, bleeding: false });
  place(type, mine, 0.2, { battles: 6, scar: 0, bleeding: true });
  place(type, mine, 1, { battles: 3, scar: 3, bleeding: false });
  place('warrior', theirs, 0.4, { battles: 3, scar: 0, bleeding: true });
  place('archer', theirs, 1, { battles: 1, scar: 0, bleeding: false });
  place('horseman', theirs, 0.7, { battles: 2, scar: 0, bleeding: false });
}
// Everything round the capital is known to the viewer, so no placed unit sits under the fog.
const viewer = state.players[me]!;
viewer.explored = [...new Set([...viewer.explored, ...range(parseKey(capital.pos), 8).map(key).filter((k) => state.tiles[k] !== undefined)])].sort();
console.log('player', me, viewer.faction, 'capital', capital.pos, 'units placed', id);

for (const look of withSvg ? (['svg', '3d'] as const) : (['3d'] as const)) {
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
    await page.screenshot({ path: join(out, look === '3d' ? name : name.replace(/\.png$/, '-svg.png')) });
    console.log('wrote', look);
  } finally {
    await app.close();
  }
}
