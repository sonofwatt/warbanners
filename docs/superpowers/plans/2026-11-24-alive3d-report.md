# A livelier 3D look: report (2026-11-24)

Branch `alive3d`, from main 7c77316 (0.5.2). Not pushed or merged. Everything here is behind the "3D terrain" match
menu option, which stays off by default; with it off nothing changes and three.js is still not fetched (the browser
test that checks this is unchanged and green).

## What was built

### 1. Waterfalls at the board's rim

- `src/ui/terrain3d/fallsLayout.ts` (pure, tested) finds them: a water tile's front edge (edge 1 or 2, the only two
  the camera can see) whose neighbour is off the board. Any neighbour on the board, fogged or not, WebGL or svg,
  stands in front of the wall and covers it, so only the rim falls. All tiles stand at height 0 and water at -2.2,
  so no inland water column is ever exposed today; the rule is written for the rim and says why. Cities are skipped.
- `src/ui/terrain3d/falls.ts` draws them: one sheet mesh and one mist mesh for the whole map, rebuilt only when the
  set of falls changes.
  - The sheet curls over the lip with a white foam edge, runs down the water column, leans out as it falls and
    tapers, then breaks into foam and fades into the abyss below the wall's foot. Toon look: the same pale-to-deep
    blue bands as the water column, with streaks in two hard steps that scroll down (a uniform, no geometry upload).
  - Mist: seven soft round puffs per fall where the water thins out, each a camera-facing quad that swells, rises and
    fades over its own life (all in the vertex shader). A firm core and one soft band, so it reads as toon mist.
  - Veiled water dims its fall as the terrain's veil does.
- Shots 01, 02, 02b, and `waterfall.gif`.

### 2. Idle life

