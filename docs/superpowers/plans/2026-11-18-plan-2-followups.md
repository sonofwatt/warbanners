# Plan 2 (the game on screen): outcome and follow-ups

Date: 2026-11-19. Built on branch `plan-2-game-on-screen`, merged into `main` at 707d79d (branch started from 3ab26af). Not pushed.

## Outcome

All 16 tasks built and reviewed, plus one task added during the build (14c, chrome
styling). Two whole-branch reviews (Opus, then Fable) each said "with fixes". Every
Critical and Important finding is fixed, and the fixes were re-reviewed clean.

What it delivers: a playable hot-seat match on a phone. Home, Setup, the pass-the-phone
curtain, the match screen with the diorama board, selection panels, tech and reward
sheets, the turn digest, effects and sound, the result screen, saves and resume,
offline play, and an update that waits for Home. The board and every panel draw only
what `playerView` gives the viewer. A deploy workflow exists but has not run.

- 404 unit tests pass; type checks and lint are clean.
- 24 browser tests pass, at `/` and at `/banners/` (`GITHUB_PAGES_BASE=/banners/`).
- The engine is unchanged apart from the data tables being frozen and one export.

Not done yet

- Not pushed and not deployed. David said "Banners" is a working title and will be
  changed before the first deploy. The workflow runs on every push to `main`, and the
  repo name sets the site path, so the push waits for the new name.
- Not checked on a real Pixel or iPhone. Touch drag and pinch, notch insets, rotating
  mid-match and sound on iOS are covered by unit tests or by desktop browser runs only.
- No AI opponent, no online play, no turn clock. Those are plans 3 and 4.

## Decisions made during the build

Each ruling below is from the build ledger, in order. Each says what it costs if wrong.

1. David's "keep going past this plan stage" was read to cover merging plan 2, pushing
   and the first deploy. This was later replaced (see ruling 25). If wrong, one
   unwanted push or deploy, which can be undone.
2. The figure box was widened from 32 to 40 units wide, because a horse does not fit in
   32. If wrong, riders overlap their neighbours a little.
3. Several browser and markup tests in the plan were written as comment lines for the
   implementer to turn into assertions. This was accepted, with the reviewer checking
   each line became an assertion. If wrong, a thin test slips through to the final review.
4. The review of task N runs while the implementer of task N+1 works, when they touch
   different files. A fix round waits until that implementer commits. If wrong, a later
   task builds on a flaw for one task longer.
5. Work ran on three parallel tracks in separate worktrees (board, art, app) to save
   wall-clock time. If wrong, a merge conflict or interface drift, caught at merge and
   by the final review.
6. The `Mark` type moved into its own file `src/ui/board/mark.ts`, re-exported from
   `tiles.tsx`, so the app track did not wait for the art track. If wrong, one extra
   tiny file.
7. Tapping a tile that holds my unit and my city cycles unit, then city, then nothing.
   The plan's rule 3 read alone would loop back to the unit. If wrong, one tap rule.
8. Task 14 was split: 14a (effects and sound logic, pure) first, 14b (the effects on
   screen) after Task 13. If wrong, two reviews instead of one.
9. The art sheet is a developer page and keeps its English labels inline, exempt from
   the rule that every display string lives in `text.ts`. If wrong, one file to clean up.
10. Task 15 was split the same way: 15a (icons, service worker config, update and
    platform code) first, 15b (Home wiring, offline and manifest browser tests) after.
    If wrong, two reviews instead of one.
11. Task 13 was split: 13a (store hook, screens and chrome) first, 13b (the board in the
    match screen and the flow and layout browser tests) after Task 8. If wrong, one more
    review.
12. The jump of a unit sliding toward the back row, and bright features on veiled tiles,
    were treated as polish and carried into Task 14b. If wrong, two visual rough edges
    ship in the alpha.
13. The Task 8 review finding (a unit moving toward the back row is re-inserted, so it
    jumps instead of sliding) is fixed inside Task 14b, not in a separate round. If
    wrong, the jump survives until the final review.
