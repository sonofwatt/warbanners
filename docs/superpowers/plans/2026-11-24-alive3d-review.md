# Review of branch alive3d (main 7c77316..HEAD df39fee), 2026-11-24

Read-only review of the diff, the report and the code paths named in the brief. Tests were not rerun. Screenshots were
not re-inspected; the points about the rendering are from the code.

## Verdict: PASS (no Critical findings; two Important, several Minor)

Checked and found sound:

- 3D off: `Board.tsx` only adds `ambient.current?.kick()` (a no-op on null) and imports `ambient.ts` and the three-free
  `lungePhase`. `ambient.ts` has no three.js import and nothing at import (`domAmbientEnv()` touches the page only when
  called, inside `ready`). `falls.ts`, `idle.ts`, `figures.ts` are reached only through the lazy `terrain3d` chunk or
  tests. `src/engine` and the AI are untouched by the diff.
- Dashes: zero U+2014 or U+2013 in the whole diff (text files checked by script).
- Loop lifetime: rAF is cancelled and both listeners removed in `stop()`; the Board effect cleanup calls it and nulls
  the ref. `step` re-checks `stopped`, hidden and reduced motion before drawing. Loss of context: `fallback` sets
  `terrain.current = null`, so the next ambient frame returns false and the loop ends; `ready` on restore calls
  `write()`, which kicks it again. No restart after unmount (`kick` is gated by `stopped`).
- Reduced motion: idle weight 0, falls time 0, no ambient rAF, live change handled (`still()` draws once, `kick` on
  leaving). The arm swing is driven by the svg lunge, which `Effects` does not play under reduced motion.
- Fog: `glMapOf` keeps never-explored tiles out of `map.tiles`, so `waterfallEdges` returns nothing for them. A veiled
  (remembered) water tile does show its fall, dimmed by the same 0.3 veil as its ground; nothing about unexplored ground
  is revealed.
- Disposal: sheet and mist geometry disposed on every rebuild and in `dispose()`, both materials disposed; the pieces'
  fill and hull geometry are disposed with the look cache; pieces share the figure's materials, or the dim set's, which
  `disposeDim` already frees.
- The idle only turns the body group and the arm pivot group; the tile-placing group is never touched, and the amplitudes
  are tiny (about 0.7 world units at most), so a figure stays on its tile and plate.

## Important

### I1. The units canvas is redrawn at up to 30 fps for the whole match, and nothing lowers it further

`src/ui/terrain3d/ambient.ts:41-54` with `src/ui/terrain3d/terrain3d.ts:192-197` and `src/ui/board/Board.tsx:451-465`.

`animating()` is true whenever any non-camp figure is within the camera box (`units3d.ts` `onScreen`, with a 40 by 60
unit margin), so on any real board the loop never stops. The sway is about 1.3 degrees at a 3.6 s period, yet each frame
is a full units-canvas render at 2x (59 calls). The report's own numbers: idle whole process tree 48 percent of a core
before, 522 percent after (SwiftShader, so a ceiling), and "not measured on a phone". Scenario: a long hotseat or online
match left open on a phone with the board visible (or under a bottom sheet or menu that covers it, which the loop does not
detect) runs the GPU, compositor and radio-quiet CPU continuously: heat and battery drain for sway nobody is looking at.
The loop has no step-down: it does not drop the rate when the player has been idle for a while, when the board is
obscured, or when the frame time is high.

Suggested fix: default `AMBIENT_FPS` to 20 (the report already says it reads fine), and do not redraw when no pose
changed visibly (for the sway alone, quantise time to the frame step); better, measure on the Pixel before merging and
treat the figure as a gate. Optionally stop after N seconds without input, resuming on any kick.

### I2. `write()` (every camera frame) already redraws the units canvas, then the ambient loop redraws it again

`src/ui/board/Board.tsx:325-329` (`terrain.draw` calls `units.draw`, then `ambient.kick()`), and
`src/ui/terrain3d/terrain3d.ts:180-184`.

During a pan or pinch, each `write()` draws terrain plus units, then kicks the ambient loop, which schedules its own
rAF and draws the units canvas again (tick plus `drawUnits`) in the next frame, once a 29 ms gap has passed, so roughly
every second gesture frame pays for a second units render at the same camera. If the ambient step runs before that
frame's `write()` in the callback order, it draws at the stale camera and the same frame draws again. Scenario: a
two-finger zoom on a phone: the units pass costs about 1.5 times what the report's "full frame while zooming" figure
assumes. Not a correctness break, a phone-cost leak, and it is exactly the double-drawing the brief asked about.

Suggested fix: have `write()` draw the terrain only and let the ambient frame draw units, or mark the loop's `last` and
skip its next frame when `write()` just drew units.

## Minor

### M1. Second draw at the end of a follow loop

`src/ui/board/Board.tsx:549-552` with `:455-457`. When the last follow step finds nothing running it has already drawn
and then calls `kick()`; the ambient step can run in the same display frame (unitsFrame is 0 by then) and draw once more.
One extra units render per move or lunge; harmless.

### M2. Idle motion snaps off at the start of a move or lunge (only the return is eased)

`src/ui/terrain3d/units/units3d.ts:244-247` (`w = motion && !p.moving ? settleWeight(...) : 0`). Weight drops from 1 to
0 in a single frame the moment `pose()` marks the unit moving. A trebuchet that was mid-hold at 4 degrees of aim yaw
and 3 degrees of arm play snaps to the base pose as its lunge begins; a horseman's 0.35 unit shift jumps. Small, but
visible as a one-frame twitch right at the start of the action. Fix: ease the weight down over about 100 ms using
`restSince` in both directions.

### M3. Flow clock wraps every hour

`src/ui/terrain3d/terrain3d.ts:188` (`(nowMs / 1000) % 3600`). The streak scroll (`uFlow * 16`) and the mist's
`fract(uFlow * 0.09 * ...)` do not repeat at 3600, so the water and every puff jump once an hour in a long session.
Use a wrap that is a common period of the shader (or no wrap: float precision is fine for days at highp).

### M4. Mist bleeds past the fall onto neighbouring rim tiles, including a fogged neighbour

`src/ui/terrain3d/fallsLayout.ts:68-70` (flare 8 plus 14) and `falls.ts` `mistGeometry` (puffs spread to 1.2 times the
edge, radius up to 18). The mist is drawn on the units canvas, above the tile svg, so a puff near a corner can lay a
translucent white patch over the bottom of a fog tile next to the water tile. It reveals no terrain, but it is animated
detail on a tile that should be blank. The report's known gap about the camera slot's edge is related. Check shot 02 for
it; clamp the outer puffs or the box if it shows.

### M5. `mq.addEventListener` guard silently drops the preference change on old Safari

`src/ui/terrain3d/ambient.ts:93-96`. Safari before 14 only has `addListener`; the guard returns a no-op, so a live
change of the setting is ignored (the setting is still honoured at load through `matches`). Negligible today.

### M6. Falls never animate without the units canvas

`src/ui/terrain3d/terrain3d.ts:192` (`animating` returns false when `units === null`). Documented in the file's comment;
the falls then stand still on the terrain canvas. Fine as a fallback, noted for completeness.

## Not found

No rAF or timer leak, no restart after unmount or after a lost context, no frame drawn when nothing visible animates
(the loop ends on its first frame with no animated figure or fall in view and wakes on any kick), no change to the
default board with 3D off.
