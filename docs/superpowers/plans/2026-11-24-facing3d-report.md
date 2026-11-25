# 3D figures face their moves and attacks: report

Branch `facing3d`, cut from main at 0.5.3. David's request: "For the 3d units. They should spawn 3/4 view, and return
to that when hunkered, but when moving or attacking they should face the correct direction of the action."

## What each action does

- **Appears** (trained, spawned, loaded from a save, first seen, back out of the fog): the rest facing, the
  three-quarter view every figure is built in (unchanged from 0.5.3).
- **Moves** (a slide, and also a lure or an advance, which move a unit the same way): turns to face the way it went,
  over 160 ms, during the 180 ms slide. The board slides a unit in one straight line from its old tile to its new
  one, so a multi-step path gives one facing, along that line. Facing the last step instead is not possible on the
  UI side: the move action is only a destination, the `moved` event carries only `from` and `to`, and the engine
  exposes `reachable` but no path, so the route the unit took is not known. It keeps the facing after it stops, and when it is
  rebuilt dimmed because it is now spent.
- **Attacks**: turns to face its target over 120 ms, timed to be round when its lunge starts, and keeps that facing.
  The unit attacked is not turned. A chain of attacks in one action faces each target in order: the turns are
  queued, each starting when the one before is round (lunges 120 ms apart, so each later target is faced up to
  120 ms after its lunge starts). The aim is taken from the tile the unit lunged from, so an attack followed by an
  advance aims right (in this game an advance goes into the target's tile, so the slide and the lunge face the same
  way anyway). A move or a hunker drops any aims still waiting.
