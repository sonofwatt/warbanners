# Time of day light: report (branch `advanced`, 2026-11-26)

Four asks on top of the Advanced menu: night mist and smoke, dawn and dusk that change over the match, figures lit
by the light with cast shadows, and checks. A look only throughout: no engine or rules change, no `RULES_VERSION`
change, nothing new in `MatchSettings`. Not pushed, merged or deployed.

## What changed

- **Mist and smoke at night** (`falls.ts`, `smoke.ts`, `sky.ts air`). Both were graded by `uTint` but never lit, so
  they stayed pale. They are now multiplied by `uAir`, a soft mix of the key and shade colours relative to the day's
  (exactly 1,1,1 by day in clear weather, so the day look is unchanged). At night that is about 0.63/0.72/0.96, so
  mist reads as dim blue haze. Smoke is also darkened by how dark the air is (about 0.78 at night): dark smoke.
- **Dawn and dusk over the match** (`daylight.ts`, new and pure; `sky.ts timeLight`, `svgGrade(look, round)`).
  `daylight(time, round)` is 0 (night) to 1 (day): dawn `(round - 1) / 29`, dusk the reverse, clamped, so dawn round
  1 is the night exactly and round 30 on is the day exactly (and dusk the other way). Colours (light, shade, ground
  and figure grades, glow, windows, sea, shadow strength) go night, then the warm dawn or dusk table at halfway, then
  day. The light's direction follows the sun: the moon hands over to a sun just over the horizon at 0.15 (about round
  5 at dawn, round 26 at dusk), which then climbs to the day's place (dawn) or the reverse (dusk), interpolated by
  bearing and height so a setting sun only sinks. The SVG grade blends the same way (overlay colours weighted by
  opacity). `Match.tsx` passes `roundOf(state)` to the Board (and the sea colour); the Board clamps it to 1..30 and only
  uses it at dawn and dusk, so day and night never re-render per round.
- **Figures lit and casting shadows** (`units/units3d.ts`). The figures were already toon-lit by `uLightDir` with
  world normals, so they now follow the moving sun. Each frame the units canvas first draws every standing figure's
  opaque fill meshes (body and every piece, not hulls, blobs or effects; a layer picks them) with one override
  material that projects each vertex onto the ground plane (world y 0.15) along the light, in flat black at the
  light's `cast` strength, blended by MAX so overlapping parts and neighbours never darken twice, fading by 35 percent
  toward the tip. Then the normal pass draws the figures over it. Because it is the real geometry in the vertex shader,
  walks, turns, crouches and strikes cast the right shape with no extra code. Reach per unit of height is
  `0.55 * slope`, capped at 1.3 (about a tile at the lowest sun); strength 0.42 by day, 0.42 dawn, 0.40 dusk, 0.20 at
  night, times `max(0.15, 1 - 1.3 * grey)` under cloud, rain or snow. The contact blob now sits away from the light
  (by day where it always sat, 1.2 right and 0.6 back), is MAX-blended with the cast shadow, and fades a little with
  the light. Falling figures keep only their fading blob.
- **Banners**: they live on the `board-overlay` svg above the units canvas, untouched by the 3D light; the shots at
  night and dawn show them at full colour.

## Files

- New: `src/ui/terrain3d/daylight.ts`, `src/ui/terrain3d/daylight.test.ts`, `scripts/light3d-shots.ts`,
  `scripts/light3d-bench.ts`, `scripts/light3d/bench.html`, `scripts/light3d/bench.ts`.
- Changed: `src/ui/terrain3d/sky.ts` (+test), `terrain3d.ts` (`setLook(look, round)`, `uAir`, `uCast`), `falls.ts`,
  `smoke.ts`, `units/units3d.ts` (+test), `src/ui/board/Board.tsx` (`round` prop), `src/ui/screens/Match.tsx`,
  `src/browser/advanced.test.ts`.

## Tests

