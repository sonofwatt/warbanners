# Advanced match options: report (branch `advanced`, 2026-11-26)

David asked for an Advanced menu on the new match screen. Built: Chests (a rule), Weather and Time of day (looks
only). Biomes and Cannibals rows are left out until those features exist. Not pushed, merged, bumped or deployed.

## What it does

- **New match screen** (`src/ui/screens/Setup.tsx`, `src/ui/screens/Advanced.tsx`): an Advanced button under the
  setup line, closed at first (`aria-expanded`, `aria-controls` when open), opening in place to three rows of chips in
  the setup screen's style: Chests (Few, Normal, Many), Weather (Clear, Cloudy, Rain, Snow, Random) and Time of day
  (Day, Dawn, Dusk, Night, Random), with a note that weather and time only change the look. Text in `src/ui/text.ts`.
  At 412x915 the screen fits when closed; open, it is 1058 px tall and scrolls, so opening it scrolls the choices and
  Start into view (smooth unless reduced motion). Chips are 44 px tall and fit five to a row.
- **Online lobby** (`src/ui/screens/Lobby.tsx`): the host sees the same section and Start online passes the choices
  (`startOnline(advanced)` to `session.start(seed, advanced)`). The guest sees nothing new; the settings reach their
  phone with the match. The host's picks live in the lobby screen until Start (a reload of the lobby resets them).
- **Settings** (`src/engine/types.ts`): `MatchSettings` gains optional `chests`, `weather`, `time`. Only values other
  than the default are written (`src/app/advanced.ts advancedPart`), so a default match's settings, save, replay and
  wire string are byte for byte what they were. `src/app/advanced.ts` also holds the choice lists, `readAdvanced`
  (validates untrusted settings) and `lookOf` (Random resolved from the seed by an integer mix, salted per option; no
  randomness, the same on every phone, stable for the match).
- **Chests** (`src/engine/mapgen.ts`, `src/engine/state.ts treasuresPerHalf`, `CONFIG.mapgen.treasuresFew/Many`):
  Few 1 per half (2 on the map), Normal 2 (4), Many 4 (8). Same distance rules. With Many an attempt needs only the
  normal 2 per half and keeps as many more as fit; 4 per half fitted on every seed 0 to 1999 (and the test checks 300
  seeds for all three settings: count, mirror, spacing, connectivity). Terrain, resources and villages come from the
  same rolls whatever the count. Rules file `docs/rules/stage1-rules.md` section 3 step 5 updated. The AI needed no
  change (it reads treasures from the tiles in its AiInput).
- **Online** (`src/online/wire.ts decodeSettings`): the settings were already one canonical JSON string in
  `rooms/<code>/match/settings`, validated by `database.rules.json` only as a string of at most 512 chars. The new
  fields fit (the longest settings string is about 100 chars), so the rules needed no change. `decodeSettings` now
  keeps known advanced fields and refuses unknown values.
