# Warbanners Plan 5: Heroes and Expanded Treasures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2, 2026-11-20.** Revised after the plan review (`.superpowers/sdd/2026-11-20-plan-5-heroes-treasures/plan-review.md`: 0 Critical, 11 Important, 24 Minor). Every Important finding is fixed in the task it names; the Minors are taken except where a Ruling says otherwise.

**Goal:** Stage 2 of the design, playable on the live site solo against the AI and online: every unit quietly counts its deeds, earns small visible traits from them, becomes a hero with a mark every player sees once it holds two, and treasure sites can now also hold a relic, a battle draught, a map to another treasure or a sellsword who joins you. The AI values heroes, uses draughts and goes for treasures, from its own fog-limited view.

**Architecture:** All of it is rules, so it lives in the engine: three new per-unit fields (`deeds`, `heroTraits`, `item`), one new file `src/engine/heroes.ts` that counts deeds and grants traits, trait effects folded into the existing stat functions (`attackOf`, `defenceOf`, `maxMp`, sight, a new `maxHpOf`), a wider treasure table in `capture.ts`, one new unit type and one new action. Every other layer reads the engine: the AI through `AiInput` (enemy deeds are zeroed in `playerView`, traits and items are public), the UI through the index. `RULES_VERSION` becomes 4. Online play needs no database change: the database rules special-case only the exact `endTurn` and `resign` strings, refuse any other action string containing `player` or a backslash (which `{"type":"useItem","unit":3}` does not), and compare `rulesVersion` values, not literals. Before any of this, the online half of the store moves to its own file and the plan 4 follow-ups marked for plan 5 are closed.

