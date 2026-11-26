# water3d: clear water, swimming fish, mountain ridges

Branch `water3d`, cut from `buildings3d` and merged with `main` (0.7.0) first. To ship as 0.7.1 with the buildings.
Not pushed, not merged, no version bump.

David's requests: "Can we make the water tiles transparent and have the fish swim around?" and "If there are
multiple contiguous mountain tiles, 30% of the time they should merge into one larger mountain ridge."

## Step 0: the merge

One conflict, in `src/ui/terrain3d/shaders.ts` `propFrag`: main's spent shade (`shade(finish(...))`, `UNIT_SHADE`
and `uShade`) against buildings3d's lamp light for the mine tunnel (`#ifdef LAMP`). Both kept: the lamp block runs,
then the final colour goes through `shade()`. `WORLD_NORMAL` came in from main without a conflict. tsc and the
terrain3d and units tests passed (190 tests) before the merge commit.

## Water

- **Bed.** A water tile's top is now its bed (`build.ts`, depth from `waterLayout.ts bedDepthFn`): `BED_MIN` (0.45)
  under the surface at a shallow edge, falling over 16 units to `BED_DEPTH` (7.5) in open water, with soft sand
  ripples in world space. Shallow edges are every edge except those to another water tile and the board's front rim
  (edges 1 and 2 off the board, where the water column and the falls are). The shader paints it sand, then pebbles,
  then a deeper green-grey toward the middle (`groundFrag`, terrain 3). Two to four stones, pebble scatters and weed
  clumps lie on it (`bedBits`), with no outline.
- **No walls between water tiles**, so the bed runs on under one surface; walls toward land and the rim stay. The
  beds of two water tiles agree along their shared edge (tested).
- **Surface.** `water.ts createSurface`: one mesh, six triangles a water tile, at `WATER_Y`, see-through, writing no
  depth, drawn after the opaque terrain. Foam and depth are worked out per pixel from each tile's edge masks. Colours
  are the old water's family; swells and foam are the old code moved into `shaders.ts WATER waterSurface()`. The deeper
  the water, the more the surface tint covers, so depth reads. The bed is always at least 0.45 below the surface, so
  the two never fight (tested on every bed vertex).
- Reeds now root on the bed; an islet stands on a rock foot. Lilies are unchanged. Borders still float over the
  surface (heightFn for water is unchanged, the bed is a separate function).
- Fog tiles, the SVG look and the waterfalls are unchanged; the falls still pour from the surface at the front rim.

## Fish

- `waterLayout.ts fishPaths/fishAt`: three fish per fish tile (two on odd layouts), one smaller and paler once
  harvested. Each swims a rounded ellipse round its own centre near the tile's middle, 8 to 11 laps per 100 s (about
  9 to 12 s a lap), each way round, bobbing a little, wagging its tail 140 to 190 times per 100 s.
- Seamless: the fish clock is the water motion clock (`terrain3d.ts tick`, scaled by the ambient level) mod
  `FISH_PERIOD` = 100 s, and falls' `FLOW_PERIOD` is 1000 s; laps and wags are whole numbers per period. It holds still
  at rest and under reduced motion because that clock does. No new loop: it runs in the existing ambient loop (20
  fps, rest after 20 s quiet, paused when covered or hidden); `animating()` also counts fish tiles in view.
- One mesh for every fish (77 triangles a fish) plus one for their soft shadows on the bed, posed entirely in the
  vertex shader (`fishPose`, line for line with `fishAt`). A new time uploads no geometry (tested).
- They draw on the figures' canvas (it alone redraws). There they are tinted as the surface would tint them, swells
  included. What stands on the two tiles in front of a fish tile (a peak, trees, a town) is drawn first as depth only,
  so it hides fish behind it; the depth is then cleared, so unit figures still draw over everything as before.
  Without the figures' canvas the fish stand still under the real surface.
- Plain water gets no fish shadows, so nothing competes with the fish resource.
- No leap (kept it cheap).

## Ridges

- `ridges.ts ridgeChance(a, b, seed)`: per touching pair of mountain tiles, a 32-bit hash of the two keys (sorted) and
  the match seed, under `RIDGE_CHANCE` = 0.3. Measured 30 percent over 23,000 pairs (test). Same whichever tile asks,
  every redraw and every viewer. It is a self-contained function, so a later biome look can replace it.
- **Per pair, not per group**, on purpose: a choice per connected group would flip when fog lifts and the group is
  found to be bigger. Per pair it never changes. Pairs that both join chain into ridges of three and more. One effect:
  a range of three in a line has about a 51 percent chance of showing some ridge, not 30.
- The seed reaches the look as `GlMap.seed` (Match passes `state.seed` to Board, Board to `glMapOf`), and it is in the
  tile cache signature.