- **Hunkers**: turns back to the rest facing over 160 ms.
- Nothing else changes a facing: selection, spent, a new turn, being attacked.
- **Out of sight and back**: a unit that leaves the scene (fog) is remembered by id with its last facing and is shown
  that way when seen again, even if it moved meanwhile (where it went is not known, so it is not turned for that: the
  simpler choice). Units that die are forgotten (the action's falls carry their ids), and the memory goes with the
  board (a reload, or the option toggled, starts every unit at rest).
- **Falls**: a unit that dies falls the way it was facing (the fall figure picks up its last facing by look and tile).
- **Reduced motion**: every turn is made at once.
- Applies to every unit type, both factions, heroes and champions, and to the AI's and an online opponent's actions:
  moves are read from the scene the board already gets (a unit on a new point), attacks from the same effects list
  that plays the lunges (`effectsFor`, which already applies the viewer's secrecy rules). Nothing new is sent
  online and nothing in `src/engine` or `src/ai` changed.

## Design

- `src/ui/terrain3d/units/facing.ts` (pure, no three.js, no clock): headings, each figure's fronts, and eased turns.
  - "Correct on screen": a board vector (dx, dy) maps to the world heading `atan2(dx, dy / SQUASH)`, because board y
    is the ground depth squashed by the camera tilt. A front with that heading projects on screen exactly along
    (dx, dy): straight down the screen faces the viewer, up faces away, sideways is a profile. In world space the six
    hex steps are 60 degrees apart, at 30, 90 and 150 degrees either side of facing the viewer (tested).
  - Each figure has a `move` front (what leads: the body, the horse's head, the trebuchet's throwing side, the
    camp's pole) and an `aim` front (what points at a target). They are the same except for the archer (walks body
    first, shoots side on along its arrow), the horse archer (rides head first, shoots back over the rump), and the
    horseman and knight (aim along spear or lance, in the rider's turn). The trebuchet throws toward its -x side (its
    pennant is at the back), so that side leads and aims.
  - A facing is a yaw from the rest pose (0 at rest). A turn eases (smoothstep) from wherever the figure is to the
    new yaw the short way round; a turn can wait to start (the attack timing).
- `facing.ts` also holds the queue: a facing is the turn under way plus turns waiting their time (`queueTurn`,
  `settle`, `turnNow`).
- `units3d.ts` keeps a facing per unit id (it survives a rebuild for a new look or dim), detects a move as a unit on
  a new point in `setUnits`, a hunker as `hunkered` going from false to true, and takes attacks through a new
  `aim(id, x, y, now, lungeAt, from)`; `forget(ids)` drops the remembered facing of units that died. `turning(now)` says whether frames must go on being drawn. Drawing turns the body
  group about the feet: body = tilt (in the screen plane, as before) x yaw (facing plus the trebuchet's idle aim).
- `GlUnit` gains `hunkered` (and its key, so a hunker reaches `setUnits`; the figure is not rebuilt for it).
- `Board.tsx` gains an optional `attacks` prop (`{ seq, list: { unit, from, toward, delay }[], fallen }`);
  `Match.tsx` passes the lunges and the falls of the action being shown. The lunge and fall effects gained `from`
  and `unit` (UI types only; the svg effects use neither). Board calls `aim` once per seq, after `setUnits`. Board's follow loop (the one
  that tracks slides and lunges) also runs while a figure is turning, so a hunker's turn, which has no svg animation,
  is drawn smoothly; it stops when the turn ends.

### Rotate at draw time, not a geometry cache per facing

I rotated at draw time. The screen-space decals (eyes, hair tufts, cheek guards, the knight's visor, the piper's
lips) are placed toward the camera only in the rest build, which is the figure's face; turned with the head they
stay on the face, so a figure facing away shows the back of its head and helmet and no eyes, and a profile shows one
eye. No mirroring anywhere. Shots look right for every type, so no per-facing geometry was needed: memory and build
time are unchanged (still one geometry per look).

Two things had to follow the turn:

- **Light**: the unit shader lit figures with object-space normals, so a turned figure would have carried its lit
  side round with it. Unit materials now define `WORLD_NORMAL`, and `propVert` takes normals through the model
  matrix for them (terrain props unchanged). The light stays from the upper left whatever the facing. At rest this is
  the same as before except for the idle sway's few hundredths of a radian, and a fall now keeps world light as it
  tips (it used to tip its light with it, a known gap in the units3d report).
- **Shadow**: moved from the body to the figure's group: it turns its ellipse with the figure (a horse seen head-on
  has a long, narrow shadow) but keeps the light's offset to the lower right, and no longer bobs with idle life
  (under a tenth of a unit; not visible).

The trebuchet's arm and stone are children of the body, so its swing and idle aim play in its new facing (tested
and in the clip: it throws up the screen with its back to the viewer).

### The light on falls, the trebuchet arm and idle tilt

`normals-object.png` (object normals, as before) and `normals-world.png` (world normals, as now) show a hoplite and a
knight mid-fall, the trebuchet mid-swing, and the trebuchet turned away mid-swing. A difference image of the two
shows changes only along a few band edges: the toon light has three bands, so a tip of up to a radian moves a band
edge here and there and nothing else. The idle tilt is a few hundredths of a radian, below what the bands show. Kept.

## Battery and performance

- The ambient loop is unchanged (20 fps cap, rest after 20 s quiet, paused when covered or hidden, no double draws).
- A turn is drawn by Board's existing follow loop (display rate, the same loop that draws slides and lunges) for at
  most its 120 to 160 ms, or until the lunge it waits for has played; then that loop stops as before. A move's turn
  falls inside its slide, so it adds no frames at all.
- Per frame: one `yawAt` (a few flops) and one shadow placement per figure, inside the loop that already poses each
  body. No new geometry, materials or draw calls. Memory: one small record per unit, and a few entries for units
  that have just left (dropped after 3 s).

## Screenshots (`docs/superpowers/plans/shots/facing3d/`)

Made by `scripts/facing3d-shots.ts`, which serves `scripts/facing3d/sheet.html` with Vite's dev server and draws the
figures straight from `units3d` in Chromium (software WebGL). Each figure is set one hex step behind its cell and
then on it, exactly as a move reaches `units3d`; the arrow shows the step.

