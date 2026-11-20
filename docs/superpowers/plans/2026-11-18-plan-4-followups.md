# Plan 4 (live online play): outcome and follow-ups

Date: 2026-11-20. Built on branch `plan-4-online-play` (final head 3edf717 plus the Firebase config commit 5c6251c), merged into `main` as 3abc2e6 and
pushed. The rule tweaks that followed were merged as 34b6351, which is the head of `main` at the time of writing and the
build live at `sonofwatt.github.io/warbanners` (app 0.3.1, rules 3).

## Outcome

All 14 planned tasks are built and reviewed. Every Critical and Important review finding was fixed and re-reviewed clean,
including the final whole-branch review (Fable), which found one Critical and four Important items. The Firebase project
was set up with David's yes on 2026-11-20 and the build is deployed.

What it delivers:

- The wire (`src/online`): room codes, invite links, encoded canonical actions, and defensive reads with bounds (names,
  uids, at most 100,000 actions per match). A hostile or malformed record reads as a worded failure, never a crash.
- The database rules (`database.rules.json`), tested clause by clause against the emulator: who may append, no rewritten
  history, one write per action index, resign only for yourself, an `endTurn` must hand the turn over with a fresh
  `turnAt`, desync needs a room and membership, tidy deletion of rooms.
- The Net layer (`src/net`): one contract, run against both the Firebase implementation and an in-memory fake that mirrors
  the rules (guarded by a SHA-256 of the rules file, so a rules change fails the fake's tests until the copy is reviewed).
- Following the record: apply, compare each `checks[n]` hash with the replayed state, rebuild on a mismatch. A loaded
  snapshot is shown at once but never trusted: the phone replays the actions in small chunks and the replay wins.
- The turn clock, the drop pause and the credit a returning phone claims; the host role and online AI seats (the host's
  phone runs the AI with the same loop as solo play, and a handover host restarts the turn from the saved actions).
- The online session (`src/online/session.ts`) and the store's online side: no curtain, your own view, waiting states,
  this phone's online matches kept apart from saves, and `?room=` kept in the address while the player is in the room so
  a reload comes back.
- The online screens: setup, lobby, join and the waiting states, at four sizes, with a Hud that cuts a long name and keeps
  "'s turn" whole.
- Proofs: a whole online match in two Chromium phones against the emulator (`test:online`), a test that local play, sockets
  and solo play included, never contacts Firebase, and `docs/online.md` with the traps.
- Delivered by the controller: Firebase project `banners-game` set up on 2026-11-20 with David's yes (web app registered,
  Realtime Database `banners-game-default-rtdb` in us-central1, anonymous sign-in on, rules deployed and checked: an
  unauthenticated read of `rooms.json` is refused). CI run 44804892207 (plan 4) and run 44806400007 (0.3.1) deployed to
  GitHub Pages. The deploy job now runs only on `main`, so a manual run on another branch shows deploy skipped, not failed.
- Two CI flakes were fixed on `main`: `hud.test` read `dist` when the file was collected instead of when the suite ran,
  and the polling timeouts were too short for a slow runner.
- A live check on the real database: two Chromium phones played room CV82LK, Ann moved and Ben's phone showed "Your turn".
- On 2026-11-20 evening David's Pixel 10 Pro showed the live site at Version 0.3.1 (34b6351), rules 3, and Warbanners is
  installed there as a home-screen app (a Chrome WebAPK). David's iPhone install has not been checked.

Test counts at the head of `main`: 760 unit tests pass (rules 3 and the AI fix), `test:emu` 827 pass, and `test:browser`
6 plus 35 at both bases (`/` and `/warbanners/`). Type checks and lint are clean.

## The rule tweaks (0.3.1, rules 3)

Right after plan 4 merged, David asked for three rule changes. They ran as one small subagent-driven job
(`.superpowers/sdd/rule-tweaks-1/`), merged as 34b6351:

- A second tap on the same enemy, while the Attack or Attack-and-lure choice is showing, does the plain attack.
- Scouts cannot capture cities (new trait `noCityCapture`, with a trait text). A scout may still capture a village.
- The Defender is tougher: def 7 and hp 15 became def 9 and hp 20, cost unchanged. A Warrior now hits it for 3 of 20
  (was 4 of 15), with a counter of 1.
- `RULES_VERSION` 2 became 3 and `APP_VERSION` 0.3.1. The pinned fingerprint gained a 3 entry (`ba3e0e466edfedd3`) and
  kept the 2 entry. The speed test's pinned digests for seeds 7, 1 and 3 were repinned from these edits only.
