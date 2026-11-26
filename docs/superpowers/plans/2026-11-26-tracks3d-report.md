# Tracks on the ground: report

Branch `tracks3d`, cut from main at 0.7.1. Commits: 459e1c1 (code, tests, shot script), 9cf8888 (shots), and this
report. No push, merge, version bump or deploy.

David asked for marks on the ground where units have walked (footprints, hoof prints, wheel ruts) that build up over
the match, fainter than a road, and for busy roads to widen with the grass dying either side.

## What it does

- **Visual only.** No engine change, no RULES_VERSION change, nothing new saved or sent online. Each phone replays
  the match record it already has (`src/ui/board/tracks.ts`). Every phone of a match derives the same tracks, and so
  does a reload or a resumed save.
- **Route.** A move records only its start and end tile, with no path. So the route is the **straight hex line**
  between the two (`hexLine`, with a fixed nudge so every phone rounds a seam the same way). Moves, the advance after
  a kill, and lures all count. When the line crosses a water tile, that tile is skipped.
- **Kinds.** Each unit leaves one kind of mark:
  - foot: every unit not listed below;
  - hoof: mounted units (Horseman, Knight, Horse Archer, Khan's Guard, Sky Caller);
  - wheel: the Catapult and the Camp (siege or camp trait);
  - a scout's pass counts half, so its tracks stay lighter.
- **Wear.** Each tile counts wear for each kind, and the edges units came in by and left by. Wear is cut into a few
  steps:
  - each kind: faint at 0.5 (one pass), worn at 4, trodden at 12 (`KIND_STEPS`);
  - the path under all traffic: flattened at 10, beaten at 24 (`PATH_STEPS`);
  - the road: light (as today) below 16, then wider at 16, 30 and 45 (`ROAD_STEPS`). The last step is the cap.

  A kind's edges are fixed at the moment it crosses a step, from the edges it has used most. So a tile looks
  different only when it crosses a step.
- **Fog (the strict option).** The viewer's own units always leave tracks. An enemy move leaves tracks only when:
  - the viewer could see that unit both before and after the action (the hidden trait counts), and
  - the route tile itself was visible to the viewer both before and after the action.

  So nothing is left by a move through the fog, by a unit walking into or out of the fog, or by a scout leaving
  hiding. Tracks are drawn only on explored tiles: buildScene gives tracks to explored tiles only. Both seats are
  worked out in one replay, so pass-the-phone shows each player their own tracks.
- **When it runs.** `useTracks` (Match.tsx) takes each new action in at once, which is one extra engine step. A long
  history (a resumed save, a rejoined online match) is replayed in 8 ms slices between frames. Opening a match never
  stalls, and the tracks appear when the replay catches up. Measured here: about 1.4 s in all for a 1418-action,
  45-round match. Expect a few seconds on a phone.

### The 3D look

Everything is drawn in the ground shader. There are no new meshes and no new triangles.
- **Data.** The tile's traffic is packed into one `aTrack` vec4 on its ground vertices (`input.ts` GlTracks):
  - the edge masks;
  - the wear steps;
  - the road's wear at the centre, and its wear where it meets each neighbour.
- **Marks.** The marks run from the tile's centre to the middle of each edge used. They bend a little in between,
  but never at the ends, so they meet the next tile's marks. More wear adds lanes and fills in gaps:
  - footprints: small ovals, left and right in turn;
  - hoof prints: rings open at the heel, in pairs;
  - wheel ruts: twin thin furrows, broken here and there;
  - from the path steps on, a pale trodden band. It is always narrower and paler than a road.
- **Where marks are not drawn.**
  - Not on water.
  - Not on a city.
  - On mountains, only at the foot: the marks fade out as the ground rises.
  - Units, buildings, resources and every prop stand on top of them.
- **Busy roads.** The road widens by `ROAD_GROW` (0.3) for each step. At step 3 it is 1.9 times as wide. Each road
  spoke widens from the tile's own wear at the centre to the busier tile's wear at the shared edge, so two tiles meet
  at one width. The earth wears patchy. A ragged band of dead, yellow-brown grass grows either side. A light road
  (step 0) is drawn exactly as before. Props keep off the wider road (`roadDist` reads the width).
- **Rebuilds.** A neighbour's signature leaves out the tile's tracks (`tileCode(t, false)`; the road's edge wear
  lives in each tile's own data). So a step rebuilds that one tile, not its six neighbours. The border mesh also
  ignores tracks.

### The SVG look

The SVG gets a subtle version (`features.tsx`):
- **Marks.**
  - footprints: faint round-dotted lines;
  - hoof prints: wider dots;
  - wheel ruts: thin paired lines;
  - a pale DIRT band for the path.
- **Strength.** The marks are drawn at 22 to 34 percent opacity, so they are always far fainter than a road.
- **Busy roads.** A busy road is drawn as tapered bands, its own width at the centre and the shared width at each
  edge, over an olive dead-grass band. A light road's markup is byte for byte the same as before.

## Developer page

`?tracks=3d` and `?tracks=svg` (`TracksSheet.tsx`, routed in App.tsx, next to `?sheet` and `?board`) show every look
side by side on a field map. The rows are:
- footprints, then hoof prints, then wheel ruts, each at steps 1, 2 and 3;
- the path, flattened then beaten;
- a road rising from light to the busiest.

## Shots (`shots/tracks3d/`)

`npx tsx scripts/tracks3d-shots.ts sheet|match` (after `vite build`). All are taken at 412 x 915.

- **Close-up sheet:**
  - `sheet-3d-kinds.png` and `sheet-svg-kinds.png`: footprints, hoof prints and wheel ruts at each wear step;
  - `sheet-3d-path-and-road.png` and `sheet-svg-path-and-road.png`: the trodden path, and the road from light to
    busy;
  - `sheet-*-phone.png`: the whole sheet.
- **Early game.** Seed 5, AI against AI (normal), played by the engine in the script (`runMatch`, as simai does). It
  is saved as a pass-the-phone match after round 8 (77 actions), the way heroes.test.ts writes a save, then resumed
  in the app. Shots: `early-{3d,svg}-phone.png`, `early-*-phone-tracks.png` and `early-*-close-tracks.png`. The marks
  are faint.
- **Late game.** The same match after 45 rounds (1418 actions). Shots: `late-{3d,svg}-phone.png`, then
  `late-*-phone-road.png` and `late-*-close-road.png` (the busiest road, -4,6, wear 3), then `late-*-close-paths.png`
  (the most worn ground, 1,-1, a beaten path).
- `match-notes.txt` lists which tiles the shots centre on.

## Performance

- **Triangles.** No new geometry. With the late seed 5 map, the ground and props are 145,819 triangles with tracks,
  against 146,123 without: a busy road pushes a few props off it.
- **Memory.** One more vec4 attribute on the ground: 16 bytes per ground vertex, about 0.7 MB for a full board.
- **Shader.** The ground fragment shader does more work only on tiles with tracks: up to 3 kinds x 6 edges x 3
  lanes. Tiles with no tracks skip it on a single test.
- **Bundle.** Measured against a build of the branch's start:
  - index: +8.3 KB (+3.1 KB gzipped);
  - the lazy terrain3d chunk: +6.1 KB (+2.2 KB gzipped).
- **Rebuild frequency.** Seed 5, viewer seat 0, played as AI against AI. Each "rebuild" is one `setMap` that rebuilds
  the changed tile(s) only.
  - During the other side's (AI) turns: 39 rebuilds over 45 turns and 669 actions, at most 6 in one turn, and
    usually 0 to 3. Enemy moves are mostly in the fog and leave nothing.
  - During the viewer's own turns: 234 rebuilds over 749 actions. That is about one move in three, up to 12 in a
    turn, and it falls as tiles reach the cap.
  - Cost on this machine: a tile rebuild takes about 3 to 5 ms, and re-merging the ground about 15 to 20 ms.

## Tests

New:
- `src/ui/board/tracks.test.ts`:
  - the straight line;
  - kinds, and a scout weighing half;
  - per-tile counts, with entry and exit edges;
  - nothing on water;
  - wear steps, and that levels change only at steps;
  - edges fixed between steps;
  - road wear steps;
  - the fog rule: an enemy through the fog leaves nothing; an enemy seen moving leaves tracks only on the seen tiles;
    one walking into or out of the fog leaves nothing; the owner sees all of its own;
  - a real seeded match: tracks only on explored tiles, never on water, the same whether replayed at once or
    action by action, and a replay restarts on a changed record;
  - sliced replays.
- `src/ui/terrain3d/tracks.test.tsx`:
  - the scene carries tracks and the road's edge wear, and none on water;
  - the 3D edge order and packing, and tracks change the tile code;
  - no tracks on a city;
  - the ground's aTrack, zero on water;
  - a busy road is wider in 3D, props keep off it, and a light road is unchanged;
  - the SVG draws faint marks with 3D off and none with 3D on;
  - the SVG light road is unchanged, and a busy road widens with dead grass;
  - a neighbour's code ignores tracks.
- `input.test.tsx`: the SVG layer list gains `tracks`.

Results:
- `npx tsc -b`: clean.
- `npm run lint`: clean.
- `npx vitest run`: 1424 passed, 138 skipped.
- `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser`: ai 6 passed; the rest 64 passed and 2 skipped.
- `npm run test:online`: 2 passed.

## Concerns

- **The route is a guess.** Straight lines are not the real paths. A unit that went round a lake or a mountain shows
  a track cutting across, and a line through a water tile drops that tile. Real paths would need either the
  engine's path in the record (an engine change) or a pathfinder replay on each phone.
- **Early marks are very faint.** Step 1 is subtle by design, and in the early shot the marks are hard to find among
  the figures. Raise them in `shaders.ts` (the darkness `0.42 + 0.16 * level`) and in `features.tsx` (`strength`) if
  David wants them bolder. All the step thresholds are in `tracks.ts`.
- **Late-game crowding.** In the late AI match the busiest roads and paths are mostly under figures, so the road
  close-ups show the widened road and dead grass only between them. The sheet is the clearest view.
- **Long histories.** A first open replays every action on the phone, a few seconds for a long match, before the
  tracks appear. Each later action costs one more engine step (about 0.6 ms here).
- **Online.** Online matches use the same record, so they behave the same. Nothing new is sent, and I did not touch
  `src/net`, `src/online` or the database rules.
- **Hotseat.** With two people on one phone, tracks are per viewer. The second player's tracks therefore differ from
  the first's, as fog does.
- **The developer page.** `?tracks=` is a new developer route, like `?board` and `?sheet`.