**Tech Stack:** unchanged from `main` (React ^19.3, Zustand ^5.1, Vite ^8.3, vite-plugin-pwa ^2.0, Vitest ^4.1, Playwright ^1.65, oxlint ^1.75, firebase ^12.18.0, firebase-tools ^15.28.1, tsx, TypeScript ~6.0, Node 24). No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-18-banners-design.md` sections 4 (stage 2), 5.5 (combat stays deterministic), 5.7 (the agoge and myth touch), 5.8 (heroes), 5.9 (treasures), 7 (the AI plays by the same rules and sees only its fog), 8.3 (determinism, versions, offline solo), 8.6 (free Firebase plan). Sections 5.10 and 5.11 only say what not to build. Also `docs/rules/stage1-rules.md` (every number this plan builds on), `docs/superpowers/plans/2026-11-18-plan-3-followups.md` (carried AI and tuning items) and `/home/claude/projects/banners/docs/superpowers/plans/2026-11-18-plan-4-followups.md` (on `main` at 41afab7, not on this branch: read it from the main tree; its "Carried into plan 5" list and items marked **Plan 5**).

**Where this sits:** Stage 1 is plans 1 to 4, merged and live (0.3.1, rules 3, head of `main` 34b6351 when this branch was cut). This plan is the whole of stage 2 and ends in 0.4.0, rules 4, live.

**Not in this plan:** stage 3 (remote play, the "text them" button, notifications), stage 4 (more players, map sizes, speed settings, ships, cannibal camps), stage 5 (more factions), stage 6 (Exalted Heroes, profiles, reincarnation). The deed and trait data are shaped so stage 6 can carry a hero over (totals are never reset, traits are an ordered list of ids), but nothing is built for it.

## Global Constraints

- Never write an em dash or an en dash anywhere: code, comments, tests, commit messages, docs, text the game shows. `src/noEmDash.test.ts` sweeps tracked files. Use a hyphen with spaces, a colon, or a new sentence.
- Nothing is copied from Hexonia or any other game. Names (Fierce, Tireless, Hardy, Watchful, Sellsword, Battle draught), numbers, art and text are our own.
- The engine boundary (`CLAUDE.md`): code outside `src/engine` imports it only through `src/engine/index.ts`; nothing in the engine imports from outside it; `src/boundaries.test.ts` and `src/engine/purity.test.ts` enforce it. Every new engine function the AI or UI needs is exported from the index.
- The AI boundary: `src/ai` takes only an `AiInput` from `aiInputFor(state, player)`, never a `MatchState`, touches no clock or randomness (`src/ai/worker.ts` excepted), never imports `src/app` or `src/ui`.
- Combat stays deterministic: only `+ - * /`, `Math.round`, `Math.min`, `Math.max`. Any random draw comes from `s.rng` through `rngInt`, in a fixed order.
- Every number lives in `src/engine/data/*.ts` (`CONFIG`, `UNITS`, `FACTIONS`), not in code. The rules doc for stage 2 is `docs/rules/stage2-rules.md` (new); `docs/rules/stage1-rules.md` keeps stage 1 and points to it where stage 2 changes a stage 1 rule.
- No side effects at module load: no DOM, storage, clock or randomness when a module is imported.
- Every display string lives in `src/ui/text.ts` (`T`, filled with `fill(template, values)`). A blurb that names a number builds it from `CONFIG`, so tuning never leaves the text wrong.
- `RULES_VERSION` is 4 from Task 3 on. `FINGERPRINT` in `src/engine/fingerprint.test.ts` keeps its 2 and 3 entries and gains a 4 entry. Every task that changes how the game plays repins `FINGERPRINT[4]` and the three rows of `src/engine/speed.test.ts` (state, legal and view digests and the legal action counts, which may move either way once traits and treasures change play) in the same commit, and may do so only while both provenance tests pass: `src/engine/stage1.test.ts` (real numbers, up to stage 2's first effect) and `src/engine/stage1.dormant.test.ts` (stage 2 switched off through `CONFIG`, every recorded playout end to end). The same task may repick the 25-unit position in `'legalActions on a 25-unit position is fast'` (now `randomPlayout(7, 148)`) and states the new one in its commit message, also updating the comment in `src/ai/plan.test.ts` that names it. Any other pinned state hash that moves (for example in `src/online/*.test.ts`) is repinned in the same commit and named in its message.
- Tests that need a threshold or a trait size read it from `thresholdOf` or `CONFIG.heroes` (for example a unit set to `thresholdOf(s, u, 'fight') - 1`), so Task 8's tuning edits no test. Tests that need a treasure outcome look its roll up with `CONFIG.treasure.table.indexOf(outcome)`.
- Browser suites gate on `describe.runIf(process.env.BROWSER === '1')`; emulator suites on `describe.runIf(process.env.EMULATOR === '1')`. Run browser tests also with `GITHUB_PAGES_BASE=/warbanners/`.
- `npm test`, `npm run typecheck` and `npm run lint` are clean at every commit. `npm run test:browser` is clean at every commit touching `src/ui`, `src/app` or the build (`hud.test.tsx` reads `dist`, so build first in a fresh shell). `npm run test:emu` is clean at every commit touching `src/net`, `src/online` or `database.rules.json`, and once more at close-out.
- ClaudeComputer runs short of memory: one emulator suite at a time, simulations with `--jobs 3`, never leave `npm run emu` or a dev server running after a step.
- `node_modules` in this worktree is a symlink to the main tree's. Never run `npm install` or `npm ci`.
- Work on branch `plan-5-heroes` in `/home/claude/projects/banners/.worktrees/heroes`. Stage files by name (never `git add -A`); the `git ls-files` guards only see staged or committed files. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push: the controller merges and pushes after the final review.
- Deploy rule (`CLAUDE.md`): the `RULES_VERSION` 4 deploy happens only when no online match is being played, because a 0.3.1 phone and a 0.4.0 phone cannot continue the same match. The controller checks with David before the push.

## Review Focus

1. **A unit crosses two thresholds in one action, or crosses one while already at three traits.** A kill that is also a counter survived adds to fight and survive at once: both traits are granted in deed order (fight, march, survive, rest) up to the cap of 3, never a fourth, and a relic on a unit holding 3 traits (or on a Camp) gives gold instead. Pinned in Task 3 (`two traits from one attack`, `never a fourth trait`) and Task 5 (`a relic on a full unit is gold`).
2. **Fierce raises maximum health, and every cap must follow.** A Fierce Warrior heals to 12, not 10, by resting and by a Piper's heal; the health factor in combat, the AI's health share, the unit panel's `12/12` and the board's pips all read `maxHpOf`. Pinned in Task 4 (`fierce heals to its new maximum`), Task 6 (`assess reads maxHpOf`), Task 9 (panel) and Task 10 (pips).
3. **Deeds are private, traits are public, and the fog still holds.** The other player (and the AI playing them) sees an enemy unit's traits, hero mark and carried draught, never its deed counts: `playerView` zeroes enemy `deeds` and shares no object with the match, the enemy unit panel shows no progress, its myth touch line is worked out from what the viewer can see (so it never betrays a fogged or hidden hero beside it), and the digest never reports the other side's progress. Pinned in Task 3 (`playerView hides enemy deeds`, `playerView shares no object with the match`), Task 6 (`AiInput carries no enemy deeds`) and Task 9 (`enemy panel shows traits, no deeds`, `myth touch never names an unseen hero`).
4. **Rules 3 meets rules 4.** A solo save made on 0.3.1 lists as "From an older version" and cannot be continued; an online room made on rules 3 opened on 0.4.0 shows the older-version message and is left untouched; a rules 4 action (`useItem`) is a canonical string under 512 characters that the wire and the database rules accept like any other. An offline Continue on a room cached under rules 3 still says it needs a connection rather than showing a board this build cannot play. Pinned in Task 2 (`an offline Continue on a rules 3 cache still says needsConnection`), Task 3 (`a rules 3 save is not resumable`), Task 5 (`useItem encodes and decodes`) and the close-out's `test:emu` run.
5. **Treasure outcomes that cannot happen as drawn.** A sellsword or warrior with no free neighbour, a draught for a unit already carrying one (or one that cannot attack), a map when every other treasure is already explored or claimed: each falls back to its named outcome (gold, gold, gold, explore) and the event names what was actually given. A draught's unit that dies loses it; drinking on a siege unit that has moved is refused because it could not attack anyway. Pinned in Task 5.

---

## Rulings

Every design question the spec leaves to the builder, decided here. Each line says why. Task-local rulings appear again in the task they bind.

Process

- Ruling: the online half of `src/app/store.ts` moves to `src/app/onlineStore.ts` as Task 1, before any hero UI touches the store, because plan 4's review asked for it before plan 5 and the hero work adds to the same file.
- Ruling: three plan 4 follow-ups marked **Plan 5** are built in Task 2 (the chunked rebuild after a lost race, a page-visible wake trigger, an offline Continue that shows the cached board), because each is small, sits in code Task 1 has just opened, and leaves online play sturdier for the rules 4 release.
- Ruling: the follow-up "five `refused` in a row end as `serverOutOfDate`" is left as is, because five taken codes in a row out of 32^6 is effectively impossible, so five refusals do mean the deployed rules refused the create, which is what the message says.
- Ruling: `tapTile`'s four copies in `src/browser` are replaced by the one in `src/browser/harness.ts` in Task 11, the task that adds a browser test, so the helper is shared before a fifth copy appears.
- Ruling: the follow-ups that need real phones (the iPhone install and seat takeover, a full match on two phones, airplane mode on the Pixel) are the controller's close-out checks, not tasks.
- Ruling: tasks run one at a time in this worktree in the order given, because Tasks 3 to 8 repin the same fingerprint and share `src/engine/data/config.ts`.
- Ruling: the plan review's Minors 2 and 11 confirm the plan (the `useItem` wire string and Task 4's worked numbers) and need no change; every other Minor is taken.

Heroes

- Ruling: four deeds, each earning exactly one trait: fight gives **Fierce**, march gives **Tireless**, survive gives **Hardy**, rest gives **Watchful**. One trait per deed means a unit needs three different kinds of life to fill its three slots, so two veterans differ (spec 5.8).
- Ruling: at most 3 traits (`maxTraits: 3`); hero status at 2 (`heroAt: 2`), because the spec says "two or three" and "a couple", and a third trait is then the reward for a hero that lives on.
- Ruling: fight points are +1 for every attack the unit makes and +2 more for every unit it kills (its target, a splashed unit, or an attacker its counter kills). The spec says kills build it; counting attacks too lets a unit that fights well but finishes few still get there, slower.
- Ruling: march points are the hex distance of each move action the unit makes itself (`distance(from, to)`); being lured or stepping into a killed unit's tile earns nothing, because it did not march there.
- Ruling: survive points are +1 for every hit the unit lives through (as a target, from a counter-attack, or from splash) and +1 for every heal ability that raises its health; resting never counts here, so one heal is never counted twice and "repeatedly hurt and healed" means hurt more than once (controller's ruling on review I9).
- Ruling: rest points are +1 at the start of each of its owner's turns when the unit rested (did nothing on the previous turn) and resting actually raised its health, because the spec's deed is "holds still and recovers", not merely holds still, so a garrison at full health earns nothing (review I9).
- Ruling: survive and rest do not count while a unit is fresh (from its spawn until its owner's next turn starts), so a unit trained or found last turn does not start its story by sitting still (review I9).
- Ruling: first-draft thresholds (tuned in Task 8): fight 6 (agoge 4), march 15 (agoge 10), survive 5 (agoge 4), rest 5 (agoge 4). With the stricter counting, a Hoplite hit once for 5 that rests to full in two turns has survive 1 and rest 2: no trait. Earning Hardy or Watchful takes several wounds, so a hero still takes real play.
- Ruling: deed totals keep counting after their trait is earned and are never reset, and `heroTraits` is ordered by when each was earned, so stage 6 can carry a hero over with its whole story. Nothing reads the totals past the threshold in stage 2.
- Ruling: when one action takes a unit past several thresholds, traits are granted in deed order (fight, march, survive, rest) until the cap, so the result never depends on event order.
- Ruling: the Camp cannot earn traits (it never fights and a hero yurt makes no sense). Every other unit, champions and supports included, can.
- Ruling: trait sizes (first draft, tuned in Task 8): Fierce +1 attack and +2 maximum health (the 2 is healed at once); Tireless +1 movement; Hardy +1 defence; Watchful +1 sight and agility. Each is a single small edge (spec: "a hero is worth protecting and never decides a match alone").
- Ruling: agility means a counter-attack against the unit deals 1 less damage, never below 1 (`agilityCut: 1`). It is a flat cut with the same floor as all damage, so combat stays deterministic and the effect reads in one sentence; 1, not 2, because most counters are 2 to 5 and a cut of 2 would halve them, more than Hardy's +1 defence gives (review Minor 22).
- Ruling: Tireless stays +1 movement for every unit in the first draft, though it doubles a foot unit's move and gives a Mongol Knight 5 tiles; Task 8 watches it (review Minor 23).
- Ruling: trait effects apply from the moment they are earned; Tireless shows up in the next turn's movement (movement is set when a turn starts), Fierce's health at once.
- Ruling: the agoge is a second, lower threshold table for Spartan units (`agogeThresholds`), not a multiplier, so the numbers are plain to read in the rules doc and to tune.
- Ruling: myth touch is a Spartan faction rule: a Spartan hero next to another Spartan hero has +1 attack and +1 defence, not more for more heroes. It reads "two heroes fighting side by side strengthen each other" literally and stays small.
- Ruling: deeds are private and traits are public: `playerView` zeroes the `deeds` of units the viewer does not own; traits, hero status and a carried item stay visible, because the spec gives the hero a mark every player can see and calls each trait a visible edge, while deeds are tracked "quietly".
- Ruling: the board shows a hero mark only at hero status; a unit with one trait looks like any other on the board and shows its trait in its panel, so the mark keeps its meaning.

Treasures

- Ruling: the map keeps 4 treasure sites (2 per half); stage 2 widens what a site holds, not how many there are, so map generation, the seed 7 browser facts and the rules 3 provenance check stay valid.
- Ruling: a claim draws one of seven equally likely outcomes, in this order: `gold`, `explore`, `unit`, `relic`, `draught`, `map`, `mercenary` (`rngInt(7)`). Equal weights are the simplest fair draw; Task 8 may reweight by repeating entries.
- Ruling: the relic grants the claiming unit one trait it lacks, drawn with a second `rngInt` over the traits it does not hold, in trait order; a unit that holds 3 traits, or a Camp, gets the gold outcome instead.
- Ruling: the one-use ability is the **Battle draught**: the claiming unit carries it (`item: 'draught'`) and may drink it once, on any later turn of its owner's, for one more attack that turn. It is deterministic, one sentence long, and its value is easy to see (finish a wounded enemy, strike twice from a held line). The rules doc calls it "a one-use ability found in a treasure", never an item to buy, so it cannot be read as the "consumable items" spec section 3 rules out (review Minor 24).
- Ruling: drinking is its own action (`{ type: 'useItem'; unit }`) that uses nothing and does not count as acting, so a unit that drinks and then rests still earns its rest. It is refused for a fresh unit, a unit with nothing to drink, a unit with attack 0 or range 0, and a siege unit that has moved.
- Ruling: a draught goes only to a unit that can attack and carries nothing; otherwise the claim gives gold. One item per unit, carried until drunk or the unit dies.
- Ruling: the map explores every tile within 1 of the nearest other treasure site its owner has not explored (distance from the claimer, then key order), so the next target is plain on the board; with no such site it gives the explore outcome.
- Ruling: the wandering mercenary is the **Sellsword**, a new unit type (attack 5, defence 3, range 1, movement 1, health 15, sight 1, no cost, no faction) that appears beside the claimer like the free Warrior, arrives already Tireless (it has wandered far), and counts against no city. A whole neutral roaming unit with its own turns is stage 4 material (it is half of a cannibal camp).
- Ruling: carried items show to every player, like traits, so there is no new hidden information to hide from views, digests or effects.
- Ruling: Task 5 adds the Sellsword with a placeholder figure (the Warrior's drawing plus one extra shape, so the "each different" art tests still hold) and a plain text entry so every `Record<UnitTypeId, ...>` typechecks; Task 10 draws its own figure.

Versions, online and saves

- Ruling: `RULES_VERSION` goes to 4 in Task 3, the first change to `MatchState`'s shape, and `FINGERPRINT[4]` is repinned by each later task that changes play, because the version is unreleased until the merge (the same as plan 3's ruling 26).
- Ruling: the fingerprint's change is proven to come only from plan 5 by two tests over a fixture recorded at the base commit before any engine edit (the fingerprint playout, every hash, and the three `speed.test.ts` playouts, hashes after each `endTurn`): `src/engine/stage1.dormant.test.ts` switches stage 2 off through `CONFIG` alone (thresholds `Infinity`, the treasure table `['gold', 'explore', 'unit']`, which is stage 1's `rngInt(3)` draw with the same mapping) and demands every recorded hash, end to end, with plan 5's fields stripped; `src/engine/stage1.test.ts` keeps the real numbers and checks every action up to the first `treasure` or `heroTrait` event (about 26 of 400 on the fingerprint playout, by the review's count). The dormant test is the strong one, since the fingerprint playout alone barely fights (review I1, controller's ruling). The controller also checks at close-out that `git diff 34b6351 --stat -- src/engine` names only files this plan lists.
- Ruling: rules 3 solo saves are not migrated: they list as "From an older version" (plan 2's design, as for rules 2 and 3), and an unfinished rules 3 online match cannot be continued on 0.4.0. Hence the deploy rule in Global Constraints.
- Ruling: `database.rules.json` needs no change, and is not edited: it special-cases only the exact strings `{"type":"endTurn"}` and `{"type":"resign"}`, refuses any other action string that contains `player` or a backslash, and compares each seat's `rules` with the room's `meta/rulesVersion` as values (no literal version); `useItem` encodes as `{"type":"useItem","unit":3}` (27 characters), well under `MAX_ACTION_CHARS` (512), with neither. The fake Net mirrors the same rules, so it needs no change either. `npm run test:emu` is still run at close-out.
- Ruling: `APP_VERSION` becomes 0.4.0 (a minor: new rules and a new feature).
- Ruling: stage 2's rules and numbers go in a new `docs/rules/stage2-rules.md`; `stage1-rules.md` gains one line at its top and in sections 8 and 12 pointing to it, so stage 1 stays readable as the base game.

AI and tuning

- Ruling: the AI values a unit at its gold worth plus 3 per trait, plus 3 more for a hero, plus 2 for a carried draught (`unitValue`). The danger term scales with worth, so heroes are kept out of reach and enemy heroes are hit first, with no new behaviour code.
- Ruling: for the Spartan formation term two adjacent heroes bond like two Hoplites (weight 2), so the Spartan AI keeps heroes together and gets its myth touch.
- Ruling: the AI scores a drink together with the best attack it enables, as one option (the drink's probe, then each attack it opens, scored from before the drink to after that attack), so it drinks when the strike pays and keeps the draught otherwise. A drink scored alone loses the draught's worth and never sees the kill that follows, so a greedy planner would never drink (review I6, controller's ruling).
- Ruling: the hard AI's missing lure (plan 3 carried item 2) is fixed by scoring a safe lure `LURE_EDGE = 0.001` above its plain twin, which breaks the tie the plan 3 review named without changing any other choice. It is pinned on a new `safeLure()` scenario, since `src/ai/scenarios.ts` only has the unsafe `lureFromCity` (review I7).
- Ruling: a two-trait Warrior is worth 11 to the AI against a Knight's 6, and danger scales with worth, so AI heroes may hang back; that pulls against the stall target, and Task 8 watches it rather than this plan guessing a smaller worth (review Minor 17).
- Ruling: the treasure objective's value rises from 6 to 9, since a site now holds more than a few gold.
- Ruling: the first-seat edge (plan 3 carried item 1) is measured in Task 8 and reported, not fixed, because the only lever (the second seat's start gold) is a stage 1 number that would break the rules 3 provenance check, and on fresh seeds the first seat was already inside its 42% to 58% band (50.0%).
- Ruling: long matches and stalls (carried item 3) are measured in Task 8 with AI weights as the only levers besides the stage 2 numbers; a target missed is carried, not chased past the run budget.

Screens

- Ruling: the unit panel shows deed progress (a bar and `3/6` per deed whose trait is not yet earned) only to the unit's owner, and only while the unit can still earn a trait.
- Ruling: a draught is not counted by Next unit or the "units to act" line, since drinking alone does nothing; the unit is counted only by what it can do after.
- Ruling: the unit panel's myth touch line is worked out on the viewer's believed state (`believedState(aiInputFor(state, viewer))`, the state `offered` already uses), never the whole match, so an enemy hero's line never reveals a fogged or hidden hero beside it (review I8, controller's ruling).
- Ruling: the digest tells the viewer when one of their units earned a trait on the other side's turn ("Your Hoplite earned Hardy."), and only "Your Hoplite is now a hero." when that trait made it a hero, so a hero line is never doubled.
- Ruling: what's new is one static line on Home under the tagline, because the app has no help screen and a line costs nothing to read.

---

## File Structure

```
src/app/onlineStore.ts             new (Task 1): the online half of the store, moved out of store.ts
src/app/store.ts                   loses its online half; wires onlineStore in (Task 1); offline Continue (Task 2)
src/online/session.ts, sync.ts     chunked rebuild after a lost race; wake() for a page made visible (Task 2)
src/engine/types.ts                DeedId, HeroTraitId, Deeds, ItemId, TreasureOutcome; Unit fields; events; useItem; sellsword
src/engine/heroes.ts               new (Tasks 3, 4): deeds, thresholds, traits, stat helpers, myth touch
src/engine/data/config.ts          CONFIG.heroes (Tasks 3, 4), CONFIG.treasure.table (Task 5)
src/engine/data/factions.ts        agoge, mythTouch flags (Tasks 3, 4)
src/engine/data/units.ts           sellsword row (Task 5)
src/engine/combat.ts, movement.ts, turn.ts, abilities.ts, vision.ts, state.ts   deed hooks and trait effects
src/engine/capture.ts              the seven treasure outcomes (Task 5)
src/engine/items.ts                new (Task 5): canUseItem, useItemHandler
src/engine/apply.ts, index.ts      register useItem, list it, export the new functions
src/engine/stage1.fixture.json     new (Task 3): the rules 3 fingerprint and speed playouts, recorded at the base commit
src/engine/stage1.test.ts          new (Task 3): the recording, the fixture's own check and the real-numbers prefix check
src/engine/stage1.dormant.test.ts  new (Task 3): every recorded playout end to end with stage 2 switched off through CONFIG
src/engine/heroes.test.ts, items.test.ts, treasure.test.ts   new
src/ai/assess.ts, plan.ts, adapt.ts                          hero worth, draughts, lure tie-break (Task 6)
src/ai/sim.ts, scripts/simai.ts                               hero and treasure metrics (Task 7)
src/ui/text.ts, panels/UnitPanel.tsx, panels/commands.ts, interaction.ts, board/effects.ts, sound.ts, screens/Match.tsx, screens/Home.tsx
src/app/digest.ts                  trait and hero lines (Task 9)
src/ui/art/hero.tsx                new (Task 10): HeroMark, ItemBadge
src/ui/art/units.tsx               the Sellsword figure (Task 10)
src/ui/board/Board.tsx             draws the mark and the badge (Task 10)
src/browser/heroes.test.ts         new (Task 11)
docs/rules/stage2-rules.md         new (Tasks 3 to 5, numbers final in Task 8)
docs/superpowers/plans/2026-11-20-plan-5-tuning-log.md       new (Task 8)
```

---

### Task 1: Move the online half of the store into `src/app/onlineStore.ts` (sonnet)

**Files:**
- Create: `src/app/onlineStore.ts`
- Modify: `src/app/store.ts`
- Test: `src/app/store.test.ts`, `src/app/store.online.test.ts` (both unedited)

**Interfaces:**
- Consumes: everything in `store.ts` under the `// ---- online ----` comment and the online fields of `AppState` (`mode`, `online`, `onlineList`, `inviteLink`, `openOnline`, `openJoin`, `createRoom`, `openRoom`, `joinAs`, `takeSeat`, `setLobby`, `startOnline`, `resignOnline`, `onlineBlocked`, `forgetRoom`, `updateForRoom`) and the state and helpers only they use (`acceptOnline`, `openSessionFor`, `closeSession`, `notReady`, `loadNet`, `net`, `netLoad`, `session`, `stepsSeen`, `acting`, `resignPending`, `built`, `recordOf`, `rememberHere`, `onView`, `sweep`, `seatOf`, `stepOf`, `ROOM_TRIES`, `setRoomInUrl`, `onlineLog`, `rememberedAs`, `listFailTold`, `createdHere`, `sessionGen`).
- Produces: `createOnlineSide(ctx: OnlineCtx): OnlineSide` in `onlineStore.ts`, where `OnlineCtx = { deps: Deps; get: () => AppState; set: (p: Partial<AppState>) => void; leave: (why?: Notice) => void; local: { nextSeq(): number; turnLog: () => TurnStep[]; resetTurnLog(): void; bumpAiRun(): void } }` (`nextSeq` because local `commit` and the online `onView` and `acceptOnline` all number `last.seq` from one counter; adjust the other `local` members to exactly what the moved code touches) and `OnlineSide` = the online members of `AppState` plus `acceptOnline(action: Action): void`, `closeSession(): void`, `sweep(): void` (called by the local `leave` and `goHome`) and `isOnline(): boolean` for the shared paths (`run`, `tap`, `goHome`). `createAppStore(deps)` and every exported name of `store.ts` (`Deps`, `Screen`, `Notice`, `Setup`, `SecondSeat`, `AppState`, `AI_STEP_MS`, `FIRST_THINK_MS`, `REPLAN_MS`, `soloSeat`, `browserDeps`) keep their signatures.

A pure move: no behaviour changes, no test edits. `store.ts` keeps local play, the shared paths and the wiring, and ends under 450 lines; `onlineStore.ts` holds the rest. `boundaries.test.ts` already lets `src/app` import `src/online` and only `import type` or dynamic `import('../net/...')` from `src/net`; the moved code keeps exactly the imports it had.

- [ ] **Step 1: Baseline.** Run `npm test -- src/app` and `npm run typecheck`. Record the test count. Expected: all pass.
- [ ] **Step 2: Move the code** into `onlineStore.ts` behind `createOnlineSide`, and spread its members into the object `createAppStore` returns.
- [ ] **Step 3: Run the same suites.** Run `npm test -- src/app`, `npm run typecheck`, `npm run lint`, `wc -l src/app/store.ts`. Expected: the same count passes, no test file changed (`git diff --stat -- '*.test.ts'` is empty), `store.ts` under 450 lines.
- [ ] **Step 4: Run the rest.** `npm test`, `npm run test:browser`, `npm run test:emu`. All pass.
- [ ] **Step 5: Commit**

```bash
git add src/app/onlineStore.ts src/app/store.ts
git commit -m "Move the online half of the app store into onlineStore.ts"
```

---

### Task 2: Online carry-overs from plan 4 (opus)

**Files:**
- Modify: `src/online/sync.ts`, `src/online/session.ts`, `src/app/onlineStore.ts`, `src/app/store.ts` (`browserDeps` only)
- Test: `src/online/sync.test.ts`, `src/online/session.test.ts`, `src/app/store.online.test.ts`

**Interfaces:**
- Consumes: `replay(settings, remote, claimed, pause, wanted)` and `REPLAY_CHUNK` in `sync.ts`; `follow(local, remote, head)`, `fullRebuild`; the session's `pause` dep, `SLEPT_MS`, its tick and return paths (`startReturn`, `lastTickAt`); `openRoom` and `notReady()` in `onlineStore.ts`.
- Produces: `Session.wake(): void` (new member of the `Session` interface); `Deps.onVisible?: (fn: () => void) => () => void` in `store.ts`, filled in `browserDeps()` from `document.addEventListener('visibilitychange', ...)` and called only from functions, never at module load.

Three changes, each with its tests written first:

1. **A rebuild after a lost race no longer replays synchronously.** Where `follow` answers `fullRebuild` (a list that does not extend ours), the session replays through the same chunked `replay` that `load()` uses, with `pause` between chunks, holding `verifying` true (so act, resign, the clock and AI seats wait, as during a load) and discarding the result if a newer reading arrived meanwhile. `follow` itself stays synchronous for the `same` and `advanced` cases.
2. **A page made visible counts as a wake.** `Session.wake()` runs the same path a tick gap over `SLEPT_MS` runs (the return before any clock decision). The online store calls it from `deps.onVisible` while a session is open and unsubscribes when it closes.
3. **An offline Continue shows the cached board.** In `openRoom`, when `notReady()` answers `'needsConnection'` and this phone holds a cache for the code that `readOnlineCache` restores (same rules version), the cached board is shown with the session opened as usual (it reports reconnecting until the connection is back), instead of the `needsConnection` notice. Without a cache, the notice stays.

- [ ] **Step 1: Write the failing tests.**

```ts
// session.test.ts
test('a rebuild after a lost race yields between chunks and blocks play while it runs', async () => {
  // a 3 * REPLAY_CHUNK action record; this phone's last write loses its index to a different action
  // expect: the injected pause is awaited at least 3 times before the rebuilt view is emitted,
  //         and view().myTurn is false (verifying) until it is
});
test('wake() runs the return before any clock decision, like a long tick gap', () => {
  // a turn past its deadline with this phone's presence stale-on: wake() must not enqueue endTurn before the return write lands
});
// store.online.test.ts
test('Continue with no connection shows the cached board, not needsConnection', () => { /* deps.online = () => false, a cached entry */ });
test('Continue with no connection and no cache still says needsConnection', () => { /* unchanged notice */ });
test('an offline Continue on a rules 3 cache still says needsConnection', () => { /* restore refuses the cache as another version: no board */ });
test('a visibilitychange to visible calls the open session wake once', () => { /* fake onVisible */ });
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/online src/app/store.online.test.ts`. Expected: the new tests fail (`wake` is not a function, pause count 0, notice `needsConnection` for the cached board) except the two that pin the unchanged `needsConnection` cases, which pass already.
- [ ] **Step 3: Implement the three changes.**
- [ ] **Step 4: Run the suites.** `npm test`, `npm run typecheck`, `npm run lint`, then `npm run test:emu`, then `npm run test:browser` and `npm run test:online`. All pass.
- [ ] **Step 5: Commit**

```bash
git add src/online/sync.ts src/online/session.ts src/online/sync.test.ts src/online/session.test.ts src/app/onlineStore.ts src/app/store.ts src/app/store.online.test.ts
git commit -m "Online: chunked rebuild after a lost race, wake on a visible page, offline Continue shows the cached board"
```

---

### Task 3: Deeds and earned traits in the engine, rules version 4 (sonnet)

**Files:**
- Create: `src/engine/heroes.ts`, `src/engine/heroes.test.ts`, `src/engine/stage1.test.ts`, `src/engine/stage1.dormant.test.ts`, `src/engine/stage1.fixture.json`, `docs/rules/stage2-rules.md`
- Modify: `src/engine/types.ts`, `src/engine/data/config.ts`, `src/engine/data/factions.ts`, `src/engine/state.ts`, `src/engine/combat.ts`, `src/engine/movement.ts`, `src/engine/turn.ts`, `src/engine/abilities.ts`, `src/engine/vision.ts`, `src/engine/vision.test.ts`, `src/engine/testkit.ts` (Step 1 only: `randomPlayoutLog`), `src/engine/index.ts`, `src/engine/fingerprint.test.ts`, `src/engine/speed.test.ts`, `src/engine/turn.test.ts` (its hand-built `Unit` literals), `src/ai/plan.test.ts` (the 25-unit position comment, if repicked), `src/app/saves.test.ts`, `docs/rules/stage1-rules.md` (pointer line at the top)

**Interfaces:**
- Consumes: `spawnUnit`, `hasTrait`, `removeUnit` (`state.ts`); `attackHandler` (`combat.ts`); `moveHandler` (`movement.ts`); `passTurn` and `restHealAt` (`turn.ts`); `abilityHandler` (`abilities.ts`); `playerView` (`vision.ts`); `randomPlayout`, `blankMatch`, `addUnit`, `addCity`, `must` (`testkit.ts`); the `NESTED` guard and the "playerView shares no object with the match" test in `vision.test.ts`.
- Produces for the tests: `randomPlayoutLog(seed: number, playerTurns: number): { state: MatchState; actions: Action[] }` in `testkit.ts`, the same playout as `randomPlayout` (which becomes `randomPlayoutLog(...).state`), added in Step 1 before any rules change.
- Produces (all exported from `src/engine/index.ts`):
  - `types.ts`: `RULES_VERSION = 4`; `type DeedId = 'fight' | 'march' | 'survive' | 'rest'`; `const DEEDS: readonly DeedId[] = ['fight', 'march', 'survive', 'rest']`; `type HeroTraitId = 'fierce' | 'tireless' | 'hardy' | 'watchful'`; `const HERO_TRAITS: readonly HeroTraitId[] = ['fierce', 'tireless', 'hardy', 'watchful']`; `type Deeds = Record<DeedId, number>`; `type ItemId = 'draught'`; `Unit` gains `deeds: Deeds; heroTraits: HeroTraitId[]; item: ItemId | null`; `GameEvent` gains `{ type: 'heroTrait'; unit: number; trait: HeroTraitId; hero: boolean }` (`hero` is true when this trait brought the unit to `heroAt`).
  - `heroes.ts`: `freshDeeds(): Deeds`; `thresholdOf(s: MatchState, u: Unit, deed: DeedId): number`; `canEarnTraits(u: Unit): boolean`; `isHero(u: Unit): boolean`; `addDeed(s: MatchState, u: Unit, deed: DeedId, points: number, ev: GameEvent[]): void`; `grantTrait(s: MatchState, u: Unit, trait: HeroTraitId, ev: GameEvent[]): boolean` (false when held, at the cap, or the unit cannot earn).
  - `CONFIG.heroes = { traitFor: { fight: 'fierce', march: 'tireless', survive: 'hardy', rest: 'watchful' }, fightPerAttack: 1, fightPerKill: 2, thresholds: { fight: 6, march: 15, survive: 5, rest: 5 }, agogeThresholds: { fight: 4, march: 10, survive: 4, rest: 4 }, maxTraits: 3, heroAt: 2 }`. Its `satisfies` type allows `number` thresholds (the dormant test sets `Infinity`).
  - `FactionDef.agoge: boolean` (spartans true, mongols false).

Rules this task builds (Rulings: Heroes):

- `spawnUnit` sets `deeds: freshDeeds()` (all 0), `heroTraits: []`, `item: null`.
- `addDeed` adds the points, then, for that deed, if the unit can earn traits, holds fewer than `maxTraits` and lacks the deed's trait, and the total has reached `thresholdOf`, calls `grantTrait`. `thresholdOf` reads `agogeThresholds` when the owner's faction has `agoge`, else `thresholds`. `canEarnTraits` is false only for a unit with the `camp` trait. Deeds are added even for a Camp (totals are its story); only traits are withheld.
- `grantTrait` appends the trait and pushes `heroTrait` with `hero: heroTraits.length === heroAt`. (Task 4 adds Fierce's health here.)
- Combat (`attackHandler`), after damage, splash and counter are resolved and dead units removed, in this order: the attacker, if alive, gets `fightPerAttack`, plus `fightPerKill` for each unit the attack killed (target and splash); then survive +1 to the target if it lived, then to each splashed unit that lived (in `s.units` order), then to the attacker if it took a counter and lived; then, if the counter killed the attacker, `fightPerKill` to the target. Today the handler returns early (`return null`) when the counter kills the attacker; restructure that branch so the defender's credit is still given before returning. Survive is skipped for a unit that is `fresh`.
- Movement (`moveHandler`): march `distance(from, to)` to the mover. Lures and the melee advance add nothing.
- Turn start (`passTurn`, the block that heals rested units, which runs only when `turnsTaken > 0`): for each of the new player's rested units in `s.units` order that is not `fresh` (checked before freshness is cleared), rest +1 if its health rose. Resting never adds survive. Heal ability (`abilityHandler`): survive +1 to the target if its health rose and it is not `fresh`.
- `playerView`: units the viewer does not own are copied with `deeds: freshDeeds()`; own units with `deeds: { ...u.deeds }`; every unit with `heroTraits: [...u.heroTraits]` and its `item`. No object is shared with the match: widen `vision.test.ts`'s `NESTED` guard from `'lure'` to `'lure' | 'deeds' | 'heroTraits'` and fill both fields in the setup of its "playerView shares no object with the match" test.
- `RULES_VERSION` 4.

- [ ] **Step 1: Record the rules 3 fixture before touching the rules.** Add `randomPlayoutLog` to `testkit.ts` (Produces above; `randomPlayout` keeps its signature and results). Write `src/engine/stage1.test.ts` (with `/// <reference types="node" />` at the top, as `purity.test.ts` has, since it uses `node:fs`) with two tests. The first, `test.runIf(process.env.RECORD_STAGE1 === '1')('record the rules 3 playouts', ...)`, writes `src/engine/stage1.fixture.json` as `{ "fingerprint": { "actions": Action[], "hashes": string[] }, "playouts": { "seed": number, "turns": number, "actions": Action[], "hashes": Record<number, string> }[] }`: `fingerprint` is the fingerprint playout (seed 42, Spartans and Mongols, at most 400 steps, `legal[(i * 7) % legal.length]` of `legalActions(s).filter(a => a.type !== 'resign')`, stopping at a winner) with `hashes[i]` the `hashState` after `actions[i]`; `playouts` are the three `speed.test.ts` playouts (`randomPlayoutLog(7, 160)`, `(1, 200)`, `(3, 90)`) with a hash only after each `endTurn`, keyed by action index, to keep the file to a few hundred KB. The second, always run, reads the fixture and checks the last hash of each: `'ba3e0e466edfedd3'` (rules 3's fingerprint) for the fingerprint playout, and the state digests `speed.test.ts` pins today for the three playouts: `'9e8f2b190371ac46'` (seed 7), `'ae927f4d0a90590c'` (seed 1), `'ec1d2740c2ea62f1'` (seed 3) (the last element of each row; the review quoted the legal digests by mistake). If a playout's last action is not an `endTurn`, also record the hash after its last action. Run `RECORD_STAGE1=1 npx vitest run src/engine/stage1.test.ts` on the unchanged rules, then `npx vitest run src/engine/stage1.test.ts` (passes), then `git add src/engine/testkit.ts src/engine/stage1.fixture.json src/engine/stage1.test.ts` and commit ("Record the rules 3 playouts for the stage 2 provenance checks").
- [ ] **Step 2: Write the two provenance tests.** Both strip what plan 5 adds with the same four-line `stage1Shape`, written into each file (an engine non-test file should not exist only for tests).