- `facing-footman.png` (hoplite), `facing-warrior.png`, `facing-archer.png`, `facing-mounted.png` (knight),
  `facing-horseArcher.png`, `facing-trebuchet.png`, `facing-hero.png` (King's Guard with pennant),
  `facing-champion.png` (Khan's Guard): rest, then moves E, SE, SW, W, NW, NE.
- `facing-all-types.png`: all 17 types, rest plus the six moves.
- `normals-object.png`, `normals-world.png`: the light before and after (see above).
- `facing-clip.gif` (real pace, 25 fps) and its stills `clip-0280ms.png` to `clip-4280ms.png`: a hoplite walks E,
  SE, NE, NW (its back to us), attacks the archer to its W (turns to a profile, lunges), then hunkers back to rest;
  the trebuchet turns up the screen and throws; the knight rides down toward the viewer.

Not shot in the game itself: the sheet uses the same `units3d`, shaders and light as the board, but the in-game
board (status plates, real terrain) was not captured for this change.

## Tests

- `units/facing.test.ts`: headings (down, up, sideways, none); every type's move and aim fronts land along each of
  the six hex directions on screen; the six steps at 30, 90, 150 degrees; rest is no turn; fronts of the archer,
  horse archer, knight; wrap; eased turn with no snap within 120 to 200 ms; short way round both ways; a new turn
  starts where the last one got to; a delayed turn; instant with no time; queued turns run in order (and the short way),
  a later aim waits for a turn under way, a turn now drops what waits, reduced motion still waits for each moment;
  a held facing.
- `units/units3d.test.ts` (new `facing` block): rest when first seen and held; a move turns, eased, and the facing
  survives a dimmed rebuild; down faces the viewer, up away, sideways a profile, for a footman, a rider, the
  trebuchet and a hero; the drawn front points along the move on screen; an attack waits for its lunge then faces
  the target, the target stays; the archer aims side on; hunker returns to rest, staying hunkered or being spent does
  not turn; out of sight and back keeps the facing, a forgotten (dead) id and a fresh board start at rest; a chain
  of three aims sent together faces each target in order and keeps the last; an attack then advance aims from where
  it lunged; a move drops waiting aims; reduced motion turns at once; the trebuchet swings and idles in a new
  facing; the shadow turns with the figure; a fall keeps the facing.

Results (2026-11-24, on this branch):

- `npx tsc -b`: clean. `npm run lint`: no warnings.
- `npx vitest run`: 1145 passed, 124 skipped (the browser suites without BROWSER=1). In the first full run, four
  engine, AI and app tests that this change does not touch timed out while the box was under load (load average
  near 10); run again on their own they all passed (69 of 69).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`, then `npm run test:browser` with the same base: AI suite 6
  passed; the rest 50 passed, 2 skipped (the online suite, which needs the emulator).

## Unsure

- The archer and horse archer aim side on and backwards (their bows point that way in the art), so attacking a unit
  straight below, the archer shows its side, not its face. That reads as an archer shooting; if David would rather
  every attacker face its target body first, it is one line per type in `facing.ts`.
- In a pure profile the King's Guard's and the piper's capes are flat slabs and show edge on (thin); seen from the
  back they cover the body well.
- A lured unit (pulled by an enemy) faces the way it was pulled, as any move does.
- The heading uses the board's own tilt (SQUASH): if the camera ever gets a different tilt from the board's, this is
  the one constant to follow.

## Review fixes (second round)

- Chained aims queue instead of overwriting each other (above).
- Facing kept through fog, forgotten on death (above).
- Multi-hex moves: left as one straight-line facing; the path is not available on the UI side (above).
- World normals: checked with stills, kept (above).
- Results after the fixes: `npx tsc -b` clean; `npm run lint` no warnings; `npx vitest run src/ui/terrain3d/units
  src/ui/board src/ui/screens` 186 passed (all of `src/ui`: 355 passed); `GITHUB_PAGES_BASE=/warbanners/ npx vite
  build` then `npm run test:browser` under flock: AI suite 6 passed, the rest 50 passed and 2 skipped (online).
