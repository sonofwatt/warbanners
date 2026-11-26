# 3D tile buildings and treasure chests: report (2026-11-25)

Branch `buildings3d`, cut from `cities3d`. Not pushed, merged or released; no version bump. Everything here is behind
the "3D terrain" option; with it off the svg board is exactly as before.

David asked: "Buildings next with treasure chests. Animate the chests so that the lid swings open when the unit is
capturing them."

## What was built

Every tile building is now drawn in 3D, in the faceted toon style of the 3D cities and the mine, and so is the
treasure chest. With 3D on, nothing that stands on a tile is a flat svg picture any more (tested over every terrain,
resource, building, village and treasure): what stays in the svg is only the deliberate overlays (selection and move
marks, the ready glow, the reward star, the veil, the fog tiles' marks, the units' plates and badges, and the
effects).

### The buildings (`buildingLayout.ts` places, `buildings.ts` shapes)

A unit stands in the middle of a tile, so each building keeps the middle low or open, as the cities keep their
square; tall pieces stand to the back and sides. Each piece is shaped at a modest size and drawn larger (1.25 to 1.5
times), so it reads at the phone's default zoom about as boldly as the svg mark.

| Building | 3D look | Upgrade of |
| --- | --- | --- |
| Farm | fenced ploughed rows with young shoots at the front left, a red barn (white cross doors, hay door) at the back right, a hay bale | |
| Granary | the farm's rows now ripe wheat, the barn, a tall round stone granary with a red conical roof and gold finial, three sheaves | farm |
| Orchard | five pruned fruit trees with whitewashed trunks in tidy rows (three at the back, two at the sides, a lane down the middle), a ladder leaning on a tree, two baskets of fruit, a low fence | |
| Plantation | seven heavier trees (apples and pears) in three straight rows on mown strips, stacked crates of fruit and a basket at the front | orchard |
| Lumber camp | at the forest's front edge, before its grove: a log cabin with log courses and a stovepipe, a stump with an axe bitten into it, a pile of cut logs (ends to the viewer), a sawhorse with a log | |
| Lumber mill | a two storey timber mill on a stone footing, a race of water beside it with a water wheel that turns, a bigger log pile and a stack of sawn planks; the grove stands behind | lumber camp |
| Market | three stalls round an open square, awnings striped in the land owner's colour and cream, goods on the counters, a barrel and sacks | |

- Upgrades keep what they grew from and add to it (tested): the granary keeps the barn and rows, the plantation has
  seven trees to the orchard's five, the mill replaces the camp's cabin with a mill and adds the wheel.
- Owner colour: the market's awnings are in the owner's colour (from the tile's territory). A market on unowned land
  keeps the svg's yellow. No other building showed an owner in the svg, so none does in 3D; the border still does.
  Only a market carries its owner on the 3D map, so a border that moves never rebuilds any other tile.
- Shared tiles: a building replaces its resource, harvested or not, as in the svg (tested: the same geometry and
  colours either way, no faded resource beside it). In a forest the camp and the mill stand before part of the grove;
  grove trees that would stand inside a building make way (tested), and at least two stay. The ground under a field
  building is nearly level, so the rows and stalls sit flat on rolling land.
- The mine and the foundry are unchanged from `cities3d`.

### The water wheel (`wheels.ts`)

- One mesh for the whole map (a fill and its toon outline), rebuilt only when the set of mills changes. The turn is
  done in the vertex shader, about each wheel's own hub, from one uniform; each mill has its own phase. A frame of
  turning wheels costs two draw calls and no geometry upload.
- It runs inside the existing ambient loop: no new loop. It turns on the terrain's motion clock (the one the
  waterfalls use), which runs at the loop's level: 20 fps, it slows to a stop when the board rests after 20 s
  quiet, holds still under reduced motion, and pauses when covered or hidden, all as the loop already does.
  `animating()` counts a wheel in view, so the loop runs while one is on screen.