```ts
// Strip what plan 5 added, so a stage 1 state hashes as it did on rules 3.
function stage1Shape(s: MatchState): unknown {
  return { ...s, rulesVersion: 3, units: s.units.map(({ deeds: _d, heroTraits: _h, item: _i, ...rest }) => rest) };
}
```

The real-numbers prefix test, a third test in `stage1.test.ts` (cheap, and it proves deed counting changes nothing before stage 2 first acts):

```ts
test('until stage 2 first changes an outcome, rules 4 plays the rules 3 playout exactly', () => {
  const { actions, hashes } = JSON.parse(readFileSync(new URL('./stage1.fixture.json', import.meta.url), 'utf8')).fingerprint;
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  let matched = 0;
  for (let i = 0; i < actions.length; i++) {
    const r = applyAction(s, actions[i]);
    expect(r.ok, `action ${i}`).toBe(true);
    if (!r.ok) return;
    if (r.events.some((e) => e.type === 'treasure' || e.type === 'heroTrait')) break;
    expect(hashState(stage1Shape(r.state) as MatchState), `after action ${i}`).toBe(hashes[i]);
    s = r.state; matched = i + 1;
  }
  expect(matched).toBeGreaterThan(0);
  console.info(`stage 1 provenance: ${matched} of ${actions.length} actions identical`);
}, 30_000);
```

