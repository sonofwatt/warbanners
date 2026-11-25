# 3D cities, villages, mine and borders: report (2026-11-25)

Branch `cities3d`, cut from main at 0.6.3. Not pushed, merged or released; no version bump. Everything here is behind
the "3D terrain" option; with it off the svg board is exactly as before.

David asked for cities that match the other 3D art, a 3D mine with a tunnel and a flickering lantern, and (added
mid-way, with his phone shot `shots/cities3d/david-border-over-mountain.png`) territory borders that pass behind a
mountain instead of over it, showing through at 25 percent.

## What was built

### Cities (`townLayout.ts` places, `town.ts` shapes)

- A city keeps an open square in the middle (where a unit stands) and grows round it: the hall at the back, houses at
  the sides and front.
  - Houses: 2 at level 1, one more a level, up to 7 at level 6.
  - From level 3 one house a level stands two storeys tall.
  - Towers: one from level 4, a second from level 6.
- Spartans: whitewashed gabled houses with red roofs, a columned hall with a gold disc in the pediment, stone towers
  with red conical roofs. Walls are a crenellated stone ring with round corner towers.
- Mongols: round felt tents with blue domes and gold crowns, a great tent with a gold band as the hall, timber
  watchtowers. Walls are a pointed palisade.
- The capital is clearly grander:
  - Spartans: a six-column temple on three steps, with gilded ornaments.
  - Mongols: a two-tier great tent with a gold finial.
  - It flies the tall swallowtailed banner, as the svg capital does.
  - Other cities fly a small pennant on the hall.
- Roof colours keep the faction roles: Spartan red, Mongol blue. Accents use the faction gold.
- Walls are drawn when the city has them. The ring sits inside the tile, with the gate on the front right side; at
  levels 4 and 6 the towers stand on the wall line at the back corners.
- Villages: two thatched mud huts and a woodpile, neutral. In a forest the grove behind them makes room for the huts.

What the svg city shows, and where it went:

| svg city shows | 3D look |
| --- | --- |
| buildings by level (`level + 1`, capped at 6) | 3D houses, taller houses and towers by level |
| faction style and roof colour | 3D |
| capital banner | 3D banner |
| walls (palisade) | 3D walls (stone for Spartans, palisade for Mongols) |
| reward waiting (star) | stays in the svg (`PendingStar`), drawn over everything as before |

- The svg city does not draw the market (`City.market`), so nothing is lost there. The 3D city does not draw it
  either; rules9 raises the market's growth, not its look.
- With 3D on, the svg draws a city tile's star only. With 3D off, nothing changes.
- `input.test.tsx` checks this both ways, and checks that the 3D map carries faction, level, capital and walls.
  `svgLayers` gained `town`, `village`, `building` and `border` flags.

### The mine and the foundry

- The mine is built into the mountain's front face:
  - A rock cliff with the mouth cut in it, extruded back into the mountain, so the mouth's sides line the tunnel.
  - A dark rim gives the cliff its toon outline, and rock lumps sit above and beside it.
  - A timber frame (posts, lintel, brace) stands at the mouth, with two smaller frames inside, receding into the dark.
  - The tunnel floor is dark earth with a back wall.
  - Rails on sleepers run out of the tunnel to an ore cart (ore lumps and a crystal), with a spoil heap by the door.
  - A lantern (iron frame, warm glass) hangs on a hook on the first inner frame, placed so the camera sees it through
    the mouth.
- The mountain's main peak moves back and gets a little smaller on a mine tile, clear of the tunnel (tested). The
  yard is flattened, so the floor and rails sit on the ground.
- The foundry gets its own 3D version, and the svg foundry mark is not drawn in 3D. It keeps the mine (tunnel,
  lantern, rails, cart) and adds a stone furnace against the rock: a glowing mouth, a chimney and three smoke puffs.
  The spoil heap goes.

### The lantern flicker (`lanterns.ts`, `townLayout.ts` `lanternFlicker`)

- The lantern's light is drawn on the units canvas, which alone redraws in the ambient loop, as the waterfalls do. It
  has three parts:
  - a camera-facing warm halo with a bright core round the lantern;
  - a soft pool of light on the tunnel floor, running out past the mouth;
  - for a foundry, a hotter orange glow at the furnace mouth.