14. Task 14b grew into "board polish": effects, a slide in every direction, the veil over
    the whole tile, and a camera clamp that shows only a small margin past the board
    edge. If wrong, Task 3's pinned clamp numbers get re-derived once.
15. A new Task 14c, "chrome styling", was added so the Hud, panels, sheets, Home, Setup,
    curtain and result get the bright, chunky look the design asks for. The plan only
    gave `theme.css` colours, type and layout, and the result was plain defaults. If
    wrong, David may want the styling changed.
16. The plan's offline test asked Player 2 to see a Warrior that fog hides. That was the
    planner's error. The implementer's stricter version stands. If wrong, nothing.
17. Borders and marks stay at full brightness on veiled tiles, because they are
    information the player needs, not scenery. If wrong, one CSS rule.
18. Task 14c continued from the work an interrupted implementer left, rather than
    restarting, since it passed every check and matched the look. If wrong, a styling
    redo that David would ask for anyway.
19. The controller's one-line sheet fix (`max-height` on match sheets) stayed in the tree
    and was reviewed with the task. If wrong, nothing, it was inside the reviewed diff.
20. Plan 2 is merged into `main` locally but not pushed, until David gives the new name.
    If wrong, `main` sits one merge ahead of `origin` a little longer.
21. Saves are never lost silently. The record being written is never evicted, finished
    matches go first, and `MAX_SAVES` rose from 5 to 20. Only with 20 unfinished matches
    is the oldest unfinished one dropped, and Home says so. If wrong, more storage is
    used, or a chooser is added to Setup later.
22. Save notices show where they apply: a dismissible line in the match screen, the
    repaired notice on the curtain, and a later good save clears the failed notice. If
    wrong, one more line of chrome.
23. The cold-start update problem (finding I3) did not block this merge, because no rules
    change ships with it and David accepted that saves from an older rules version cannot
    be resumed in the alpha. Plan 3 must provide a way for half-played matches to finish
    (amended, see ruling 32). If wrong, plan 3's tuning task grows a compatibility step.
24. The fix wave also took the cheap minors: camera re-centring once the capital is lost,
    tap time limit raised from 350 to 600 ms, lost pointer capture, the win and last
    capture sounds, and a lock on the curtain's ready button. If wrong, a slightly
    larger fix wave.
25. Ruling 1 is superseded: the push and first deploy wait for David's new name. If
    wrong, nothing.
26. Before the first deploy the manifest gets an explicit `id` and the `github-pages`
    environment is restricted to `main`, both done with the rename. If wrong, nothing.
    (Still to do, see below.)
27. The final whole-branch review had already run on Opus before David said Fable should
    do it, so the next step became one Fable review that also verifies the fix wave,
    replacing a scoped re-review. His model note: the controller runs on Opus, Sonnet
    does well-specified implementation and task reviews, Opus does art, integration, the
    AI planner and design judgement, and Fable does only the final reviews of plans 2
    and 3. If wrong, one extra Fable review's allowance.
28. The curtain may show any save notice (failed, dropped, repaired). None says anything
    about the board, and a player told sooner is better off. If wrong, one condition.
29. A second fix round was run after the single fix wave, against the usual one-wave
    rule, because the Fable review found two Important faults a player would hit (a
    blank screen on a bad save, a board that jumps on every tap). If wrong, one more
    implementer and one scoped re-review.
30. That round fixed N1 (smoke-test a restored snapshot and fall back to replaying the
    actions, plus an error boundary with a way Home), N2 (the board stays still when a
    panel opens), N3 (no reload of another window mid-match), M1 (the digest names an
    attacker only when the victim's side could see it) and M8 (stop parsing every save
    body on each action). If wrong, a larger round than needed.
31. Ruling 23 is amended: plan 3's Task 12 may change state shape or numbers only with
    the N1 replay fallback in place and a test that a save from the previous build
    resumes. If wrong, Task 12 grows.
32. `MAX_SAVES` stays 20. Even at two bytes per character, 20 long matches are about
    2.6 MB, inside the 5 MB origin quota, and the M8 fix removed the per-action cost. If
    wrong, lower it to 10 in one line.

