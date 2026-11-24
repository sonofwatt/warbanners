# 3D unit figures in the game: report (2026-11-24)

Branch `units3d`, from main 9f1ca27 (0.5.1). Not pushed or merged.

## What was built

- The approved art sample (`warbanners-workspace/superpowers/scratch/webgl-units`) is ported into
  `src/ui/terrain3d/units/` (`kit.ts`, `parts.ts`, `figures.ts` as approved, plus `units3d.ts`, the renderer). It is
  part of the lazy 3D chunk: nothing from it, and no three.js, loads while the option is off.
- With the 3D option on, every unit is drawn by its 3D figure: all 17 types, the owner's faction colours (from the
  same `playerColour` and `ACCENT` the SVG uses), the hero pennant with the lighter tail, the three-quarter turn.
  The engine's 17 unit types and the 17 figures match exactly (a unit test checks it); no gaps.
- The figures come from the board's own scene items (`src/ui/terrain3d/unitsInput.ts`, `glUnitsOf`), the same list
  the SVG units are drawn from, so the two cannot disagree. The scene is built from the viewer's `playerView`, so a
  unit the viewer cannot see is never in it: fog hides it from WebGL exactly as from the SVG. Hotseat, AI,
  online and the turn report (which pans the same board) all go through `matchData` and this one path.
- Own spent units (0.55) and own hidden units (0.7) are dimmed as the SVG dims them, as one see-through piece
  (a depth-only pass, then one blended colour pass), not part by part.

## Layering (the one structural choice)

Cities, villages, buildings, treasures, borders and marks stay SVG with the 3D terrain on. If the figures were drawn
on the terrain canvas under the SVG, a unit standing in a city would be covered by the city. So with the figures on
the board is a sandwich:

1. terrain canvas (as today),
2. the board svg: tiles, cities, villages, buildings, highlights, borders (taps and gestures stay here),
3. the units canvas (`board-units3d`, a second WebGL context, `pointer-events: none`),
4. an overlay svg (`board-overlay`, `pointer-events: none`) with each unit's group: status plate, pips, taunt,
   blind, fresh and hunker marks, item badge, and the effects (numbers, bursts, falls). The effects stay in this
   svg for as long as the option is on, also while the board falls back to svg figures, so a fallback or a
   restored context never remounts them and never replays an action's effects. Only turning the option itself on
   or off moves them.

