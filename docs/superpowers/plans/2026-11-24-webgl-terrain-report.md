# WebGL terrain in the game: report (2026-11-24)

Branch `webgl-terrain`, version 0.5.1, rules version unchanged (7). Not merged, not deployed.

## What was built

An optional 3D terrain look, "3D terrain on / off" in the match menu (under Sound), off by default and remembered
per device (`localStorage` key `warbanners.terrain3d`). When it is off the board is the same component tree and
the same svg as before, and three.js is never downloaded.

When it is on, the board slot holds a `<canvas class="board-terrain">` under the board's `<svg>`, the same size
(absolute, `inset: 0`, no pointer events; the svg gets `position: relative` so it stays on top and keeps every
tap). The renderer is the approved art sample ported to TypeScript, with David's later changes:

- Mountains: one large main peak with a straight summit, 15 percent lower than the sample's second pass (about 35
  to 38 board units on screen), plus two or three smaller peaks at 40 to 62 percent of its height. Smaller peaks
  left of the main peak stand behind it (its lit left face stays clear); only the shaded right side has one beside
  it. Peaks at 55 percent or more carry a snow cap. With ore or a mine the front of the tile is kept clear.
- Variety: four layouts per terrain picked by (7q + 13r) mod 4, which differs between any two neighbours, and one
  of six turns per tile from a hash. The light stays fixed. Forests, orchards and field and water details spin with
  the turn; the grove behind what shares a forest is mirrored instead, and mountains turn their ridges slightly and
  flip the shoulder, so tall things stay at the back of the tile.
- New low details: grass clumps on every field plus bushes, stones or a flower patch; on water an islet, lily
  pads or reeds by a shore; game as one deer either way, a doe and fawn, or a deer and a bush; ore clusters vary.
- Everything else as approved: flat toon light, wild wheat tufts, earth roads joined to neighbours and cities,
  faint hills by mountains, apple trees with seven apples, painted water with foam at the shore.

## Files

- `src/ui/terrain3d/option.ts`: the setting (read and write, memory fallback) and a WebGL 2 check on a throwaway
  canvas. No three.js.
- `src/ui/terrain3d/input.ts`: `glMapOf(items)` builds the terrain's map from the board scene (explored tiles only,
  the fog list, the veiled list, and signatures), `svgLayers()` says which svg layers a tile still draws, and
  `GL_TERRAIN` / `GL_RESOURCE` list what has 3D art. No three.js; the board imports it either way.
- `src/ui/terrain3d/layout.ts`: what stands where (variants, turns, peaks, trees, props, details, roads, heights).
  Pure maths.
- `src/ui/terrain3d/build.ts`: geometry per tile (ground lattice and walls, props, fog tiles).
- `src/ui/terrain3d/shaders.ts`: ground and prop shaders.
- `src/ui/terrain3d/terrain3d.ts`: the renderer, the lazy chunk's entry: `createTerrain3d(canvas, onLost)` with
  `setMap`, `setVeil`, `draw(cam, vp)`, `dispose`.
- `src/ui/board/Board.tsx`: the canvas, the dynamic import, drawing in the same frame as the svg camera, map and
  veil updates, the svg layers switch (`TileArt` takes `layers`), `BoardTile` exported for tests.
- `src/ui/panels/Menu.tsx`, `src/ui/screens/Match.tsx`, `src/ui/icons.tsx` (TerrainIcon), `src/ui/text.ts`,
  `src/ui/theme.css`: the menu line, its state and failure handling, label and style.
- `vite.config.ts`: the `terrain3d-*.js` chunk is left out of the service worker precache and cached on first use
  (CacheFirst), so a device that never turns it on never downloads it, and one that has still works offline.
- `package.json`: `three` 0.170.0 (exact), `@types/three` 0.170.0 (dev).
- Tests: `src/ui/terrain3d/{option,input,layout,lazy}.test.ts(x)`, a Menu test in `src/ui/panels/panels.test.tsx`,
  `src/browser/terrain3d.test.ts` (BROWSER=1). `src/browser/harness.ts` gains `webgl: true` (software WebGL).
- `scripts/terrain3d-shots.ts`: the screenshots below (`npx tsx scripts/terrain3d-shots.ts` after `vite build`).

## How it hooks into the board

- The camera stays in Board.tsx. `write()`, which sets the svg camera transform once per animation frame, now also
  calls `terrain.draw(cam, vp)`, so both layers move in the same frame. There is no render loop: a frame is drawn
  only when the camera moves, the slot resizes, or the map or veil changes.
- Map changes (a road, a harvest, a building, a city, fog lifting) change the map signature; `setMap` rebuilds only
  the tiles whose own state or neighbours changed (a per-tile cache) and merges them again.
- The svg keeps drawing the ground until the renderer has drawn its first frame, so there is no blank board while
  the chunk downloads.
- The svg stays at the same place in the React tree whether the canvas is there or not (an early version swapped
  it, which left the size observer and gestures on the old node; landscape screenshots caught the drift).

## Fog and veil

