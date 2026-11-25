# War banners, darker spent units, the hidden eye: report (2026-11-25)

Branch `warbanner`, from `hunker3d` (main 0.6.2 plus the hunker crouch). Not pushed or merged, no version bump.

David's requests: spent units are no longer see-through but darker; a war banner above each unit with a unit-type
icon and the green health beside it; and (later ruling) scouts are not see-through either, an eye on their banner
says they are out of the enemy's sight.

## What changed

- **No unit is ever drawn see-through.** `unitAlpha` (0.55 spent, 0.7 hidden) is gone. In its place
  `unitShown()` (`src/ui/terrain3d/unitsInput.ts`) gives `shaded` (own and spent) and `eye` (own and hidden trait).
  `GlUnit.alpha` is replaced by `GlUnit.spent`. Only falls still fade (as before).
- **Spent: darker, in both looks.** 40 percent darker and a quarter greyer, eased over 200 ms when the unit becomes
  spent and back when its next turn starts.
  - SVG: the figure (with a hero's pennant) and the banner sit in a `.unit-shade` group; `.unit-shade.spent` is
    `filter: brightness(0.6) saturate(0.75)` with a 200 ms `filter` transition (`src/ui/theme.css`), none with
    reduced motion.
  - 3D: the figure shader gets `UNIT_SHADE` / `uShade` (`src/ui/terrain3d/shaders.ts`), the same darkening applied to
    the final colour. `units3d.ts` eases each unit's shade (the crouch's easing, `units/shade.ts`, `SHADE_MS` 200)
    and repaints its opaque meshes with one of 8 shared step materials; no rebuild, no transparency. `turning()`
    stays true while a shade eases, so the frames are drawn. A unit first seen spent is dark at once.
  - Marks round the banner (taunted, blinded, new, hunkered, the item badge) keep their colours, so they read the same.
  - Enemy units: never darkened. The spent set the board receives holds only the viewer's own units (as today), and
    `unitShown` also requires `mine`.
- **War banner** (`src/ui/art/banner.tsx`, `WarBanner`, replaces `StatusOverlay` in `units.tsx`). A small swallowtail
  flag in the owner's main colour with a dark edge (gold for a hero), above the head (rows y -49.8 to -38.2 in figure
  units; the pips were at -43 to -39). Left: the unit type's glyph in warm white. Then the pips on a dark inset, one
  per 5 health (same rule and green as before, a little bigger: 3.4 units). Marks as before but centred on the
  banner's middle: taunted and blinded to the left, the "new" glint or the hunker shield to the right, the item
  badge past them (`itemBadgeX` now measures from the banner). It is one svg used by both looks: in 3D it is in the
  overlay svg above the figures canvas, exactly where the pips were, so it follows slides, lunges, crouch and falls
  as the pips did and is never hidden behind a 3D body.
- **Glyphs** (original, simple): warrior hand axe, spearman spear, swordsman crossed swords, defender tall shield,
  archer drawn bow, horseman horse head, knight plumed closed helm, catapult throwing engine, hoplite round shield on a
  spear, King's Guard crown, piper twin pipes, scout dagger, horse archer arrow through a horseshoe, Khan's Guard
  horsetail standard, Sky Caller storm cloud, camp tent, sellsword sword across a coin. Heroes: their base type's
  glyph, the gold banner edge, and the pennant on the figure as before.
- **Hidden eye.** An own unit with the hidden trait (the Krypteia Scout) is opaque and its banner carries a
  **slashed eye** after the glyph (the banner widens by one slot). I picked the slashed eye over a closed one because
  the blinded mark is already a shut eye; a slashed eye reads as "not seen" and is clearly different. The scout's
  own glyph is a dagger, not an eye, so the two do not clash. Spent and hidden: darker, with the eye. Shown only on
  the viewer's own units (the opponent sees an enemy scout's plain banner, nothing new revealed). It is the trait, as
  the 0.7 dim was: the owner is not told whether an enemy is actually next to the scout.