- `daylight.test.ts`: dawn round 1 equals night, 15 between (warm, sun on the east, lower than the day's), 30 and 40
  equal day; dusk the reverse with its sun in the west; day and night identical at rounds 1, 15, 30, 40 in every
  weather (3D and SVG); round by round dawn never darkens and dusk never brightens, steps under 0.06; the dawn sun only
  climbs after it rises, the dusk sun only sinks until it sets; the SVG grade at both ends and between; the cast
  shadow points away from the light, long and capped at a low sun, short at a high one.
- `sky.test.ts`: day clear still exactly the old light, now also `air` = 1,1,1 and `cast` 0.42; the figures' grade
  stays readable at rounds 1 to 30; night air dimmer and bluer; shadows faint at night and under cloud and rain.
- `units3d.test.ts`: each frame draws the cast pass first then the figures; only fills (never hulls) cast; the blob
  sits right of the figure by day and left under a western sun; no cast pass when the strength is 0.
- `src/browser/advanced.test.ts`: a new Dawn match opens with the night's sea and grade; a new Dusk match with the
  day's sea and no grade.

Results: `npx tsc -b` clean; `npm run lint` clean; `npx vitest run` 1434 passed, 142 skipped;
`GITHUB_PAGES_BASE=/warbanners/ npm run test:browser` all passed (AI file 6, the rest 68 passed, 2 skipped).

## Frame time

`npx tsx scripts/light3d-bench.ts 3`: the units canvas alone, 412x915 css at DPR 2, idle life on, each frame posed,
drawn and waited for (one pixel read), 120 frames, Chromium with SwiftShader (software WebGL, CPU) on ClaudeComputer.
Average of three runs.

| Figures | Before (ms, avg / p95) | After (ms, avg / p95) | Draw calls | Triangles |
|---|---|---|---|---|
| 12 | 30.4 / 36.0 | 38.3 / 43.4 | 130 to 189 | 24,666 to 37,902 |
| 24 | 52.6 / 59.8 | 69.6 / 81.1 | 260 to 378 | 49,332 to 75,804 |

About +26 to +32 percent on software rendering, where every triangle is CPU work. The cast pass adds one draw call
per fill mesh (about 5 per figure) and the fill's triangles once more, with a one-line fragment shader and no depth
test. On a phone GPU the extra cost is mostly the draw calls. Unchanged: the ambient loop (20 fps, rests after 20 s,
pauses when covered or hidden, still under reduced motion) and the terrain canvas (no shadow work there).

## Shots (`docs/superpowers/plans/shots/advanced/light/`, 412x915 at DPR 2.6, software WebGL)

- Dawn: `3d-dawn-round1.png` (night), `3d-dawn-round15.png`, `3d-dawn-round30.png` (day).
- Dusk: `3d-dusk-round1.png` (day), `3d-dusk-round15.png`, `3d-dusk-round30.png` (night).
- Figures and shadows (a mounted knight, a hunkered hoplite, an archer, a Mongol horse archer and swordsman):
  `3d-day-units.png`, `3d-night-units.png`, `3d-dawn-round8-units.png` (long shadows to the right, low sun in the
  east), `3d-dusk-round22-units.png` (low sun in the west), each with a `-close.png` crop.
- Smoke: `3d-day-smoke.png`, `3d-night-smoke.png` (the foundry's and camp's smoke).
- SVG: `svg-dawn-round15.png`.
- Script: `scripts/light3d-shots.ts` (`rounds`, `units`, `smoke`, `svg`, or `all`).

## Unsure, and choices for David

- **Which way is east.** The day's light comes from the upper left, and the old dawn came from the left and dusk from
  the right, so I kept that: the east is screen left, the west screen right. A dawn's sun therefore just climbs on
  the left; a dusk's sun swings across the front of the board (toward the viewer) as it sinks to the right, so its
  shadows turn from right-and-back to left during the match. If east should be screen right, it is two vectors in
  `sky.ts SUN_LOW_DIR`.
- **Moon to sun.** At dawn, rounds 1 to about 5 swing the light from the high moon to the low sun while it is still
  dark (shadows faint); at dusk the same happens in rounds 26 to 30. The shadows turn quickly then, but faintly.
- **Shadow length is stylised**: 0.55 of a true shadow's length, because the figures are tall for their tiles (about
  42 world units on a tile 52 across); a true day shadow would reach the next tile. At a high sun the shadow falls
  mostly behind the figure, so by day it is subtle; it reads best at dawn and dusk.
- **Shadows lie on a flat plane** at the figures' feet, on the units canvas, so they lie over the tile svg's marks and
  over trees or buildings on a neighbouring tile rather than wrapping onto them (faint, and capped at about a tile).
  The contact blob always did this.
- **The figures' light changes their faces** at dawn and dusk (lit from the side), as asked; their own lighter grade
  keeps them above 0.8 luma at every round.
- **Online and replays** read the round from the state, so both phones agree; an older build would show the old
  fixed dawn or dusk look (a look only, no desync).
