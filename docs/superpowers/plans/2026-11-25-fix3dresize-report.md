# fix3dresize: the 3D board squashed or stretched off the svg after the slot resized

Branch `fix3dresize`, cut from 0.6.2 (fa4a75d). Hotfix for David's report: with the 3D look on, selecting a unit,
city or tile "skews and shifts the layers" (the white selection ring a tile away from the city it marks, blurry
ground, ghosted figures). Pictures: `shots/fix3dresize/david-*.png`.

## Cause

The canvases resize their drawing buffers only when they draw (`terrain3d.ts draw` and `units3d.ts draw` call
`renderer.setSize(vp.w, vp.h, false)`), and CSS gives both `width: 100%; height: 100%`, so a canvas that keeps its old
buffer is stretched or squashed to its new box. When the slot changed size, `Board.tsx`'s resize observer updated the
viewport and moved the camera to keep the corner, but drew nothing itself: it left the drawing to the eased pan
(`panTo`). `panTo` returns without drawing when the target camera equals the current one, which is the usual case
when the selection is already in the middle of the slot (`keepSelection(keepCorner(...))` gives back exactly the
corner-kept camera), and also when a finger is down. The svg transform is unchanged by a corner-keeping resize, so the
svg stayed right; the terrain canvas kept its old buffer, stretched to the new slot, until the camera next moved. The
ambient loop meanwhile redrew (and so resized) the units canvas alone, so the figures and the ground disagreed too.

Evidence (Chromium, 412x915, ratio 2.6, seed 7, every WebGL draw recorded with the svg camera and buffer size):
after the capital's unit card (slot 469.7 px) a tap on a middle tile opened the tile card (slot 445 px) with no pan;
the terrain canvas stayed at 824x939 (drawn for 469.7) in a 412x445 box while the units canvas was 824x890. Opening a
card from nothing at ratio 1 left the terrain at 412x811 in a 412x629.6 box. The new test fails on 0.6.2 with
`board-terrain: buffer 824x1622 for 412x629.609375`.

Not the cause: the camera transforms (the svg, the overlay svg and the canvases always got the same camera when they
drew), the pixel ratio cap (MAX_DPR 2, applied the same to both canvases), the `covered` pause.

## Fix

`Board.tsx` measure: every size change now calls `write()` at once, in the resize observer callback, which runs after
layout and before paint. That sets both svg cameras and draws the terrain and the figures at the new size in the same
frame the new layout is painted; the eased pan then carries on from there. One draw per resize, no loop, no new
context. The first measure also draws at once rather than a frame later. A `matchMedia` resolution listener redraws on
the next frame when the pixel ratio changes with no size change (browser zoom, another screen), which the resize
observer cannot see.

## Test

`src/browser/resize3d.test.ts` (gated on `BROWSER=1`), at ratio 2.625 and 1: 3D on, then a middle tile (tile card, no
pan), the capital's unit card, its city card, the tile again, closed, then a rotation to landscape and back and a
browser bar (915 to 860 px tall) and back. After each step, and in every painted frame in between (sampled right after
paint), each canvas buffer must equal its CSS size times min(ratio, 2) within a pixel and must have been drawn with the
camera the svg shows; at rest the selected tile's svg centre must land within 1.5 px of where the terrain canvas draws
that board point. The frame sampler pauses only for the viewport change itself, which the browser applies between
frames. The harness gained a `scale` option for the pixel ratio.

## Results

- `npx tsc -b`, `npm run lint`: clean.
- `npx vitest run`: 125 files passed, 24 skipped; 1299 tests passed.
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: built.
- `npm run test:browser` (with `GITHUB_PAGES_BASE=/warbanners/`): ai 6 passed; the rest 18 files passed, 1 skipped, 52 tests passed.
- The new test: 6 runs in a row green on the fix; fails on 0.6.2.

## Pictures (`shots/fix3dresize/`)

- `before-tile-2.625.png`, `before-tile-1.png`: 0.6.2, tile card opened, the terrain squashed to the shorter slot.
- `after-*-2.625.png` (tile, unit, city, closed, landscape, bar) and `after-1-tile-1.png`: with the fix.

Not changed: own figures are drawn see-through on purpose (`unitAlpha`: 0.55 once spent, 0.7 while Hidden). David's
shots say "No units to act", so his semi-transparent spearmen are spent units dimmed by design; the stretch of the
terrain under them is what made them look doubled and off their tiles. Whether spent figures should be less faint in
3D is a separate design call.
