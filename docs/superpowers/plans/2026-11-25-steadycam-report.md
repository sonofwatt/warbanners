# Steadycam: a board that stays put, a pull-up card, and the turn buttons at the bottom

Branch `steadycam`, cut from main at 0.6.2. No version bump, no push, no deploy.

David's reports on 0.6.2:

1. "The screen still moves around too much. When Selecting a unit, the screen will move to center it. When you
   deselect the unit, the menu disappears, so the screen recenters."
2. The bottom card could be shorter: show its top row, pull the card up for the rest (a pull, not a scroll).
3. Move Next unit, End turn and Tech to the bottom of the screen, all End turn's shape, with words; a selection's
   card replaces them; Menu to the left of the player's name.
4. End turn stays neutral while there are moves left, and lights up red once there are none.

## 1. The cause, measured

A probe (Playwright, the built app, seed 7, Player 1's Scout on the capital at -2,5) read the board slot's box and the
camera transform before a selection, after it, and after deselecting, and counted camera writes in between.

0.6.2 (before):

| viewport | moment | slot | panel | camera |
| --- | --- | --- | --- | --- |
| 412x915 | start | 412x811 | none | translate(174 420.9) |
| 412x915 | selected | **412x445** | top 549, 366 tall | translate(174 **180.82**) |
| 412x915 | deselected | **412x811** | none | translate(174 **420.9**) |
| 915x412 | start | 915x346 | none | translate(457.5 81.82) |
| 915x412 | selected | **615x346** | side, 346 tall | translate(**428** 81.82) |
| 915x412 | deselected | **915x346** | none | translate(**457.5** 81.82) |

22 camera writes during the select and 18 during the deselect in portrait (an eased pan each way): the selection
card was its own grid row, so opening it shrank the board's slot by 366 px; Board's ResizeObserver then kept the
corner and re-aimed (keepSelection, the dead zone of the smaller slot) and eased, and closing it grew the slot back and
eased again. Landscape did the same sideways (the side column took 300 px from the slot).

After (same probe, before the bar was added):

| viewport | moment | slot | panel | camera |
| --- | --- | --- | --- | --- |
| 412x915 | start | 412x811 | none | translate(174 420.9) |
| 412x915 | selected | 412x811 | top 724, 191 tall | translate(174 392.85) |
| 412x915 | deselected | 412x811 | none | translate(174 392.85), **0 writes** |
| 915x412 | selected | 915x346 | side | translate(457.5 81.82), unchanged |
| 915x412 | deselected | 915x346 | none | unchanged, **0 writes** |

The 28 px pan on the portrait select is the new rule at work: the Scout's tile (with its figure and a third of a tile
of margin) reached under the collapsed card, so the view eased up just that far. Deselecting never moves anything.

## 2. What changed

### The slot keeps one size; panels lie over it

- `theme.css`: `.board-slot` spans every row and column under the Hud (`grid-row: 2 / -1; grid-column: 1 / -1`) in
  both orientations. The selection card (bottom in portrait, side column in landscape), the turn bar and the sheets
  sit on top of it with `z-index: 3`. Real size changes (rotation, window, browser bar) still go through the old
  ResizeObserver path.
- The notice line (`.match-notice`) already floated over the board's cell and never resized it; unchanged.
- The tech and menu sheets also took the side column in landscape (and so used to shrink the slot there); they now
  lie over the board too. In portrait a sheet now rises from just above the turn bar, so End turn stays in reach.
- The 3D canvases are not resized or re-created on select or deselect: a browser test marks both canvases, then
  selects, deselects and selects again in the 3D look, and checks the same elements with the same drawing size and an
  unchanged camera.

### The camera knows what is covered (`src/ui/board/camera.ts`, pure, tested)

- `Insets` and `uncovered(vp, cover)`: what a panel covers on each side, and the box that is left.
- Clamp: `clampCamera` takes a per-side slack. While a panel covers the bottom (or the side), the view may run that
  much further on that side, so the map's last row can be brought out from under the card.
