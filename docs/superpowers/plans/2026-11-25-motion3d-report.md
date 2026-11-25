# Moves that walk, a calmer camera, attacks that strike and block: report

Branch `motion3d`, cut from main at 0.6.1. Not pushed, merged or deployed; no version bump. David's three requests
after playing 0.6.1 in 3D on his phone:

1. "when moving the characters they often just instantly snap to the new location. Instead they need to show the
   animation of them turning to then start walking, galloping, etc."
2. "the view seems to move around abruptly. Instead it shouldn't move if the action is near the centre of the view.
   When the view does need to shift, have a smooth but quick acceleration of the pan over to the new viewing location."
3. "I'd like to add animations for the attack e.g. A quick sword swing from attacker, a brief shield block from
   Defender if they can survive attack."

Nothing in `src/engine` or `src/ai` changed. No sound changed (the sound is still chosen by the same rule from the
same events). Everything 3D stays behind the "3D terrain" option.

## 1. Why moves snapped (diagnosis)

`scripts/motion3d-probe.ts` opens the built app in Chromium with the 3D look on, loads a crowded saved match against
the hard AI (92 random turns of seed 3 is the AI suite's board; the probe uses 82 turns of seed 3), makes the
person's moves with Next unit and a tap, ends the turn, and logs every slide and lunge started on a unit
(`Element.animate`) and every camera write, then replays the saved actions in Node to name each move and what the
viewer was shown. What it found on main (0.6.1):

| Move | What the board did | Snap? |
| --- | --- | --- |
| Own move, 1 hex | 180 ms ease-out slide | no, but over before the figure's 160 ms turn reads |
| Own move, 3 or 4 hexes (riders, scouts, roads) | the same 180 ms ease-out slide: most of the distance in the first 60 ms | **reads as a snap** |
| AI or online opponent move in sight | the same 180 ms slide | as above |
| Move out of the fog | the unit appears on its new tile, no slide | deliberate (where it came from is secret) |
| Move into the fog | the unit disappears | deliberate |
| Kill then advance (AI unit 24 in the probe) | the slide started at 0 ms, with the fall; **no lunge at all**: Effects took the lunge's start from `data-at`, which already named the target's tile, so it leaned nowhere | **yes: the killer jumped into the tile with no blow** |
| Attack by a unit whose own tile the action took out of sight (a lone defender killed: its sight dies with it) | no lunge, no fall: `effectsFor` only showed tiles in sight *after* the action | **yes: the victim vanished, the attacker never moved** |
| Knight chain (attack, advance, attack, advance) | one 180 ms slide from start to end, lunges from the wrong tile | yes (same two causes) |
| Lure | a 180 ms slide | as for a move |
| A second move of a unit still sliding (two actions close together) | a new slide from where the last one was going | a jump forward |
| Units leaving and re-entering the 3D scene, the dimmed rebuild after a move, a pan during a slide | checked in code and the probe: the figure keeps following the svg slide; the rebuild keeps its group and facing | no |
| Reduced motion | no slide | deliberate (kept) |

So the snaps were: the flat 180 ms slide for every distance, the advance that started at once and lost its lunge,
blows and falls hidden when the action itself removed the viewer's sight of a tile, and a slide restarted from the
wrong place. The SVG look shared the advance, lunge and sight bugs, so those fixes apply to it too; its slide itself
stays 180 ms ease-out as before.

## 2. Moves: turn, then walk

`src/ui/board/motion.ts` (pure, main chunk, tested):

- The 3D look's slide holds the unit on its tile for `TURN_LEAD_MS` (140 ms, while the existing 160 ms eased turn
  plays), then travels with `cubic-bezier(0.45, 0, 0.4, 1)` (ease in and out).
- Travel per hex: 240 ms for foot units, x0.85 for riders (204 ms), x0.8 for the scout (192 ms), x1.3 for the trebuchet and
  the camp (312 ms), capped at 820 ms of travel, so any move is over in under 960 ms. One hex on foot: 380 ms in all;
  two hexes: 620 ms; a three hex gallop: 752 ms.
- The svg look keeps its 180 ms ease-out slide.

