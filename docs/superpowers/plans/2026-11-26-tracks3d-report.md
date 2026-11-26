# Busy roads widen: report

Branch `tracks3d`, cut from main at 0.7.1. No push, merge, version bump or deploy.

## What David asked for, and what he kept

David asked for:
- marks where units walk (footprints, hoof prints, wheel ruts) that build up over the match;
- busy roads that widen, with the grass dying either side.

The first build drew both (commits 459e1c1, 9cf8888, 9d820b3). After seeing it, David decided: "Let's leave out all
the ground tracks except for the widened road."

The follow-up commit removes, from both looks:
- the footprints, hoof prints and wheel ruts;
- the trodden path and the beaten band.

It keeps the road widening, the worn earth and the dead-grass band exactly as built. It also:
- cuts the derivation down to what roads need;
- turns the `?tracks=` developer sheet into a road sheet (`?roads=`);
- replaces the shots.

## What it does now

### Where the wear comes from

`src/ui/board/roadWear.ts` works out the wear.
- **Visual only.** There is no engine change and no RULES_VERSION change, and nothing new is sent online. Each phone
  replays the match record it already holds. So every phone agrees, and a reload or a resumed save shows the same
  roads.
- **Route.** A move records only its start and end tile, with no path in between. So the route is the **straight hex
  line** between the two. Every phone rounds a line that runs along a seam the same way.
- **What counts.** Moves, the advance after a kill, and lures. Each counts one pass on every road tile of its route
  that has a road after the action. A city takes no wear.
- **Steps.** 16, 30 and 45 passes give steps 1, 2 and 3 (`ROAD_STEPS`).
  - Below 16 a road is the light road it always was.
  - Step 3 is the cap.
  - A road's look changes only when it crosses one of these steps.
- **Fog (the strict rule, unchanged).**
  - The viewer's own units always count.
  - An enemy move counts only if the viewer could see that unit both before and after the action (the hidden trait
    counts).
  - Even then, it counts only on route tiles the viewer could see both before and after.

  So a move through the fog, a unit walking into or out of it, or a scout leaving its hiding place adds nothing. Wear
  is shown only on explored tiles. Pass-the-phone keeps a separate count for each seat.
- **Keeping up with the match.** `useRoadWear` (in Match.tsx) takes each new action in at once, which costs one engine
  step. A long history (a resumed save, or a rejoined online match) is replayed in 8 ms slices between frames.
  Opening a match never stalls, and busy roads widen once the replay catches up.

### The 3D look

- **What the shader gets.** Each road tile carries its step at the centre and its step at each edge, as one `vec2`
  attribute (`aRoadWear`). The edge step is the busier of the two roads that meet there.
- **Width.** In the ground shader the road is `1 + 0.3 x step` times as wide. Each spoke widens from the tile's own
  step at the centre to the edge step, so two tiles always meet at one width.
- **Look of a busy road.** The earth wears patchy. A ragged band of dead, yellow-brown grass grows wider either side
  with each step. There is no dead grass on mountain scree.
- **Props.** Props keep off the wider road, because `roadDist` reads the width.
- **Light roads.** A light road is drawn exactly as before.
- **What rebuilds.** A neighbour's signature leaves the wear out. So a step rebuilds the road tile itself, plus the
  linked roads whose edge step changed with it.

### The SVG look

- **Busy road.** Each spoke is a tapered band, at the tile's own width at the centre and the shared width at the edge,
  drawn over an olive dead-grass band.
- **Light road.** Its markup is byte for byte the same as before.

### Developer page

`?roads=3d` or `?roads=svg` (`RoadSheet.tsx`) shows:
- two roads rising from light to the busiest, one over fields and one through forest;
- a road worn to step 2 all along, with a light tile at each end.

## Shots (`shots/roads3d/`)

Taken with `npx tsx scripts/roads3d-shots.ts sheet|match` after `vite build`, all at 412 x 915.