## Board.tsx

Only `UnitViewOf` changed (the shade class instead of the opacity, `WarBanner` instead of `StatusOverlay`, the eye
flag for the item badge) and two imports. Nothing in the camera, panels or layout.

## Shots (`docs/superpowers/plans/shots/warbanner/`)

- `board-svg.png`, `board-3d.png`: 412 x 915, opening zoom. Spartans round their capital: hoplite hero (Fierce,
  which the game marks spent here as it has nothing left to do), archer damaged and spent, knight spent, defender
  hunkered and damaged, scout hidden and fresh, scout hidden and spent, catapult, swordsman damaged with a draught.
  Mongols beside them: horseman damaged, Khan's Guard, horse archer spent (not darkened: an enemy), camp damaged.
- `board-svg-zoomed.png`, `board-3d-zoomed.png`: the same a little closer.
- `banners-close.png` (4 px a board unit) and `banners-board.png` (opening zoom on a phone, dpr 2.6): every type,
  full, damaged (other side's colour), hero, spent; the scout hidden fresh and hidden spent; a row of marks
  (taunted and blinded, new, hunkered, hero with draught and new, draught and spent).

Made by `scripts/warbanner-sheet.ts` and `scripts/warbanner-shots.ts` (run after a root `vite build`).

## Tests

- `src/ui/art/banner.test.tsx` (new): one distinct glyph per engine unit type, in the glyph colour, inside its slot;
  owner colour, gold edge for a hero; pip counts; every mark still drawn and in its place above the head; spent
  changes only the banner's shade class, marks untouched; the hidden eye after the glyph, before the pips, widening
  the banner, and kept when spent.
- `Board.test.tsx`: spent own unit has the shade on figure and banner and no opacity anywhere; an enemy in the spent
  set is not darkened; own hidden scout opaque with the eye, enemy scout and a warrior without; each unit's banner has
  its type's glyph in its owner's colour, outside the crouch; hero banner; pips follow `maxHpOf` (unchanged).
- `unitsInput.test.ts`: `spent` instead of `alpha`, `unitShown` rules, an enemy never spent, the signature changes
  with spent.
- `units3d.test.ts`: a spent unit darkens in place (same group, no rebuild) over `SHADE_MS`, monotone, no jump, all
  materials opaque, lightens the same way; first seen spent is dark at once; step materials shared and freed;
  reduced motion is instant. Existing facing and crouch tests reworded from "rebuilt dimmed" to "darkens in place".
- `hero.test.tsx`: bounds moved to the banner row (reach 34 either side, y -50 to -38).

Results: `npx tsc -b` clean, `npm run lint` clean, `npx vitest run` 1326 passed (124 browser skipped),
`GITHUB_PAGES_BASE=/warbanners/ npx vite build` fine, `npm run test:browser` all passed (6 + 50, 2 skipped as before).

Sizes: main chunk 538.64 kB (168.97 kB gzip), terrain3d chunk 615.33 kB (168.56 kB gzip).

## Concerns and open points

- The svg darkening uses a CSS `filter` on svg groups. Chromium draws it (checked in the shots); Safari on iPhone
  should be checked. If it did not apply there, spent units would simply look fresh (never broken).
- Banners are wider than the old pips (a 5-pip banner is about 36 board units, a tile is 52), so in a tight cluster
  a banner can cover part of the figure behind it, and the item badge can reach the next tile. Everything stays
  readable in the shots; worth David's eye on the phone.
- The hidden eye follows the trait, not whether an enemy actually stands next to the scout right now. Showing
  "spotted" would need the enemy positions the owner may not see, so I kept it to what the 0.7 dim said before.
- Marks keep full colour on a spent unit (my call, so taunted or hunkered still read); say if they should darken too.
- The ArtSheet (`src/ui/art/ArtSheet.tsx`) shows the new banners and a hidden scout cell.