Moves now carry their timing: `effectsFor` emits a `move` effect for a seen move (its delay; it takes no slot, so no
other effect's timing changes). An advance after a kill gets the delay of the slot after the fall (240 ms), so the
killer strikes, the victim starts to fall, then the killer steps in. The board passes each move's delay to the slide
(both looks) and to the figure's turn (3D). A unit that is still sliding sets off from where it is drawn that frame.
A moved unit goes back into the draw order once its own slide has ended (was a fixed 220 ms).

The figure's gait (`src/ui/terrain3d/units/gait.ts`, pure, tested) is driven by how far it has travelled, not by the
clock, so the steps keep pace with the ease and never skate; it swells in over the first fifth of the travel and dies
away over the last:

- **walk** (foot units): two steps a cycle, 1.25 cycles a hex: bob up to 2.4 world units over each planted foot, a
  side roll of 0.11 rad and a small sway, a slight lean forward; spear, shield and sword move with the body.
- **trot** (scout): quicker (1.75 cycles a hex), springier, leaning into the run.
- **gallop** (horseman, knight, horse archer, Khan's Guard, Sky Caller): a rocking bound, the forehand rising and
  dipping 0.16 rad, a 3.2 unit bound; the rider rides it.
- **lurch** (trebuchet, camp): a slow heavy roll side to side and a nod as the wheels bump.

The figures stand about 45 world units tall, so these read on a phone without leaving the slide's line.

Straight lines only: there is still no path on the UI side, so a move of several hexes slides straight from start to
end (it can cross a mountain or water tile it went round). Left as is, as ruled.

`watchMs` (the AI's pause after a visible action) waits for the 3D walk to end when the 3D look is on (the store reads
the option); the svg look's pauses are unchanged. An online opponent's steps play as they arrive, as before.

## 3. Camera: a dead zone and an eased pan

There was no camera follow of actions before. What moved the view abruptly (probe camera log, and the code):
Next unit (an instant least pan), a selection opening or closing the unit card (an instant pan to keep the selected
unit **and every marked tile** in view, then an instant re-clamp when the card closed), a turn report line (an
instant centring) and a new turn focus.

Now (`src/ui/board/camera.ts`, pure and tested, used by `Board.tsx`, shared by both looks since the 3D terrain draws
from the svg camera):

- `followAction`: an action stays put when its tiles are inside the **dead zone**, the middle 60 percent of the board
  slot in each axis (the slot already sits between the top bar and the bottom card, so the zone keeps clear of both).
  When they are not, the view pans just far enough to bring them to the zone's edge (or centres them, when they are
  larger than the zone), clamped to the board as every pan is.
- What counts as "the action": each tile's ground (not its wall or the figure's height): the ends of the moves, the
  attacker's and the target's tiles, the falls, the numbers and bursts of the action, exactly the effects the viewer
  may see.
- Applied to: every action (own, AI, online opponent, through the same effects list), Next unit, a new selection
  when the card opens, the turn report (which still centres its line, now eased) and a new turn focus (eased).
- `panTo`: the camera eases from where it is to the target with an ease in and out (cubic), over 250 ms for a short
  hop to 400 ms for a pan across the screen (`panMs`). Drawn a frame at a time with the same `write()` a drag uses.
- A touch, a mouse press or a wheel turn on the board stops an automatic pan at once, and no action pan starts while
  a finger is on the board, so it never fights a drag or a pinch.
- A slot that changes size (the card opening or closing, a rotation) first keeps the board exactly where it was on
  screen, then eases to where it belongs, so the clamp no longer jumps.
- Reduced motion: every camera move is instant.

## 4. Attacks: strikes, blocks, flinches, counter strikes

The figures now have moving pieces (`Kit.pivot` takes an axis and push directions): the weapon (a blade or a spear,
turning about the grip so the arm stays put; the swordsman has two), the shield and the arm that holds it (turning
about the shoulder, so a negative turn brings it up and forward), an archer's drawing arm and its arrow.

`src/ui/terrain3d/units/strike.ts` (pure, tested) fits a strike to each unit:

| Strike | Units | What it does |
| --- | --- | --- |
| swing | warrior, swordsman (both blades), sellsword | blade raised back over the shoulder, then brought down and through as the lunge peaks |
| thrust | spearman, hoplite, King's Guard, horseman, knight (lance), scout (dagger) | drawn back a little, then levelled and driven forward |
| bow | archer, horse archer | drawing hand comes back, the arrow leaves the string at 0.26 of the strike, a new one is nocked; they stay side on |
| sling | trebuchet | its existing arm swing |
| bash | defender | the tower shield driven forward |
| rear | Khan's Guard, Sky Caller | the horse rears, then comes down hard |
| lean | piper | a lean into the blow |