## Carried into plan 3 (AI and tuning)

- Rules bump requirement (I3, amended). Do not bump `RULES_VERSION`, and do not change
  the shape of `MatchState` (a new field on a unit, player, city or tile), unless two
  things exist first: the snapshot replay fallback (already built, see below) and a
  test that a save written by the previous build resumes. Reason: a waiting service
  worker activates by itself once every window closes, so the next cold start runs the
  new build, and every half-played match would become "From an older version". Plan 3's
  Task 12 (tuning) is the likely bump.
  - How the fallback works today: `restore` in `src/app/record.ts` accepts a snapshot
    only if its hash matches, its fields match a fresh `createMatch` of the same
    settings, and `playerView` and `legalActions` run on it. If not, it replays the
    saved actions under the current engine and shows the "repaired" notice. If the
    replay throws, the save is reported damaged.
  - What it does not cover: replaying under changed numbers or rules can diverge from
    what the players saw, or throw on an action that is no longer legal. The test must
    show a real previous-build save resuming, not just a shape change.
- M2: zone of control and camp targets read the full state. This is more than the plan's
  "gap in the move highlights". In `src/engine/movement.ts` (`isEnemyAt`,
  `nextToEnemy`) an unseen enemy not only blocks its own tile, it also cuts the reach of
  every path that passes next to it, and `campTrain` targets skip tiles that hold hidden
  units. So unseen enemies shape move highlights. Decide for the AI's fog-limited view
  whether to accept this, or give the movement code a viewer. The decision text in the
  plan 2 plan understates it.
