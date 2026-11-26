# Hunkered units crouch: report

Branch `hunker3d`, cut from main at 0.6.2. Not pushed, merged or deployed; no version bump. David's request: "When
hunkered, units should squat down. The hoplite, for example, should put their shields closer to the center of their
body and crouch down so that they're sort of hiding behind it."

Nothing in `src/engine`, `src/ai` or the sounds changed. The crouch follows the `hunkered` flag the scene already
carries (`GlUnit.hunkered` in 3D, `unit.hunkered` in the svg look).

## 3D: the guard pose

`src/ui/terrain3d/units/crouch.ts` (pure, tested) gives every type a guard at full crouch and eases between standing
and crouched:

- **Easing**: 230 ms smoothstep in when the unit hunkers, out when it stops being hunkered (moved, acted, attacked out
  of it: whatever clears the flag). A change part way eases back from where it got to. A unit first seen already
  hunkered (a reload, out of the fog) is crouched at once. Reduced motion: at once both ways. A spent (dimmed)
  rebuild keeps the crouch (it lives with the unit's facing record, by id).
- **Foot units** (all with a shield or without): the body sinks 8 world units (about a quarter of the height to the
  eyes) and leans forward 0.1 rad; the boots stay on the ground (shifted 2.2 forward so the toes show under the hem)
  and the shins tip forward 1.3 rad about the ankles, so the knees come out in front of the tunic.
- **Shield bearers** (hoplite, spearman, warrior, King's Guard, defender, and heroes of those types): the shield comes
  to the centre front and up, tipped a little more upright, so the helmet just shows over the rim (hoplite: the eyes
  go behind the rim, the helmet and crest show). The spear slides up through the hand by as much as the body sinks,
  so its butt stays on the ground, and leans out past the shield's edge (0.2 rad). The defender's tower shield is set
  down on the ground before him, his helmet over it. The warrior's sword is turned in a little.
- **No shield**: the swordsman's arms come in and his blades cross before him; the archer's bow (bow, string, both
  arms, arrow: one piece) comes down and in, held low and close; the sellsword holds his long blade upright before
  him; the piper just crouches; the scout (already crouched) goes 2.6 lower and draws his dagger in.
- **Riders** (horseman, knight, horse archer, Khan's Guard, Sky Caller): the rider (with his lance, spear, bow or
  staff) hunches 0.42 rad over the horse's neck; the horse lowers its head and neck 0.55 rad about the withers and
  settles 1.8 units on its legs (legs stay planted, so they read gathered under it). The Khan's standard stays upright
  (it is planted behind the saddle).
- **Trebuchet and camp**: a settle of 5 and 4 percent; the trebuchet's arm turns 0.45 rad further down (locked).
  Note: the rules say siege engines cannot hunker, so in play only the camp could ever show this (if it can hunker at
  all); it is there so nothing silly happens if that changes.
- **Idle life** goes on while crouched at 45 percent of its size.
- **Strikes and blocks** play on top of the guard: the block's turn and push are added to the crouched shield, and it
  settles back into the guard when the block ends (tested). A unit that attacks loses its hunker in the rules, so its
  strike plays while it stands up.

How it is built:

- `kit.ts`: a piece made inside another piece is now carried by it (`parent`), and each piece records the axes of the
  frame it was built in (`basis`), so a guard is written in the figure's own build frame. A piece that only carries
  others is still made.
- `parts.ts` / `figures.ts`: new pieces `legs` and `feet` (every standing body, the King's Guard's own legs, the
  scout's), `neck` (horse neck, head and mane, plus the knight's and Khan's Guard's neck cloth) and the horse's
  `legs`, `rider` (the whole rider block, carrying the weapon and arrow pieces), `bow` (the archer), `armR` and `armL`
  (the swordsman's arms, carrying his blades). The standing look is unchanged (the pieces sit at rest).
- `units3d.ts`: the piece groups are nested by `parent` and named; each piece's guard is turned into figure space
  once when the group is built; `tick` lowers and leans the body, squashes siege, damps idle life and poses every
  piece from its guard (strike or block added). `turning()` stays true while a crouch eases, so the board's existing
  follow loop draws it and then stops.

Battery: no new loop. The ease is drawn by the board's follow loop for its 230 ms (the same loop that draws a hunker's
turn back to rest), then everything is as before: the ambient loop's 20 fps cap, rest after 20 s, pause when hidden.
Per figure per frame a few more quaternion and vector ops (one per piece). No new materials; the new pieces add two
draw calls each (hull and fill) per figure: a hoplite goes from 6 meshes to 10, a knight from 4 to 10. Triangle
counts are unchanged.

## SVG look

The svg figures are drawn as one flat list of shapes per unit (`Ink`), with each shield painted in among the arms and
body; moving the shield in front would mean splitting every shield figure into layers, a large rework. So the svg
look gets the simple crouch only: the figure (and a hero's pennant) sinks and squats about its feet, `scale(1.06,
0.8)` from the feet line, eased by a 230 ms CSS transition (none with reduced motion), in a new `unit-crouch` group in
`Board.tsx`. The status plate and today's steel hunker mark stay where they were, so the mark still says "hunkered".
The shield is not moved to the front in the svg look.

## Shots (`docs/superpowers/plans/shots/hunker3d/`)

Made by `scripts/hunker3d-shots.ts` (the figures drawn by `units3d` in Chromium, software WebGL, through
`scripts/hunker3d/sheet.ts`) and `scripts/hunker3d-svg.ts` (the svg figure, crouch group and status plate as
`Board.tsx` draws them, with the crouch rules read from `theme.css`).

- `all-types-board.png`: all 17 types, standing (left) and hunkered (right), at the board's opening zoom on a phone
  (64 css px a tile at device pixel ratio 2.6, about 3.2 px a board unit).
- `all-types-close.png`: the same at 6 px a board unit.
- `heroes-close.png`: King's Guard, Khan's Guard, a hoplite and an archer as heroes (with the pennant).
- `clip-hoplite.gif` and `clip-hoplite-*.png`: a hoplite hunkers at 400 ms and stands up at 1600 ms, real pace, 25 fps.
- `clip-line.gif`, `clip-line-*.png`: hoplite, archer, knight, swordsman and trebuchet doing the same at board scale.
- `clip-block.gif`, `clip-block-*.png`: a hunkered hoplite takes a sword blow (lunge at 500 ms): the shield block plays
  from the crouch and settles back; it stands at 1600 ms.
- `svg-before-board.png`, `svg-after-board.png`, `svg-before-close.png`, `svg-after-close.png`: the svg look today
  (the mark only) and with the crouch.

## Tests

- `units/crouch.test.ts` (new): standing or crouched at once when first seen; the ease is 200 to 250 ms, monotone,
  no frame jump, and out the same way; a change part way eases back from where it got to; no time (reduced motion)
  is instant; every type has a guard with smaller idle life; feet and legs are lifted exactly as far as the body
  sinks; foot units sink about a quarter of their height and bend their knees; shields go to the middle and up;
  planted spears; crossed blades, a low bow; riders hunch, horses lower their heads, siege only settles.
- `units/units3d.test.ts`: new pieces and their carriers (the knight's lance in the rider, the swordsman's blades in
  his arms, the archer's arm and arrow in the bow); a hoplite hunkers eased with no snap, its feet stay put and its
  shield rises, `turning()` while it eases, it stands up eased and is back exactly as it was; already hunkered when
  first seen is crouched at once and a dimmed rebuild keeps it; reduced motion is instant both ways; idle life goes
  on smaller while crouched; a block plays from the crouch and returns to it, still crouched; a rider hunches, the
  horse's neck lowers, the lance is not turned on its own, the trebuchet's arm lowers and it settles. Existing motion
  tests now find pieces by name rather than by position.
- `board/Board.test.tsx`: a hunkered unit's svg figure is in the crouch group, the hunker mark outside it; a plain
  unit stands.

Results (2026-11-25, this branch):

- `npx tsc -b`: clean. `npm run lint`: no warnings.
- `npx vitest run` (under the heavy-tests lock): 1314 passed, 124 skipped (the browser suites without BROWSER=1);
  then `Board.test.tsx` gained one test (15 passed).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: index 533.72 kB (167.42 kB gzip), terrain3d 614.29 kB
  (168.20 kB gzip), up about 3.4 kB (1.2 kB gzip) on the lazy 3D chunk.
- `npm run test:browser` (same base, under the lock): AI suite 6 passed; the rest 50 passed, 2 skipped (online, needs
  the emulator).

## Open points

- Not seen on a phone yet: tuned on software WebGL stills. At the opening zoom the foot units' crouch and the shield
  in front read clearly; the riders' hunch is small (the horse's head going down carries most of it) and the scout
  barely changes (it already crouched).
- The shield arm is part of the shield piece, so when the shield comes to the middle the arm's shoulder end moves
  with it; it is behind the shield and does not show in the shots.
- The svg look does not move the shield in front (see above); only the squat.
- A unit killed while hunkered falls from a standing pose (the fall figure is built standing), as before.
- Numbers to turn if it should read stronger or softer: `FOOT_DROP`, `KNEES` and each type's shield shift in
  `crouch.ts`, `CROUCH_MS` for the pace; the svg squat is one CSS line in `theme.css` (`.unit-crouch.hunkered`).