- About one turn every 6 s (1.05 rad/s): calm, a few degrees a frame.
- Drawn on the units canvas with the waterfalls and lanterns; without a units canvas it stands still in the terrain.

### The treasure chest (`buildings.ts` `chestParts`)

- A wooden chest with two gold bands, a dark foot band, a lock plate and a half barrel lid with matching bands; two
  coins at its foot and the svg's two four-point sparkles, now flat 3D glints facing the camera (as the svg's are
  still, so are these).
- Placed like the svg chest: in the middle on a field, in front of the grove in a forest, in front of the peak on a
  mountain (the peak moves back as for ore), and small beside a unit standing on the tile (`beside`, from the scene's
  `occupied`). A chest under a building or a village is hidden in both looks, as before.

### The chest opening when claimed (`chests.ts`, `buildingLayout.ts` `chestOpen`)

- The claim is found in the action's effects list: `claimsOf` in `effects.ts` takes the treasure effects (the gold
  sum or the find words for the claimer, the plain burst for the other side), one per tile, with their delays.
  `Match.tsx` passes them to the board with the attacks (`BoardAttacks.chests`); the board hands them to the terrain
  in the same layout effect that starts the strikes. So it plays for the viewer's own claims and for the AI's and an
  online opponent's, whenever the viewer sees the tile (the effect is only there when they do).
- The claimed tile no longer has a treasure, so the prop mesh drops its chest; in the same frame an identical chest
  appears on the units canvas where the old one stood (the terrain remembers the spots of chests that the last maps
  took away) and opens:
  - 0 to 360 ms: the lid swings back on its hinge with an ease out, to 112 degrees, showing its pale underside and
    the dark inside;
  - 110 to 630 ms: a soft gold glow rises from behind the mouth and seven gold coins leap out and fall back;
  - 360 to 560 ms: the open chest holds;
  - 560 to 860 ms: it shrinks into the ground as it sinks (300 ms), and is gone.
  The svg's existing burst and words play over it as before.
- The parts stay opaque while it goes, so its outline never shows through a see-through body (a fade was tried
  first and looked dark and muddy on a transparent canvas).
- Each opening is a handful of meshes made when it starts and freed when it ends; nothing is drawn or kept when no
  chest is opening. The board's existing follow loop draws the units canvas while one plays (`Terrain3d.playing`),
  as it does for strikes and turns; no new loop.
- Reduced motion: nothing plays; the chest is simply gone.

## Files

- New: `src/ui/terrain3d/buildingLayout.ts` (pure), `buildings.ts`, `wheels.ts`, `chests.ts`, and their tests
  `buildingLayout.test.ts`, `chests.test.ts`; `scripts/buildings3d-shots.ts` takes every shot below.
- Changed in `terrain3d`: `input.ts` (`GL_BUILDING` now all nine, `GlTile.owner` and `beside`, the svg `treasure`
  layer), `codes.ts`, `layout.ts` (`Setup.building` and `chest`, grove trees make way, level ground), `build.ts`,
  `terrain3d.ts` (wheels, chests, `chests()`, `playing()`), `town.ts` (`Kit` and `gable` exported, `Kit.done` takes a
  scale).
- Outside `terrain3d`, kept small:
  - `Board.tsx`: about ten lines. `TileArt` honours the treasure layer; `BoardAttacks` gains `chests`; the attacks
    layout effect starts the openings and the follow loop runs while one plays.
  - `Match.tsx`: three lines (`claimsOf` into `BoardAttacks`).
  - `effects.ts`: `claimsOf`, pure.

## Cost