- `src/ui/terrain3d/units/idle.ts` (pure, tested): each unit's phase and pace come from a hash of its id, so
  neighbours never move together.
  - Foot units sway (about 1.3 degrees) and breathe (about 1 percent), a 3.6 second cycle at 0.85 to 1.15 times.
  - Mounted units (horseman, knight, horse archer, Khan's Guard, Sky Caller) shift their weight side to side
    (0.35 world units), rock a little and bob.
  - The camp stands still.
  - The trebuchet adjusts its aim now and then (David's addition): every 7 seconds or so (its own pace) it eases over
    1.8 seconds to a new small turn of the frame (up to 4 degrees) and a little play in the arm (up to 3 degrees),
    then holds still until the next one.
- Only the figure's body group turns, about the feet; the group that places it on its tile never moves, so a figure
  never leaves its tile or its svg status plate (a unit test checks this over 8 seconds of frames).
- A unit that slides, lunges or falls has no idle motion while it does (the fall is its own figure, never idle), and
  eases back into it over 0.45 s after, so nothing pops.
- Shots 03 and 04 (1.6 s apart; the differences are small on purpose), and `idle.gif`.

### 3. The trebuchet arm

- The figure kit has moving pieces now (`Kit.pivot`): parts added inside go to their own fill and hull geometry
  with a pivot and an axis. The trebuchet's arm (with its counterweight and cup) and its stone are two pieces on the
  axle at the top of the A-frame.
- At rest it sits cocked: the long end with the stone down toward the back, the counterweight raised.
- In the lunge (the svg's own lunge, read from the overlay as the slide already is, now with how far into it the
  unit is: `livePose.ts` `lungePhase`) it whips up and over (to 0.28 of the lunge), shudders at the top, the stone
  leaves the cup, and the arm is winched back to cocked by the end. `armSwing` and `stoneLoaded` are pure and tested.
- The snapped arm of Gritty mode's broken stage stays fixed (it cannot throw); not used on main.
- Shots 05 to 07 in the game (the attacker is spent the moment it attacks, so the game dims it to 0.55 as before:
  the swing is there but see-through), and 08, a full-opacity pose sheet of the same figure at lunge phases 0,
  0.14, 0.28, 0.55, 0.8 and 1, drawn with the game's own renderer. 09 is the idle aim at four moments.

## The loop and its cost

- `src/ui/terrain3d/ambient.ts` (no three.js, nothing at import, tested with a fake page): one loop per board while
  the 3D terrain is on.
  - It redraws the units canvas only. The waterfalls are drawn on that canvas too (they sit on the board's rim,
    where nothing on the tile svg overlaps them), so the terrain canvas still redraws only when the camera or the
    map changes.
  - It runs only while something that animates is in view (a figure other than a camp, or a waterfall's box), and
    stops when nothing is; any camera move, unit change or end of a slide kicks it again.
  - At most 30 frames a second (rAF with a frame gap).
  - Never in a hidden tab (cancelled on visibilitychange, resumed when shown), never with prefers-reduced-motion
    (no sway, the water holds still, the mist holds one static shape; it reacts to the setting changing live), and
    stopped and released with the option or the board.
  - The slide and lunge loop draws those frames itself, with idle life for the units that are not moving.
- Disposal: the falls' geometry and materials and the pieces' geometry are freed with the renderer.

### Frame cost and idle CPU (headless Chromium, SwiftShader, 412 x 915 at 2x)

Each animation frame timed with every context forced to finish; idle CPU over 6 s on a page without the timing
wrapper. SwiftShader rasterises on the CPU, so these are a ceiling, not a phone.

| | Before (main 7c77316) | After |
| --- | --- | --- |
| full frame while zooming (terrain and units) | median 437 ms, max 516 | median 416 ms, max 421 |
| units canvas frame (figures, plus the falls after) | about 41 ms (units3d report) | median 39 ms, 59 draw calls |
| frames drawn while idle | 0 | 21 a second (SwiftShader cannot reach 30) |
| idle, main thread | 0.2 percent | 2.5 percent (script 1.4) |
| idle, whole Chromium process tree | 48 percent of a core | 522 percent of a core |
| hidden tab, whole tree | 3.5 percent | 3.5 percent (0 frames drawn in 3 s) |
| reduced motion, idle, whole tree | | 50 percent (0 frames drawn) |

So the per-frame cost did not grow (the falls add two draw calls), and the terrain is never redrawn for the
animation. What did grow is that the units canvas is now redrawn about 30 times a second while anything animates in
view. On SwiftShader that is several cores; on a phone GPU a 60 call, 2x units canvas frame should be a few
milliseconds. The baseline's 48 percent idle with no frames drawn is the browser's own compositor and was there
before. Still to measure on the Pixel: battery and frame time. If it is too much, the knobs are `AMBIENT_FPS` (one
constant; 20 would still read as smooth for this slow sway) and the draw rect.

## Sizes (`vite build`)

| Chunk | Before (main 7c77316) | After |
| --- | --- | --- |
| index (main) | 507.59 kB, 159.30 kB gzip | 509.58 kB, 159.90 kB gzip (+2.0 kB, +0.6 kB gzip) |
| terrain3d (lazy) | 584.07 kB, 157.25 kB gzip | 594.18 kB, 161.10 kB gzip (+10.1 kB, +3.9 kB gzip) |

The main chunk grows only by the loop (`ambient.ts`), the lunge phase in `livePose.ts` and the wiring in `Board.tsx`.

## Checks

- Unit tests: `ambient.test.ts` (about 30 frames a second while something animates, stops when nothing does, a
  hidden tab pauses it and showing resumes it, a hidden start never starts, reduced motion draws nothing and poses
  still once, stop ends it and its listeners), `fallsLayout.test.ts` (rim edges, no falls inland, on land, on the
  back rim, on a city, behind a fogged neighbour; spots and their screen boxes), `units/idle.test.ts` (phases and
  paces spread, kinds, small bounded motion, zero at weight 0, the aim's moves and holds and continuity, the arm
  pose by lunge phase, the stone, easing back in), `units/units3d.test.ts` (the arm and stone are pieces on one
  axle, idle turns the body but never moves a figure off its tile, reduced motion holds it at rest, moving units
  hold still then ease back, the arm swings and resets with the lunge, on-screen test), `livePose.test.ts` (lunge
  phase).
- Full unit suite: 1118 passed, 124 skipped (the browser suites without BROWSER=1).
- `npm run test:browser` with `GITHUB_PAGES_BASE=/warbanners/`: green (AI suite 6 passed; the rest 50 passed, 2 skipped: the online suite, which needs the emulator).

## Screenshots and clips (`2026-11-24-alive3d-shots/`)

The saved hotseat match from the units3d report (seed 7, both factions round the Spartan capital), regenerated on
this branch. Seed 7 has one water tile on the front rim (-5,6), next to the capital.

- 01 the board, portrait and landscape; 02 the waterfall, portrait and landscape, 02b the same 0.7 s later.
- 03, 04 two frames of idle sway, 1.6 s apart.
- 05 trebuchet cocked; 06 (1 to 3) mid-swing in a real attack, animations slowed 20 times; 07 reset.
- 08 the arm by lunge phase at full opacity; 09 the idle aim at four moments.
- `waterfall.gif` and `idle.gif`: real pace (captured with the page clock slowed 3 times and played back 3 times
  faster).

## Known gaps

- The camera's bounds were not widened for the falls: zoomed out in landscape the bottom of the mist can sit at the
  slot's edge (shot 02 landscape).
- The spent dim makes the trebuchet's real swing see-through (as every spent figure is).
- Not measured on a phone yet.
