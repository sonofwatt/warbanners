# 3D figures face their moves and attacks: report

Branch `facing3d`, cut from main at 0.5.3. David's request: "For the 3d units. They should spawn 3/4 view, and return
to that when hunkered, but when moving or attacking they should face the correct direction of the action."

## What each action does

- **Appears** (trained, spawned, loaded from a save, first seen, back out of the fog): the rest facing, the
  three-quarter view every figure is built in (unchanged from 0.5.3).
- **Moves** (a slide, and also a lure or an advance, which move a unit the same way): turns to face the way it went,
  over 160 ms, during the 180 ms slide. The board slides a unit in one straight line from its old tile to its new
  one, so a multi-step path gives one facing, along that line. It keeps the facing after it stops, and when it is
  rebuilt dimmed because it is now spent.
- **Attacks**: turns to face its target over 120 ms, timed to be round when its lunge starts (an attack later in a
  chain waits for its own lunge), and keeps that facing. The unit attacked is not turned.
- **Hunkers**: turns back to the rest facing over 160 ms.
- Nothing else changes a facing: selection, spent, a new turn, being attacked. A reload, or leaving the scene (fog)
  and coming back, starts at rest again.
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
- `units3d.ts` keeps a facing per unit id (it survives a rebuild for a new look or dim), detects a move as a unit on
  a new point in `setUnits`, a hunker as `hunkered` going from false to true, and takes attacks through a new
  `aim(id, x, y, now, lungeAt)`. `turning(now)` says whether frames must go on being drawn. Drawing turns the body
  group about the feet: body = tilt (in the screen plane, as before) x yaw (facing plus the trebuchet's idle aim).
- `GlUnit` gains `hunkered` (and its key, so a hunker reaches `setUnits`; the figure is not rebuilt for it).
- `Board.tsx` gains an optional `attacks` prop (`{ seq, list: { unit, toward, delay }[] }`); `Match.tsx` passes the
  lunges of the action being shown. Board calls `aim` once per seq, after `setUnits`. Board's follow loop (the one
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
- `facing-clip.gif` (real pace, 25 fps) and its stills `clip-0280ms.png` to `clip-4280ms.png`: a hoplite walks E,
  SE, NE, NW (its back to us), attacks the archer to its W (turns to a profile, lunges), then hunkers back to rest;
  the trebuchet turns up the screen and throws; the knight rides down toward the viewer.

Not shot in the game itself: the sheet uses the same `units3d`, shaders and light as the board, but the in-game
board (status plates, real terrain) was not captured for this change.

## Tests

- `units/facing.test.ts`: headings (down, up, sideways, none); every type's move and aim fronts land along each of
  the six hex directions on screen; the six steps at 30, 90, 150 degrees; rest is no turn; fronts of the archer,
  horse archer, knight; wrap; eased turn with no snap within 120 to 200 ms; short way round both ways; a new turn
  starts where the last one got to; a delayed turn; instant with no time.
- `units/units3d.test.ts` (new `facing` block): rest when first seen and held; a move turns, eased, and the facing
  survives a dimmed rebuild; down faces the viewer, up away, sideways a profile, for a footman, a rider, the
  trebuchet and a hero; the drawn front points along the move on screen; an attack waits for its lunge then faces
  the target, the target stays; the archer aims side on; hunker returns to rest, staying hunkered or being spent does
  not turn; leaving and coming back is rest; reduced motion turns at once; the trebuchet swings and idles in a new
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