- `slackFor(c, bounds, vp, cover)`: the slack is the covered size or how far the view already runs past the plain
  limit, whichever is more. **When a panel closes with the view past the plain limit, it stays there** (the calmer
  option): nothing eases it back, and the next drag or pinch cannot jump it in; it can only come back toward the board.
- `deadZone(vp, zone, cover)` and `followAction(..., { cover, slack })`: the dead zone is the middle 60 percent of the
  uncovered part. Used by followed actions, Next unit and real resizes.
- `keepInView(..., { cover, margin, slack })`: the least pan bringing a box inside the uncovered part with a margin;
  `c` itself when it already is.
- `centreOn(..., cover)`: the turn report line is centred in the uncovered part. `startCamera(..., cover)`: the turn's
  opening focus is centred in the uncovered part (the bar at the start of a turn).

### The board (`src/ui/board/Board.tsx`)

- New props `cover(): Insets` (read on demand when the board decides where to look, so never stale) and `coverN`
  (bumped when the collapsed card's height changes or the layout turns).
- A new effect on the selected tile (and `coverN`): no pan if the tile, with its figure (`tileBox`), lies wholly in
  the uncovered part with a third of a tile of margin; else the least pan, eased by `panTo` as before. Deselecting
  never pans. It runs after the reveal and follow effects and measures from where any pan under way is going, so
  Next unit or a followed action is not doubled.
- Drags and pinches use `slackFor` with the last cover read; a finger still wins over any automatic pan.
- The cover is read (which measures layout) only when it may have changed: a selection, the card's top changing
  size, a resize, a tap on Next unit or a report line. A followed action (every AI step) uses the last read. Reading
  it on every followed action forced a layout of the whole board inside the action's task and pushed the AI test's
  longest task over its 100 ms bound; with the cached read the A/B below shows no difference from 0.6.2.

### The pull-up card (`src/ui/panels/SelectionSheet.tsx`)

- Portrait: the selection card is a bottom sheet with a grab handle (a button with `aria-expanded`, keyboard
  toggles; the full card width and 44 px tall, a thumb target, with a short grip bar drawn in it). Collapsed, the default for every new selection, it shows only `.card-peek`:
  - a unit: the name, the action buttons (top right, as today) and the numbers row (health, attack, defence,
    movement, range). The blurb, traits, earned traits, momentum, hunker, brace, myth touch, carried item and deeds
    are in `.card-more`, shown when pulled up.
  - a city (capital or not): the name, its actions and the row of units to train. Picking a unit in the row puts its
    Train button in the head, so training needs no pull. The picked unit's card (or the hint) and the city's numbers
    are below.
  - a tile: the name, its actions and its numbers; the mountain and harvested notes are below.
- Pull by the handle or anywhere on the card's top part: the card follows the finger, then settles (200 ms height
  transition, none under reduced motion) to collapsed or expanded: past 36 px in a direction it goes that way, a
  shorter pull settles to the nearer end. Expanded = the content's height, at most 70 percent of the match screen; a
  taller card scrolls inside (the handle stays pinned). A pull down from collapsed does nothing. A tap on the handle
  toggles. A pull never turns into a tap on a button under the finger. Sideways drags on the row of units still scroll
  it (`touch-action: pan-x` on the top part).
- Only the collapsed height counts as covered, so pulling the card up or down never moves the board, and a tile that
  ends up under the expanded card is left there (the player pulled it up on purpose).
- Landscape keeps the whole side column (no handle, no pull), over the board's right part.
- Taps and drags on the card never reach the board (the card is a sibling of the board's svg, above it).

### The turn buttons at the bottom (`src/ui/panels/Hud.tsx`: `Hud` and `ActionBar`)

- Top bar: Menu on the far left (before the flag and name, in the same group so they never part on a narrow phone),
  then the name, gold, turn and, online, the clock and the status line as before; the AI's "Thinking" line stays there too. The "N units to act" text left the top bar.
- Bottom bar, portrait and landscape: Tech (flask and "Tech", with the ready dot), Next unit (its icon, "Next unit"
  and a count badge of the units that can still act; the full sentence stays for screen readers), End turn on the
  right. All the same button family (End turn's shape), 56 px tall (48 px on short landscape screens), sized by their
  words. It lies over the bottom of the board like the card; the screen's own layout already stops above the bottom
  safe-area inset.
- Landscape: the bar runs along the bottom of the board area, buttons on the right at a thumb's size (not in the side
  column: at 568 wide the column is 240 px, too narrow for three worded buttons). While a sheet holds the side column
  the bar keeps to the board's part.
- A selection's card takes the bar's place; deselecting brings it back. The camera counts the bar's height as covered
  when nothing is selected and the collapsed card's when something is; neither swap pans (in sight), and deselecting
  never pans.
- End turn is neutral (the beige of Tech and Next unit) while any unit can still act (the units-to-act count above
  0) and turns to the player's colour (red for the Spartans) when none can, with a 200 ms colour transition (none
  under reduced motion). It is tappable in both looks; the disabled looks (locked, AI thinking, waiting online) are as
  before.