- The AI needs a fog-limited view of its own (plan 2's decision line 31). The saved
  record's `players` entries have `kind: 'human'` and plan 3 adds `'ai'`.
- The plan 1 follow-ups for plan 3 still stand: no turn limit or draw, `applyAction`
  cloning before refusing, lure onto a Mongol city, Mongol forest entry. The data
  tables were frozen in plan 2, as plan 1 asked.
- Saves cost: every accepted action writes the whole record. With an AI that plays many
  actions per turn, check the write cost on a phone. The save list is already kept from
  `writeSave`'s result (`withSave`), not re-read.
- The drafts for plan 3 and plan 4 sit in `.superpowers/drafts/` (git-ignored). The plan 3
  draft puts an engine speed-up for visibility in its Task 1.

## Carried into plan 4 (online play) and the first deploy

Rename. "Banners" is a working title. Where the name is hard-coded:

- Risky to change:
  - `src/app/saves.ts` lines 24 and 25: the keys `banners.saves.v1` and
    `banners.save.<id>`. Changing either orphans every save. If the name must change
    here, add a one-time migration that copies the old keys. Otherwise leave them
    alone, since players never see them.
  - `src/ui/sound.ts`: the key `banners.muted`. Changing it only resets the mute choice.
  - The site path. `.github/workflows/deploy.yml` derives the base from the repo name, so
    a repo rename moves the site from `/banners/` to `/<new>/`. GitHub does not redirect
    old Pages paths. Rename before anyone installs the app. Saves survive a path change
    because `localStorage` is per origin, as long as the keys above are unchanged.
- Safe to change (display or docs):
  - `vite.config.ts`: manifest `name`, `short_name` and `description`.
  - `index.html`: the title.
  - `src/ui/text.ts`: `appName`. `src/ui/art/ArtSheet.tsx`: one inline label.
  - `package.json`: the package name. `README.md`: the title and the
    `sonofwatt.github.io/banners/` link. `CLAUDE.md`: the title and the `/banners/`
    path rule.
- Tests that pin the name: `src/ui/App.test.tsx`, `src/browser/offline.test.ts` (the
  manifest name and a temp directory prefix), and the key strings in `saves.test.ts`,
  `store.test.ts` and `screens.test.tsx` (these must move with the keys if the keys
  change). The `GITHUB_PAGES_BASE=/banners/` instruction in `CLAUDE.md` and `README.md`
  also names the path.
- Keep the key prefix unique after the rename. GitHub Pages serves every project of the
  account from one origin, so storage and its 5 MB quota are shared with any other
  Pages app on that account.

Before the first push to `main`

- Add an explicit `id` to the manifest. Without one, the app's identity follows
  `start_url` and scope, so a path change makes an installed copy a different app.
- Restrict the `github-pages` environment to `main` in the repo settings.
  `workflow_dispatch` can otherwise deploy from any branch.
- Set the Pages source to "GitHub Actions" in the repo settings. The workflow has no
  `actions/configure-pages` step, so the deploy job fails without it.
- Get David's yes, with the final name, before the push. Every push to `main` deploys.
- Decide whether the public site should still carry `?seed=` (it fixes the map for a
  shared link), `?sheet` and `?board` (the art sheet and board demo ship in the
  production bundle). Gate them on the dev or test build, or lazy-load them.
- Check on a real Pixel and iPhone: touch drag, pinch, notch insets, rotation, sound, and
  install and offline on iOS.

Plan 4 (live online play)

- The plan 4 draft says the engine's resign must take a player and pass the turn. That is
  a rules change, so it triggers the plan 3 rules-bump requirement above. Settle the
  order of plans 3 and 4 with that in mind.
- The saved record has the shape online play will store. The store's `Screen` union and
  the curtain gating need an online mode, and the browser harness needs a build that
  talks to an emulator. Details are in the plan 4 draft.
- Anyone who can read `localStorage` can see through the fog. Spec 8.5 accepts this for
  hot-seat. Online play must not send hidden state to a client (plan 1 already says
  that actions carry no player id and database rules must enforce who appends).

## Known rough edges left in the alpha

Deferred minors that were not fixed, grouped by area. None blocks play. Fixed items
(the sound leak, silent eviction, save notices, the camera and tap fixes, the blank
page, the jumping board, the reload of another window, the digest attacker, the save
list cost) are not listed.

Saves and storage

- Two windows on the same match each write their own record, and the last writer wins
  with no warning (M9).
- A list entry whose body is missing is hidden by `listSaves` but still counts toward
  the 20 saves (N13).
- A body that parses but is not a record is listed as "older version" and can only be
  deleted.
- Eviction frees space only after the new writes, so a nearly full quota can refuse a
  save that eviction would have made room for.
- `readList` does not dedupe ids (`writeSave` filters by id, so it is not reachable).
- On an iPhone, a site used in Safari and not installed can have its storage cleared
  after seven days without a visit. The install hint does not say why to install, and
  `navigator.storage.persist()` has no `.catch` (N8).
- The 20-save budget is about half used on an iPhone, since WebKit counts two bytes a
  character and the quota is shared with other Pages sites (N5).
- `startMatch` and `resume` work from any screen, and a failed resume leaves the save
  listed.

Update and offline

- "Ready to play offline" shows only in the session where the service worker first
  installed, so a later visit says nothing (N7).
- A failed service worker registration is swallowed with no hint (M13).
- iPadOS sends a Macintosh user agent, so iPads get no install hint.
- Offline is switched on from Home in the test, not mid-match.
- `skipLibCheck` is on because the workbox types need the WebWorker lib (accepted).

Interaction and gestures

- If `setPointerCapture` throws, no `lostpointercapture` follows, so the gesture
  reducer can stay in one-finger mode with a dead pointer (N11).
- Touch drag and pinch are only unit tested, not run in a browser.
- End turn is one tap with no confirmation, even while "units can still act" shows
  (N15).
- Selecting a second unit while a panel is already open does not pan, so its far move
  tiles may sit off screen.
- No property test that every action a tap returns is in `legalActions`. Several
  branches are untested: tap own unit while armed, tap elsewhere while `askLure` is set,
  `afterAction` keeping a still-active unit.
- The pick test has no case for a point exactly on a shared hex edge.

Board, camera and effects

- A move started during a slide starts from the last target, not the on-screen
  position.
- Falls and damage numbers draw over everything for about 450 ms.
- In portrait the board is shorter than the screen at the default zoom, so there is sky
  above and below, and the capital sits low.
- A rotation re-aims at the capital until the player pans or zooms.
- The veil draws a veiled tile twice under a group opacity, and its CSS recolour relies
  on no art using `style=` fills.
- `Board.tsx` imports `prefersReducedMotion` from the Effects module.
- Trained and reward have no visual effect. Treasure gold is inferred from the gold
  change. Several effect kinds and the oscillator sound path are untested.
- The hidden-unit opacity test uses a brittle regex. `freePort` in the harness has a
  race.
- The camera follows the first unit when a player has no capital.

Layout and chrome

- The `.screen.match` height uses `100dvh` with no `vh` fallback, so older browsers
  (Safari before 15.4, Chrome before 108) collapse the board row (N6).
- Small type carries real information: 11 px and 12 px text for "units can still act",
  stat labels, why a command is disabled and what a tech opens (N14).
- The notice about failed saves comes back after every action once dismissed (N10).
- AudioContext is resumed only from `suspended`, so iOS can leave sound dead after an
  interruption (N9).
- The Hud wraps to three rows at 360 px wide.
- At 568 by 320 the "units can still act" line runs to three short lines, and
  landscape stat tiles wrap 4 plus 1. 568 by 320 is checked by screenshot only.
- Home at 412 by 915 has empty bands above and below the centred column.
- No test for notch insets or for rotating mid-match.
- The unit panel shows base stats without the phalanx or inspire bonuses.
- Unused `T.ui` keys: `walled`, `notWalled`, `traits`.
- The ability and capture highlights are low contrast at phone size, and the move dot is
  small.

Art

- The knight's lance hides most of the horse's head, the busiest figure at phone size.
- The Sky Caller is the weakest of the sixteen: thin streamers, and a pale horse close to
  the knight's grey one.
- The lumber camp is weakest at phone size, and resources and buildings are centred so
  they overlap trees (the board skips the terrain feature under them).
- Footprint and box tests ignore stroke width, caps and radii. No test renders
  `ArtSheet`. No test that the skin tone is used only for skin. The `extents` helper is
  duplicated in two test files.
- A duplicated comment and a magic expression in `features.tsx`. `ArtSheet` has a split
  palette import. `Ink` is exported from `features.tsx` (accepted).
- Resources and buildings still need a look at forest tiles in the real game.

Code and colour

- `FACTION_COLOUR` in `Pass.tsx` and `colour.ts` duplicates `PLAYER_COLOURS`, both keyed
  by faction. Spec 8.4 wants player colour separate from faction colour (M12).
- `ArtSheet` and `BoardDemo` ship in the production bundle (M11, also in the first
  deploy list).
- `?seed=` is honoured in the production build (N12, also in the first deploy list).

Tests and tooling

- The purity test skips bare-package imports and scans `.ts` files only.
- The error boundary has no browser test. If Home itself throws, the fallback shows
  again each time (no loop, saves intact).
- There is no Setup test (blank name, 16 character limit), no test of `persist()` on
  resume, no test for screen `match` with a null viewer, and no Match-level test for a
  selected enemy city.
- The double-tap browser test's second click probably lands on a detached node, so the
  store's guard is proven by the unit test only. Nested scroller positions are not
  restored after `scrollIntoView`, and `scrolls(page)` ignores the page's overflow
  style. The overlay test reaches a real reward card but no real digest.
- Offline test hygiene: the temp dir leaks if `cp`, the build or `openApp` throws
  before the `try`, the second build may use `NODE_ENV=test`, tap helpers are duplicated
  from `flow.test.ts`, and `footer.version` is selected by class.
- The deploy guard test matches `run:` lines anywhere, the gate text may be in a comment,
  and browser test files are detected by single-quoted imports only. Actions are pinned
  by tag, not by commit, and `tsc` runs twice.
- `package.json` key order is noisy, and `boardBounds` sorts keys needlessly.
- Several tasks (11, 12, 14a, 13a and the camera fix) had no separate failing run.
