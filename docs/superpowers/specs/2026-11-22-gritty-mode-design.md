# Gritty art mode - design

## Intent

David wants an optional grown-up look for Warbanners. The bright, kid-friendly art stays the default. A new Settings
menu on Home switches to **Gritty**: a darker theme, blood on units when they are badly hurt, and armour, shields and
weapons that show wear as they take damage. A unit keeps signs of every battle it has fought, even after healing.

## Decided by David

- Bright stays the default; Gritty is opt-in from a Settings menu on Home.
- Gritty = a darker theme + blood when hurt + missing or damaged armour as damage grows.
- Damage stages: **scuffed, dented, battered, broken**. Slight blood from battered onward.
- Healing (resting, the Heal ability, levelling up and the like) removes the blood. The armour then goes back to
  dented or battered, depending on how badly the unit was hurt before the heal. Wear never fully resets.
- Shields, swords and armour also show how many battles the unit has fought.
- Cosmetic only: no number in the game changes.
- Opponents see the battle damage too, so the data it needs is public.

## Goals, non-goals, anti-goals

- Goal: every one of the 17 unit figures has four wear stages and two blood levels in Gritty.
- Goal: the setting is per phone and changes nothing about a match; two phones in one online match may use different
  modes.
- Non-goal: new sounds, death animations, gore. Blood stays small: a smear, a few drops.
- Anti-goal: Bright mode changing in any way. With Gritty off, every figure draws exactly as it does today.
- Anti-goal: wear that reads as noise at phone size. Marks are few, bold and placed on the big shapes (shield, helmet,
  blade, tunic), not hairlines.

## Approaches considered

1. **Track wear in the engine (chosen).** Each unit carries a small public `wear` record that the engine updates when
   it is hit, fights or heals. Deterministic, replayed and hashed like the rest of the match, so it survives saves,
   reloads and online play, and opponents see the same thing.
2. Work it out in the UI from the action log. No rules change, but every screen would need the whole history, online
   catch-up and resumed saves would have to replay it, and the fog makes "what the opponent saw" hard.
3. Derive it only from current health. No state at all, but healing would erase all wear, which David ruled out.

## The engine part

`Unit.wear: { battles: number; scar: 0 | 1 | 2 | 3; bleeding: boolean }`, public (playerView copies it for every
visible unit; `deeds` stay private).

- `battles` goes up by one for every unit in an attack: the attacker, the target and every unit a splash hits.
  Abilities do not count.
- The **wound stage** comes from health alone: 0 at full health, then by `hp / maxHp`: 1 scuffed above 75%, 2 dented
  above 50%, 3 battered above 25%, 4 broken at 25% or less.
- Any loss of health (a hit, a counter, a splash, a chain kill's cost) that leaves the wound stage at 3 or more sets
  `bleeding`.
- Any gain of health (rest, Heal, Fierce) clears `bleeding` and raises `scar` to `SCAR_AFTER[stage before the heal]`,
  where `SCAR_AFTER = [0, 1, 2, 2, 3]`: healed from battered leaves dented armour, healed from broken leaves battered.
  `scar` never goes down.
- The **visible stage** is `max(wound stage, scar, battle floor)`, with battle floor 1 (scuffed) from 1 battle,
  2 (dented) from 4 battles, 3 (battered) from 10 battles. Fights alone never show broken.
- **Blood**: none unless `bleeding`; then 1 (slight) at wound stage 3, 2 (more) at wound stage 4.
- All of this lives in `src/engine/wear.ts` as pure functions (`woundStage`, `wearLook`), exported from the engine
  index. The thresholds are cosmetic constants there, not rules numbers.
- It changes the shape of the match state and so its hash: `RULES_VERSION` goes up by one. Saves from the old rules
  show as "from an older version", as today. Note for the merge: the `connected-cities` branch is also at 7, so
  whichever branch lands second takes the next number.

## The setting

- `src/ui/artMode.ts`: `getArtMode()`, `setArtMode()`, `useArtMode()` (a `useSyncExternalStore` hook). Stored in
  `localStorage` under `banners.artMode` as `'bright' | 'gritty'`, read and written only inside functions, wrapped in
  try/catch with a memory fallback, the same way `sound.ts` keeps the mute.
- The App writes `data-art="gritty"` on `<html>` while Gritty is on, and the CSS dark tokens key off it.
- Home gets a row below the online buttons with a **Settings** button, laid out so a **Stats** button can sit beside
  it (another session is adding Stats). Settings opens a small card over Home with one choice, **Art style:
  Bright / Gritty**, each with a line of description, and a Done button.

## Mood

David's reference (2026-11-22): "the game Bad North is what I'm sort of looking for when we're making grittier
graphics. Especially when there's bad weather and less daylight." A mood reference only: our own art, colours and
shapes, nothing copied or traced. In spirit: a muted, desaturated palette; low, overcast light; small figures that
read clearly against a moody ground; mist and rain as atmosphere. Weather and time of day are David's "version 2"
idea, so the Gritty palette is built to be dimmed further for night and storms later (the grade in `art/palette.ts`
is a few numbers, and the haze over the board is one CSS layer).

## The dark palette

- Chrome: the warm paper becomes dark leather, the sky a night slate, ink a pale parchment. Gold buttons become a
  tarnished brass that keeps dark words (a new `--on-gold` token, dark in both modes). Contrast stays at least
  4.5 to 1 for words.
- Board: the five grounds get cooler, duller versions (olive-grey grass, slate water, wet stone, drab sand, and fog
  as a near-black murk). Scenery (trees, rocks, buildings, cities) is muted by one overcast grade: less colour, less
  light, a cold cast. A pale haze at the top of the board and a dusk vignette at its edges, drawn with gradients
  only (no filter), stand in for weather. Figures keep their own colours so units stay easy to tell apart.

## What each stage looks like

Each figure decides its own marks, drawn on top in Gritty only:

- **Scuffed**: two or three pale scratches on the shield or armour, a dirt smudge on the hem.
- **Dented**: scratches plus dark dents on the helmet and shield, a notch in the blade, a frayed hem.
- **Battered**: a chip out of the shield rim, a crest or plume torn short, a cracked shield face, a tear in the tunic.
- **Broken**: a shield split with a piece gone, a missing cheek guard or pauldron, a snapped or bent weapon, a torn
  cloak.
- **Blood** sits on skin and metal, never on the player's colour where it would not show: a small dark-red smear at
  level 1, a smear and two or three drops at level 2.

Shared parts (the standing body, the sword, the horse) get shared wear helpers in `src/ui/art/wear.tsx`, and each
figure function takes an optional `wear` prop (`{ stage, blood }`), drawing nothing extra when it is absent.

## Order of work

1. This spec, then a sample: the wear helpers, the dark tokens, and three figures (Warrior, Hoplite, Horse Archer) at
   every stage on the art sheet, in both modes. **David looks at the sample before the other 14 are drawn.**
2. The engine `wear` record, tests and the rules bump.
3. Settings on Home, the stored mode and the dark theme.
4. The other 14 figures (Opus subagents), then the full test run including browser tests, and screenshots.

## Left to the builder

Exact coordinates and colours of every mark; the copy for the Settings card; whether the Picture panel and the Setup
faces also show wear (they show a fresh unit, so they draw clean).