The dormant test, `src/engine/stage1.dormant.test.ts`, in its own file because `vi.mock` binds a whole file (vitest isolates files by default). `CONFIG` is deep-frozen, so the factory builds new objects:

```ts
vi.mock('./data/config', async (orig) => {
  const m = await orig<typeof import('./data/config')>();
  const off = { fight: Infinity, march: Infinity, survive: Infinity, rest: Infinity };
  return { CONFIG: { ...m.CONFIG,
    heroes: { ...m.CONFIG.heroes, thresholds: off, agogeThresholds: off },
    treasure: { ...m.CONFIG.treasure, table: ['gold', 'explore', 'unit'] } } };
});
test('with stage 2 switched off, rules 4 replays the rules 3 fingerprint playout hash for hash', () => {
  // every action accepted; hashState(stage1Shape(state)) === fingerprint.hashes[i] after every action; last is 'ba3e0e466edfedd3'
});
test.each([7, 1, 3])('with stage 2 switched off, the seed %i speed playout replays hash for hash', (seed) => {
  // replay its actions from createMatch({ seed, factions: ['spartans', 'mongols'] }); compare at every recorded index
});
```

Until Task 5 exists, `CONFIG.treasure.table` is not read; the mock sets it anyway so the file needs no edit later. (Task 3's engine still draws `rngInt(CONFIG.treasure.outcomes)`, which is 3.)

- [ ] **Step 3: Write the failing hero tests** in `heroes.test.ts` (use `blankMatch`, `addUnit`, `addCity`, `must`; set deed totals with the `addUnit` patch, from `thresholdOf` as Global Constraints say; for turn-start tests set the owner's `turnsTaken: 1` and give it a city whose territory holds the unit, since `passTurn` heals and counts only when `turnsTaken > 0`):

```ts
test('a new unit starts with no deeds, no traits and nothing carried', () => { /* spawnUnit fields */ });
test('fight: one attack, and a kill', () => { /* Warrior on Warrior: fight === fightPerAttack; Knight kills Warrior: fightPerAttack + fightPerKill */ });
test('survive: a target that lives, and an attacker that lives through a counter', () => { /* Warrior on Warrior: both survive === 1 */ });
test('a fresh unit hit and alive earns no survive', () => {});
test('a counter that kills the attacker is a kill for the defender', () => { /* attacker at 1 hp: defender.deeds.fight === fightPerKill */ });
test('march counts the distance of each own move, not lures or advances', () => { /* Horseman moves 2 tiles: march 2; lured target: 0; melee advance: 0 */ });
test('rest counts only a rest that heals, and never adds survive', () => { /* hp 5 in own territory: rest 1, survive 0; full health: rest 0 */ });
test('a unit trained last turn earns no rest on its first turn start', () => { /* fresh, hurt by hand: rest 0 */ });
test('a heal ability counts survive for its target', () => {});
test('the threshold grants the trait with an event', () => { /* Warrior fight thresholdOf - 1, attack: heroTraits ['fierce'], event { type: 'heroTrait', unit, trait: 'fierce', hero: false } */ });
test('Spartans earn from the agoge table', () => { /* Spartan Hoplite and Mongol Horseman both at agogeThresholds.fight - 1, attack: only the Hoplite gains fierce */ });
test('the second trait makes a hero', () => { /* heroTraits ['fierce'], survive at threshold - 1, survives a hit: hero true; isHero true */ });
test('two traits from one attack, in deed order', () => { /* fight and survive at threshold - 1, attacks and survives the counter: ['fierce', 'hardy'], two events in that order */ });
test('never a fourth trait', () => { /* heroTraits ['fierce', 'tireless', 'hardy'], hurt, rest at threshold - 1, rests and heals: still those three, no event */ });
test('a Camp counts deeds but earns no trait', () => {});
test('deeds keep counting after their trait', () => { /* fierce held, attack: fight rises, no event */ });
test('playerView hides enemy deeds but shows traits and items', () => {
  // unit of player 1 with deeds.fight 4, heroTraits ['hardy'], item 'draught': playerView(s, 0) shows deeds all 0, ['hardy'], 'draught';
  // playerView(s, 1) shows fight 4
});
// vision.test.ts: the existing "playerView shares no object with the match" test, now with deeds and heroTraits filled in
```

```ts
// saves.test.ts
test('a rules 3 save is not resumable', () => { /* a stored record with rulesVersion 3 lists with resumable false */ });
```

- [ ] **Step 4: Run them and see them fail.** Run: `npx vitest run src/engine/heroes.test.ts src/engine/stage1.test.ts src/engine/stage1.dormant.test.ts src/app/saves.test.ts`. Expected: the hero tests fail (`deeds` undefined); both provenance tests pass on the unchanged rules with every action matched (there is nothing to strip yet), which proves the checks themselves; the saves test passes already, since it pins behaviour that must survive the bump.
- [ ] **Step 5: Implement** the types, `CONFIG.heroes`, `FACTIONS.agoge`, `heroes.ts`, the hooks, the view change and the exports. Bump `RULES_VERSION` to 4.
- [ ] **Step 6: Repin.** Run both provenance tests first: both pass, and the prefix test prints its length; note it in the commit message. Then run the fingerprint test, put the received hash in `FINGERPRINT[4]` (keep 2 and 3), and repin the three `speed.test.ts` rows. Traits now change play inside `randomPlayout` (a Tireless unit moves farther), so the digests and counts may move either way; repick the 25-unit position if it no longer holds 25 units (Global Constraints). Update the comment above the rows to name rules 4.
- [ ] **Step 7: Write the rules.** `docs/rules/stage2-rules.md`: a header in the style of stage 1's ("draft numbers, tuned in plan 5 Task 8; the data files win"), section 1 Deeds (the four deeds and exactly how each counts, that survive and rest skip a fresh unit, that resting never counts as surviving, the order), section 2 Traits (which deed gives which, thresholds table with the agoge column, the cap, hero status, deed order on ties, the Camp, totals never reset), section 3 Visibility (deeds private, traits and items public). `stage1-rules.md` gains at the top: "Stage 2 (heroes and treasures) adds to these rules: see `stage2-rules.md`."
- [ ] **Step 8: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`. All pass. The only hand-built `Unit` literals are in `turn.test.ts`; give them the three new fields.
- [ ] **Step 9: Commit**

```bash
git add src/engine/types.ts src/engine/heroes.ts src/engine/heroes.test.ts src/engine/stage1.test.ts src/engine/stage1.dormant.test.ts src/engine/data/config.ts src/engine/data/factions.ts src/engine/state.ts src/engine/combat.ts src/engine/movement.ts src/engine/turn.ts src/engine/turn.test.ts src/engine/abilities.ts src/engine/vision.ts src/engine/vision.test.ts src/engine/index.ts src/engine/fingerprint.test.ts src/engine/speed.test.ts src/app/saves.test.ts docs/rules/stage2-rules.md docs/rules/stage1-rules.md
git commit -m "Units count their deeds and earn traits; rules version 4"
```

(Add any other file the typecheck made you touch, by name.)

---

### Task 4: What traits do, the agility cut and myth touch (sonnet)

**Files:**
- Modify: `src/engine/heroes.ts`, `src/engine/data/config.ts`, `src/engine/data/factions.ts`, `src/engine/combat.ts`, `src/engine/movement.ts`, `src/engine/vision.ts`, `src/engine/turn.ts`, `src/engine/abilities.ts`, `src/engine/index.ts`, `src/engine/fingerprint.test.ts`, `src/engine/speed.test.ts`, `src/engine/soak.test.ts` (`checkInvariants` caps health at `maxHpOf(u)`, not `UNITS[u.type].hp`, since a Fierce unit stands at 12 of 12), `docs/rules/stage2-rules.md`
- Test: `src/engine/heroes.test.ts`, `src/engine/combat.test.ts`, `src/engine/soak.test.ts`

**Interfaces:**
- Consumes: Task 3's `grantTrait`, `isHero`, `HeroTraitId`; `attackOf`, `defenceOf`, `damageFor` (`combat.ts`); `maxMp` (`movement.ts`); `unitSight` (`vision.ts`).
- Produces (exported from the index): `maxHpOf(u: Unit): number`; `baseAttackOf(u: Unit): number` (type attack plus Fierce, no neighbours); `mythTouched(s: MatchState, u: Unit): boolean`; `statsOf(s: MatchState, u: Unit): { atk: number; def: number; maxHp: number; move: number; sight: number; range: number }` (`move` in tiles, `maxMp / 2`, while `maxMp` stays in half-points; traits and the faction's mounted bonus, no neighbour bonuses: no inspire, phalanx or myth touch); `FactionDef.mythTouch: boolean` (spartans true). `CONFIG.heroes` gains `fierceAtk: 1, fierceHp: 2, tirelessMove: 1, hardyDef: 1, watchfulSight: 1, agilityCut: 1, mythAtk: 1, mythDef: 1`.

Effects:

- Fierce: `baseAttackOf` +`fierceAtk`; `maxHpOf` +`fierceHp`; `grantTrait('fierce')` also adds `fierceHp` to the unit's current health.
- Tireless: `maxMp` +`2 * tirelessMove` half-points.
- Hardy: `defenceOf` +`hardyDef`.
- Watchful: sight +`watchfulSight` (in `vision.ts`'s unit sight, so both `visibleTiles` and the mountain bonus stack); in `attackHandler`, a counter against a Watchful attacker is `Math.max(1, counter - agilityCut)` (only when there is a counter).
- Myth touch: `mythTouched(s, u)` is true when `u`'s owner's faction has `mythTouch`, `isHero(u)`, and another hero of the same owner stands next to it. `attackOf` adds `mythAtk` and `defenceOf` adds `mythDef` when it is true (once, whatever the number of hero neighbours).
- `attackOf` today returns early for a unit that is not mounted and `defenceOf` for one without `phalanx`: Fierce, Hardy and myth touch must be added before those returns, so every unit gets them.
- Every read of a unit's own maximum health in the engine goes through `maxHpOf`: the health factor in `combat.ts`, the heal filter and cap in `abilities.ts`, the rest cap in `turn.ts`. `UNITS[t].hp` stays the spawn health.

- [ ] **Step 1: Write the failing tests** (field, full health, `blankMatch`):

```ts
test('a Fierce Warrior hits a Warrior for 8 and takes a counter of 2', () => {});        // attack 5, health 12/12
test('a Warrior hits a Hardy Warrior for 5 and takes a counter of 2', () => {});
test('a Watchful Warrior takes 1 from a Warrior counter, not 2', () => {});
test('a Watchful Warrior takes 4 from a Spearman counter, not 5', () => {});
test('a counter cut by agility never goes below 1', () => { /* a counter of 1 stays 1 */ });
test('Tireless adds a tile of movement: Warrior 4 half-points, Mongol Horseman 8', () => {});
test('Watchful sees one tile farther, and one more on a mountain', () => {});
test('fierce heals to its new maximum', () => {
  // earned at hp 6/10 -> 8/12; a rested Fierce Warrior at 10/12 in own territory heals to 12; a Piper heal caps at 12
});
test('myth touch: two adjacent Spartan heroes +1 attack and +1 defence each, not for one hero alone', () => {
  // two hero Hoplites side by side, each holding tireless and watchful (no Fierce or Hardy, so the numbers are myth touch alone):
  // attackOf 5, defenceOf 7 (5 + 1 phalanx + 1 myth); three in a row: still +1 myth
});
test('Mongol heroes side by side get no myth touch', () => {});
test('statsOf a Fierce Tireless Mongol Horseman', () => { /* { atk: 5, def: 2, maxHp: 12, move: 4, sight: 2, range: 1 } */ });
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/engine/heroes.test.ts src/engine/combat.test.ts`. Expected: the new tests fail on unchanged numbers. The numbers above are worked at the first-draft sizes; write them from `CONFIG.heroes` where a size enters (Global Constraints), and keep the literal expected damage only in the rules doc's worked examples.
- [ ] **Step 3: Implement** the effects and `statsOf`, `maxHpOf`, `baseAttackOf`, `mythTouched`, and export them.
- [ ] **Step 4: Repin** (Global Constraints): both provenance tests pass first, then `FINGERPRINT[4]`, the speed rows and, if needed, the 25-unit position. Run `npx vitest run src/engine/soak.test.ts` too.
- [ ] **Step 5: Write the rules.** `stage2-rules.md` section 4 Trait effects: a table (trait, deed, effect, numbers), the agility formula next to stage 1's counter formula, myth touch, and worked examples (the six numeric cases from Step 1).
- [ ] **Step 6: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 7: Commit**

```bash
git add src/engine/heroes.ts src/engine/heroes.test.ts src/engine/combat.test.ts src/engine/soak.test.ts src/engine/data/config.ts src/engine/data/factions.ts src/engine/combat.ts src/engine/movement.ts src/engine/vision.ts src/engine/turn.ts src/engine/abilities.ts src/engine/index.ts src/engine/fingerprint.test.ts src/engine/speed.test.ts docs/rules/stage2-rules.md
git commit -m "Traits take effect: Fierce, Tireless, Hardy, Watchful with agility, and the Spartan myth touch"
```

---

### Task 5: Expanded treasures, the Sellsword and the Battle draught (sonnet)

**Files:**
- Create: `src/engine/items.ts`, `src/engine/items.test.ts`, `src/engine/treasure.test.ts`
- Modify: `src/engine/types.ts`, `src/engine/data/config.ts`, `src/engine/data/units.ts`, `src/engine/capture.ts`, `src/engine/apply.ts`, `src/engine/index.ts`, `src/engine/data/data.test.ts`, `src/engine/fingerprint.test.ts`, `src/engine/speed.test.ts`, `src/ui/text.ts` (placeholder `T.unit.sellsword`), `src/ui/art/units.tsx` (placeholder figure and `'sellsword'` in the `SharedFigure` union), `src/ui/art/units.test.tsx` (`'eight figures, each different'` becomes nine), `src/ui/art/factionUnits.test.tsx` (`'all sixteen unit types have a figure, each different'` becomes seventeen), `src/online/wire.test.ts`, `src/ai/plan.test.ts` (the 25-unit position comment, if repicked), `docs/rules/stage2-rules.md`, `docs/rules/stage1-rules.md` (sections 8 and 12 point to stage 2)

**Interfaces:**
- Consumes: `claimTreasureHandler`, `canClaimTreasure` (`capture.ts`); `firstFreeNeighbor`, `spawnUnit`, `tileAt` (`state.ts`); `rngInt`; `grantTrait`, `canEarnTraits`, `HERO_TRAITS` (Task 3); `attackTargets` (`combat.ts`); `encodeAction`/`decodeAction` in `src/online/wire.ts` (test only).
- Produces:
  - `types.ts`: `UnitTypeId` gains `'sellsword'`; `type TreasureOutcome = 'gold' | 'explore' | 'unit' | 'relic' | 'draught' | 'map' | 'mercenary'`; the `treasure` event becomes `{ type: 'treasure'; at: HexKey; outcome: TreasureOutcome; trait?: HeroTraitId; found?: HexKey; unit?: number }` (`trait` for a relic, `found` the treasure a map shows, `unit` the id of a spawned Warrior or Sellsword); `Action` gains `{ type: 'useItem'; unit: number }`; `GameEvent` gains `{ type: 'usedItem'; unit: number; item: ItemId }`.
  - `UNITS.sellsword = { atk: 5, def: 3, range: 1, move: 1, hp: 15, sight: 1, cost: null, tech: null, faction: null, traits: [] }`.
  - `CONFIG.treasure = { gold: 5, exploreRadius: 4, unit: 'warrior', table: ['gold', 'explore', 'unit', 'relic', 'draught', 'map', 'mercenary'], mapRadius: 1, mercenary: 'sellsword', mercenaryTrait: 'tireless' }` (`outcomes` removed; its `satisfies` type updated).
  - `items.ts`: `canUseItem(s: MatchState, unitId: number): boolean`; `useItemRefusal(s: MatchState, unitId: unknown): string | null` (reasons `'bad item use'`, `'no such unit'`, `'not your unit'`, `'nothing to use'`, `'unit is too new'`, `'cannot attack'`); `useItemHandler: Handler<Extract<Action, { type: 'useItem' }>>`. Exported from the index: `canUseItem`, `useItemRefusal`.

Rules (Rulings: Treasures):

- A claim draws `[roll, next] = rngInt(s.rng, CONFIG.treasure.table.length)` and takes `table[roll]`:
  - `gold`: +5 gold.
  - `explore`: every tile within 4 of the claimer explored (stage 1).
  - `unit`: a Warrior on `firstFreeNeighbor` (fresh, no home); none free: gold.
  - `relic`: if `canEarnTraits(u)` and fewer than `maxTraits`, the traits it lacks in `HERO_TRAITS` order, a second draw `rngInt` over their count, `grantTrait` of that one (event `trait`); otherwise gold, with no second draw. The second draw happens only when a trait is granted, so the rng order is: one draw per claim, plus one for a granted relic.
  - `draught`: if `u.item === null` and the unit has attack and range above 0, `u.item = 'draught'`; otherwise gold.
  - `map`: among tiles with `treasure: true` other than the claimer's, not in its owner's `explored`, the nearest by `distance` from the claimer, ties by key; explore every tile within `mapRadius` (1) of it (event `found`). None: the explore outcome.
  - `mercenary`: a Sellsword on `firstFreeNeighbor` (fresh, no home), then `grantTrait(sellsword, 'tireless')` (its own `heroTrait` event); none free: gold.
  - The event's `outcome` is what was actually given after any fallback. Stage 1's claim rules (who may claim, the whole turn, the tile cleared) are unchanged.
- `useItem`: refused unless the unit exists, is the current player's, has an item, is not fresh, has attack and range above 0, and is not a `siege` unit that has moved. Effect: `attacks += 1`, `item = null`, event `usedItem`. It does not set `acted` or `moved`.
- `legalActions` lists `{ type: 'useItem', unit }` right after the unit's `claimTreasure` entry when `canUseItem`.
- Placeholders so everything typechecks: `T.unit.sellsword = { name: 'Sellsword', blurb: 'A wandering fighter for hire who joins whoever finds it, already Tireless.' }`; `SHARED_FIGURES.sellsword` draws the Warrior figure plus one extra small shape (a rect), so it is distinct from every other figure and the "each different" tests hold (Task 10 replaces it). The AI's `trainOrder`s never name it (no cost).

- [ ] **Step 1: Write the failing tests.** In `treasure.test.ts`, fix the draw by setting `s.rng` to a value whose first draw gives the wanted outcome: the test file's helper `rngFor(outcome: TreasureOutcome): number` tries `rng = 1, 2, 3, ...` until `rngInt(rng, CONFIG.treasure.table.length)[0] === CONFIG.treasure.table.indexOf(outcome)`, so Task 8's reweighting breaks no test:

```ts
test.each(['gold', 'explore', 'unit', 'relic', 'draught', 'map', 'mercenary'])('a claim can give %s', (outcome) => {});
test('a relic grants a trait the unit lacks and names it', () => { /* unit holds fierce: trait is one of tireless, hardy, watchful; event.trait === the new trait */ });
test('a relic on a full unit is gold', () => {});
test('a relic on a Camp is gold', () => {});
test('a draught for a unit already carrying one is gold', () => {});
test('a draught for a unit that cannot attack is gold', () => { /* Camp */ });
test('a map explores around the nearest unexplored treasure and names it', () => { /* two other treasures, nearer one unexplored: found === nearer; its neighbours now explored */ });
test('a map with every other treasure explored is the explore outcome', () => {});
test('a sellsword arrives fresh, Tireless, counting against no city', () => { /* home null, heroTraits ['tireless'], fresh true, hp 15 */ });
test('a sellsword or warrior with no free neighbour is gold', () => {});
```

```ts
// items.test.ts
test('a draught gives one more attack this turn and is gone', () => { /* Warrior attacks, attacks 0; useItem: attacks 1, item null, event usedItem; attacks again */ });
test('drinking is refused for a fresh unit, an empty hand, a Camp and a siege unit that moved', () => { /* each reason */ });
test('drinking alone does not stop a unit resting', () => { /* useItem, endTurn: rested true */ });
test('legalActions lists useItem only when canUseItem', () => {});
test('a carried draught is lost with its unit', () => { /* unit dies: no unit, nothing left anywhere */ });
```

```ts
// data.test.ts: the Sellsword row; wire.test.ts:
test('useItem encodes and decodes as a canonical string', () => { /* encodeAction gives '{"type":"useItem","unit":3}'; decodeAction of it deep-equals the action; length < MAX_ACTION_CHARS */ });
// units.test.tsx: nine shared figures, each different; factionUnits.test.tsx: seventeen unit types, each different
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/engine src/online/wire.test.ts`. Expected: the new tests fail (no `useItem`, outcomes `gold`/`explore`/`unit` only).
- [ ] **Step 3: Implement** the outcomes, `items.ts`, the handler registration in `HANDLERS` and the listing, the placeholders and the exports.
- [ ] **Step 4: Repin** (Global Constraints). Every treasure claim inside `randomPlayout` now draws from seven outcomes, so the playouts diverge and the legal action counts and digests may move either way; the comment above the rows names traits and treasures as the reason. Repick the 25-unit position if needed.
- [ ] **Step 5: Write the rules.** `stage2-rules.md` section 5 Treasures (the table with each outcome, its fallback and the draw order), section 6 the Sellsword (its row in the stage 1 unit table's columns), section 7 the Battle draught, described as "a one-use ability found in a treasure" (the action, its refusals, that it is not acting). `stage1-rules.md` section 8 gets a line under the table ("The Sellsword joins only from a treasure: see stage 2") and section 12's treasure bullet ends with "Stage 2 replaces the draw: see `stage2-rules.md` section 5."
- [ ] **Step 6: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser` (the art placeholder touches `src/ui`).
- [ ] **Step 7: Commit**

```bash
git add src/engine/items.ts src/engine/items.test.ts src/engine/treasure.test.ts src/engine/types.ts src/engine/data/config.ts src/engine/data/units.ts src/engine/data/data.test.ts src/engine/capture.ts src/engine/apply.ts src/engine/index.ts src/engine/fingerprint.test.ts src/engine/speed.test.ts src/ui/text.ts src/ui/art/units.tsx src/ui/art/units.test.tsx src/ui/art/factionUnits.test.tsx src/online/wire.test.ts docs/rules/stage2-rules.md docs/rules/stage1-rules.md
git commit -m "Treasures can hold a relic, a battle draught, a map or a sellsword"
```

---

### Task 6: The AI values heroes, drinks draughts and lures on hard (opus)

**Files:**
- Modify: `src/ai/assess.ts`, `src/ai/plan.ts`, `src/ai/adapt.ts`
- Test: `src/ai/assess.test.ts`, `src/ai/plan.test.ts`, `src/ai/input.test.ts`, `src/ai/scenarios.ts` (new fixtures only: `safeLure()` and `draughtFinish()`)

**Interfaces:**
- Consumes (engine index): `maxHpOf`, `baseAttackOf`, `statsOf`, `isHero`, `canUseItem`, `FACTIONS[f].mythTouch`; `aiInputFor`, `believedState`; the planner's `candidates`, `scoreAfter`, `decide`, `choose`; `unitWorth(type)`.
- Produces: `unitValue(u: Unit): number` exported from `assess.ts` (= `unitWorth(u.type) + HERO_TRAIT_WORTH * u.heroTraits.length + (isHero(u) ? HERO_WORTH : 0) + (u.item !== null ? ITEM_WORTH : 0)`, with `HERO_TRAIT_WORTH = 3`, `HERO_WORTH = 3`, `ITEM_WORTH = 2`); `LURE_EDGE = 0.001` in `plan.ts`; `TREASURE_VALUE` 6 to 9.

What changes:

- `assess.ts`: `unitTerms` uses `unitValue(u)` where it used `unitWorth(u.type)` for the unit's own worth; `enemyWorth` starts from `unitValue(e)`; `healthFactor` and every health share use `maxHpOf`; `strikeOf` uses `baseAttackOf(u)` (still no neighbour bonuses, for the reason its comment gives); `moveScore`'s sight uses `statsOf(b, moved).sight`; `pairWeight` is 2 for two hoplites or for two heroes of a faction with `mythTouch`, else 1; it has no state today, so it gains the believed state (`pairWeight(b, a, c)`) to look up the owner's faction, and `bond` and `formationTotal` pass it through. `threatReach` and `dangerMap` already read `maxMp` and `attackOf`, which now include traits.
- `adapt.ts`: the army term uses `unitValue(u) * u.hp / maxHpOf(u)`.
- `plan.ts`: `candidates` adds one combined drink option when `canUseItem(s, id)` and the drink is allowed: probe the drink (`rd`), then probe each allowed attack in `attackTargets(rd.state, id)` on `rd.state` (`ra`), and keep the best as a candidate `{ action: useItem, base, score, result: rd, then: ra }` with `base = score = scoreAfter(s, base, ra, victimId)` (scored from before the drink to after the attack). With no attack after the drink there is no drink candidate. `Cand` gains `then?: Applied`; in `decide`'s lookahead a candidate with `then` follows up from `then.state` (so the attack is never counted twice), and `commit` applies only the drink (`result`), after which the next `decide` scores the attack on its own. The vacate and refill logic is untouched. In `decide`, a lure candidate's score becomes `twin.score + LURE_EDGE` (lures are only pushed when the pull is safe and the attacker moves on, as now). `canKillThisTurn` and `unitRank` read `maxHpOf` where they read type health.

- [ ] **Step 1: Write the failing tests.**

```ts
// assess.test.ts
test('unitValue: worth plus 3 a trait, 3 for a hero, 2 for a draught', () => { /* Warrior 2; one trait 5; two traits 11; two traits and a draught 13 */ });
test('a hero standing in danger costs more than a plain unit there', () => { /* same tile, same danger: valueOf drops more for the hero */ });
test('assess reads maxHpOf', () => { /* through valueOf (hpShare is a local): a Fierce Warrior at 12/12 is worth exactly what a full plain one is, plus its trait worth */ });
test('two Spartan heroes side by side bond like two Hoplites; two Mongol heroes do not', () => {});
// input.test.ts
test('AiInput carries no enemy deeds but shows enemy traits and items', () => {});
// plan.test.ts
test('the planner drinks a draught when a second attack kills a hurt enemy in reach', () => {
  // draughtFinish(): own Warrior with a draught next to a full enemy Warrior on a field. One attack leaves it at 4
  // (damage 6, counter 2); a second from the attacker at 8/10 deals 5 and kills. The plan contains a useItem and two
  // attacks on that target, in either order of drink and first attack.
});
test('the planner keeps its draught when no enemy is in reach', () => {});
test('hard Mongols lure when the pull is safe', () => {
  // safeLure() (new): a Mongol Horseman next to an enemy unit on open field, no village or city on any of
  // lureDestinations, a free tile to ride back to. At dial LEVEL_DIAL.hard the plan holds an attack with lure: true.
  // The existing lureFromCity test (hard never lures there) still passes.
});
test('a map-revealed treasure becomes an objective', () => { /* explored treasure tile: objectives contain kind treasure value 9 */ });
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/ai`. Expected: the new tests fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the AI suites, the slow ones too.** `npx vitest run src/ai`, then `SLOW=1 npx vitest run src/ai` (character and sim suites; about 20 minutes). Expected: all pass. A SLOW bound that moves because heroes now exist is reported in the task summary with the old and new figures, never loosened silently; loosening one is the controller's call.
- [ ] **Step 5: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser` (the AI timing tests in `src/browser/ai.test.ts`).
- [ ] **Step 6: Commit**

```bash
git add src/ai/assess.ts src/ai/plan.ts src/ai/adapt.ts src/ai/assess.test.ts src/ai/plan.test.ts src/ai/input.test.ts src/ai/scenarios.ts
git commit -m "AI: heroes are worth protecting, draughts are drunk when they pay, hard Mongols lure"
```

---

### Task 7: Hero and treasure measures in the simulator (sonnet)

**Files:**
- Modify: `src/ai/sim.ts`, `scripts/simai.ts`
- Test: `src/ai/sim.test.ts`

**Interfaces:**
- Consumes: `runMatch(o: SimOpts): SimResult`, `SideMetrics`, `emptySide()`, the per-action event loop in `runMatch` (`runAiTurn`'s log); event types `heroTrait`, `treasure`, `usedItem`, `died`.
- Produces: `SideMetrics` gains `traitsEarned: Partial<Record<HeroTraitId, number>>`, `heroes: number` (units that reached hero status), `heroesLost: number`, `treasures: Partial<Record<TreasureOutcome, number>>`, `draughtsDrunk: number`; `SimResult` gains `firstHero: PlayerId | null` and `firstHeroRound: number | null`. `summarize` sums `METRIC_KEYS` as numbers; give the two record-valued fields (`traitsEarned`, `treasures`) the same special case `unitsTrained` has (the mean of their total), and report their per-kind breakdown separately. `scripts/simai.ts` prints, after its current summary: mean heroes per match (each side and both), the share of matches with at least one hero, the first-hero side's win share, traits by kind per faction, treasures claimed per match and by outcome, draughts drunk per draught found.

- [ ] **Step 1: Write the failing test.**

```ts
test('hero and treasure measures match the events of a short match', () => {
  // runMatch({ seed: 3, factions: ['spartans', 'mongols'], seats: [{ level: 'normal' }, { level: 'normal' }], maxRounds: 25 })
  // replaying its actions with applyAction, count heroTrait events per owner: equal to the sum of traitsEarned;
  // heroes === events with hero true per owner; firstHero is the owner of the first such event (or null)
});
```

(If `runMatch` does not return its actions, add `actions: Action[]` to `SimResult`; the JSON output may then grow, so `--json` writes it only with `--actions`.)

- [ ] **Step 2: Run it and see it fail.** `npx vitest run src/ai/sim.test.ts`.
- [ ] **Step 3: Implement** the counters and the summary lines.
- [ ] **Step 4: Check the script.** `npm run sim:ai -- --matches 4 --seed 1 --a normal --b normal --max-rounds 40 --swap --jobs 2` prints the new lines.
- [ ] **Step 5: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add src/ai/sim.ts src/ai/sim.test.ts scripts/simai.ts
git commit -m "Simulator: count traits, heroes, treasures and draughts"
```

---

### Task 8: Tune heroes and treasures by simulated matches (opus)

**Files:**
- Create: `docs/superpowers/plans/2026-11-20-plan-5-tuning-log.md`
- Modify (only these levers): `src/engine/data/config.ts` (`CONFIG.heroes` numbers, `CONFIG.treasure.table` by repeating entries), `src/ai/assess.ts` and `src/ai/persona.ts` (AI weights: `HERO_TRAIT_WORTH`, `HERO_WORTH`, `ITEM_WORTH`, `TREASURE_VALUE`, persona weights), `src/engine/fingerprint.test.ts`, `src/engine/speed.test.ts`, `docs/rules/stage2-rules.md`, and the tests that pin those numbers.

**Interfaces:**
- Consumes: `npm run sim:ai` with Task 7's measures; plan 3's tuning log for the format and the baseline figures (`docs/superpowers/plans/2026-11-18-plan-3-tuning-log.md`).
- Produces: final stage 2 numbers in the data files and the rules doc; the tuning log.

No stage 1 number changes (Rulings: the first-seat edge). Each run states a hypothesis, changes one lever group, runs, and is kept or reverted; every run and its figures go in the log.

Targets (normal against normal unless named; `--max-rounds 60 --swap --jobs 3`):

| Measure | Target |
|---|---|
| Matches with at least one hero | 60% to 95% |
| Heroes per match, both sides | 1 to 4 |
| First-hero side's win share | at most 65% |
| Spartan traits per match minus Mongol | above 0 (the agoge shows) |
| Treasures claimed per match | at least 3 of 4 |
| Draughts drunk per draught found | at least 50% |
| Spartan share of wins | 40% to 60% |
| Hard over easy, normal over easy, hard over normal (pooled, both seat orders) | at least 80%, 65%, 60% |
| Median rounds | at most 39 (no worse than plan 3) |
| Stalled at 60 rounds | at most 21.5% (no worse than plan 3); aim for 15% |
| First-seat win share | measured and reported (42% to 58% is the band) |

- [ ] **Step 1: Baseline.** Run `npm run sim:ai -- --matches 50 --seed 1 --a normal --b normal --max-rounds 60 --swap --jobs 3` (100 matches) with Task 6's numbers, and the three ladder pairs at `--matches 25 --swap` each. Log the figures.
- [ ] **Step 2: Tune.** At most 12 runs of 100 matches on seeds 1 to 50. Levers in this order of preference: hero thresholds (both tables), trait sizes, the treasure table's weights, the AI worths, persona weights. Stop at the first run inside every target, or at the budget.
- [ ] **Step 3: Confirm on fresh seeds.** Normal against normal `--matches 100 --seed 701 --swap` (200 matches), and each ladder pair `--matches 50 --seed 701 --swap`. Log them in a final table like plan 3's.
- [ ] **Step 4: Make the numbers official.** `stage2-rules.md` drops "draft" from the numbers it confirms and gains a short "Tuning" section with the final table and the log's path. Text blurbs need no edit (they read `CONFIG`).
- [ ] **Step 5: Repin and run everything.** Both provenance tests pass, then `FINGERPRINT[4]`, the speed rows and, if needed, the 25-unit position; `npm test`, `npm run typecheck`, `npm run lint`, `SLOW=1 npx vitest run src/ai`.
- [ ] **Step 6: Commit** (one commit per kept lever change during Step 2 is fine; the final one):

```bash
git add src/engine/data/config.ts src/ai/assess.ts src/ai/persona.ts src/engine/fingerprint.test.ts src/engine/speed.test.ts docs/rules/stage2-rules.md docs/superpowers/plans/2026-11-20-plan-5-tuning-log.md
git commit -m "Tune hero thresholds, trait sizes and treasure weights by simulated matches"
```

Any target missed at the budget is written in the log's "Carried" section with its figure; the task is done either way.

Two things to watch, named by the plan review: AI heroes are worth much more than their gold (a two-trait Warrior 11 against a Knight's 6), so they may hang back and lengthen matches, which works against the stall target (the `HERO_*` worths are levers); and Tireless doubles a foot unit's move and gives a Mongol Knight 5 tiles (its size, or limiting it, is a lever). The baseline in Step 1 also states the share of all treasure claims that came out as gold, since gold is both an outcome and four fallbacks.

---

### Task 9: Heroes and treasures on screen: text, unit panel, commands, digest, effects (sonnet)

**Files:**
- Modify: `src/ui/text.ts`, `src/ui/panels/UnitPanel.tsx`, `src/ui/panels/commands.ts`, `src/ui/interaction.ts`, `src/ui/screens/Match.tsx`, `src/ui/screens/Home.tsx`, `src/ui/board/effects.ts`, `src/ui/board/Effects.tsx`, `src/ui/sound.ts`, `src/ui/theme.css`, `src/app/digest.ts`
- Test: `src/ui/text.test.ts`, `src/ui/panels/panels.test.tsx`, `src/ui/panels/commands.test.ts`, `src/ui/interaction.test.ts`, `src/ui/board/effects.test.ts`, `src/app/digest.test.ts`, `src/ui/screens/screens.test.tsx`

**Interfaces:**
- Consumes (engine index): `statsOf`, `isHero`, `mythTouched`, `thresholdOf`, `canEarnTraits`, `DEEDS`, `HERO_TRAITS`, `CONFIG.heroes`, `CONFIG.treasure`, the `heroTrait`, `treasure` (with `outcome`, `trait`, `found`, `unit`) and `usedItem` events, the `useItem` action; `aiInputFor` and `believedState` (`src/ai/input.ts`, as `interaction.ts`'s `offered` already uses them).
- Produces:
  - `T.heroTrait: Record<HeroTraitId, Entry>`, `T.deed: Record<DeedId, string>`, `T.item: Record<ItemId, Entry>`, `T.treasure: Record<TreasureOutcome, string>`, new `T.ui` keys below, `T.unit.sellsword` final.
  - `UnitPanelProps = { unit: Unit; faction: FactionId; stats: ReturnType<typeof statsOf>; myth: boolean; thresholds: Record<DeedId, number> | null; commands: Command[]; onCommand: (c: Command) => void }` (`thresholds` null for a unit the viewer does not own, which hides deeds).
  - `ActionIndex.items: number[]` (unit ids with a legal `useItem`), not added to `activeUnits`.
  - `DigestLine` gains `{ kind: 'traitEarned'; unitType: UnitTypeId; trait: HeroTraitId }` and `{ kind: 'heroMade'; unitType: UnitTypeId }`.
  - `Effect` `number` tones gain `'hero'` and `'find'`.

Text (exact copy; numbers from `CONFIG.heroes`, shown here at their Task 3 and 4 values):

```ts
heroTrait: {
  fierce: { name: 'Fierce', blurb: `+${fierceAtk} attack and +${fierceHp} health. Earned by fighting.` },
  tireless: { name: 'Tireless', blurb: `+${tirelessMove} movement. Earned by marching far.` },
  hardy: { name: 'Hardy', blurb: `+${hardyDef} defence. Earned by being hurt and healed.` },
  watchful: { name: 'Watchful', blurb: `Sees ${watchfulSight} tile farther and takes ${agilityCut} less damage when struck back, never below 1. Earned by resting.` },
},
deed: { fight: 'Fighting', march: 'Marching', survive: 'Surviving', rest: 'Resting' },
item: { draught: { name: 'Battle draught', blurb: 'Drink it once to make one more attack this turn.' } },
treasure: { gold: 'Gold', explore: 'A lookout', unit: 'A warrior joins', relic: 'A relic', draught: 'A battle draught', map: 'A treasure map', mercenary: 'A sellsword joins' },
// ui:
hero: 'Hero', heroTraits: 'Earned', deeds: 'Deeds', carrying: 'Carrying', drink: 'Drink draught',
mythTouch: 'Myth touch', mythTouchBlurb: `Beside another Spartan hero: +${mythAtk} attack and +${mythDef} defence.`,
digestTrait: 'Your {unit} earned {trait}.', digestHero: 'Your {unit} is now a hero.',
whatsNew: 'New: units earn traits from what they do and become heroes, and treasures can hold relics, draughts, maps and sellswords.',
```

Screen rules:

- Unit panel: a "Hero" badge beside the title when `isHero`; stats from `stats` (health `hp/maxHp`, attack, defence, movement, range); the type traits list as now, then an "Earned" list of `heroTraits` with name and blurb, then the myth touch line when `myth`, then "Carrying: Battle draught" with its blurb when `unit.item`; then, when `thresholds !== null` and the unit can still earn (fewer than `maxTraits`, `canEarnTraits`), one row per deed whose trait it lacks: the deed name, a bar (`<meter min=0 max={threshold} value={min(total, threshold)}>`) and `total/threshold`. The panel must fit a 360 px wide phone with no horizontal scroll.
- `Match.tsx` builds the props: `stats = statsOf(state, u)`, `myth = mythTouched(believedState(aiInputFor(state, viewer)), u)` (the viewer's believed state, never the whole match, so an enemy hero's line never reveals an unseen hero beside it), `thresholds` from `thresholdOf` per deed when `u.owner === viewer`, else null. It reads the unit from the viewer's view (so enemy deeds are already zero).
- Commands: `unitCommands` adds `{ id: 'useItem', label: T.ui.drink, cost: null, enabled: true, why: null, action: { type: 'useItem', unit: unit.id }, arm: null }` when `ix.items` has the unit, after the claim command.
- `T.unit.sellsword`'s blurb names its trait through the text table, not a literal: `` `A wandering fighter for hire who joins whoever finds it, already ${T.heroTrait[CONFIG.treasure.mercenaryTrait].name}.` `` (build `heroTrait` before `unit`).
- Digest: for each `heroTrait` event on a viewer's unit made on the other side's turn: `heroMade` when `hero` is true, else `traitEarned`. Treasures of the other side stay one `treasureTaken` line.
- Effects: a `heroTrait` event on a seen unit shows a `number` effect, tone `hero`, text the trait's name, at the unit's tile. A `treasure` event with an outcome other than gold shows a `number` effect, tone `find`, at `e.at`, for the claiming player only (the other side keeps the burst): the text is `T.treasure[outcome]`, except a relic, which shows the trait it gave (`T.heroTrait[e.trait].name`). Gold keeps its `+N`.
- Sound: `heroTrait` and `usedItem` join the `build` cue's types.
- Home: `T.ui.whatsNew` in a `<p className="whats-new">` under the tagline.
- `theme.css`: colours for the two new tones, named the way `Effects.tsx` already names its tone classes, from the existing tokens (gold for hero, the treasure burst's colour for find), `.hero-badge`, `.deed-row`, and the `meter` styled to the panel; Task 10 may refine them.

- [ ] **Step 1: Write the failing tests.**

```ts
// text.test.ts
test('every hero trait, deed, item and treasure outcome has text, and blurbs carry the CONFIG numbers', () => {});
// panels.test.tsx
test('a hero panel shows the Hero badge, earned traits and deeds with progress', () => { /* fierce + hardy, march 7/15: "Hero", "Fierce", "Hardy", "7/15", no "Fighting" row */ });
test('enemy panel shows traits, no deeds', () => { /* thresholds null: "Hardy" present, no meter */ });
test('myth touch never names an unseen hero', () => {
  // Match screen: an enemy Spartan hero whose hero neighbour stands on a tile the viewer cannot see (or is a hidden
  // Krypteia scout not next to any of the viewer's units): its panel has no myth touch line; once the neighbour is seen, it has
});
test('a Fierce unit shows 12/12 health', () => {});
test('a full unit shows no deed rows', () => { /* three traits */ });
test('the draught line and the myth touch line', () => {});
// commands.test.ts
test('Drink draught is offered when useItem is legal', () => {});
// interaction.test.ts
test('items index lists useItem units and does not count them as active', () => {});
// digest.test.ts
test('a trait earned on the other turn is told once; a hero line replaces the trait line', () => {});
test('the other side never hears of its enemy progress', () => { /* heroTrait on a unit the viewer does not own: no line */ });
// effects.test.ts
test('a trait shows its name over the unit; a non-gold find shows its words to the claimer only', () => {});
// screens.test.tsx
test('Home shows the what is new line', () => {});
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/ui src/app/digest.test.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser`.
- [ ] **Step 5: Commit**

```bash
git add src/ui/text.ts src/ui/panels/UnitPanel.tsx src/ui/panels/commands.ts src/ui/interaction.ts src/ui/screens/Match.tsx src/ui/screens/Home.tsx src/ui/board/effects.ts src/ui/board/Effects.tsx src/ui/sound.ts src/ui/theme.css src/app/digest.ts src/ui/text.test.ts src/ui/panels/panels.test.tsx src/ui/panels/commands.test.ts src/ui/interaction.test.ts src/ui/board/effects.test.ts src/app/digest.test.ts src/ui/screens/screens.test.tsx
git commit -m "Show traits, deeds, heroes and the new treasures on screen"
```

---

### Task 10: The hero mark, the draught badge and the Sellsword in the diorama style (opus)

**Files:**
- Create: `src/ui/art/hero.tsx`, `src/ui/art/hero.test.tsx`
- Modify: `src/ui/art/units.tsx` (the Sellsword replaces the placeholder), `src/ui/art/ArtSheet.tsx`, `src/ui/board/BoardDemo.tsx` (a hero and a draught in the demo state), `src/ui/board/Board.tsx`, `src/ui/board/scene.ts` (only if `SceneUnit` needs the flag), `src/ui/theme.css`
- Test: `src/ui/art/units.test.tsx`, `src/ui/art/factionUnits.test.tsx` (counts unchanged since Task 5; the redrawn figure must stay distinct), `src/ui/art/hero.test.tsx`, `src/ui/board/Board.test.tsx`

**Interfaces:**
- Consumes: `Ink`, `FigureProps`, `PIP_Y` and the plate constants in `units.tsx`; `ACCENT`, `playerColour` (`palette.ts`); `StatusOverlay`; `isHero`, `maxHpOf` (engine index); `UnitViewOf` in `Board.tsx`.
- Produces: `HeroMark(p: { accent: string }): ReactElement` with a root `data-hero-mark` attribute; `ItemBadge(p: { item: ItemId }): ReactElement` with `data-item={item}`; `SHARED_FIGURES.sellsword`.

The look follows `docs/design/look-b-diorama.html` and the existing figures: flat fills, no outlines, the palette, chunky toy shapes, readable at phone size. The hero mark must read at the smallest zoom on a 360 x 640 phone and be distinct from the taunted and blinded badges and the fresh glint: a small gold pennant on a short staff rising behind the figure's shoulder, in the player's accent with a gold edge, is the suggested direction; the implementer may choose another shape if it reads better, and says why. The draught badge is a tiny flask to the right of the health plate, where the fresh glint sits; when the unit is also fresh, the badge moves one slot (7.6 units, the marks' spacing) farther right so the two never overlap. The Sellsword is a shared figure (no faction): a cloaked foot fighter with a long blade and patched mismatched armour, in the player's colour like every unit, its silhouette unlike the Warrior's and the Swordsman's.

Board: `UnitViewOf` draws `HeroMark` when `isHero(unit)` and `ItemBadge` when `unit.item !== null`, inside `unit-body` so a lunge carries them, and passes `maxHp={maxHpOf(unit)}` to `StatusOverlay` (was `UNITS[t].hp`). The memo comparison already compares the unit by value.

- [ ] **Step 1: Write the failing tests.**

```ts
// units.test.tsx: still nine figures, each different (Task 5 set the count); the redrawn Sellsword stays inside the figure bounds the extents test uses
// hero.test.tsx
test('the hero mark and the draught badge stay inside the unit box and use only absolute paths', () => { /* the extents helper */ });
// Board.test.tsx
test('a hero carries the mark and a plain unit does not', () => { /* [data-hero-mark] once */ });
test('a carried draught shows its badge', () => {});
test('pips follow maxHpOf', () => { /* a Fierce Warrior at 12/12: 3 full pips */ });
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/ui/art src/ui/board`.
- [ ] **Step 3: Draw** the mark, the badge and the Sellsword; add an ArtSheet row (the mark on a Hoplite, a Horseman and the King's Guard; the badge; the Sellsword in both factions' colours).
- [ ] **Step 4: Look at it.** Build, open `?sheet=1` and a board with a hero (give `src/ui/board/BoardDemo.tsx`'s demo state a hero and a unit carrying a draught) in a 360 x 640 Playwright page at the closest and the farthest zoom, save screenshots in `.superpowers/scratch/heroes/`, and compare them with the diorama sketch. Adjust until the mark reads at the farthest zoom.
- [ ] **Step 5: Run everything.** `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser`.
- [ ] **Step 6: Commit**

```bash
git add src/ui/art/hero.tsx src/ui/art/hero.test.tsx src/ui/art/units.tsx src/ui/art/units.test.tsx src/ui/art/ArtSheet.tsx src/ui/board/Board.tsx src/ui/board/BoardDemo.tsx src/ui/board/Board.test.tsx src/ui/theme.css
git commit -m "Draw the hero mark, the draught badge and the Sellsword"
```

(Add `src/ui/board/scene.ts` if it changed.)

---

### Task 11: A hero in a real browser, the shared `tapTile`, docs and version 0.4.0 (sonnet)

**Files:**
- Create: `src/browser/heroes.test.ts`
- Modify: `src/browser/flow.test.ts`, `src/browser/ai.test.ts`, `src/browser/nextunit.test.ts` (import `tapTile` from `./harness`, delete their copies), `src/version.ts` (`APP_VERSION = '0.4.0'`), `CLAUDE.md`, `docs/online.md`, `README.md`

**Interfaces:**
- Consumes: `openApp(query, { width?, height?, beforeOpen? })`, `tapTile`, `frames` (`src/browser/harness.ts`); `newRecord` (`src/app/record.ts`); `writeSave` (`src/app/saves.ts`) on a `Map`-backed `KeyValue`; `createMatch`, `hashState`, `maxHpOf`; the pattern of `savedHardMatch` in `src/browser/ai.test.ts` (a record whose snapshot at action count 0 holds a prepared state).
- Produces: `heroSave(): { entries: [string, string][]; heroAt: HexKey }` inside `heroes.test.ts`: `createMatch({ seed: 7, factions: ['spartans', 'mongols'] })`, then player 0's starting unit gets `heroTraits: ['fierce', 'hardy']` and `hp = maxHpOf(unit)`, and another of its units (or a second unit added beside it with the testkit's `spawnUnit` pattern) gets `item: 'draught'`; a two-person (pass-the-phone) record with `snapshot: { count: 0, hash: hashState(state), state }`, written with `writeSave` into a `Map`. Deterministic, instant and independent of Task 8's numbers, unlike playing AI matches until a hero appears.

- [ ] **Step 1: Write the failing browser tests** (gate: `describe.runIf(process.env.BROWSER === '1')`):

```ts
test('a resumed match shows the hero mark and the hero panel on a 360 x 640 phone', async () => {
  // Home -> Continue -> "I'm {name}" -> tapTile(heroAt): [data-hero-mark] visible; [data-item="draught"] visible; the panel shows "Hero" and "Earned";
  // document.documentElement.scrollWidth <= innerWidth; the panel's scrollWidth <= its clientWidth
});
test('the same at 568 x 320', async () => {});
test('Home shows what is new and the version 0.4.0', async () => {});
```

- [ ] **Step 2: Run them and see them fail.** `npm run build && cross-env BROWSER=1 npx vitest run src/browser/heroes.test.ts`. Expected: the version test fails (0.3.1); the others pass or fail on whatever Tasks 9 and 10 left; fix in this task only what is wiring, and report anything visual to the controller.
- [ ] **Step 3: Share `tapTile`**, bump `APP_VERSION`, and write the docs: `CLAUDE.md` "Where things are written down" gains "- Stage 2 rules (heroes and treasures): `docs/rules/stage2-rules.md`."; `docs/online.md` gains a "Rules 4" paragraph (the new `useItem` action; why `database.rules.json` did not change, stated as the rules are: the exact `endTurn` and `resign` strings are special-cased, any other action containing `player` or a backslash is refused, and versions are compared as values; that a rules 3 room cannot be continued on 0.4.0, and the deploy rule); `README.md` one line on heroes and treasures under its game description.
- [ ] **Step 4: Run everything,** one at a time: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser`, `GITHUB_PAGES_BASE=/warbanners/ npm run test:browser`, `npm run test:emu`, `npm run test:online`. All pass. `src/browser/coverage.test.ts` sees the new file's gate.
- [ ] **Step 5: Commit**

```bash
git add src/browser/heroes.test.ts src/browser/flow.test.ts src/browser/ai.test.ts src/browser/nextunit.test.ts src/version.ts CLAUDE.md docs/online.md README.md
git commit -m "A hero in the browser, one shared tapTile, docs and version 0.4.0"
```

---

### Task 12: Whole-branch review and close-out (fable review; controller)

Not an implementer task.

- [ ] **Review.** One Fable reviewer on the whole branch (`git diff 34b6351...plan-5-heroes`), given the spec sections above, this plan and the Review Focus. The controller triages its findings; Critical and Important are fixed in a fix wave (one Opus implementer) and re-reviewed (Sonnet) before anything else.
- [ ] **Provenance.** `git diff 34b6351 --stat -- src/engine` names only files this plan lists; `src/engine/stage1.dormant.test.ts` replays all four recorded playouts end to end, and `src/engine/stage1.test.ts` passes with its printed prefix noted in the follow-ups.
- [ ] **All suites,** one at a time: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser` (both bases), `npm run test:online`.
- [ ] **Deploy, with David's yes.** Ask David that no online match is in progress (the rules 4 deploy strands one). `database.rules.json` is unchanged, so no database deploy. Merge into `main`, push, watch the workflow to green.
- [ ] **Live check.** On the live site in a phone-sized browser: Home shows 0.4.0, rules 4 and the what's new line; a solo match against the normal AI played until a trait appears (or a seeded save as in Task 11); two Chromium phones open an online room on the real database and play two turns. Then the real-phone checks carried from plan 4: the Pixel over ADB (always `-s <serial>`) and David's iPhone install. Show each screenshot directly in the reply to David.
- [ ] **Follow-ups doc.** `docs/superpowers/plans/2026-11-20-plan-5-followups.md`: the outcome, the rulings made during the build, the tuning table and anything carried (targets missed, the first-seat edge, deferred minors), and what stage 3 needs.

---

## Plan 5 is done when

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser` (both bases) and `npm run test:online` pass, locally and in the workflow.
- On the live site (0.4.0, rules 4), solo against the AI and online between two phones: units earn traits, heroes carry a mark both players see, each treasure outcome can happen, a draught can be drunk, and the AI uses all of it.
- `stage2-rules.md` holds every stage 2 rule and number, matching the data files; the tuning log holds every run.
- Solo and pass-the-phone play still work offline; a rules 3 save reads "From an older version".

## Needs the owner

- A yes to merge and push, given at a moment when no online match is being played.
- The iPhone install check and one full match between two real phones (carried from plan 4).
- Wireless debugging on the Pixel 10 Pro for the live check.
- Whether any of the rulings above should change (the trait list and sizes, the Battle draught, the Sellsword, the seven-outcome draw). Every one is a data line or a small rule, so changing them later is cheap, though each change after release is another rules version.