- It is one mesh for the whole map, rebuilt only when the set of mines changes. The flicker is two uniforms (two
  voices, so most neighbouring mines do not flicker together). Each frame costs one draw call and no geometry upload.
- `lanternFlicker(t, level, voice)` is pure:
  - A slow breath and three quicker wavers, between 0.43 and 2.93 Hz, clamped to plus or minus 22 percent.
  - Frame to frame it never jumps more than 0.12 at the loop's 20 fps (tested over two minutes).
  - Every frequency is a whole number of cycles per 1000 s, so the clock can wrap.
- It runs inside the existing ambient loop: no new loop, 20 fps, and it rests after 20 s quiet.
  - `Terrain3d.tick` sets it.
  - `animating()` counts a lantern in view, so the loop runs while one is on screen and rests as before.
  - At level 0 (reduced motion, or the board at rest) it is the steady glow exactly. The loop's own easing to rest
    calms the flicker down smoothly.
  - Pauses when covered or hidden are the loop's, unchanged.
- Veiled tiles dim the glow, as they dim the falls.
- With no units canvas (no WebGL 2 there), the light goes into the terrain scene and stays steady.

### Borders behind what stands in front (`borders.ts`)

- In the 3D look the territory borders are drawn in the terrain scene, not the svg. They use exactly the svg
  `Border`'s lines: `borderLines` was pulled out of `Border` in `art/tiles.tsx`, and `glMapOf` passes the lines
  through.
- Each line is a flat strip built in board space, so on screen it has the svg stroke's 2.4 unit width and round caps
  (tested). It is lifted onto the ground's height under it, and floats 0.35 above it.
- It is drawn twice, after the ground and the props, without writing depth:
  - `LessEqual` at full strength where nothing stands in front;
  - `GreaterDepth` at 25 percent where a mountain, a city, a tree or the mine stands in front.
- One mesh for the whole map, rebuilt only when the borders, or the tiles under and around them, change (tested). No
  per-frame work.
- The svg does not also draw them with 3D on (tested). The selected city's land glow on branch steadycam was not
  touched.

## Files

- New:
  - `src/ui/terrain3d/townLayout.ts`, `town.ts`, `lanterns.ts`, `borders.ts`;
  - `codes.ts` (`THICK_3D`, `tileCode`, `bordersKey`), so the lazy chunk does not import `input.ts`, which now
    reaches the svg art;
  - `geom.ts` (`coloured`, `at`, `repaint`, moved out of `build.ts`).
- Changed:
  - `input.ts`: `GlTown`, `GlBorder`, `GL_BUILDING`, the new svg layers, and `glMapOf(items, radius, factions)`;
  - `layout.ts`: Setup `town` and `works`, the mine's peak and flat yard, room for the huts;
  - `build.ts` and `terrain3d.ts`: wiring.
- Outside `terrain3d`, kept small:
  - `Board.tsx`: about ten lines. It passes `factions` to `glMapOf` and honours the four new layer flags. A city tile
    with 3D on draws only `PendingStar`.
  - `art/features.tsx`: `PendingStar` split out of `CityMark`, the same drawing.
  - `art/tiles.tsx`: `borderLines` and `BORDER_WIDTH` split out of `Border`, the same drawing.
- `scripts/cities3d-shots.ts` takes every shot below.

## Cost

Triangles in the prop mesh per tile:

| tile | triangles |
| --- | --- |
| Spartan city level 1 / 3 / 5 | 372 / 520 / 926 |
| Mongol city level 1 / 3 / 5 | 568 / 944 / 1520 |
| capital level 6 with walls, Spartan / Mongol | 2728 / 3172 |
| walls alone, Spartan / Mongol | 1116 / 1128 |
| village | 172 |
| bare mountain / ore mountain / mine / foundry | 416 / 1304 / 1184 / 1184 |
| a whole hex of border | 168 |
| a lantern's light | 4 (foundry 6) |

- A mine costs less than the ore mountain it replaces.
- A typical mid-match board (two or three cities of level 2 to 4, a few villages) adds about 3000 to 5000 triangles
  to the merged prop mesh, plus a few hundred for borders.
- Draw calls added: the border mesh's two passes, and one call for the lantern lights when there are mines.
- Built once per map change; nothing is rebuilt per frame.

Bundle (`vite build`, gzip -9, main at 0.6.3 vs this branch):

