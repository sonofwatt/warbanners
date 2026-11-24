# units3d review (2026-11-24)

Diff 9f1ca27..HEAD. Read-only review: code read and screenshots viewed; tests not rerun.

Verdict: PASS. No Critical findings. One Important finding, several Minor.

## Checked and found sound

- Fog: the 3D scene is fed only by `glUnitsOf(p.items, p.factions)` (unitsInput.ts:28), and `items` come from `buildScene(view)` where units are `view.units` (playerView). No second source of units reaches WebGL, so hotseat, AI, online, replay and turn report share the SVG's visibility. Falls come from `data-fall` nodes that Effects already renders, so they match the SVG. unitsInput.ts is in the main chunk and imports the engine only through its index; the lazy chunk imports types only. Engine and AI boundaries are not touched.
- Default (3D off): `glWanted` false renders no canvases, `unitsData` is null, `units3d` false, `figure` undefined so the SVG figure draws as before, `drawn` has the same order, and `unitAlpha` gives the same opacity values as the old expression.
- Pointer events: the overlay svg and the units canvas are `pointer-events: none`, and the property is inherited by Effects and unit groups. No child sets it back on. `pick` works on board coordinates.
- Disposal: the lifecycle cleanup removes the listeners before `terrain.dispose()`, so the `forceContextLoss` from the units renderer cannot trigger a fallback. Geometry and materials are disposed; dim materials are cached by 0.05 steps.
- No em or en dashes in the diff.
- Animation loop: it stops when nothing is running, is cancelled on unmount, and has no infinite animation inside the overlay (`ready-glow` is in the tile svg).

## Important

1. src/ui/board/Board.tsx:275-281 and :288-292 (`liveTransform`, `livePose`). `liveTransform` returns (0,0) when the computed transform is `none`, empty or `DOMMatrixReadOnly` is missing. `livePose` then uses `place` (the unit group's own transform, which is an SVG `transform` attribute, not an animated CSS value) as the unit's absolute position, for any unit that has any running animation, including a lunge on `.unit-body` only.
   Failure: in a browser where `getComputedStyle(g).transform` does not reflect the SVG transform attribute (or returns `none`), a lunging unit is drawn at the board origin (0,0) for the whole lunge, and the 3D figure detaches from its plate. Only Chromium is verified. Fix: fall back to the unit's own position (from `data-at` or the item's `at`) instead of 0, or read `g.transform.baseVal` for the unmoved case.

## Minor

1. Board.tsx:653-660. `p.children` (Effects) moves between the tile svg and the overlay when `units3d` flips (3D ready, context loss, restore). React remounts it, so the numbers, bursts and lunge of the current action replay once. Failure: a context restore during a fight replays "-3" and the lunge.
2. lifecycle.ts:47-52. `ready` is called after load even when a canvas is already in `down` (its context was lost while the chunk loaded), so the board can show the 3D layout on a dead context until a restore event arrives. Rare.
3. lifecycle.ts `restored`: the lifecycle listener is added before three creates its own `webglcontextrestored` listener, so `ready` and `write()` draw before three has reinitialised its state. This is inherited from the terrain path and shot 09 shows it working; it now applies to the units context as well.
4. units3d.ts:50 and terrain3d.ts. Two full-viewport antialiased WebGL contexts at up to MAX_DPR. GPU memory and fill cost are unmeasured on the Pixel and iPhone (the report admits this). Consider `antialias: false` on the units canvas if the Pixel struggles.
5. units3d.ts:161-178. A falling figure is rebuilt (new meshes, and up to 20 sets of 4 dim materials created and held until dispose) on each 0.05 alpha step. This is fine for a half-second fall, but the materials accumulate over a long game. The key `${i}@${k}` also shifts if an earlier fall in the list ends first, which causes one extra rebuild.
6. Requirement wording: "hero marks stay SVG". The hero pennant (HeroMark) is now drawn in 3D and left out of the SVG when `figure` is false. This reads as intended (it is part of the approved figure), but confirm with David.
7. Playwright or other tests that click a `[data-unit]` node will fail actionability checks with 3D on, because the node sits in a `pointer-events: none` overlay and the hit target is the board svg. Real taps are fine.
8. Report's known gap, restated: the overlay plates are always above all figures, so a front figure no longer hides a plate behind it (differs from the SVG board).