- One fix round: the AI ignored the new trait (it still pulled a scout toward enemy cities and counted it as a capture
  threat). Three guards in `src/ai/assess.ts` and two red-first tests fixed it, re-checked clean.
- A solo match half played on rules 2 cannot be continued. This is by design (plan 2's rule): Home lists it as from an
  older version.

## Decisions made during the build

There are 22 rulings in the two ledgers (18 in plan 4's, 4 in the rule tweaks'), listed here in order. Each says what it
costs if wrong.

1. Plan 4's worktree has its own `node_modules` (`npm ci`), not a symlink, because Task 2 installs the Firebase packages
   and a shared folder would leak them into `main`. If wrong, disk space.
2. The Firebase one-time setup F1 to F4 waits for David's yes, since the database region is permanent and the step is
   outside this repo. Every task before Task 14 runs against the emulator, so the build did not wait. If wrong, nothing.
3. Every mismatch found in the pre-flight check is carried into the dispatch of the task it affects by pointing the
   implementer at `preflight.md`. The plan file is not re-edited. If wrong, an implementer misses a line and the task
   review catches it.
4. The Global Constraint "nothing in `src/net` imports `src/ui` or anything else from `src/app`" is loosened for
   `src/net/sessionKit.ts`, a test helper nothing in the app imports, which may import `src/ai` and `src/app/aiClient.ts`.
   If wrong, nothing.
5. Task 4's two extra database rules stand: a forged resign is refused unless it is exactly the writer's own resign, and an
   `endTurn` must hand the turn to the other seat with `turnAt` now and `paused` 0. Both close real exploits (winning by
   resigning the opponent, keeping the turn or handing over a spent clock) and the fake Net mirrors them. If wrong, two
   rules relaxed for stage 4's three-player games.
6. Task 3's bounds stand: at most 10,000 actions per match and uids of 1 to 128 characters (Firebase anonymous uids are
   28). The action cap was later raised (ruling 12). If wrong, one constant.
7. Closing one watch no longer marks the phone absent while its match is live. The reviewer graded it Minor, the controller
   treated it as Important and had it fixed: presence is written and cancelled only if this Net called `present(code)` and
   no other watch on that code is open. If wrong, one extra fix round.