- **Road sheet.**
  - `sheet-3d-rising.png` and `sheet-svg-rising.png`: wear rising west to east, over fields and through forest.
  - `sheet-3d-even.png` and `sheet-svg-even.png`: a road at step 2.
  - `sheet-*-phone.png`: the whole sheet.
- **Late game.** Seed 5, AI against AI at normal, 45 rounds (1418 actions), played by the engine in the script as
  simai does. It is saved as a pass-the-phone match, the way heroes.test.ts writes one, and resumed in the app.
  - `late-{3d,svg}-phone.png`: the opening view.
  - `late-*-phone-road.png` and `late-*-close-road.png`: the busiest road in view, which is step 3 here.
- `match-notes.txt` lists which tiles the shots centre on, and how many roads reached each step.

## Performance

The figures are for seed 5 with viewer seat 0, where 13 roads end up worn.

- **Triangles.** No new geometry. The full board has 145,867 triangles against 146,123 without wear, because busy
  roads push a few props off.
- **Memory.** One more `vec2` on the ground, 8 bytes per ground vertex: about 0.35 MB for a full board.
- **Shader.** The road field reads one more digit per spoke. Nothing new runs off the road.
- **Rebuild frequency.**
  - During the AI's turns: 0 rebuilds in 45 turns (669 actions).
  - During the viewer's own turns: 19 rebuilds in 749 actions, at most 4 in one turn.
  - Each rebuild redoes one to three tiles (about 3 to 5 ms each here) and re-merges the ground (about 15 to 20 ms
    here).
- **Replay.** About 1 s here for the whole 1418-action history, run in slices.
- **Bundle.** The size change is in the table below.

| Chunk | Before | After | Change |
| --- | --- | --- | --- |
| index | 551,355 B (170,524 B gzipped) | 556,715 B (172,543 B gzipped) | +5.4 KB (+2.0 KB gzipped) |
| terrain3d | 682,636 B (190,323 B gzipped) | 684,583 B (191,010 B gzipped) | +1.9 KB (+0.7 KB gzipped) |

## Tests

**`src/ui/board/roadWear.test.ts`**
- the straight line;
- passes counted only on road tiles of the route, and none on a city;
- the steps, light roads left out, and only three changes however busy a road gets;
- the fog rule:
  - an enemy in the fog adds nothing, while its owner counts every tile;
  - an enemy seen moving counts only on the tiles the viewer saw;
  - an enemy walking out of sight, or out of the fog, adds nothing;
- a real seeded match:
  - wear only on explored roads;
  - the same result replayed at once or action by action;
  - a changed record restarts the replay;
- sliced replays.

**`src/ui/terrain3d/roadWear.test.tsx`**
- the scene carries each road's step and the busier step at each link;
- the 3D edge order and packing;
- the step changes the tile's own code, not its neighbours' codes;
- a city tile carries no wear;
- `aRoadWear` is on every ground vertex;
- a busy road is wider in 3D and props keep off it, while a light road is unchanged;
- the SVG light road is unchanged, and a busy one widens with dead grass, drawn by the SVG only with 3D off.

**Results**
- `npx tsc -b`: clean.
- `npm run lint`: clean.
- `npx vitest run`: 1418 passed, 138 skipped.
- `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser`: ai 6 passed; the rest 64 passed and 2 skipped.
- `npm run test:online`: 2 passed.

## Concerns

- **Straight-line routes.** A unit that went round a lake or a mountain counts on road tiles the straight line
  crosses. That only matters where a road runs beside such a detour.
- **Wear before the road.** Wear counts only from when a tile has a road, so a road built on an old trail starts
  light.
- **Crowded late game.** In the late AI match the busiest roads run between crowds of figures. The road sheet is the
  clearest view.
- **First open is slower.** A long match replays every action once on the phone, a few seconds before the roads
  widen.
- **Hotseat.** Wear is per viewer, the same as fog. Two people on one phone can see different road widths.