- Geometry: a crest from each tile's main peak to a crossing on the shared edge, toward the edge's back corner. On the
  way to a front neighbour the crest runs out along the tile's side, so the front of the tile stays clear. Each tile
  draws its own half (faceted rock, light and dark faces, snow above half the peak height, scree at the foot), and the
  two halves share the crossing section exactly. The crest dips to a saddle about a third of the lower peak's height,
  with a small snow-free tooth peak standing on the saddle, so it reads as peaks along a crest. Foothill scree follows
  the crest.
- Content: each tile keeps its own peaks, props, chest and works exactly (tested against the same tile unjoined, for
  ore, jewels, mine, foundry and treasure, every edge). The crest is narrowed and lowered near ore, jewels, the mine
  yard, a foundry and a chest on either tile, and every section's foot keeps 1.5 units clear of them (tested). Units
  draw on their own canvas, over everything, as before. The faint 25 percent border behind tall things works on ridges
  unchanged, because the ridge rock is ordinary prop geometry in the depth buffer.
- Visual only: no engine, mapgen or rules change.

## Cost

- Bundle: the terrain3d chunk 664.27 kB (186.38 kB gzip) before, 682.63 kB (193.41 kB gzip) after: +18.4 kB
  (+7.0 kB gzip). The main bundle only gained the seed prop.
- Triangles on the seed 7 map (127 tiles, 16 water, 6 fish, 26 mountains): the surface is 96 triangles (6 a water
  tile); fish about 1,150 plus 2 a fish for shadows; a ridge pair adds 282 triangles to the 728 of two mountains; this
  map rolls 6 of its 12 mountain pairs into ridges, about 1,700 more triangles on the static terrain. The water bed
  uses the same lattice as before (no change); bed stones and weeds add a few dozen triangles a tile.
- Per ambient frame on the figures' canvas: two more draw calls (fish, shadows) and, when fish tiles are on the map,
  a depth-only pass over the props of the tiles in front of each fish tile (a few hundred to a few thousand triangles,
  no colour, no shading) and a depth clear. Nothing else changes in the loop's rules.

## Tests

- New: `src/ui/terrain3d/water.test.ts` (bed always under the surface and deepest in open water; no walls between
  water tiles; beds meet along a shared edge; the surface is one flat hexagon a tile; fish loops keep their whole body
  inside the tile on 441 tiles, at many clock times; loops are seamless at the wrap and the same clock gives the same
  pose; turning is smooth; fish counts and the harvested fade; no fish left in the prop mesh; one fish mesh posed by
  the clock alone, no upload) and `ridges.test.ts` (deterministic, symmetric, 30 percent; both tiles agree and share
  the crossing section; cities excluded; content unchanged and kept clear for five kinds of content on all six edges;
  triangle cost).
- Changed: `build.test.ts` no longer expects fish props in the prop mesh; `lifecycle.test.ts` fake gains `water()`.
- Results at the end of the branch: `npx tsc -b` clean, `npm run lint` clean, `npx vitest run` 1404 passed (138
  skipped: the browser suites), `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser` passed (ai 6 of 6, then 64 passed
  and 2 skipped in 23 files) on the second run. The first run failed one timing check in `ai.test.ts` (the longest
  task during a hard AI turn with the CPU slowed four times was 115 ms against a 100 ms limit) while the machine's load
  was about 5; that suite runs the svg board and this branch does not touch it. `npm run test:online` passed (2 of 2).

## Shots

`docs/superpowers/plans/shots/water3d/` (made by `scripts/water3d-shots.ts`; `before-` from the merge commit's build):

- `lake-phone.png` / `before-lake-phone.png`: 412x915, a lake of seven water tiles with three fish tiles (one
  harvested) and a peak in front of the harvested one.
- `lake-close.png`, `fish-tile-close.png`, `fish-harvested-and-peak-close.png` and their `before-` pairs: close ups.
- `fish-swim.gif`: five seconds at real pace, 20 fps on the page's held clock; `fish-swim-*ms.png` stills from it.
- `ridges-phone.png` / `before-ridges-phone.png`: 412x915, with a ridge of two, an L of three (with a diagonal join
  onto an ore tile), two separate peaks, and a ridge with a mine and jewels on it.
- `ridge-two.png`, `ridge-three.png`, `separate-peaks.png`, `ridge-mine-jewels.png` and their `before-` pairs.

## Concerns and open points

- Ridge choice per pair (see above) instead of per group; David asked for "30% of the time". If he wants exactly 30
  percent of ranges, it needs the whole range known, which fog makes unstable.
- The fish occluder covers the two tiles in front of a fish tile. Very tall things two rows in front can in principle
  reach a fish at the tile's front edge; none of today's art does (peaks reach about 37 board units up, the fish stay
  over 40 away on screen).
- The bed's hex lines stay faintly visible under water, as on land (the grid stays readable). Easy to drop if David
  prefers open water to look seamless.
- The `before-` shots of the lake come from the same diorama, which is why the water there is the old opaque tile.