8. The same fix round added a drift guard (a SHA-256 of `database.rules.json` pinned beside the fake's rules copy),
   detached the `serverOffset` listener and calls `connected(false)` when the config is missing. If wrong, nothing.
9. The brief's `void` return for `rememberOnline` is overridden: it returns an outcome (saved, droppedUnfinished, failed)
   like the saves do, so a player is never silently left without a pointer to a live match (plan 2's rule). If wrong,
   Tasks 11 and 12 read one more value.
10. The final whole-branch review on Fable runs after Task 14's docs and before the Firebase setup, merge and deploy. The
    controller steps wait for David's yes. If wrong, nothing.
11. Critical C1 (a forged snapshot) is fixed on the client: a loaded snapshot is shown at once for speed but never trusted.
    The phone replays the actions from the start in small chunks off the critical path (no main-thread task over 100 ms)
    and, if the replay disagrees with the snapshot, the replay wins and the forging seat's record is reported as a
    desync. If wrong, a few seconds of background work on reopening a long match.
12. The action cap rises from 10,000 to 100,000, and a list past it, or unreadable, is a worded failure, never a silent
    stop. If wrong, one constant.
13. The fix wave takes C1, I1 to I4 and the two named minors in one Opus implementer, then one scoped Sonnet re-review.
    If wrong, nothing.
14. A forged record leaving both phones in a worded desync, with Home as the way out, is accepted: the match was cheated
    and no honest state exists to continue from. If wrong, a stage 3 "abandon match" button.
15. The short Hud label "Offline", where "Your turn, once online" does not fit, is accepted; the line over the board says
    the rest. If wrong, a wording change.
16. The synchronous replay inside a rebuild after a lost race is deferred to the follow-ups: it is rare and only long
    matches would block the screen. If wrong, a stutter on a long online match after a race.
17. The missing page-visible trigger for I1 (a phone waking with a dead socket) is parked as a minor: the sleep case is
    fixed by a tick gap over 5 s, and a hidden tab with a dead socket still gets the drop and return detection. If wrong,
    a rare turn lost on a phone that wakes without a tick gap.
18. The deploy job runs only on `main` (`if: github.ref == 'refs/heads/main'`), so a manual run on another branch shows
    deploy skipped, not failed. If wrong, nothing.
19. A second tap on the same enemy while the Attack or Attack-and-lure choice is showing does the plain attack (the only
    case where one tap did not already attack). If wrong, one UI branch.
20. The scout may still capture villages (it is the Spartans' starting unit and its only early way to expand), not
    cities, through the trait `noCityCapture`. If wrong, one condition.
21. Defender def 7 hp 15 becomes def 9 hp 20, cost unchanged. If wrong, two numbers.
22. `RULES_VERSION` goes 2 to 3 and the app to 0.3.1, so half-played solo saves from rules 2 show as from older rules and
    cannot be continued (plan 2's design). If wrong, a lost solo match.

## What stage 1's done list still lacks

Spec section 9, item by item:

- A lobby on one phone, a link, a second phone joins: built and proven in two Chromium phones on the real database (room
  CV82LK). Not yet tried with David's two real phones.
- A full live match to elimination or resignation with a working clock: built and tested on the emulator and for one
  move on the real database. No full match on two real phones over real networks, and the clock's drop pause and credit
  have only run against the emulator.
- Solo against the AI at easy, normal, hard or adaptive: done in plan 3. The Pixel check of the 100 ms and 3 s bounds on
  the real phone is still open.
- Airplane mode: the installed game opens, starts a solo match and resumes one half played. Covered by the offline browser
  tests; not tried on a real phone in airplane mode.
- Closing the browser mid-match and reopening the link resumes the match: covered by the two-browser reopen test; not
  tried on real phones.
- Installs to the home screen on the Pixel 10 Pro and on David's iPhone: the Pixel is done (a Chrome WebAPK, showing 0.3.1).
  The iPhone has not been checked. Its Safari tab and home-screen app have separate storage, so check that a player
  reopening from the home-screen app gets their seat back or takes it from the join screen (`docs/online.md`).
- Both factions feel different to play: David's call, not tested. The balance issues carried below bear on it.

## Carried tuning items from plan 3

Still open, in plan 3's order (see `2026-11-18-plan-3-followups.md` for the figures):

- The first seat wins more. Normal against normal: first seat 58.5% on the tuning seeds, 50.0% against 39.3% on fresh
  seeds. In solo play the person always moves first, so it favours the person.
- The hard AI never lures. A lure gets exactly its plain twin's score and hard's `topK` of 1 keeps the plain attack.
  Fix by breaking the tie towards the lure when the pull is safe, then re-check hard over normal.
- Matches run long: median 39 rounds (target 20 to 35), about 21% of even matches stall at the 60-round cap.
- The ladder comes mostly from the Mongol side; no skill setting changes how well the Spartans play.
- The Mongol formation weight (-0.25) was chosen partly so the SLOW "adaptive climbs" test passes. Make that test read the
  mean over its matches, then choose the weight on play.
- A third-seed-set confirmation of the ladder (one 200-match run; hard over easy sits on the 80% line).
- Rules 3 changed the numbers under all of this (Defender def 9 hp 20, scouts no city capture). The tuning figures were
  taken on rules 2 and have not been re-run, so a short sim run is needed before trusting them.
- Plan 1's open items still stand: no draw rule, `applyAction` cloning before refusing.
- The M2 note from plan 2 (zone of control reads the full state) still needs its one-line decision note.

## Follow-ups

Deferred minors, grouped by area. None blocks play. Items fixed in a fix round are not listed. Those marked **Plan 5**
should be picked up there.

Store and session

- **Plan 5:** extract the online part of `src/app/store.ts` into `src/app/onlineStore.ts` (store.ts is 717 lines, about
  330 of them online).
- `src/online/session.ts` is 651 lines and its write queue is a separable unit. Plan 5 may split it while it is in there.
- **Plan 5:** a rebuild after a lost race still replays the whole list synchronously (ruling 16). Move it onto the
  chunked replay.
- **Plan 5:** no page-visible trigger for a phone waking with a dead socket (ruling 17); I1 has no emulator test because
  the emulator cannot make a stale socket.
- **Plan 5:** five `refused` in a row end as `serverOutOfDate`, which is misleading (`store.ts:592`).
- **Plan 5:** an offline Continue shows `needsConnection` rather than the cached board (`store.ts:614`).
- A batch of remote steps becomes one `last` with the first step's `before` (`store.ts:436`). `select` open while waiting
  needs a comment.
- `joinAs` and `takeSeat` drop their result (Task 12 reads `online.failure`).
- A queued resign later refused flips the phase back to playing; the notice `resignLost` exists but the case has little
  test cover.
- A remote step during verifying can set the broken desync with `recordForged` false, which a later agreeing replay could
  in theory clear (needs an already inconsistent record).
- The solo no-network test never goes Home, so the sweep and `forgetRoom` paths are untested for local play.
- The microtask does not guarantee the seats caught up on Firebase, so a partial AI turn after a handover may read a stale
  dial.
- A phone with no presence entry counts as away at once; measure from `meta.createdAt`. Reclaim does not check that the
  creator still holds a human seat.
- If `append` throws, the AI seat's retry moves to the next step and a throw from the pass send escapes. No tests for
  fail-once-then-succeed, a pass that does not land or the uid tie-break.
- `pauseCredit` lacks `clockView`'s drop-after-deadline guard, `creditOnReturn` ignores `clockSec` (the caller must not
  claim a credit with the clock off), and there is no test for a second drop in one turn.
- A refused cache write leaves any earlier cache for that code stale (`cached` false tells the caller).
- `sync.ts:134` should check that `snap.n` is a non-negative integer. The fallback tests assert only `ok` and
  `'fallback'`, never that `fromSnap` is false, and there are no tests for a `checks` mismatch or follow's mismatch paths.

Net layer and database rules

- The fake Net is a hand copy of the rules (about 550 lines). Only a SHA-256 pin ties it to `database.rules.json`. Three
  clauses no current patch reaches are not mirrored (the delete grant cascading to child writes, ancestor `.validate`,
  overlapping update paths).
- The fake raises no early local or rollback events, and a dropped phone's non-append writes are not held in it.
- `Net.append` can throw for non-permission errors and `net.ts:35` does not say so.
- The rules do not require `head.n` to be an integer (harmless, the client refuses one). Only `head/hash` is tested alone
  for the signed-in requirement.
- The current player can fake a drop to claim the 3-minute credit (trust model, documented). The host may move an AI
  seat's `adapt` with any append.
- No lobby leave and no way for the host to turn an AI seat back to empty (not needed in stage 1). Both extra rules
  assume two seats, so stage 4 revisits them.
- The rules emulator test uses literal `rulesVersion` values 2 and 3 (left alone).
- The `now >=` boundary is guarded by `rulesMirror`, not by an emulator test.

Screens and layout

- The Hud shows "Offline" in landscape and on narrow phones where "Your turn, once online" does not fit (ruling 15), and
  that string is not in the layout test. In short landscape with the clock on `.hud-turn` is fixed at 52 px and may wrap to
  about three lines.
- `updateDuringOnline` shows `{name}` literally until a screen fills it in.
- Lobby rooms go on the list with an empty second name. A lobby-only entry reads "Your match with  is still going"
  (`Home.tsx:403`).
- A failed clipboard copy is silent (`Lobby.tsx:622`); the version phase with no numbers shows "rules 0" (`Join.tsx:512`).
- The room code in the address can be saved by iOS Add to Home Screen from inside a room. Check this on the iPhone.
- A PASTE_ME build gets the emulator config but no emulator connection, so a stray `ensureSignedIn` would call Google with
  key `demo`. Task 12 blocked every screen from it, but the layer itself does not.

Tests and CI

- **Plan 5:** `tapTile` is still copied in four browser test files. Share one helper.
- `coverage.test.ts` checks only the run line of the workflow, not the online script's gates. `offline.test.ts` matches
  the whole URL rather than the host.
- Two early online assertions can pass from the localStorage cache (the later poll is the real proof), and port reuse after
  a close can race. A hard-coded "lost their connection" string sits in a test.
- The emulator coverage guard's `setup-java` and cache checks are whole-file substring matches. `.env.emu` and `dist-emu`
  had no consumer at Task 2.
- A first `test:emu` run once had one failing file, unidentified, and passed on rerun. Watch for an emulator flake.
- The timing heuristic that decides timeouts only on ticks at least 250 ms after the last reading is documented; a
  "due on two consecutive ticks" rule was rejected because it would break the 500 ms timing.
- `hud.test.tsx` reads `dist` when the suite runs, so a fresh worktree needs a build before `npm test`.
- Plan 3's follow-ups (engine and view, AI planner, simulation, worker and store, layout and art) still stand unless
  listed above.

## Carried into plan 5

- The first item of plan 5 is the `onlineStore.ts` extraction above, before more online features land in the store.
- Check David's iPhone install and an iPhone seat takeover.
- Two real phones, a full match over real networks, then the airplane-mode and reopen checks on the Pixel.
- Never deploy a `RULES_VERSION` bump while an online match is being played (CLAUDE.md). The next bump needs the rules
  bump rule from plan 2 and a coordinated quiet moment.
- After any edit to `database.rules.json` the controller deploys it and checks it is live, never a subagent.