- **3D look** (`src/ui/terrain3d/sky.ts`, `weather.ts`, small edits to `shaders.ts`, `lanterns.ts`, `terrain3d.ts`):
  - Time of day sets the toon light direction and colours, the grade (`uTint`), the fog tiles' tint, the sea beyond
    the board (the slot background) and a glow boost. Dawn: low warm light from the left, pink shade. Dusk: low orange
    light from the right, violet shade. Night: cool blue moonlight, a dark blue grade, lit city windows, lanterns and
    furnaces 1.9 times as bright. There are no shadow maps, so no long shadows: the low sun shows in which faces are lit.
  - The unit figures get their own lighter grade (at night 0.86/0.89/1.0 against the ground's 0.56/0.64/0.90) and no
    snow or wet, so they stay readable. Banners, rings, marks and the status svg are untouched by the 3D grade.
  - Cloudy: greyer, flatter light and soft cloud shadows drifting over the board (one quad, noise in its shader).
    Rain: falling streaks and small splash rings (one mesh), darker ground with a faint wet sheen. Snow: falling flakes
    (one mesh) and a light patchy white dusting on the ground and on the up-facing tops of trees, roofs and rocks.
  - Rain, snow and clouds are drawn on the units canvas, in the existing ambient loop: 20 fps, rest after 20 s quiet,
    paused when covered or hidden, still under reduced motion. Each is one mesh built once; the board size is a
    uniform and every particle moves in its vertex shader by the motion clock, so a frame uploads no geometry.
  - Day and Clear are exactly the old light (`sky.test.ts` checks the numbers); the window glow, snow and wet are 0.
- **SVG look** (`src/ui/board/Board.tsx`): a grade silhouette per tile (the tile's art drawn again in one colour at a
  low opacity, the way the veil already works; no filters), for dawn, dusk, night, and a light grey for cloud and rain.
  Marks, the ready glow, borders and units are drawn outside it, at full contrast. Rain and snow add a faint static
  texture on the tiles' top faces (two small svg patterns). The sea beyond the board follows the time of day too.

## Tests

- `src/engine/chests.settings.test.ts`: absent and Normal give the same map and hash; weather and time never change the
  match hash; Few/Normal/Many give 2/4/8 chests on 300 seeds with the spacing, mirror and connectivity rules.
- `src/engine/fingerprint.test.ts` unchanged and passing: the default-settings fingerprint (rules 9) is unchanged.
- `src/app/advanced.test.ts`: defaults write nothing; untrusted values refused; Random weather and time stable per seed
  and identical after a JSON round trip, all four of each reached, drawn independently; old records load unchanged; a
  record with advanced fields keeps them and replays with 8 chests.
- `src/online/wire.test.ts`: default settings encode to the old string; advanced settings round trip and stay under 512.
- `src/app/store.test.ts`: the setup's choices go into the settings, only the non-defaults.
- `src/app/store.online.test.ts`: the host's choices reach the guest: the same settings, the same look, the same 8 chests.
- `src/ui/screens/screens.test.tsx`: the section is closed at first.
- `src/ui/terrain3d/sky.test.ts`: Day+Clear is the old light; night darker and blue with brighter glow; the figures'
  grade is never darker than the ground's and stays above 0.8 luma; dawn/dusk low and warm from either side; cloud
  and rain flatten the light; the SVG grade stays at most 0.6.
- `src/browser/advanced.test.ts` (real browser): disclosure, defaults, fit at 412 px, chip sizes, choices saved with the
  match, SVG grade and texture present and marks/units outside it, a default match unchanged; in 3D (software WebGL)
  night with rain is under 75% of the day's brightness and the rain moves between two shots.

Results (2026-11-26, this branch): `npx tsc -b` clean; `npm run lint` clean; `npx vitest run` 1422 passed, 141
skipped; `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser` all passed (AI file 6, the rest 67 passed, 2 skipped,
including `resize3d` for the 0.6.3 resize fix and the new `advanced` file); `npm run test:online` 2 passed;
`npm run test:emu` (src/online changed) 1489 passed, 76 skipped.

## Cost

- Bundle (vite build, against `db496f6`): main chunk 551,355 to 558,908 bytes (+7.6 KB; gzip 170,921 to 173,638,
  +2.7 KB); terrain3d chunk 682,636 to 690,176 bytes (+7.5 KB; gzip 190,842 to 193,499, +2.7 KB).
- Triangles and draw calls only while the weather is on: Rain 650 streaks + 140 splashes = 790 quads, 1,580 triangles,
  1 draw call; Snow 420 flakes, 840 triangles, 1 draw call; Cloudy 2 triangles, 1 draw call (a noise shader over the
  board). Clear adds nothing (the meshes are hidden). Time of day adds nothing: uniforms only.
- With weather on, the units canvas redraws in the ambient loop whenever it is awake (the weather covers the whole
  board), so for 20 s after each touch the figures' canvas draws at 20 fps even with no figure in view. It still rests,
  pauses when covered or hidden, and stands still under reduced motion.
- Snow adds an fbm (4 noise octaves) to the ground shader per pixel, only while snowing and only when the terrain redraws
  (camera moves and map changes, never in the loop).

## Shots (`docs/superpowers/plans/shots/advanced/`, 412x915 at DPR 2.6, software WebGL)

- `setup-closed.png`, `setup-advanced-open.png` (opened: Many, Random, Night chosen), `setup-advanced-open-scrolled.png`
- 3D times: `3d-day.png`, `3d-dawn.png`, `3d-dusk.png`, `3d-night.png`
- 3D weather: `3d-cloudy.png`, `3d-rain.png`, `3d-snow.png`, plus `3d-snow-night.png`, `3d-rain-dusk.png`
- GIFs at real pace (20 fps on the page clock, 3 s): `3d-rain.gif`, `3d-snow.gif`
- SVG: `svg-day.png`, `svg-night.png`, `svg-dusk.png`, `svg-night-rain.png`, `svg-snow.png`
- Chests: `chests-many-svg.png` (8 chests), `chests-normal-svg.png`, `chests-few-svg.png`, `chests-many-3d.png`
- Script: `scripts/advanced-shots.ts` (`setup`, `times`, `weather`, `cloudy`, `gifs`, `svg`, `chests`).

## Concerns and choices for David

- **Older app builds online.** A phone on an older build decodes the settings without `chests`, so with Few or Many it
  would build a different map and the match would fail its opening hash check (desync) rather than play on. Default
  matches and weather/time are unaffected. RULES_VERSION is unchanged (the default game is unchanged), so the room's
  rules check does not stop such a pair. Worth a note in the release, or a check that both phones are on this build.
- **Cloud shadows and rain lie over the tile svg**, which holds the selection marks and move rings, because they are
  drawn on the figures' canvas (the only one that redraws in the loop). A cloud shadow dims a mark under it by up to
  about a third; the rain streaks are thin. Status, banners and badges are above and untouched.
- **Window glow** finds the town's windows by their two paint colours in the prop shader. If those colours change in
  `town.ts` or `buildings.ts`, the shader's two constants must follow.
- **Not graded:** the waterfalls' mist, chimney smoke and the chest-opening effect keep their day colours (they read as
  pale at night). Easy to tint if wanted.
- **No long shadows:** the 3D board has no shadow maps; dawn and dusk show the low sun by which faces are lit.
- **Merge with `tracks3d`:** outside the new modules, `shaders.ts groundFrag` changed in two lines (the fog tile's
  colour times `uTint`, and `lit` wrapped in `weatherOn(...)`), plus a `WEATHER_GLSL` block and the prop shader's end.
  `terrain3d.ts` gained the weather mesh, a units copy of the uniforms and `setLook`.
- The SVG grade draws each tile's art a second time (as the veil does), so a night or dusk board in SVG draws about
  twice the tile shapes; panning on an old phone in SVG mode is worth a look.
