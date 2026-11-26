# Release 0.7.0 integration: steadycam, warbanner (with hunker3d), cities3d

Branch `release070`, cut from main (live 0.6.3 plus docs). Merged in order: `steadycam` (07dc1bc), `warbanner`
(173bf82, which carries `hunker3d`), `cities3d` (b38311a). Not merged: rules9, buildings3d (the controller adds rules9).
No version bump, no whatsNew, no push, no deploy.

## Conflicts and how each was resolved

1. **steadycam, `src/ui/board/Board.tsx` (the measure effect).** Main's 0.6.3 fix (every measure calls `write()` at
   once; a `matchMedia` resolution listener redraws when only the pixel ratio changes) against steadycam's cover-aware
   camera (`startCamera(..., coverNow())`, `keepSelection(..., coverNow())`) and its `measure(now)` flag. Kept main's
   always-draw-now shape and its ratio listener and cleanup, with steadycam's `coverNow()` calls, and added `coverNow`
   to the effect's dependencies. With the slot now a fixed size, this path runs for real size changes only
   (rotation, window, browser bar).
2. **warbanner, `Board.tsx` imports.** Steadycam's camera imports (`keepInView`, `NO_INSETS`, `slackFor`, `Insets`) kept;
   `StatusOverlay` replaced by warbanner's `WarBanner`. The rest of warbanner (`UnitViewOf`, theme.css, the 3D units)
   merged on its own.
3. **cities3d** merged with no conflict. `Board.tsx`: the svg `Border` is gated on the new `svgLayers(...).border` flag
   while steadycam's `CityGlow` (`data-city-land`) is drawn independently of it, so in 3D the borders are drawn once by
   the terrain scene and the glow still by the tile svg over the 3D ground.

## Fixes after the merges

- `src/boundaries.test.ts` failed: `scripts/warbanner-shots.ts` imported `src/engine/testkit` (scripts must use the
  engine index). The script now builds its units with a local `addUnit` from exported data (`UNITS`, `freshDeeds`).
  This was a latent failure on the warbanner branch itself.
- `src/browser/resize3d.test.ts` (0.6.3) asserted that opening a card shrinks the slot. Since steadycam the cards lie
  over a fixed-size slot, so the selection steps now assert the slot keeps its size, and the rotation and browser bar
  steps assert it does change (so the redraw-at-once path is still exercised); every per-frame and at-rest alignment
  check is unchanged. Its taps go through the harness `tapTile` (drags the board when the card or bar covers a tile).

## Integration tests added

- `src/ui/terrain3d/input.test.tsx`: in 3D a selected city's tile draws the `CityGlow` in the svg but no svg `Border`,
  the border is in the 3D map, and the glow does not change the 3D map signature (selecting a city never rebuilds the
  terrain). With 3D off both are in the svg.
- `src/browser/integrate.test.ts` (gated on `BROWSER=1`), svg and 3D at 412x915, the seed 7 save with a level 2 city
  joined by road:
  - in 3D the svg draws no border lines; in svg it does;
  - the Scout's war banner, with the collapsed unit card open, lies in the uncovered part of the board;
  - with the capital selected: the land glow, the selection ring, the level badge (no road badge on a capital);
  - hiding the banner, and hiding the ring, changes the screen where they are (both drawn over the 3D city);
  - the second city shows the road and level badges in the collapsed card, and its land glows.
- The existing steadycam suites (`selection`, `sheet`, `bar`, `nextunit`, `cityfit`, `cityland`, `citybadges`, `flow`)
  pass with war banners in place of the pips; `hunker.test.ts` and the unit crouch tests pass with the panels.

## Results

- `npx tsc -b`: clean. `npm run lint` (oxlint): clean.
- `npx vitest run`: 130 files passed, 28 skipped; 1355 tests passed, 138 skipped (browser gates).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: built. index 549.53 kB (172.45 kB gzip), terrain3d 636.45 kB
  (176.38 kB gzip), firebaseNet 229.78 kB.
- `npm run test:browser` (with the base), run twice: both runs AI suite 6 of 6, then 23 files passed, 1 skipped
  (online, needs the emulator), 64 tests passed, 2 skipped. No flake across the two runs. (An earlier run before the
  fixes failed only in resize3d, as expected, and in the first draft of the new integrate test.)
- `npm run test:emu`: 134 files passed, 24 skipped; 1422 tests passed, 73 skipped.

## Shots (`docs/superpowers/plans/shots/release070/`)

Made by `scripts/release070-shots.ts` (seed 7 advanced 12 turns by `BoardDemo.advance`, turn 7, reduced motion), 412x915:

- `board-svg-412x915.png`, `board-3d-412x915.png`: the board with nothing selected, war banners over the units,
  3D cities and villages, the bottom bar (Tech with its dot, Next unit with its count, End turn neutral).
- `bar-svg-412x915.png`, `bar-3d-412x915.png`: the bottom bar close up.
- `unit-selected-svg-412x915.png`, `unit-selected-3d-412x915.png`: the Krypteia Scout selected, the collapsed card in
  the bar's place, move rings, its banner with the hidden eye.
- `city-selected-svg-412x915.png`, `city-selected-3d-412x915.png`: the level 3 capital selected: land glow, ring over
  the 3D city, the unit's banner on top, the level badge on the card picture.

## Concerns

- The shots board is modest (three own units at turn 7): `advance` plays legal moves blindly, so it is "mid-game" only
  in turn count.
- The steadycam, warbanner and cities3d concerns stand as written in their reports (Next unit out of reach while
  something is selected; banners wider than the old pips in clusters; the lantern light drawn over a mine tile's
  highlight; Safari `filter` on svg groups unchecked). Nothing here has been seen on a phone.
- Heavy suites shared the box with other sessions' sims and tests (load 7 to 12); all timings passed.
