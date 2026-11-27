# Woodland Nations (rules 11): report

Branch `faction-design`, from main at 126afff (0.8.0, rules 10). Spec:
`docs/superpowers/specs/2026-11-26-woodland-nations-faction.md`. Plan: `docs/superpowers/plans/2026-11-26-woodland-nations.md`.
Nothing merged, pushed or deployed; `database.rules.json` changed but not deployed.

## What was built

- **Engine (Tasks 1 to 8, each with a task review):**
  - the faction's data and `RULES_VERSION` 11;
  - harvests that pay 3 gold back, lighter buildings, the champion and support from level 4, and a Skirmisher plus a
    Trapper at the start;
  - hiding in forests and forest stride;
  - the bow, agile, ambush and forest eye;
  - the Dash-strike;
  - snares, with moves that stop on the snare tile;
  - smoke and guide.

  Rules text is in section 15 of `docs/rules/stage1-rules.md`, with a "Rules 11 changes" changelog. Spartan and
  Mongol play is unchanged: the legal-action and view digests of the seeded playouts are identical, and only the state
  hash moved, because it carries the rules version.
- **AI (Tasks 9 and 10):**
  - the AI plays the faction: its persona, Dash-strike candidates, snare scoring, and smoke and guide through its
    usual scoring;
  - it values its own hidden units by the threat that can reach them;
  - it is wary of unseen forests near a Woodland rival, using only `AiInput` (a test proves the plan does not change
    with a hidden unit's true position).
- **App (Tasks 11 to 14):**
  - a faction picker per seat, and mirror matches with a purple second seat (`seatColour` everywhere a player is
    coloured);
  - online rooms with a guest faction, chosen by the host;
  - the Shoot or Dash-strike choice on the card;
  - the Palisade;
  - report lines: a hidden attacker's kind, a Dash-strike told as one hit, and a snare sprung;
  - on the board: hidden shots draw only the hit, your own snares show to you, your hidden units carry the eye, and
    the Dash-strike runs out and back.
- **Art (Tasks 15 to 17):**
  - five 2D figures and banner glyphs, and the emblem;
  - five 3D figures with hunker poses: weapons slung on the back for the War Chief, the Skirmisher and the Hunter,
    huddled for the Smoke Keeper and the Trapper;
  - Woodland towns by level in 2D and 3D;
  - Woodland tile buildings in 3D.
- **Sounds (Task 18):** five synthesised drafts in the workspace (`.superpowers/scratch/audio/woodland`). They are
  not wired in until David has listened.
- **Review:** a whole-branch review (Fable) found no Critical issue and no hidden-information leak. Its fix wave
  closed 5 Important and 6 Minor findings and was re-reviewed clean. A leak check now runs as a test
  (`src/app/woodland.leak.test.ts`).

## Balance (Task 19)

The details are in `docs/superpowers/plans/2026-11-26-woodland-tuning-log.md`.

- **Against the Mongols:** inside the band as built: 43.0% at normal, 45.5% at hard.
- **Against the Spartans:** short of it: 18.5% at normal, 15.5% at hard. Hoplite lines shrug off arrows.
- **Why no lever fixes it:** every lever in the plan lifts both pairs together. The cheaper Skirmisher gives 25.5%
  against the Spartans and 62.0% against the Mongols.
- **The Spartans against the Mongols:** unchanged within noise.
- **Arrows past the shield wall:** a trial where bow shots ignore the phalanx bonus did not help (17.5%). Production
  is the gap: the Spartans train 49 units a match to the Woodland Nations' 28.
- **Decision:** no number is changed on the branch. The direction is David's call (options in the log).

## Not done or parked

- **3D:** the mine and foundry hogans and the worn forest trail road were not drawn. The lean-to reads plain.
- **The faction emblem:** it has no place in the game yet; it is shown on the art sheet only.
- **Board effects:** smoke, guide and setting a snare have no effect of their own on the board.
- **Old phones:** an old 0.8.0 phone shown a Woodland room may call it unreadable rather than ask for an update.
- **The enemy card:** an enemy Skirmisher's card shows range 1 even when its owner knows Archery, because a rival's
  techs are not known.
- **Sims not run:** the hard level for the levers, the mirror at hard, and the biomes (not merged).

## Deploying, when David says yes

- Deploy `database.rules.json` before the app. The new app always writes `guestFaction`, and the old rules refuse
  unknown `meta` keys. The new rules accept everything the live 0.8.0 app writes.
- Never deploy during a live online match (`npx firebase database:get /rooms` first).
- Rules 11 bumps `RULES_VERSION`: online rooms made on 0.8.0 cannot be joined from 0.9.0, and the reverse.