Units therefore sit on top of all terrain and every SVG tile mark (David's rule), and sort among themselves by depth.
The unit groups in the overlay keep their `data-unit`, `data-at` and `.unit-body`, so the slide and the lunge play on
them exactly as before; tap targets are unchanged (`pick` works on board coordinates). With the option off none of
this exists: the board renders the single svg as on main (the browser test checks the svg figure nodes are the same
count before and after a round trip).

## Animations

- Slide (move, lure, advance), lunge: the 3D figure follows the svg frame by frame. While anything in the overlay
  animates, a loop reads each moving unit's live transform (`getComputedStyle`, plus the lunge on `.unit-body`) and
  draws only the units canvas; it stops when nothing animates (`src/ui/board/livePose.ts`). A transform that cannot
  be read (`none`, empty, no `DOMMatrixReadOnly`) falls back to the unit's own tile (`data-at`), never the board
  origin. So both always agree, reduced motion included.
- Death: the svg fall stays in the overlay (hidden by CSS) and drives a 3D copy of the fallen figure that turns
  clockwise on screen and fades with the svg animation's own angle and opacity (shot 07). Each fall has its own
  material set whose opacity changes in place; it is freed when the fall ends.
- Capture, build, level and treasure bursts and the floating numbers are SVG on top, as before. There is no spawn
  animation in the SVG today, so none in 3D.
- Units stand on the tile plane (height 0), not on the terrain's bumps (at most about 4 board units), so their
  status plates stay where the SVG puts them and slides are straight. They are always drawn on top, so nothing
  sinks into a hill.

## Rebuilds, sharing, disposal, context loss

- `setUnits` runs only when the units' signature changes (id, type, colours, hero, tile, dim). A unit that moves keeps
  its meshes. Geometry is built once per look (type, colours, hero) and shared; at most 68 looks. Materials are shared
  (one fill, one hull, one shadow, plus one set per dim level).
- Everything is disposed when the board unmounts or the option goes off; the units renderer is disposed with the
  terrain renderer.
- Either context lost: the board falls back to SVG (svg figures and their status back on the board svg, shot 08) until every lost context
  is restored (shot 09). Only the menu toggle writes the stored option. If the units canvas cannot get a context the
  terrain still draws and the svg figures stay.

## Wear (my call)

Wear and blood are in, unused at runtime: the game always passes `CLEAN`, so every wear branch is skipped. It is woven
through the shared parts (shields, blades, helmets, horses), so taking it out would fork the approved art from the
Gritty branch. Its cost is only in the lazy chunk: about 9.3 kB minified, 3.4 kB gzip (measured by building the
figures with every wear test forced false). Nothing of it is in the main chunk.

## Sizes (`vite build`)

| Chunk | Before (main 9f1ca27) | After |
| --- | --- | --- |
| index (main) | 503.61 kB, 158.09 kB gzip | 507.63 kB, 159.31 kB gzip (+4.0 kB, +1.2 kB gzip) |
| terrain3d (lazy) | 511.32 kB, 133.22 kB gzip | 584.07 kB, 157.25 kB gzip (+72.8 kB, +24.0 kB gzip) |

The unit mapping lives in its own module (`unitsInput.ts`) so the lazy chunk imports only its types; with it in
`input.ts` the bundler split the engine into a shared chunk.

## Frame cost (headless Chromium, SwiftShader, 412 x 915 at 2x)

Each animation frame was timed with both contexts forced to finish (CPU emulation, a ceiling, not a phone):

- a full frame while zooming (terrain and 17 figures): median 433 ms, max 519 ms,
- a frame while units animate (units canvas only): median 41 ms.

So moving units do not redraw the terrain, and the figures are about a tenth of a full frame. Figure triangle counts
are as in the sample notes (500 to 1600 each, plus hull). Needs measuring on the Pixel.

## Checks

- Review fixes (2026-11-24): the transform fallback above (`livePose.test.ts`), one material set per fall
  (`units3d.test.ts`), and effects kept in the overlay so they do not replay.
- Unit tests: `unitsInput.test.ts` (scene units only, positions, owner colours both sides, fog hides an enemy
  until it stands next to us, hero, dimming, signature), `units/units3d.test.ts` (all engine unit types have a
  figure, deterministic builds, shared looks, removal, poses and falls, disposal), `lifecycle.test.ts` (two
  canvases, either context lost, back when both restored). Existing terrain3d tests unchanged and green.
- Browser: `src/browser/terrain3d.test.ts` now also checks the units canvas and overlay appear, every unit keeps its
  svg status in the overlay, the svg figure art is left out, and all comes back as before when the option goes off.

## Screenshots (`2026-11-24-units3d-shots/`)

A saved hotseat match (seed 7) with nine Spartan and eight Mongol units around the Spartan capital, a hero on each
side (King's Guard in the capital, Khan's Guard), one more Mongol in the fog (not drawn, as it must not be).

01 portrait, 02 landscape, 03 zoomed in, 04 the hero selected with its moves, 05 the hero mid-slide (spent, so
dimmed), 06 a hoplite's lunge with the counter number, 07 the Mongol unit falling and fading (animations slowed 20
times to catch it), 08 a lost units context: svg figures back, 09 restored, 10 the option off: the board as on main.

## Known gaps

- The fallen figure turns on screen but keeps upright lighting while it fades (about half a second, hard to see).
- Figures stand on the tile plane, not on the bumps of hills and mountains (by choice, see above).
- The overlay plates are no longer covered by a figure standing in front of them (they always read; on the svg board
  a front figure can hide a plate behind it).
- Two WebGL contexts instead of one; fine in Chromium, still to check on the Pixel and an iPhone.
- No figure for a unit type added later: `ALL_TYPES` is checked against the engine's list in a test, so it would fail.