The strike lasts the 450 ms of the svg lunge, with a lean of the whole figure toward its aim. A melee blow lands at
0.3 of it (135 ms, the lunge's furthest point). A shot lands after its flight: an arrow 55 ms a hex after it is
loosed, a stone 90 ms a hex after the arm's top.

The unit attacked, if it survives (it is not among the action's dead), reacts when the blow lands: a **block**
(warrior, spearman, defender, hoplite, King's Guard: the shield comes up and forward about the shoulder, starting
60 ms early so it is up in time, held, then lowered, 300 ms in all, with a small knock back) or a **flinch**
(everyone else: a lean of 0.16 rad away from the blow and a knock back of 1.6 units, recovering within 300 ms). A
defender that dies keeps the existing fall. If the engine reports a counter (`attacked.counter > 0`; the lunge
effect now carries its target and whether it struck back), the defender turns to its attacker, strikes back 110 ms
after the first blow with a quicker strike (340 ms) and the attacker blocks or flinches in turn.

Timings: a plain exchange is over within the existing 450 ms lunge; one with a counter strike ends at 647 ms after
the lunge starts (about 200 ms past the lunge, inside the 600 ms the counter's number already shows for). The AI's
pacing for attacks is unchanged, so turns are no slower.

Not done: the defender is not turned to face its attacker for a block (the facing rule from facing3d: the unit
attacked is not turned), so a block can be made facing sideways; the knock back and lean do go away from the blow.
A unit hit by splash damage does not react. An attack from a unit the viewer cannot see plays no strike and no block
(there is no lunge to time it by, and a reaction would tell where the blow came from).

## 5. Battery and frame rate

- The ambient loop is unchanged: 20 fps for idle life, rest after 20 s quiet, paused when covered or hidden, no
  double draws.
- Slides, strikes, blocks and turns are drawn by the board's existing follow loop at display rate while something
  plays (units canvas only), and it stops when the last slide, turn, strike or reaction has ended. A camera pan draws
  through `write()` (terrain and units, as a drag does) only for its 250 to 400 ms.
- Per figure per frame: a gait pose, a strike and a reaction pose (a few trigonometric calls) and up to four piece
  transforms. No new materials; pieces add draw calls only for the figures that have them (two to four meshes per
  piece, as the trebuchet's arm already did).
- Reduced motion: no gait, no strike, no block, instant slides (none) and instant camera.

## 6. Shots and clips (`docs/superpowers/plans/shots/motion3d/`)

Made by `scripts/motion3d-shots.ts` (the figures drawn by `units3d` on a plain hex ground by
`scripts/motion3d/sheet.ts`, posed on its own clock at real pace, 25 frames a second, with the board's own slide
timing and ease, the svg lunge, and the strikes exactly as the board hands them over) and
`scripts/motion3d-camera.ts` (the real app, 3D look, landscape phone, the page clock held and stepped 40 ms at a time
so the pan's frames are caught at real pace however slowly software WebGL draws).

Moves (each GIF at real pace; stills named by ms into the clip):

- `walk.gif`, `walk-*.png`: a hoplite walks two hexes, one, then two: it turns on its tile, then steps along.
- `gallop.gif`, `gallop-*.png`: a knight gallops three hexes then one (the forehand rising and dipping).
- `trebuchet.gif`, `trebuchet-*.png`: the trebuchet lurches two hexes then one, and a camp rolls two.

Attacks (each played twice in its clip, at 300 ms and 1500 ms):

- `sword.gif`, `sword-*.png`: a warrior's sword swing, the hoplite's shield block.
- `counter.gif`, `counter-*.png`: a swordsman's two blades, the spearman blocks, turns and thrusts back, the swordsman
  flinches.
- `spear.gif`, `spear-*.png`: a hoplite's spear thrust, the archer flinches.
- `lance.gif`, `lance-*.png`: a knight's lance comes down and drives, the warrior blocks.
- `archer.gif`, `archer-*.png`: an archer draws and looses (side on), the arrow leaves the string, the defender's
  tower shield takes it two hexes away.
- `rear.gif`, `rear-*.png`: a Khan's Guard rears and comes down, the swordsman flinches.

Camera (the real app, 3D look, 915 x 412, zoomed in on the first player's Scout on its capital):

- `camera-centre-before.png`, `camera-centre-0200ms.png`, `camera-centre-0360ms.png`, `camera-centre-after.png`,
  `camera-centre.gif`: the Scout dragged to the middle of the slot the unit card leaves; selecting it and moving it
  one hex: the camera transform is the same in every frame (`translate(342.27 -45.45)` throughout).
- `camera-edge-*.png`, `camera-edge.gif`: the Scout dragged near the right of the screen, where the card opens:
  selecting it eases the view 136 px over in about 260 ms (x 543.4, 542.0, 534.8, 503.0, 462.7, 421.8, 411.0, 407.6
  at 40 ms steps), and the move one hex further right eases it 42 px more (407.3, 402.8, 394.4, 375.3, 368.5, 365.5,
  365.4). Smooth start, quick middle, smooth stop.

The diagnosis probe (`scripts/motion3d-probe.ts`) prints its log to the terminal; nothing of it is saved here.

## 7. Tests

New and changed unit tests:

- `src/ui/board/follow.test.ts` (camera): the dead zone is the middle 60 percent; an action inside it returns the
  same camera; outside, the least pan to the zone's edge, both axes; a box larger than the zone is centred; the board
  edge stops it and asking again moves no further; pan time 250 ms to 400 ms by distance; the ease is monotone with
  no frame jump; the in-between camera.
- `src/ui/terrain3d/units/motion3d.test.ts` (pure timing): slide timing per hex, quicker riders and scouts, slower
  siege, every move under a second, no move no slide, the travel phase, the slide keyframes in each look; gait kinds,
  the swell in and out, a walk's two steps a cycle keeping pace with distance, the gallop's rock, every gait small;
  strike kinds and block or flinch per unit; the swing's wind up, hit at the lunge's peak and recovery with no frame
  jump; thrust, bow (draw, loose, nock), rear; block and flinch shapes; melee and ranged impact times; an exchange's
  timeline, a dead defender, a counter strike within 200 ms of the lunge.
- `src/ui/terrain3d/units/units3d.test.ts` (with three.js and a stand-in renderer): a figure bobs along its slide and
  stands still before and after, on its line; a rider's front rocks; an advance turns only when its slide starts; a
  sword swing turns the weapon piece and the hoplite's shield comes up at the hit, all back at rest after; a flinch
  knocks back and leans away from the blow, a dead defender does not react; a counter strike; the archer's arrow
  leaves and comes back; reduced motion plays nothing; the figures' pieces.
- `src/ui/board/effects.test.ts`: the lunge's target and counter; move effects, which take no slot; an advance waits
  for the blow and the fall; a move out of the fog does not tell its start; the 3D look's watch time; a killed unit's
  blow and fall show on tiles seen only before the action. `Effects.test.tsx`: moves draw nothing of their own.
- Browser suites, changed because the camera now eases where it used to jump: `tapTile` and the camera tests wait
  for the view to hold still (`cameraStill` in `harness.ts`) before reading where a tile is; `selection.test.ts`
  now checks the dead-zone rule (a tile in the middle of the slot left by the card moves nothing; a unit where the
  card lands is eased into the zone, its far edge on the zone's edge); `nextunit.test.ts` and the rotation test wait
  for the eased view.

Results (2026-11-25, this branch):

- `npx tsc -b`: clean. `npm run lint`: no warnings.
- `npx vitest run` (under the heavy-tests lock): 1295 passed, 124 skipped (the browser suites without BROWSER=1).
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`, then `npm run test:browser` with the same base: AI suite 6 passed;
  the rest 50 passed, 2 skipped (the online suite, which needs the emulator).

Bundle (`GITHUB_PAGES_BASE=/warbanners/ npx vite build`):

| Chunk | 0.6.1 | This branch |
| --- | --- | --- |
| index (main) | 528.64 kB, 165.59 kB gzip | 533.30 kB, 167.26 kB gzip (+4.7 kB, +1.7 kB gzip) |
| terrain3d (lazy) | 602.45 kB, 164.23 kB gzip | 609.98 kB, 166.77 kB gzip (+7.5 kB, +2.5 kB gzip) |

## 8. Open concerns

- Not seen on a phone yet: the gait sizes and the block are tuned on software WebGL stills at three times scale.
  At the phone's default zoom the block is small (the shield moves a few pixels); the knock back carries most of it.
- The 3D walk makes a move take 380 to 960 ms instead of 180 ms. Own moves feel the change most; if it drags,
  `HEX_MS` and `TURN_LEAD_MS` in `motion.ts` are the two knobs.
- Moves slide in straight lines (no path on the UI side), so a long move can cross a mountain or water tile.
- A knight's chain merges its advances into one slide from its first advance; each lunge still plays from its own
  tile.
- The dead zone now also governs a new selection: selecting a unit near the edge eases it inward when the card
  opens (it used to jump to fit every marked tile); a unit inside the zone no longer moves the view at all, even if
  some of its marked tiles are off screen.
- Effects (blows, falls, damage numbers) now also show on tiles the viewer saw just before the action but not after
  it (a defender killed takes its sight with it). Units still have to have been seen; nothing new is revealed.
- The block is made in the defender's own facing (it is not turned to the attacker).