Triangles in the prop mesh per tile (the bare tile's own grass and stones included):

| Tile | triangles | what it replaces |
| --- | --- | --- |
| field / forest / mountain, bare | 156 / 336 / 416 | |
| farm | 544 | cropland 1491 |
| granary | 864 | |
| orchard | 780 | orchard resource 960 |
| plantation | 1080 | |
| lumber camp (with its grove) | 836 | forest with game 648 |
| lumber mill (with its grove) | 1048, plus 440 for its wheel | |
| market | 900 | |
| chest on a field / in a forest / on a mountain | 256 / 448 / 568 (the chest itself about 250) | |
| a chest opening | the same chest, 7 coins and a glow disc, only while it plays | |

- Every building costs less than a level 5 city (926 to 1520). A farm or orchard costs less than the cropland or
  orchard resource it replaces.
- Built once per map change, into the merged prop mesh; nothing is rebuilt per frame.
- Draw calls added: the wheels' two (fill and outline) when there are mills, and about a dozen per chest while it
  opens (its body and lid with their outlines, seven coins, the glow). Nothing for the buildings themselves (they are in the prop mesh).

Bundle (`GITHUB_PAGES_BASE=/warbanners/ npx vite build`, gzip -9, the branch's start vs now):

| chunk | cities3d | buildings3d |
| --- | --- | --- |
| index (main) | 535.1 kB, 165.4 kB gzip | 535.8 kB, 165.6 kB gzip (+0.7 kB, +0.2 kB gzip) |
| terrain3d (lazy) | 632.0 kB, 172.2 kB gzip | 652.6 kB, 179.6 kB gzip (+20.6 kB, +7.4 kB gzip) |

- No new chunk. The new 3D files are only reached from the lazy chunk; the main chunk gains `claimsOf` and the svg
  layer flag.

## Tests

- `buildingLayout.test.ts` (new, pure): every building's plan on every turn of its tile, each piece on the tile and
  tall ones clear of the middle; upgrades keep what they grew from and add to it; the market's open square; a building
  replaces its resource, harvested or not; the chest's spot in the middle, before a grove, before a peak, beside a
  unit, and nowhere a building, village or city hides it; the lid's timing (opens in 360 ms with an ease out, never
  more than about ten degrees a 10 ms frame, holds, goes over 300 ms, gone at 860 ms); the burst comes while it opens
  and ends before it goes; the coins leap and fall back; `chestPlays` (a claim on a tile that showed a chest, timed
  from its effect, once per tile; reduced motion plays nothing); the wheel's spots and its steady turn.
- `chests.test.ts` (new, three.js with a stand-in renderer): a claimed chest opens where the map showed it after the
  map has dropped it, shut until its effect starts, open at 360 ms, nearly gone near the end, gone and not playing
  after 860 ms; reduced motion: nothing plays; a claim where no chest was seen plays nothing and a chest opens once;
  the wheels are one mesh, turn with the motion clock, stand still at level 0, keep the ambient loop running in view.
- `input.test.tsx`: every building and the chest go to 3D, each drawn exactly once (svg with 3D off, 3D only with it
  on, on every terrain, in the middle and beside a unit); the market carries its owner and no other building does;
  a unit stepping onto a chest rebuilds that tile; with 3D on no svg layer is left for anything that stands on a
  tile, over every terrain, resource, building, village and treasure.
- `build.test.ts`: every building has props; each upgrade has at least 15 percent more than what it replaces; the
  market's awnings in the owner's colour (yellow without one); a building is the same over a harvested resource;
  the chest on every land terrain, not under a building or village; triangle ceilings.
- `layout.test.ts`: the camp and the mill keep a grove behind them, and no tree stands in a building.
- `effects.test.ts`: `claimsOf` finds a claim for both sides where it is seen and nowhere it is not, one per tile.

Results (2026-11-25, this branch):

- `npx tsc -b`: clean.
- `npm run lint`: clean.
- `npx vitest run` (under the heavy-tests lock): 1340 passed, 126 skipped (the browser suites without BROWSER=1).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: ok.
- `npm run test:browser` (with the sub-path): AI suite 6 passed; the rest 51 passed, 2 skipped (the online suite,
  which needs the emulator), 1 failed: `resize3d.test.ts` "stay aligned at pixel ratio 2.625" saw one frame with the
  canvases' buffers not yet resized for a 445 px slot. It passed 3 times out of 3 on its own and the whole set passed
  on a second run (52 passed, 2 skipped), so it reads as a timing flake under load; see Concerns.
- `npm run test:emu`: not run; nothing in `src/net`, `src/online` or `database.rules.json` changed.

## Shots (`shots/buildings3d/`)

Taken by `scripts/buildings3d-shots.ts` on the built app with software WebGL (SwiftShader).

- `sheet-buildings.png` and `sheet-buildings-2.png`: every building and the chest, svg beside 3D, on its terrain at
  the closest zoom: farm, granary, orchard, plantation, lumber camp, lumber mill, market (on Spartan land), mine,
  foundry, the chest on a field, in a forest, on a mountain and beside a unit, a farm on harvested cropland and a camp
  in a harvested forest. The crops are in `crops/`.
- `board-before.png` and `board-after.png`: a real board (seed 7, twelve turns) at the phone's default zoom, 412 x
  915, with the first player's land given every field and forest building and two treasures nearby. Before is the
  branch's start (`cities3d`): only cities, villages and mines were 3D, the rest flat svg marks.
- `chest-middle-3d.png`, `chest-middle-svg.png`, `chest-beside-3d.png`, `chest-beside-svg.png`: the chest close up.
- `claim.gif`: a Spartan scout claims a chest it stands beside (the real app, its clock held and stepped 40 ms a
  frame, so the pace is real). The claim closes the unit card, so the board slides up while the lid opens; the
  find's words show above. `claim-closeup.gif` is the chest alone from the tap on, and `claim-closeup-frames.png` its
  frames at 160, 240, 320, 480, 600, 760 and 920 ms. Stills: `claim-<ms>ms.png`, `claim-closeup-<ms>ms.png`.
- The wheel's turn is not filmed (it is a slow turn; the tests check it).

## Concerns

- Not seen on a phone yet. At the phone's default zoom (`board-after.png`) the buildings read, but the chest is a
  little smaller than the svg chest it replaces. Knobs: the chest spots' `s` in `buildingLayout.ts` `chestSpot`, and
  `SIZE` in `buildings.ts` for the buildings.
- The lid is small at the phone's zoom: what reads most is the dark open mouth, the glow and the coins. A larger
  chest (above) would help it.
- The claim closes the unit card, so on the claimer's own screen the board slides back into the taller slot during
  the first 200 ms of the opening (it plays in place on the board, it just moves with it). The AI's and an online
  opponent's claims close no card; the view follows them only by the usual dead-zone rule.
- The opening chest and the wheel are drawn on the units canvas, above the tile svg, as the lanterns and
  waterfalls are: a highlight on that tile sits under them, and a tree of the tile in front cannot hide the wheel.
- A treasure under a building or a village was already hidden in the svg; it stays hidden in 3D.
- The AI's pause after a claim is unchanged (the burst is 450 ms, the gold or find words 1350 ms); the opening takes
  860 ms, so for the other side's claims the next action can start while it is going.
- `resize3d.test.ts` failed once in the full browser run (one frame painted before the canvases' buffers caught up
  with a smaller slot) and passed on every rerun. Nothing in this branch touches the resize path; the one new draw
  (`drawUnits` when a claim starts) only runs on a claim, which that test does not make. Worth watching in CI.
- `THREE.Material: parameter 'side' has value of undefined` is logged by `units3d.ts`'s dimmed figures (from
  before this branch); not touched.
- Merge points with other branches: `Board.tsx` (`TileArt`, `BoardAttacks`, the attacks layout effect, the follow
  loop's condition), `Match.tsx` (the attacks memo) and `effects.ts` (one new function). rules9 (Market growth) only
  changes numbers, not the look.