- Testids kept: `open-menu`, `open-tech`, `tech-dot`, `next-unit`, `end-turn`, `hud-status`, `thinking`. New:
  `action-bar`, `units-to-act`, `selection`, `sheet-handle`. `can-act` is gone (its words are on Next unit for
  readers).

## 3. Tests

Unit (`npx vitest run`): new `src/ui/board/cover.test.ts`: the uncovered dead zone (portrait and side), a followed
action that is in the plain zone but low in what the card leaves, the clamp's extra room equal to the card (and only
on that side, and off centre on an axis where the board is smaller), the view left past the limit after a card closes
(stays, a drag back moves exactly by the drag, a drag out or a pinch does not move it), the least pan for a selection
under the card, and the report line centred in the uncovered part. Hud and bar unit tests updated
(`panels.test.tsx`, `screens.test.tsx`).

Browser (`npm run test:browser`):

- `selection.test.ts` (rewritten for the new rules, 412x915 and 915x412): unit, city, nothing, unit, city on the same
  tile leave the camera and the slot exactly as they were once the tile is in sight; a unit where the card lands is
  brought a third of a tile clear of it (within 8 px) and no further, and deselecting leaves the view there; the 3D
  look's canvases are neither re-created nor resized; taps and drags on the card never reach the board.
- `sheet.test.ts`: collapsed shows the head, numbers and actions and hides traits and blurb; handle tap, a pull by the
  name and a pull by the handle open and close it with the camera unchanged; a pull down from collapsed does nothing;
  Enter and Space toggle; the capital shows its row of units collapsed and its numbers pulled up; Train goes in the
  head while collapsed; a new selection opens collapsed; landscape keeps the side column with no handle.