| chunk | main | cities3d |
| --- | --- | --- |
| index (main) | 533.8 kB, 165.0 kB gzip | 535.1 kB, 165.4 kB gzip (+1.3 kB, +0.4 kB gzip) |
| terrain3d (lazy) | 610.9 kB, 164.5 kB gzip | 632.0 kB, 172.2 kB gzip (+21.1 kB, +7.8 kB gzip) |

- No new chunk. A first cut imported `art/tiles` into the lazy chunk, which made Rollup split the engine into its own
  shared chunk. `codes.ts` and passing the lines through `glMapOf` avoid that.

## Tests

- `townLayout.test.ts` (new):
  - city layout per level: houses, taller houses and towers, growing every level to 6;
  - capital versus city: hall kind, size, banner or pennant;
  - every building on the tile, off the square, apart from the others and inside the walls;
  - walls only with walls, a ring with a front gate;
  - villages;
  - tileSetup carries the plan and shadows, and the grove makes room;
  - the mine's peak stands behind the tunnel;
  - lantern spots for mines and foundries only, with two voices;
  - the flicker is bounded, never strobes, steady at level 0, scales with the level, voices differ, and the clock
    wraps seamlessly.
- `borders.test.ts` (new):
  - strips match the svg lines and width;
  - strips lie just above the ground on fields, forests and mountains;
  - two depth passes at 1 and 0.25, after the ground and props, never writing depth;
  - rebuilt only on change.
- `input.test.tsx`:
  - drawn once: cities, villages, mines and foundries leave the svg with 3D on, the star stays, other buildings and
    treasures stay;
  - borders move to 3D with the owner's colour and the exact svg lines;
  - city level, walls, owner and capital change the map signature, growth does not.
- `build.test.ts`: cities grow in triangles by level, walls and the capital add, roofs in the owner's colour, villages
  and mines have props, triangle ceilings.

Results:

- `npx tsc -b`: clean.
- `npm run lint`: clean.
- `npx vitest run`: 1318 passed, 126 skipped (the browser suites without BROWSER=1).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: ok.
- `npm run test:browser` (with the sub-path): AI suite 6 passed; the rest 52 passed and 2 skipped (the online suite, which needs the emulator).

## Shots (`shots/cities3d/`)

- `sheet-cities-3d.png`: Spartan and Mongol cities at levels 1 to 5 and the level 3 capital, with and without walls,
  plus level 6 for each and a village on field and in forest. `sheet-cities-svg.png` is the same board in the svg
  look. Crops at the closest zoom.
- `board-before.png` and `board-after.png`: a real board (seed 7, twelve turns) at the phone's default zoom, 412 x
  915. Before is main's build.
- `mine-svg.png`, `mine-3d.png`, `foundry-svg.png`, `foundry-3d.png`: close-ups at the closest zoom.
  `mine-foundry-3d-enlarged.png` is the two 3D ones enlarged.
- `lantern-flicker.gif`: 40 frames of the mine with motion on. `lantern-flicker-frames.png` is four of them side by
  side. The flicker is slight on purpose. The frames were taken as fast as SwiftShader allowed, so the GIF's pace is
  only roughly real time.
- `border-over-mountain-before.png` and `border-over-mountain-after.png`: a capital whose land borders mountains, 412
  x 915. Before is main's build. `border-over-mountain-closeup.png` puts them side by side: after, the line behind
  the peak shows faintly instead of running across its face.

## Concerns

- The lantern light is on the units canvas, above the tile svg. A selection or move highlight on a mine tile sits
  under the glow rather than over it. It is small and soft, so this hardly shows; the waterfalls already work this
  way.
- At the phone's default zoom the mine reads as a rock face with a timber door, a light and a cart, smaller and less
  stark than the svg's big black opening. The lantern carries it. If David wants it bolder, the knobs are `MINE` in
  `townLayout.ts` and the glow sizes in `lanterns.ts`.
- On a mine tile the main peak is smaller and further back than on a plain mountain, so the tunnel can run into it.
- Borders: the hidden pass also catches parts of a border behind the board's own rolling hills, where the ground in
  front is higher than the line. It is rare and faint.
- Rules 9 (market growth) and steadycam (camera, panels, city land glow) were not touched. The merge points are
  `Board.tsx` (TileArt, CityArt, the border line, `glMapOf`) and `input.ts`.
- Two flicker voices, by tile parity: on a hex grid some neighbours share a voice.