- Fogged (never explored) tiles: the terrain receives only their keys, never their terrain, so nothing hidden can
  be drawn. WebGL draws them as today's fog tile: the same three colours from `GROUND.fog`, unlit, with the thin
  rim. This is a deliberate change from "fog stays in SVG": with fog in the svg, a peak or tree on an explored tile
  in front of a fog tile was cut off by that fog tile's svg polygon, which never happens on today's board. The svg
  still draws a fog tile's glow, mark and centre.
- Veiled (explored, not seen now) tiles: dimmed in WebGL toward the board's veil colour `#1E2833` by 0.3, the same
  sum as the svg veil (a silhouette at 0.3 opacity), on ground and props alike, through a per-vertex attribute that
  is rewritten in place (no rebuild). What stays in the svg on a veiled tile (a city, a village) keeps its svg veil.

## What the svg keeps and drops when the option is on

- Drops: the tile base (top face and walls, fog included), roads, terrain features (mountain, forest, water
  waves), the grove behind what shares a forest, resource marks.
- Keeps: cities, villages, buildings, treasures, borders, marks, the ready glow, units and effects. A treasure on
  a mountain keeps its front position, where the 3D peak leaves room for it; a lumber camp keeps its place before
  the grove.
- Fallback: a terrain not in `GL_TERRAIN` is left out of the 3D map and drawn whole by the svg; a resource not in
  `GL_RESOURCE` is drawn by the svg on top. Today every terrain (field, forest, mountain, water, and a city's sand)
  and every resource (orchard, cropland, game, ore) has 3D art.

## Failures

- No WebGL 2 (checked before three.js is fetched), the chunk fails to load (offline before it was ever cached),
  `WebGLRenderer` throws, or the context is lost: the renderer is disposed, the svg board is whole again on the
  next render, and Match turns the option off on the device (it shows "3D terrain off" in the menu).
- The match ending or being left unmounts the board, which disposes every geometry, material and the renderer and
  releases the context.

## Light

- devicePixelRatio is capped at 2 (`MAX_DPR`). The fragment shader is the sample's; frames are drawn on demand.
- 3 draw calls. The sample's radius 6 board: about 45k ground vertices and 48k prop triangles (drawn twice, fill
  and outline).
- Building every tile from nothing takes about 230 ms on ClaudeComputer (once, when the option turns on or a
  match with a large explored map opens); later changes rebuild a few tiles and merge again.

## Sizes (vite build)

- Main chunk before: 499.19 kB (gzip 156.61 kB). After: 503.02 kB (gzip 157.91 kB), so 3.8 kB more (1.3 kB gzipped): the option, the svg layers
  switch, the map signature, the menu line and the icon. It now passes Vite's 500 kB warning line, which was
  already 0.8 kB away.
- Lazy chunk `terrain3d-*.js`: 508.37 kB (gzip 132.18 kB), three.js plus the renderer. Not precached.
- CSS 38.07 kB before, 38.17 kB after.

## Test results

- `npm test`: 105 files passed, 22 skipped (the gated browser and emulator suites); 1076 tests passed.
- `npm run build`: passes (typecheck and Vite build); `oxlint` clean on src.
- `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser`: 18 files, 50 passed, 2 skipped, including the new
  `terrain3d.test.ts`. One earlier run failed `ai.test.ts` "the page never stands still for 100 ms" (the CPU
  slowed four times check) under machine load; it passed alone and in the full rerun. Nothing in this branch
  runs during an AI turn when the option is off.
- All heavy runs were taken under `flock /tmp/banners-heavy-tests.lock`.

## Screenshots

In `docs/superpowers/plans/2026-11-24-webgl-terrain-shots/`, seed 7, at 412 x 780 (portrait) and 915 x 412
(landscape), all checked by eye: units stand on their tiles and borders lie on the tile edges in every one.

- `portrait-off.png`, `portrait-on.png`, `landscape-off.png`, `landscape-on.png`: the first turn.
- `portrait-on-zoomed.png`, `landscape-on-zoomed.png`, `portrait-off-zoomed.png`, `landscape-off-zoomed.png`: after
  three zoom steps, with the option on and then off again.
- `portrait-later-off.png`, `portrait-later-on.png`, `landscape-later-off.png`, `landscape-later-on.png`: turn 7
  of a fixed-move game with the whole map explored, most of it veiled, villages, treasures and a second city.

The scratch sample (`~/projects/warbanners-workspace/superpowers/scratch/webgl-terrain`) now bundles this renderer,
so its renders show exactly the game's art; `renders/mountain-close.png`, `renders/compare-close.png` and
`renders/compare-full.png` were rendered again with it.

## Known gaps

- Not yet measured on the Pixel: the frame cost on a phone GPU, and the first build (about 230 ms here, so perhaps
  half a second on a phone) which happens on the main thread when the option turns on.
- The veil reads a little softer on the 3D ground than on the flat svg colours, though the sum is the same.
- The sample's weather hooks (cloud and fog masks) were left out of the game shaders; the light and `uTint` remain.
- The water does not animate (static frames only).
- Peaks from a tile can reach up over the tile behind it, as today's svg mountains do; the svg layers of that back
  tile (border, mark, glow) are drawn over the peak, since all svg is above the canvas.
- The option sits in the match menu only, not on Home.