- `bar.test.ts`: no turn buttons in the top bar, Menu left of the name; Tech, Next unit (count 1), End turn in one
  row along the bottom, at least 48 px tall, each label on one line inside its button; the card replaces the bar and
  deselecting brings it back with the camera unchanged; End turn neutral (Tech's beige) with a unit to act and in the
  player's colour once none can, still enabled.
- Updated for the bar and the card lying over the board, without weakening what they prove:
  - `harness.ts`: `uncoveredBox` (the part of the slot the card or bar leaves); `deselect` (a tap on the sea past the
    map, else the selected tile until it cycles to nothing); `tapTile` now drags the board first when the card or the
    bar lies over the tile, as a player would (a tap there used to land on the bar).
  - `nextunit.test.ts`: "in sight" means in the uncovered part; it deselects before the second Next unit; the count
    badge replaces the "No units to act" text.
  - `cityfit.test.ts`: collapsed, the whole row of units is in sight; pulled up, the whole card fits with nothing to
    scroll; Train sits at the top right of the card's content (under the handle).
  - `flow.test.ts` ("nothing is clipped"): checked with nothing selected and with a unit selected (End turn absent
    then), and End turn uncovered after deselecting; `endTurnReady` deselects first.
  - `offline.test.ts`, `digest.test.ts`, `ai.test.ts`: deselect before End turn (a unit with moves left stays
    selected). `digest.test.ts`: the report line is centred in the uncovered part.
  - `techlink.test.ts`: deselects before opening Tech from the bar.
  - `overlay.test.ts`: the reward overlay still blocks the Menu; End turn and Tech are checked when on screen (with the
    harvested tile selected, its card holds their place, so they cannot be tapped at all).
  - `hud.test.tsx`: the Hud's new props.

Results of the final run (load average 12 to 20 on the shared box throughout):

- `npx tsc -b`: clean. `npm run lint`: clean.
- `npx vitest run`: 126 files passed, 24 skipped (the browser gates); 1305 tests passed. Under the box's load
  `src/app/stats.test.ts` and `src/engine/speed.test.ts` timed out once each in earlier runs; both pass alone and on
  the baseline, and neither is touched here.
- `GITHUB_PAGES_BASE=/warbanners/ npx vite build`: clean.
- `npm run test:browser` (with the base): `ai.test.ts` 6 of 6, then the rest 19 files passed, 1 skipped (online,
  gated on the emulator), 57 tests passed.
- The AI test's "never stands still for 100 ms" bound is close to the line on this loaded box. A/B with the 0.6.2
  build (same test file, the dist swapped), after the cover caching: 0.6.2 failed 2 of 3 runs (119, 124 ms), this
  branch 2 of 3 (106, 134 ms); both pass when the box is quieter, and it passed in the final run. Before the caching
  this branch was worse (it forced a layout per AI action), which is why the cover read is now cached.

## 4. Shots

`docs/superpowers/plans/shots/steadycam/`, all at 412x915 unless named otherwise:

- Before (0.6.2) and after, the same select and deselect of the Scout: `before-select-deselect.gif`,
  `after-select-deselect.gif`, with stills `before-start`, `before-selected`, `before-deselected`, `after-start`,
  `after-selected`, `after-deselected` (`-412x915.png`). Before: the board jumps up 240 px and back. After: it eases
  28 px once (the Scout would sit under the card) and does not move on deselect.
- The pull: `pull.gif` (select, pull up by the handle, pull down).
- The card: `unit-collapsed-412x915.png`, `unit-expanded-412x915.png`, `capital-collapsed-412x915.png`,
  `capital-expanded-412x915.png` (expanded with the Warrior picked, its Train button in the head).
- The bar: `bar-nothing-selected-412x915.png` (Tech with its dot, Next unit with its count, End turn neutral),
  `unit-selected-card-412x915.png` (the card in the bar's place), `bar-end-turn-ready-412x915.png` (no unit left to
  act: End turn red, Next unit greyed), `topbar-412x915.png` (close-up: Menu, flag, name, gold, turn).
- The camera rule: `in-sight-412x915.png`, `in-sight-915x412.png` (selected in sight, nothing moved),
  `brought-in-412x915.png`, `brought-in-915x412.png` (a unit under the card brought just clear of it).

## 5. Concerns

- **Next unit and End turn are out of reach while something is selected**, as asked (the card takes the bar's
  place). To use them the player deselects first: a tap on the sea, on fog, or the selected tile until it cycles to
  nothing. A unit that has spent its whole turn is deselected by the game already, so the common "move, then Next
  unit" flow mostly works; but "select a unit, look, then Next unit" now takes one more tap. Worth David's feel on the
  phone; a small Next unit button on the collapsed card would be the obvious follow-up if it grates.
- The first selection of a unit that sits low on the board still pans (by design: it would be under the card). On
  the default zoom at 412x915 the starting capital is near the bottom, so the very first tap of a match usually moves
  the view up by 20 to 60 px, once.
- The city's collapsed card is taller than a unit's (its row of units), so going from a unit to its city on the same
  tile can pan once if the tile is low; then never again.
- After a card closes with the view beyond the normal limit (the bottom rows pulled up from under it), empty sea can
  show at the bottom until the player drags; that was the calmer of the two options offered.
- Landscape loses about 80 px of height to the bar on a 412 tall screen (64 px at 320 tall); the camera counts it as
  covered, so nothing is hidden for good, but the visible board is smaller than in 0.6.2 when nothing is selected.
- Not seen on a real phone. The pull gesture is tested with a mouse in Chromium (pointer events); a real touch
  depends on `touch-action: pan-x` on the card's top part, which Chromium honours, but feel and thresholds (6 px to
  start, 36 px to decide) need David's thumb.
