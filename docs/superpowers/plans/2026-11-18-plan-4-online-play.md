# Warbanners Plan 4: Live Online Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 3, 2026-11-19.** Revises rev 2 after its review (`.superpowers/drafts/plan-4-online-rev2-review.md`: 1 Critical, 11 Important, 15 Minor). Every interface below was read from the code plans 2 and 3 built (plan 2 on `main`, plan 3 on `plan-3-ai` at `cfce99e`). Each task ends with **What changed from rev 2**. "Changes from rev 2" at the end lists every review finding and what was done with it. Execute only after plan 3 is merged into `main`; Task 0 re-checks the few things plan 3's last tasks may still move.

**Goal:** Two people, each on their own phone, play a full live Spartans against Mongols match of Warbanners: one opens a lobby and sends an invite link, the other joins, turns go in order with a turn clock, and a dropped connection, a reload or a closed browser loses nothing. Solo play against the AI, pass-the-phone play and the saves on the phone work exactly as before, with no connection.

**Architecture:** The match record lives in Firebase Realtime Database under a six-letter room code: meta, seats, and the ordered list of actions stored as canonical JSON strings. The phone whose turn it is (or the host's phone, for an AI seat) checks each action with the engine and appends it with one atomic multi-path write; the database rules allow that write only from the right writer, only at the next index, and never over an existing action. Every phone replays the list with the engine and compares `hashState` with the hash the writer stored. All decisions (who may act, when the clock runs out, how much drop pause to credit, who stands in as host, whether the replay agrees) are pure functions in `src/online`, tested without a network. A thin `Net` layer in `src/net` is the only code that imports Firebase; it is tested against the emulator, and an in-memory fake is held to the same contract tests, including the SDK's habit of holding writes while offline. The app store gains an online mode that drives the existing match screen from an online session instead of from a local save; the Firebase code is loaded with a dynamic `import()` only when the player opens online play.

**Tech Stack:** firebase ^12.18.0 (Realtime Database, anonymous Auth), firebase-tools ^15.28.1 (emulator, rules and auth deploy), @firebase/rules-unit-testing ^5.0.2, Java 21 for the database emulator (installed system-wide on ClaudeComputer: `/usr/bin/java`, OpenJDK 21.0.13). On top of what is on `main`: React ^19.3, Zustand ^5.1, Vite ^8.3, vite-plugin-pwa ^2.0, Vitest ^4.1, Playwright ^1.65, oxlint ^1.75, cross-env ^10.1, tsx, TypeScript ~6.0, Node 24. The three Firebase versions match `~/projects/deutsch-dash`.

**Spec:** `docs/superpowers/specs/2026-11-18-banners-design.md` sections 3, 6.1, 7 ("Running it"), 8.2, 8.3, 8.5, 8.7 and 9. Also `docs/superpowers/plans/2026-11-18-plan-2-followups.md` ("Carried into plan 4"), `docs/superpowers/plans/2026-11-18-plan-3-ai.md` (the AI client, driver and store loop this plan reuses) and `docs/rules/stage1-rules.md` (resign). Background worth reading before Tasks 2, 4 and 5: `~/projects/deutsch-dash/handoff.md` sections "Editing database.rules.json is half the job", "Firebase and the emulator", "CI runs the emulator suite", "Trust model" and "State and host continuity".

**Where this sits:** Stage 1 of the design is four plans. This is the fourth.

1. Rules engine (done, on `main`).
2. The game on screen (done, on `main`, live at https://sonofwatt.github.io/warbanners/).
3. AI opponents and number tuning (on `plan-3-ai`; merged before this plan starts).
4. Live online play (this plan): lobby, invite link, turn clock, rejoin, version check, host role with AI seats.

**Not in this plan:** remote play over days with notifications (stage 3; a clock-off match here already waits for days), more than two seats (stage 4), chat, spectators, speed settings (stage 4), offering "play the AI online" in the lobby (built and tested, not offered; see decisions).

## What changed from the 2026-11-18 draft, in short

- **No `RULES_VERSION` bump.** `RULES_VERSION` is already 2 (plan 3 raised it for David's rule changes and the riders-into-fog rule, and plan 3's tuning stays inside 2). Resign-by-seat is additive: a version 2 record never holds a `player` field, so every version 2 record replays the same, and no phone without online code can ever meet an online record. The fingerprint test is pinned to version 2 after plan 3's last tuning commit.
- **The AI is not a stateless `chooseTurn`.** Online AI seats reuse plan 3's step driver (`aiStep`, `afterThink`, `afterAct`), `AiClient.think`, the per-seat `salt` and the adaptive `AdaptState`, keep `salt` and `adapt` in the database seat so a stand-in host carries on the same AI, and never run the store's solo `playAi` loop.
- **Firebase setup is mostly an agent's job** (F1 to F6 below), with the console only as a fallback.
- **Names, paths, keys and versions follow the rename and the merged code.**
- **Online matches are kept apart from the 20 saves** under their own keys.

## What rev 3 changes, in short

- **A returning player's presence and drop credit go in one atomic write** (`presentPatch`), and the rules accept the credit only when it is no more than the time the server saw the player away. A session that has just reconnected takes no clock decision until that write has landed. This closes the Critical finding: the returning phone used to see its own stale "present" presence and end its own turn at once.
- **Timeouts:** the rule is `now >= deadline`, the current phone writes 500 ms after the deadline and the waiting phone 3 s after, and a refused timeout is retried once.
- **Offline writes are pending, not refused**, as in the real SDK: the fake now holds a dropped phone's writes and lands them on its return, and the contract proves both sides behave the same.
- **Every `head` field is pinned by the rules** unless `head/n` moves, with negative tests; AI seats are lobby-only; a stale `desync` entry of a non-member can be removed by anyone.
- **The session test helpers live in `src/net/sessionKit.ts`**, so `src/online` stays pure, and the "configured?" flag lives in `src/netReady.ts`, which holds no URL, so the main chunk never names the database.
- **Resigning on the other player's turn** has a store action; **the same browser coming back** after it was closed is tested with its saved storage.

## Global Constraints

- Never write an em dash or an en dash anywhere: code, comments, tests, commit messages, docs, text the game shows. `src/noEmDash.test.ts` sweeps tracked files. Use a hyphen, a colon, or a new sentence.
- Nothing is copied from Hexonia or any other game. Wording is our own.
- Plan 2's and plan 3's constraints all still hold, with one amendment: requests may leave the phone for Firebase (`banners-game-default-rtdb.firebaseio.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`) only after the player opens online play, opens an invite link, or continues an online match. Solo and pass-the-phone play never load `src/net` and never contact Firebase.
- Code outside `src/engine` imports the engine only through `src/engine/index.ts` (the import ends in `/engine` or `/engine/index`). `src/boundaries.test.ts` gains `src/net` and `src/online` in the checked folders and three new tests: nothing outside `src/net` imports `firebase/*`; no non-test file in `src/ui`, `src/app`, `src/online` or `src/main.tsx` imports `src/net` except with `import type` or a dynamic `import('../net/...')` (test files, named by `/\.test\.tsx?$/`, are exempt); `src/netReady.ts` imports nothing and contains no URL.
- `src/online` is pure: its non-test files import the engine, `src/ai`, types from `src/app/record.ts`, and `src/app/aiClient.ts` (the `AiClient` type, `isSuperseded` and `SupersededError`; that file imports only `src/ai`), never `src/net`, `src/ui` or Firebase. `src/net` imports Firebase, `src/netReady.ts` and `src/online` (the session test helpers in `src/net/sessionKit.ts` import `src/online/session.ts`; nothing in the app imports `sessionKit.ts`). Through `wire.ts`, `src/net` sees one type from `src/app/record.ts` (`Seat`); that type-only edge is allowed and vanishes at build time. Nothing in `src/net` imports `src/ui` or anything else from `src/app`.
- Nothing outside the engine changes a `MatchState`. Every change, local or received, goes through `applyAction`.
- No Firebase, DOM, storage, clock or randomness access when a module loads. `src/net/firebase.ts` creates the app on the first call, never on import.
- Everything stored in the database that came from the engine is a JSON string: actions, settings, snapshots. Firebase drops `null` and empty arrays, which would change the hash.
- Actions are encoded with the engine's `canonical()` (sorted keys), so the rules can match exact strings such as `{"type":"endTurn"}`.
- Every read of the database is untrusted: every value goes through `normalizeRoom`, `readActions`, `decodeAction` or `decodeSettings` before use. The client never assumes the rules were deployed.
- Never subscribe to a whole room. Listen to `meta`, `seats`, `members`, `presence`, `head`, `desync` and `actions` separately; read `match`, `snap`, `checks`, and the fresh `head` and own presence on a return, once with `get()`.
- Never compare two phones' clocks. Every deadline is computed from server timestamps plus `.info/serverTimeOffset`, and the rules check the server's `now`. A phone that has just reconnected takes no clock decision until its return write (`present`) has landed.
- The SDK holds writes made while offline and sends them on reconnect; it does not reject them. `append` is allowed to stay pending for as long as the phone is offline. Every other `Net` method answers `'offline'` after `NET_TIMEOUT_MS` (10 s). A held write that lands late is checked by the rules like any other.
- Rules changes are half done until deployed: after any edit to `database.rules.json` the controller (never a subagent) runs `npx firebase deploy --only database --project banners-game` and the `curl` check in Controller step F5.
- In `database.rules.json`, no `.write` grant sits at `rooms/$code`, `head` or `seats/$s` except the delete-only grant on the room; each leaf that may be written has its own `.write`, so no grant cascades to a child it did not mean to open.
- Emulator suites (`*.emu.test.ts`) gate on `describe.runIf(process.env.EMULATOR === '1')`. CI runs `npm run test:emu` in place of `npm test`; `src/net/emulatorCoverage.test.ts` fails if it stops.
- Browser suites keep plan 2's exact gate `describe.runIf(process.env.BROWSER === '1')` (the regex in `src/browser/coverage.test.ts` requires it); the online browser suite nests a second `describe.runIf(process.env.EMULATOR === '1')` inside it.
- ClaudeComputer runs out of memory when too much is left running. Run one emulator suite at a time, never leave `npm run emu` running after a task, and stop any dev server you started.
- Every display string lives in `src/ui/text.ts` (`T.ui`, filled with `fill(template, values)` and `{name}` placeholders). Online play says plainly that it needs a connection and that the match is safe when one is lost.
- Dependencies are limited to the Tech Stack list.
- `npm test`, `npm run typecheck` and `npm run lint` are clean at every commit; `npm run test:emu` is clean at every commit that touches `src/net`, `src/online`, `database.rules.json` or `firebase.json`; `npm run test:browser` is clean at every commit that touches `src/ui`, `src/app` or the build.
- The `git ls-files` guards in `boundaries.test.ts` and `emulatorCoverage.test.ts` see only files git knows about: stage new files by name (`git add <files>`) before running the suites in the step that checks them, then commit.
- A new version of the app is never applied mid-match (`CLAUDE.md`). Online play keeps that: the update is applied only from Home.
- Every commit message ends with the `Co-Authored-By:` trailer the controller's session names, with the address `noreply@anthropic.com`. Stage files by name; never `git add -A`.
- Work on branch `plan-4-online-play` in a worktree `~/projects/banners/.worktrees/online`, cut from `main` after plan 3's merge. Do not push: the controller pushes after the final review and the owner's yes.

## Review Focus

1. Both phones write at the same instant: the waiting phone's timeout `endTurn` against the current player's last move, or a double tap on End turn. Exactly one write lands, the other phone rebuilds from the database, and no turn is ended twice. Pinned in Task 5 (contract) and Task 9 (the race with the loser's watcher held back).
2. A reload, a killed app or a dropped connection between a local move and its write reaching the database. On reopening, the database wins: the board shows what was stored, a held write that lost its place is refused and rolled back, nothing else is lost, and the clock resumes with the drop credited. Pinned in Tasks 5 and 9.
3. A player coming back from a drop past the original deadline but inside the pause allowance: neither phone ends the turn, and both clocks show the credited time. Pinned in Task 4 (the credit rule), Task 7 and Task 9.
4. The same person on a different identity: the invite link opened in Safari after installing to the iPhone home screen (separate storage, so a new anonymous identity), Safari's seven-day storage purge, or cleared site data. The join screen offers "I'm Ben" for the absent seat and the match carries on. Pinned in Task 4 (rules) and Tasks 9 and 13. The same browser with its storage intact comes straight back with no questions (Task 13).
5. A new build lands between sessions mid-match. Same rules version: the match carries on. Different rules version: a plain message naming both versions, the match stays in the database, and nothing is deleted or overwritten. Pinned in Task 9 and Task 11.
6. Solo and pass-the-phone play are untouched: no Firebase request, saves listed and resumed as before, the solo AI loop never runs in an online match and the online AI loop never runs in a local one. Pinned in Task 11 and Task 13.
7. Database rules in production older than the code. Creating a room fails at once with a sentence naming the cause. Pinned in Task 4 (schema literal) and Task 5.

---

## Task 0 (controller): pre-flight after plan 3's merge

Not a subagent task. Before Task 1, on merged `main`:

- [ ] Cut the worktree: `git worktree add .worktrees/online -b plan-4-online-play main`, `npm ci` in it, and run `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:browser`. All pass.
- [ ] Re-check these against the merged code and correct the task briefs if any moved (each was true at `plan-3-ai` `cfce99e` on 2026-11-19 unless marked):
  - `RULES_VERSION` in `src/engine/types.ts` is 2 and no rules change is waiting on another branch. If plan 3 ended on another number, Task 1's fingerprint key is that number; nothing else in this plan names it.
  - `Action`'s resign is `{ type: 'resign' }` and `resignHandler` in `src/engine/capture.ts` eliminates `s.current` through `eliminate(s, p, ev)`.
  - `canonical` is exported from `src/engine/hash.ts` and not from the index.
  - `src/app/store.ts`: `Deps { kv; now; newSeed; newId; updater?; ai: AiClient; sleep }`, `Screen`, `Notice`, `soloSeat`, `playAi`, `accept`, `openMatch`, `leave`, `FIRST_THINK_MS`, `REPLAN_MS` (used by the store itself at the `deadlineMs` line), `AI_STEP_MS` as quoted in Task 11.
  - `src/app/record.ts`: `Seat`, `MatchRecord` (with `snapshot: { count; hash; state }`), `newRecord`, `append`, `setAdapt`, `restore` as quoted in Task 10.
  - `src/ai/driver.ts`: `aiStep`, `afterThink`, `afterAct`, `START`, `Cursor`, `AiSeat { player; dial; salt }`; `src/ai/adapt.ts`: `adaptStep`, `gapOf`, `AdaptState { dial; trend }`; `src/ai/types.ts`: `AiLevel`, `LEVEL_DIAL`; `src/ai/input.ts`: `aiInputFor`; `src/app/aiClient.ts`: `AiClient`, `SupersededError`, `isSuperseded`.
  - `src/ui/interaction.ts`: `Hit = { unit: number | null; hex: HexKey | null }`.
  - `src/browser/harness.ts`: `openApp(query, { width?, height?, serviceWorkers?, outDir?, beforeOpen? })` launching one browser per call (Task 13 adds `storageState?`).
  - The version line (`src/ui/Version.tsx`, `versionLine()`) on Home and in the Menu, and `APP_VERSION` after plan 3 (Task 14 sets the next minor). These are on `main`, not on `plan-3-ai`; after the merge both are there. Check they survived the merge.
  - The seed 7 facts at the top of `src/browser/flow.test.ts` (Task 13 uses them).
- [ ] Do the Firebase one-time setup below (F1 to F6) once Task 2 is committed (F3 needs its `firebase.json`). It blocks nothing until Task 14, since every test runs against the emulator; F4 and F5 are repeated after Task 4.

## Firebase one-time setup (controller, with the owner's go-ahead)

The project `banners-game` (display name "Banners", project number 377540570036) exists on the free plan with no apps and no database instances (checked 2026-11-19 with `firebase apps:list` and `firebase database:instances:list`). The Firebase CLI on ClaudeComputer is signed in to the owner's account. Keep the project id `banners-game`; the app is named Warbanners everywhere a player can see. Run every command from the worktree with the repo's own CLI (`npx firebase`, 15.28.1). Never run `firebase init` inside the repo (it rewrites `firebase.json` and `database.rules.json`).

**Owner only (before F1):** a yes to F1 to F4 on his project. The database region is permanent.

- [ ] **F1. Register the web app and record its config.**
  ```bash
  npx firebase apps:create WEB "Warbanners" --project banners-game
  npx firebase apps:sdkconfig WEB <appId printed above> --project banners-game
  ```
  Copy `apiKey` into `src/netReady.ts` (`FIREBASE_API_KEY`), and `authDomain`, `databaseURL` (expect `https://banners-game-default-rtdb.firebaseio.com`; it appears only after F2, so re-run `apps:sdkconfig` then), `projectId` and `appId` into `src/net/firebaseConfig.ts`, and commit ("Fill in the public Firebase web config"). These values are public by design; the rules make them safe. Create this app before F3, because `deploy --only auth` otherwise makes a "Default Web App" of its own.
- [ ] **F2. Create the default Realtime Database instance in `us-central1`.** `database:instances:create` cannot do it: it refuses while the project has no default instance (`lib/commands/database-instances-create.js` throws `MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE`). `firebase init database` can: its `createDefaultDatabaseInstance` calls the management API with type `DEFAULT_DATABASE`. Run it in an empty scratch folder, never in the repo, in a terminal tab (it is interactive; `expect` may not be installed):
  ```bash
  mkdir -p "$SCRATCH/fbinit" && cd "$SCRATCH/fbinit" && ~/projects/banners/.worktrees/online/node_modules/.bin/firebase init database --project banners-game
  ```
  Answer **Yes** to "Are you ready to proceed?", accept the rules file name, answer **Yes** to "haven't initialized Realtime Database ... set it up?", pick **us-central1**. Then delete the scratch folder. Check: `npx firebase database:instances:list --project banners-game` lists `banners-game-default-rtdb` in `us-central1`. Fallback if the CLI is refused: Firebase console, Build, Realtime Database, Create database, United States, Start in locked mode (needs the owner's Google sign-in).
- [ ] **F3. Enable anonymous sign-in.** There is no `auth:*` command for it, but firebase-tools 15.28.1 provisions providers from `firebase.json` (`lib/deploy/auth/deploy.js` sends `anonymousAuthProviderMode: PROVIDER_ENABLED` through `provisionFirebaseApp`). Task 2 puts `"auth": { "providers": { "anonymous": true } }` in `firebase.json`. Run `npx firebase deploy --only auth --project banners-game`. Check from the shell with the public key from F1:
  ```bash
  curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<apiKey>" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}' | head -c 200
  ```
  Expected: JSON with an `idToken`. `ADMIN_ONLY_OPERATION` or `OPERATION_NOT_ALLOWED` means it did not take: fall back to the console (Authentication, Get started, Sign-in method, Anonymous, Enable), which needs the owner's Google sign-in: ask him, or with his OK use Claude in Chrome in his signed-in browser. This path is untried against a real project; the console is the known route. (Each check creates one throwaway anonymous user; harmless.)
- [ ] **F4. Deploy the locked rules** (Task 2's `database.rules.json`, all closed): `npx firebase deploy --only database --project banners-game`.
- [ ] **F5. Check the rules are live.** `curl -s https://banners-game-default-rtdb.firebaseio.com/rooms.json` prints `{"error":"Permission denied"}` (or `{ "error" : "Permission denied" }`). Repeat F4 and F5 after Task 4 and after every later change to the rules file.
- [ ] **F6. Stay on the free plan.** No billing account, no Functions. Anonymous sign-in and one database instance are free (Spark: 1 GB stored, 10 GB a month downloaded, 100 connections at once). Two slow leaks are accepted and written in `docs/online.md` (Task 14): a lobby whose creator never returns is swept only by a manual delete or the 30-day idle rule, and every fresh browser adds one anonymous user to the project.

Authorized domains are not needed: anonymous sign-in does not use a redirect or popup. Restricting the browser API key to `sonofwatt.github.io` and `127.0.0.1` is optional hardening done in the Google Cloud console (see "Needs the owner").

---

## File Structure

```
firebase.json, .firebaserc, database.rules.json, .env.emu         new
src/engine/types.ts, capture.ts, index.ts                           resign by seat; export canonical (modify)
src/engine/fingerprint.test.ts                                      RULES_VERSION pinned to how the game plays
src/ai/driver.ts                                                    gains FIRST_THINK_MS, REPLAN_MS (moved from the store, which imports and re-exports them)
src/netReady.ts                the public API key and netReady(): no URL, no imports (static; safe in the main chunk)
src/net/firebaseConfig.ts      the rest of the public web config (filled in F1)
src/net/firebase.ts            lazy app, auth, database, emulator wiring, server time, reconnect
src/net/net.ts                 the Net interface every online module talks to
src/net/patches.ts             the exact multi-path writes, shared by firebaseNet, fakeNet and the rules tests
src/net/firebaseNet.ts         Net on Firebase
src/net/fakeNet.ts             Net in memory, same contract (holds a dropped phone's writes), for session and store tests
src/net/contract.ts            the contract tests, run against both
src/net/sessionKit.ts          session test helpers (pair, manualTimers, settle, the shared session test bodies), fake and emulator
src/net/*.emu.test.ts          rules, contract on Firebase, the session on Firebase
src/net/emulatorCoverage.test.ts   CI must run the emulator suite
src/online/wire.ts             constants, room types, codes, links, encoding, defensive reads
src/online/sync.ts             follow the remote list: apply, compare hashes, rebuild
src/online/clock.ts            turn clock, drop pause and the credit written on return
src/online/host.ts             host stand-in and which AI seat to play
src/online/aiSeat.ts           one AI turn for an online seat, with AiClient and the plan 3 driver
src/online/session.ts          one open room: ties Net, sync, clock, host and AI together
src/app/onlineList.ts          this phone's online matches and its cached copy of each
src/app/store.ts               online mode, new screens and notices (modify)
src/ui/screens/{OnlineSetup,Lobby,Join}.tsx                         new screens
src/ui/screens/{Home,Match,Result}.tsx, src/ui/panels/{Hud,Menu}.tsx, src/ui/App.tsx, src/ui/text.ts, src/ui/theme.css   (modify)
src/browser/harness.ts         openApp gains storageState (modify)
src/browser/online.test.ts     two phones in two browsers against the emulator
src/browser/offline.test.ts    solo play sends nothing to Firebase (modify)
.github/workflows/deploy.yml   Java, emulator jar cache, test:emu, test:online (modify)
docs/online.md                 layout, rules, traps, how to run the emulator
```

Database layout under `rooms/$code` (every time is server milliseconds unless named otherwise):

```
meta     { createdAt: server time (write once), creatorId, hostId, schema: 1, rulesVersion, build,
           clock: 0|60|120|180|300 (seconds), hostFaction: 'spartans'|'mongols', phase: 'lobby'|'playing'|'over' }
seats    { "0": Seat, "1": Seat }
           Seat (human) = { uid, name, kind: 'human', rules: the phone's RULES_VERSION when it took the seat }
           Seat (ai)    = { uid: 'ai_<s>', name, kind: 'ai', level: 'easy'|'normal'|'hard'|'adaptive', salt, adapt: { dial, trend } }
members  { <uid>: seat number }                 reverse index so the rules can find a writer's seat
presence { <uid>: { on: boolean, at: server time } }   onDisconnect writes { on: false, at }; a return writes { on: true, at } (with the credit when due)
match    { settings: JSON string of MatchSettings, startedAt: server time }   write once
head     { n: actions so far, seat: whose turn, hash: hashState after action n-1 (the opening hash when n is 0),
           at: server time of the last append, turnAt: server time the current turn began, paused: ms of drop pause credited this turn }
actions  { "0": JSON string, "1": ... }         append only
checks   { <n>: hash }                          written with each endTurn; write once
snap     { n, hash, state: JSON string }        replaced with each endTurn and at the end
desync   { <uid>: { n, hash, build } }          owner-written, removed by its owner once the phones agree, or by anyone once <uid> is no longer a member
```

---

### Task 1: Engine hand-over: resign by seat, the rules fingerprint, canonical, AI timing constants

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/capture.ts`, `src/engine/index.ts`, `src/engine/capture.test.ts`, `docs/rules/stage1-rules.md`, `src/ai/driver.ts`, `src/app/store.ts` (import and re-export only)
- Create: `src/engine/fingerprint.test.ts`

**Interfaces:**
- Consumes: `eliminate(s, p, ev)` and `resignHandler` in `capture.ts`; `endTurnHandler` in `turn.ts` (it passes the turn inline at its steps 3 and 4, so a shared `passTurn` must be extracted); `canonical` in `hash.ts`; `blankMatch`, `addCity`, `must` from `src/engine/testkit.ts`.
- Produces: `Action` variant `{ type: 'resign'; player?: PlayerId }`; `canonical(value: unknown): string` exported from `src/engine/index.ts`; `FIRST_THINK_MS = 2500` and `REPLAN_MS = 1000` exported from `src/ai/driver.ts`. The store uses both itself (the `deadlineMs` line in `playAi`), so it gains `import { FIRST_THINK_MS, REPLAN_MS } from '../ai/driver'` for its own use and keeps them public with `export { FIRST_THINK_MS, REPLAN_MS }`, so its tests and callers are unchanged. `RULES_VERSION` stays 2.

Rules for the new resign: `player` absent means `s.current` (today's behaviour, byte for byte). `player` present must be an integer naming an alive player, or the action is refused with `'invalid player'`. The named player is eliminated through `eliminate`. If the match goes on and the eliminated player was current, the turn passes exactly as `endTurn` would pass it: extract `passTurn(s, ev)` from `endTurnHandler`'s steps 3 and 4 inside the engine and call it from both; do not copy it. `legalActions` keeps listing the plain `{ type: 'resign' }`. With two players eliminating either one ends the match, so the turn-passing branch matters from stage 4; it is tested now with a third player added by hand.

- [ ] **Step 1: Write the failing tests**

```ts
// capture.test.ts additions
test('a player may resign out of turn, and only a real living player', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const t = must(applyAction(s, { type: 'resign', player: 1 }));
  expect(t.winner).toBe(0); expect(t.players[1]!.alive).toBe(false); expect(t.current).toBe(0);
  for (const player of [2, -1, 0.5, '1', null]) {
    expect(applyAction(s, { type: 'resign', player } as never)).toEqual({ ok: false, reason: 'invalid player' });
  }
  expect(must(applyAction(s, { type: 'resign' })).winner).toBe(1);
});
test('a resign without a player is exactly the old resign', () => {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  const a = applyAction(s, { type: 'resign' }); const b = applyAction(s, { type: 'resign', player: s.current });
  expect(a.ok && hashState(a.state)).toBe(b.ok && hashState(b.state));
  expect(a.ok && a.events).toEqual(b.ok && b.events);
});
test('a resigning current player hands the turn on when others remain', () => {
  const s = blankMatch(); s.players.push({ ...structuredClone(s.players[1]!), id: 2 });
  addCity(s, 0, 0, 0); addCity(s, 1, 3, 0); addCity(s, 2, -3, 0);
  const r = applyAction(s, { type: 'resign', player: 0 }); const t = must(r);
  expect(t.winner).toBeNull(); expect(t.current).toBe(1);
  const viaEnd = must(applyAction(s, { type: 'endTurn' }));
  expect(t.stamp).toBe(viaEnd.stamp);
  expect(r.ok && r.events.map(e => e.type)).toEqual(['eliminated', 'turnStarted']);
});
```

```ts
// fingerprint.test.ts
import { expect, test } from 'vitest';
import { applyAction, createMatch, hashState, legalActions, RULES_VERSION } from './index';
import { must } from './testkit';

// If this fails, the game plays differently. Bump RULES_VERSION in types.ts and add the new hash here.
// Two phones on different rules must never meet in a match, and a solo save from older rules must say so.
// Before bumping, read the plan 2 final review ruling: a bump strands half-played solo saves.
const FINGERPRINT: Record<number, string> = { 2: 'PASTE_ONCE' };

test('RULES_VERSION changes whenever the rules do', () => {
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    s = must(applyAction(s, legal[(i * 7) % legal.length]!));
  }
  expect(hashState(s)).toBe(FINGERPRINT[RULES_VERSION]);
}, 30_000);
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/engine`. Expected: the out-of-turn and hand-on tests fail (`invalid player` never returned, wrong player eliminated); the fingerprint test fails on `PASTE_ONCE`.
- [ ] **Step 3: Implement the resign change.** Extract `passTurn`. Export `canonical` from the index. Move `FIRST_THINK_MS` and `REPLAN_MS` to `src/ai/driver.ts`; in the store, import them and re-export them. Update the rules section on resigning in `docs/rules/stage1-rules.md`: "Either player may resign at any time, on their own turn or the other's."
- [ ] **Step 4: Fix the fingerprint.** Run the fingerprint test, copy the received hash into `FINGERPRINT[2]`, and run `npm test`: everything passes, including every `restore` and saves test (no version moved).
- [ ] **Step 5: Commit**

```bash
git add src/engine/types.ts src/engine/capture.ts src/engine/turn.ts src/engine/index.ts src/engine/capture.test.ts src/engine/fingerprint.test.ts docs/rules/stage1-rules.md src/ai/driver.ts src/app/store.ts
git commit -m "Let a player resign out of turn and pin the rules version to how the game plays"
```

**What changed from rev 2:** the store imports the two constants for its own use as well as re-exporting them (M14); `passTurn` is named as a required extraction and `turn.ts` is staged.

---

### Task 2: Firebase toolchain, emulator and CI

**Files:**
- Create: `firebase.json`, `.firebaserc`, `database.rules.json` (locked: `{ "rules": { ".read": false, ".write": false } }` until Task 4), `.env.emu`, `src/netReady.ts`, `src/net/firebaseConfig.ts`, `src/net/firebase.ts`, `src/net/firebase.emu.test.ts`, `src/net/firebase.test.ts`, `src/net/emulatorCoverage.test.ts`
- Modify: `package.json`, `package-lock.json`, `.gitignore`, `.github/workflows/deploy.yml`, `src/boundaries.test.ts`. (`tsconfig.json` already lists `vite/client`, so `import.meta.env` is typed and `vite.config.ts` needs no change.)

**Interfaces:**
- Produces:

```ts
// src/netReady.ts: no imports, no URL. Imported statically by the store, so it is in the main chunk.
export const FIREBASE_API_KEY: string;               // 'PASTE_ME' until Firebase setup F1; public by design
export function netReady(): boolean;                 // FIREBASE_API_KEY !== 'PASTE_ME' || import.meta.env.VITE_EMULATOR === '1'
                                                     //   || (import.meta.env.DEV && import.meta.env.VITE_USE_PROD !== '1')

// src/net/firebaseConfig.ts: the rest of the public client identifiers, filled in Firebase setup F1
export const firebaseConfig: { apiKey: string; authDomain: string; databaseURL: string; projectId: string; appId: string };
//   apiKey is FIREBASE_API_KEY imported from '../netReady'

// src/net/firebase.ts: nothing runs on import
export const EMU = { projectId: 'demo-banners', host: '127.0.0.1', dbPort: 9010, authPort: 9110,
  databaseURL: 'http://127.0.0.1:9010?ns=demo-banners-default-rtdb' } as const;
export function usingEmulator(): boolean;            // in Node: true when EMULATOR=1, otherwise THROWS (no test may reach production);
                                                     // in a browser: VITE_EMULATOR=1, or a dev server without VITE_USE_PROD=1
export function configMissing(): boolean;            // FIREBASE_API_KEY === 'PASTE_ME' && !usingEmulator()
export interface Fb { app: FirebaseApp; db: Database; auth: Auth }
export function fb(name?: string): Fb;               // created on first call per name; a second name is a second identity (tests)
export function ensureSignedIn(f: Fb): Promise<string>;      // anonymous; returns the uid
export function watchConnected(f: Fb, cb: (ok: boolean) => void): () => void;   // .info/connected
export function serverOffset(f: Fb, cb: (ms: number) => void): () => void;      // .info/serverTimeOffset
export function reconnect(f: Fb): void;              // goOffline then goOnline; only when believed offline
export function setOnline(f: Fb, on: boolean): void; // goOnline / goOffline; used by the emulator tests to drop a phone
```

"In Node" means `typeof window === 'undefined'`. The browser test build and the dev server are browsers; Vitest runs in Node.

- `package.json` scripts: `"emu": "firebase emulators:start --only database,auth --project demo-banners"`, `"test:emu": "firebase emulators:exec --only database,auth --project demo-banners \"cross-env EMULATOR=1 vitest run\""`. Dependencies: `firebase@^12.18.0`; dev: `firebase-tools@^15.28.1`, `@firebase/rules-unit-testing@^5.0.2`.
- `firebase.json`:
  ```json
  { "database": { "rules": "database.rules.json" },
    "auth": { "providers": { "anonymous": true } },
    "emulators": { "database": { "port": 9010 }, "auth": { "port": 9110 }, "hub": { "port": 4410 },
                   "logging": { "port": 4510 }, "ui": { "enabled": false }, "singleProjectMode": false } }
  ```
  The ports differ from Deutsch Dash's (9000, 9099, and the default hub 4400 and logging 4500), so the two projects' suites can never collide on this machine.
- `.firebaserc`: `{ "projects": { "default": "banners-game" } }`. `.env.emu`: `VITE_EMULATOR=1`. `.gitignore` gains `database-debug.log`, `firebase-debug.log`, `auth-debug.log`, `.firebase/`, `dist-emu/`.
- `fb()` uses `initializeAuth` with `[indexedDBLocalPersistence, browserLocalPersistence]` in a browser (so a phone keeps its identity across reloads and browser restarts; Deutsch Dash's comment on why explains it) and `inMemoryPersistence` in Node. With the emulator it calls `connectDatabaseEmulator(db, EMU.host, EMU.dbPort)` and `connectAuthEmulator(auth, 'http://127.0.0.1:9110', { disableWarnings: true })`. With `configMissing()` it initialises with the emulator config object and connects nowhere; the app shows `notSetUp` (Task 12). The emulator config is `{ apiKey: 'demo', projectId: EMU.projectId, databaseURL: EMU.databaseURL }`.
- Java 21 is on PATH on ClaudeComputer, so Deutsch Dash's `scripts/with-java.mjs` is not needed. A machine without Java gets the CLI's own message.

- [ ] **Step 1: Install.** `npm install firebase@^12.18.0 && npm install -D firebase-tools@^15.28.1 @firebase/rules-unit-testing@^5.0.2`
- [ ] **Step 2: Write the failing tests**

```ts
// firebase.emu.test.ts
import { ref, set } from 'firebase/database';
import { describe, expect, test } from 'vitest';
import { EMU, ensureSignedIn, fb, usingEmulator } from './firebase';

const emu = describe.runIf(process.env.EMULATOR === '1');
emu('the emulator', () => {
  test('the app points at the namespace the rules are loaded into', () => {
    expect(EMU.databaseURL).toBe('http://127.0.0.1:9010?ns=demo-banners-default-rtdb');
    expect(usingEmulator()).toBe(true);
  });
  test('CANARY: rules are on in that namespace (a signed-in write to the root is refused)', async () => {
    const f = fb('canary'); await ensureSignedIn(f);
    await expect(set(ref(f.db, 'canary'), 1)).rejects.toThrow(/permission/i);
  });
  test('two names are two identities', async () => {
    expect(await ensureSignedIn(fb('a'))).not.toBe(await ensureSignedIn(fb('b')));
  });
});
```

```ts
// firebase.test.ts (plain npm test)
import { afterEach, expect, test, vi } from 'vitest';
import { usingEmulator } from './firebase';

afterEach(() => { vi.unstubAllEnvs(); });
test('a Node process without EMULATOR=1 can never reach the live database', () => {
  vi.stubEnv('EMULATOR', '');
  expect(() => usingEmulator()).toThrow(/EMULATOR/);
  vi.stubEnv('EMULATOR', '1');
  expect(usingEmulator()).toBe(true);
});
```

```ts
// emulatorCoverage.test.ts (plain npm test)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const runs = (): string[] => readFileSync('.github/workflows/deploy.yml', 'utf8').split('\n')
  .map(l => /^\s*(?:-\s+)?run:\s*(.+?)\s*$/.exec(l)?.[1]).filter((c): c is string => c !== undefined);

test('CI runs the emulator suite, with a JVM and a cached jar', () => {
  const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(runs()).toContain('npm run test:emu');
  expect(runs()).not.toContain('npm test');          // test:emu is a strict superset
  expect(wf).toContain('actions/setup-java');
  expect(wf).toContain('~/.cache/firebase/emulators');
});
test('every emulator suite gates on EMULATOR, and there are some', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(f => f.endsWith('.emu.test.ts'));
  expect(files).toContain('src/net/firebase.emu.test.ts');
  for (const f of files) expect(readFileSync(f, 'utf8'), f).toContain("describe.runIf(process.env.EMULATOR === '1')");
});
test('the emulator ports cannot collide with Deutsch Dash', () => {
  const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
  expect(cfg.emulators.database.port).toBe(9010); expect(cfg.emulators.auth.port).toBe(9110);
  expect(cfg.emulators.hub.port).toBe(4410); expect(cfg.auth.providers.anonymous).toBe(true);
});
```

```ts
// boundaries.test.ts additions (plain npm test)
const isTest = (f: string): boolean => /\.test\.tsx?$/.test(f);
test('only src/net imports Firebase', () => {
  for (const file of tracked('src').filter(f => !f.startsWith('src/net/'))) {
    expect(/from\s+['"]firebase\//.test(readFileSync(file, 'utf8')), file).toBe(false);
  }
});
test('the app and src/online reach src/net only through import type or a dynamic import', () => {
  const files = tracked('src/ui', 'src/app', 'src/main.tsx', 'src/online').filter(f => !isTest(f));
  expect(files).toContain('src/app/store.ts');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? '';
      const typeOnly = /^\s*(?:import|export)\s+type\b/.test(m[0]);
      expect(typeOnly || !/(^|\/)net(\/|$)/.test(spec), `${file} imports ${spec}`).toBe(true);
    }
  }
});
test('netReady holds no URL and imports nothing, so the main chunk never names the database', () => {
  const source = readFileSync('src/netReady.ts', 'utf8');
  expect(source).not.toMatch(/firebaseio|googleapis|https?:\/\//);
  expect(source).not.toMatch(/^\s*import\s/m);
});
```

`tracked` already exists in `boundaries.test.ts` and keeps `.ts`/`.tsx` files. The `../netReady` specifier does not match `(^|\/)net(\/|$)`, so the store may import it statically. Type-only imports of `src/net/net.ts` are allowed (they vanish at build time).

- [ ] **Step 3: Run them and see them fail.** `npm test` (coverage, boundary and `firebase.test.ts` fail: no workflow step, no `firebase.json`, no `firebase.ts`); `npm run test:emu` (fails: no `firebase.ts`).
- [ ] **Step 4: Implement `firebase.ts`, `netReady.ts`, the config placeholder, the scripts and the files above.** `firebaseConfig.ts` holds `'PASTE_ME'` values with a comment that Firebase setup F1 fills them and that they are public by design. `usingEmulator()` throws `new Error('EMULATOR=1 is required to use Firebase from Node')` in Node without `EMULATOR=1`.
- [ ] **Step 5: CI.** In `.github/workflows/deploy.yml`, before `npm ci`: `actions/setup-java@v5` (`distribution: temurin`, `java-version: '21'`) and `actions/cache@v6` on `~/.cache/firebase/emulators` keyed `firebase-emulators-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` with `firebase-emulators-${{ runner.os }}-` as a restore key. Replace `- run: npm test` with `- run: npm run test:emu`. Check the newest major of `actions/setup-java` when writing the step and use it; the workflow already pins `checkout@v7`, `setup-node@v7`, `cache@v6`.
- [ ] **Step 6: Stage, then run every suite.** `git add` the files listed in Step 7 (the `git ls-files` guards only see staged files), then `npm test`, `npm run test:emu`, `npm run typecheck`, `npm run lint`, `npm run test:browser`; all pass. Check the production bundle: `npm run build`, then `grep -l "firebaseio" dist/assets/*.js` lists nothing yet (nothing imports `src/net`).
- [ ] **Step 7: Commit**

```bash
git add firebase.json .firebaserc database.rules.json .env.emu .gitignore package.json package-lock.json src/netReady.ts src/net/firebaseConfig.ts src/net/firebase.ts src/net/firebase.emu.test.ts src/net/firebase.test.ts src/net/emulatorCoverage.test.ts .github/workflows/deploy.yml src/boundaries.test.ts
git commit -m "Add Firebase, the emulator suite and the CI steps it needs"
```

The controller then runs Firebase setup F1 to F6.

**What changed from rev 2:** the "is it set up?" flag moved out of `src/net` into `src/netReady.ts`, which holds the API key but no URL, so the store can import it statically without pulling the database URL into the main chunk (I2); the boundary guard exempts test files by name and also covers `export ... from` (I2); `usingEmulator()` throws in Node without `EMULATOR=1` (M7); `setOnline` for the emulator drop tests (I6); stage before running the `git ls-files` guards (M4); no `vite.config.ts` change.

---

### Task 3: The wire: constants, room types, codes, links, encoding

**Files:**
- Create: `src/online/wire.ts`, `src/online/wire.test.ts`

**Interfaces:**
- Consumes: `canonical`, `Action`, `MatchSettings`, `FactionId`, `PlayerId`, `FACTIONS` from the engine; `AiLevel` from `src/ai/types.ts`; `AdaptState` from `src/ai/adapt.ts`; `type Seat` from `src/app/record.ts`.
- Produces:

```ts
export const SCHEMA = 1;                          // mirrored as a literal in database.rules.json
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CLOCK_CHOICES = [0, 60, 120, 180, 300] as const;     // seconds; 0 is off
export type ClockSec = (typeof CLOCK_CHOICES)[number];
export const DEFAULT_CLOCK: ClockSec = 120;
export const DROP_PAUSE_MS = 180_000;             // mirrored in the rules
export const TIMEOUT_LEAD_MS = 500;               // the current phone ends its own turn this long after the deadline
export const TIMEOUT_GRACE_MS = 3_000;            // the waiting phone, as a backup, this long after
export const TIMEOUT_RETRY_MS = 1_000;            // a refused timeout is tried once more after this, if head.n has not moved
export const CREDIT_MARGIN_MS = 2_000;            // a return credit claims this much less than the phone's estimate of the time away
export const NET_TIMEOUT_MS = 10_000;             // every Net call but append answers 'offline' after this
export const HOST_AWAY_MS = 30_000;
export const ROOM_IDLE_TTL_MS = 30 * 86_400_000;  // mirrored in the rules
export const FINISHED_SWEEP_MS = 86_400_000;
export const MAX_ACTION_CHARS = 512; export const MAX_SNAP_CHARS = 200_000; export const MAX_NAME = 16;
export const SEATS = 2;

export type Phase = 'lobby' | 'playing' | 'over';
export type RoomSeat =
  | { uid: string; name: string; kind: 'human'; rules: number }
  | { uid: string; name: string; kind: 'ai'; level: AiLevel; salt: number; adapt: AdaptState };
export interface RoomMeta { createdAt: number; creatorId: string; hostId: string; schema: number; rulesVersion: number;
  build: string; clock: ClockSec; hostFaction: FactionId; phase: Phase }
export interface Head { n: number; seat: PlayerId; hash: string; at: number; turnAt: number; paused: number }
export interface Presence { on: boolean; at: number }
export interface Desync { n: number; hash: string; build: string }
export interface Snap { n: number; hash: string; state: string }
export interface Room { code: string; meta: RoomMeta; seats: (RoomSeat | null)[]; members: Record<string, PlayerId>;
  presence: Record<string, Presence>; head: Head | null; desync: Record<string, Desync> }

export function makeRoomCode(rand?: () => number): string;   // default: crypto.getRandomValues
export function isRoomCode(v: unknown): v is string;
export function inviteLink(base: string, code: string): string;  // base = origin + import.meta.env.BASE_URL
export function codeFromSearch(search: string): string | null;   // tolerant of case and spaces
export function factionsFor(hostFaction: FactionId): [FactionId, FactionId];
export function encodeAction(a: Action): string;                 // canonical(a)
export function decodeAction(s: unknown): Action | null;         // a string of at most MAX_ACTION_CHARS that parses to an object with a string type
export function encodeSettings(s: MatchSettings): string; export function decodeSettings(v: unknown): MatchSettings | null;
export function readActions(raw: unknown): string[] | null;       // array or integer-keyed object; null on a gap or a non-string
export function normalizeRoom(code: string, raw: unknown): Room | null;   // never throws
export function liveDesync(room: Room): Desync[];                 // desync entries whose uid is a current member; the rest are stale
export function toRecordSeat(s: RoomSeat): Seat;
```

`normalizeRoom` reads the separately fetched nodes put together as `{ meta, seats, members, presence, head, desync }`. Firebase returns `seats` and `actions` as arrays when their keys are `0..n`, and as objects otherwise: both are accepted. A seat that is not a well-formed `RoomSeat` becomes `null` (an AI seat needs a known level, a finite `salt` and an `adapt` with finite `dial` and `trend`, as `record.ts`'s `seatWellFormed`). Names are cut to `MAX_NAME`. A `meta` missing `creatorId`, `createdAt`, a known `phase`, a known `hostFaction`, a clock in `CLOCK_CHOICES` or a positive integer `schema` makes the whole room `null`. `meta.schema` is kept as read: a room with `schema > SCHEMA` was made by a newer wire format, and the session treats it like a newer rules version (Task 9), never as readable. Numbers that are not finite become 0. `decodeSettings` accepts only a finite integer seed and two known factions.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest';
import type { Action, MatchSettings } from '../engine';
import { codeFromSearch, decodeAction, decodeSettings, encodeAction, encodeSettings, factionsFor, inviteLink,
  isRoomCode, liveDesync, makeRoomCode, normalizeRoom, readActions, toRecordSeat } from './wire';

test('room codes', () => {
  expect(makeRoomCode(() => 0)).toBe('AAAAAA');
  expect(makeRoomCode(() => 0.9999)).toBe('999999');
  expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(isRoomCode('ABC234')).toBe(true);
  for (const v of ['abc234', 'ABC23', 'ABC2340', 'ABCO34', 'ABC1I4', 7, null]) expect(isRoomCode(v)).toBe(false);
});
test('invite links', () => {
  expect(inviteLink('https://sonofwatt.github.io/warbanners/', 'ABC234')).toBe('https://sonofwatt.github.io/warbanners/?room=ABC234');
  expect(codeFromSearch('?room=abc234')).toBe('ABC234');
  expect(codeFromSearch('?seed=7&room=%20ABC234%20')).toBe('ABC234');
  expect(codeFromSearch('?room=ABC')).toBeNull(); expect(codeFromSearch('')).toBeNull();
});
test('factions follow the host', () => {
  expect(factionsFor('mongols')).toEqual(['mongols', 'spartans']);
  expect(factionsFor('spartans')).toEqual(['spartans', 'mongols']);
});
test('actions are canonical strings the rules can match', () => {
  expect(encodeAction({ type: 'endTurn' })).toBe('{"type":"endTurn"}');
  expect(encodeAction({ type: 'resign', player: 1 })).toBe('{"player":1,"type":"resign"}');
  expect(encodeAction({ to: '1,0', unit: 3, type: 'move' } as Action)).toBe('{"to":"1,0","type":"move","unit":3}');
  expect(decodeAction('{"type":"endTurn"}')).toEqual({ type: 'endTurn' });
  for (const v of ['{', '[]', '"x"', '{"type":7}', 'x'.repeat(513), 7, null]) expect(decodeAction(v)).toBeNull();
});
test('settings survive the database', () => {
  const s: MatchSettings = { seed: 4294967295, factions: ['spartans', 'mongols'] };
  expect(decodeSettings(encodeSettings(s))).toEqual(s);
  for (const v of ['{"seed":1}', '{"seed":1.5,"factions":["spartans","mongols"]}', '{"seed":1,"factions":["spartans","elves"]}', 7]) {
    expect(decodeSettings(v)).toBeNull();
  }
});
test('the action list comes back as an array or an object', () => {
  expect(readActions(['a', 'b'])).toEqual(['a', 'b']);
  expect(readActions({ 0: 'a', 1: 'b', 2: 'c' })).toEqual(['a', 'b', 'c']);
  expect(readActions(null)).toEqual([]);
  expect(readActions({ 0: 'a', 2: 'c' })).toBeNull();
  expect(readActions(['a', null, 'c'])).toBeNull();
  expect(readActions(['a', 7])).toBeNull();
});
const meta = { createdAt: 5, creatorId: 'u1', hostId: 'u1', schema: 1, rulesVersion: 2, build: 'abc1234', clock: 120, hostFaction: 'spartans', phase: 'lobby' };
test('a room is read defensively', () => {
  const r = normalizeRoom('ABC234', { meta, seats: [{ uid: 'u1', name: 'A very long name indeed', kind: 'human', rules: 2 }], members: { u1: 0 } })!;
  expect(r.seats).toEqual([{ uid: 'u1', name: 'A very long name', kind: 'human', rules: 2 }, null]);
  expect(r.head).toBeNull(); expect(r.presence).toEqual({});
  expect(normalizeRoom('ABC234', { meta, seats: { 1: { uid: 'u2', name: 'Ben', kind: 'robot' } } })!.seats).toEqual([null, null]);
  for (const bad of [{ phase: 'nope' }, { clock: 45 }, { hostFaction: 'elves' }, { creatorId: 7 }, { schema: 0 }, { schema: 'x' }]) {
    expect(normalizeRoom('ABC234', { meta: { ...meta, ...bad } })).toBeNull();
  }
  for (const v of [null, 7, 'x', [], {}]) expect(normalizeRoom('ABC234', v)).toBeNull();
});
test('a room from a newer wire schema keeps its schema, so the session can refuse it', () => {
  expect(normalizeRoom('ABC234', { meta: { ...meta, schema: 2 } })!.meta.schema).toBe(2);
});
test('an AI seat keeps its salt and dial, and maps onto the record seat', () => {
  const ai = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'adaptive', salt: 99, adapt: { dial: 0.4, trend: 0.01 } };
  const r = normalizeRoom('ABC234', { meta, seats: [null, ai] })!;
  expect(r.seats[1]).toEqual(ai);
  expect(toRecordSeat(r.seats[1]!)).toEqual({ name: 'Bot', kind: 'ai', level: 'adaptive', salt: 99, adapt: { dial: 0.4, trend: 0.01 } });
  expect(normalizeRoom('ABC234', { meta, seats: [null, { ...ai, salt: 'x' }] })!.seats[1]).toBeNull();
});
test('only a member\'s desync entry counts', () => {
  const d = { n: 3, hash: '0123456789abcdef', build: 'x' };
  const r = normalizeRoom('ABC234', { meta, members: { u1: 0 }, desync: { u1: d, gone: d } })!;
  expect(liveDesync(r)).toEqual([d]);
});
```

- [ ] **Step 2: Run them and see them fail.** `npx vitest run src/online`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `wire.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online/wire.ts src/online/wire.test.ts
git commit -m "Add the online wire format: codes, links, encoded actions, defensive reads"
```

**What changed from rev 2:** `schema` is validated and kept so a newer wire format is refused (M8); `liveDesync` counts only members' entries (I8); the timing constants for the lead, retry, credit margin and `Net` time limit (C1, I1, I4).

---

### Task 4: Database rules, tested against the emulator

**Files:**
- Modify: `database.rules.json`
- Create: `src/net/patches.ts`, `src/net/rules.emu.test.ts`, `src/net/rulesMirror.test.ts`

**Interfaces:**
- Consumes: the layout above; `SCHEMA`, `CLOCK_CHOICES`, `DROP_PAUSE_MS`, `ROOM_IDLE_TTL_MS`, `MAX_ACTION_CHARS`, `MAX_SNAP_CHARS`, `MAX_NAME` from `wire.ts`.
- Produces: `database.rules.json`, and `patches.ts`, the exact multi-path objects the app sends (the rules tests and `fakeNet` import them, so the three cannot drift):

```ts
type Patch = Record<string, unknown>;   // paths relative to rooms/<code>; serverTimestamp() for every server time
export function createPatch(uid: string, input: { name: string; hostFaction: FactionId; clock: ClockSec; rulesVersion: number; build: string }): Patch;
export function joinPatch(uid: string, seat: PlayerId, name: string, rules: number): Patch;
export function aiSeatPatch(seat: PlayerId, s: Extract<RoomSeat, { kind: 'ai' }>): Patch;
export function lobbyPatch(p: { clock?: ClockSec; hostFaction?: FactionId }): Patch;
export function startPatch(settings: MatchSettings, openingHash: string, firstSeat: PlayerId): Patch;
export function appendPatch(a: { n: number; action: string; hash: string; seatAfter: PlayerId; turnPassed: boolean;
  over: boolean; snap: string | null; adapt: { seat: PlayerId; value: AdaptState } | null }): Patch;
export function takeoverPatch(newUid: string, seat: PlayerId, oldUid: string, rules: number): Patch;
export function presentPatch(uid: string, pausedTo: number | null): Patch;   // presence/<uid> { on: true, at: now }, plus head/paused when a credit is due
```

`appendPatch` writes `actions/<n>`, `head/n` (n + 1), `head/hash`, `head/at`; when `turnPassed` also `head/seat`, `head/turnAt` (server time), `head/paused` (0), `checks/<n + 1>` and, with `snap`, `snap` `{ n: n + 1, hash, state }`; when `over` also `meta/phase: 'over'` and `snap`; with `adapt`, `seats/<seat>/adapt`. `takeoverPatch` writes `seats/<s>/uid`, `seats/<s>/rules`, `members/<newUid>`, deletes `members/<oldUid>` and deletes `desync/<oldUid>`. `presentPatch` writes `presence/<uid>` and, when `pausedTo` is not null, `head/paused`.

What the rules enforce (`R` below is `root.child('rooms').child($code)`, the room before the write; `N` is the same under `newData`):

- Root and anything outside `rooms` are closed. A room is readable by any signed-in user (the code is the credential, spec 8.5).
- **No cascading grants.** The only `.write` at `rooms/$code` is the delete grant. Every writable leaf (`meta/<field>`, `seats/$s/<field>`, `members/$uid`, `presence/$uid`, `match`, `head/<field>`, `actions/$n`, `checks/$n`, `snap`, `desync/$uid`) has its own `.write`; nothing grants at `head`, `seats/$s` or `meta`.
- **Create:** one multi-path update writes `meta`, `seats/0` and `members/<uid>`. `meta/createdAt` is write-once and equals `now`; `creatorId` and `hostId` equal `auth.uid`; `schema` equals the literal `1`; `clock` is one of 0, 60, 120, 180, 300; `phase` is `lobby`; `seats/0/rules` equals `meta/rulesVersion`.
- **Lobby:** the host may change `clock` and `hostFaction` while `phase` is `lobby`. A signed-in user who is not a member may claim an empty seat (writing `seats/<s>` with their own uid and `members/<uid>` = s) while `phase` is `lobby`, only when the seat's `rules` equals `R.meta.rulesVersion`. A seat's owner may rename it. Names are strings of 1 to 16 characters.
- **AI seats:** only the host, only while `R.meta.phase === 'lobby'`, may write a whole AI seat (`kind: 'ai'`, uid `'ai_' + $s`, a known level, a number `salt`, an `adapt` with number `dial` and `trend`). Once the match is playing, no one can turn a human seat into a bot or back.
- **Members:** `members/$uid` may be written only when `$uid === auth.uid` (a join or a takeover, with the seat it names holding `auth.uid` in `N`), or deleted by a takeover (the old uid's seat now holds `auth.uid` in `N`). No one writes another uid's membership.
- **Start:** only the host, only from `lobby` with both seats filled: writes `match` (write once), `head` with `n: 0`, `seat: 0`, `turnAt: now`, `at: now`, `paused: 0`, and `meta/phase: 'playing'`.
- **Append** (`actions/$n`): never over an existing value, never a delete, `R.meta.phase === 'playing'`, a string of at most 512 characters, `$n === '' + R.head.n`, and `N.head.n === R.head.n + 1`. Allowed writers:
  1. the uid in `seats/<R.head.seat>`;
  2. the host, when that seat's `kind` is `ai`;
  3. any member, when the value is exactly `{"type":"endTurn"}`, `R.meta.clock > 0`, and `now >= R.head.turnAt + R.meta.clock * 1000 + R.head.paused`;
  4. any member, when the value is exactly `'{"player":' + R.members[auth.uid] + ',"type":"resign"}'`.
- **Head fields stay unchanged unless `head/n` moves.** After start, each `head` child validates:
  - `head/n`: equals `data + 1`, and `N.actions[data]` exists where `R.actions[data]` did not.
  - `head/hash`: a 16-character hex string; may differ from `data` only when `N.head.n === R.head.n + 1`.
  - `head/at`: may differ from `data` only when `N.head.n === R.head.n + 1`, and then equals `now`.
  - `head/seat` and `head/turnAt`: may differ only when `N.head.n === R.head.n + 1` and `N.actions[R.head.n]` is `{"type":"endTurn"}` or starts with `{"player":`; then `head/turnAt` equals `now`.
  - `head/paused`: may differ from `data` only (a) to 0 when `head/turnAt` changes in the same update, or (b) by the **return credit** below.
- **Return credit** (`head/paused` raised with presence coming back): the writer is the uid in `seats/<R.head.seat>`; `R.presence[auth.uid].on === false`; `N.presence[auth.uid].on === true` in the same update; `N.head.turnAt === R.head.turnAt`; `newData.val() > data.val()`; `newData.val() <= 180000`; `newData.val() - data.val() <= now - R.presence[auth.uid].at`; and `newData.val() - data.val() <= now - R.head.turnAt`. So a credit can never exceed the time the server itself saw the player away during this turn, and it lands atomically with the presence that ends the pause.
- **Checks and snapshot:** `checks/$n` is write-once, a 16-character hex string, written only with an append. `snap` may be replaced by any member; `state` at most 200,000 characters; `n` at most the new `head/n`.
- **Phase over:** any member may set `meta/phase` from `playing` to `over` (within the trust model: a member could end a match with no winner; written in `docs/online.md`).
- **Presence:** `presence/<uid>` only by that uid: `{ on: boolean, at: now }`.
- **Takeover:** while `phase` is `playing`, a signed-in user who is not a member may replace `seats/<s>/uid` of a human seat with their own and in the same update write `members/<own uid> = s`, delete `members/<old uid>`, delete `desync/<old uid>`, and set `seats/<s>/rules` equal to `R.meta.rulesVersion`, only when `presence/<old uid>/on` is not `true`.
- **Host:** any member may set `meta/hostId` to the uid of a human seat.
- **Desync:** `desync/<uid>` may be written by that uid; it may be deleted (`!newData.exists()`) by any member when `N.members[<uid>]` does not exist (a stale entry from a player who is no longer in the match).
- **Delete:** `rooms/$code` admits only a delete (`!newData.exists()`), by the creator, or by anyone when `(R.head.at or R.meta.createdAt) + 2592000000 < now`. As in Deutsch Dash, this grant must not cascade a write to any child.

- [ ] **Step 1: Write the failing tests.** `rules.emu.test.ts` uses `initializeTestEnvironment({ projectId: 'demo-banners-rules', database: { host: '127.0.0.1', port: 9010, rules: readFileSync('database.rules.json', 'utf8') } })`. The project id is deliberately not the app's namespace, so loading rules here can never mask a broken app namespace (Deutsch Dash's trap). Helpers: `as(uid)` an authenticated context's database, `anon()` an unauthenticated one, `seed(tree)` writes with rules disabled, `clear()` between tests, `seedLobby({ withGuest? })`, and `playing()` which seeds a started room `ABC234` with `u0` (seat 0) and `u1` (seat 1), both `rules: 2`, `clock: 60`, `head: { n: 2, seat: 0, hash: '0123456789abcdef', at: T, turnAt: T, paused: 0 }` where `T = Date.now()`, actions `"0"` and `"1"`, and presence `u0` and `u1` both `{ on: true, at: T }`. A patch's paths are applied with `update(ref(db, 'rooms/ABC234'), patch)`.

```ts
const emu = describe.runIf(process.env.EMULATOR === '1');
const room = (db: Database) => ref(db, 'rooms/ABC234');
const move = '{"to":"1,0","type":"move","unit":0}';
const BOT = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal', salt: 5, adapt: { dial: 0.5, trend: 0 } } as const;
const step = (n: number, action = move, extra: Partial<Parameters<typeof appendPatch>[0]> = {}) =>
  appendPatch({ n, action, hash: 'fedcba9876543210', seatAfter: 0, turnPassed: false, over: false, snap: null, adapt: null, ...extra });
const endTurnAt = (n: number, seatAfter: PlayerId) => step(n, '{"type":"endTurn"}', { seatAfter, turnPassed: true, snap: '{}' });
const resignAs = (n: number, seat: PlayerId) => step(n, `{"player":${seat},"type":"resign"}`, { over: true, snap: '{}' });
const create = (uid: string, over: Partial<{ clock: number; rulesVersion: number }> = {}) =>
  createPatch(uid, { name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: 2, build: 't', ...over } as never);
const awayFor = (uid: string, ms: number) => seed({ [`rooms/ABC234/presence/${uid}`]: { on: false, at: Date.now() - ms } });

emu('database rules', () => {
  test('CANARY: the rules are loaded (an unauthenticated read is refused)', async () => {
    await assertFails(get(ref(anon(), 'rooms/ABC234')));
  });
  test('create: the creator writes meta, seat 0 and membership in one update', async () => {
    await assertSucceeds(update(room(as('u0')), create('u0')));
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...create('u9'), 'meta/schema': 0 }));      // stale code
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), create('u9', { clock: 45 })));
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...create('u9'), 'seats/0/rules': 1 }));   // seat on other rules
    await assertFails(update(room(as('u9')), create('u9')));                                              // code taken
  });
  test('join: an empty seat in the lobby, once, on the same rules', async () => {
    await seedLobby();
    await assertFails(update(room(as('u1')), joinPatch('u1', 1, 'Ben', 3)));
    await assertSucceeds(update(room(as('u1')), joinPatch('u1', 1, 'Ben', 2)));
    await assertFails(update(room(as('u2')), joinPatch('u2', 1, 'Cy', 2)));
    await assertFails(update(room(as('u1')), { 'seats/1/name': '' }));
    await assertSucceeds(update(room(as('u1')), { 'seats/1/name': 'Benny' }));
  });
  test('members: nobody writes another uid\'s membership', async () => {
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), { 'members/u5': 1 }));
    await assertFails(update(room(as('u1')), { 'members/u0': null }));
    await playing();
    await assertFails(update(room(as('u1')), { 'members/u5': 1 }));
  });
  test('lobby: only the host changes the clock and factions', async () => {
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), lobbyPatch({ clock: 300 })));
    await assertSucceeds(update(room(as('u0')), lobbyPatch({ clock: 300, hostFaction: 'mongols' })));
    await assertFails(update(room(as('u0')), lobbyPatch({ clock: 45 as never })));
  });
  test('AI seats: the host, in the lobby only', async () => {
    await seedLobby();
    await assertFails(update(room(as('u1')), aiSeatPatch(1, BOT)));                                      // not the host
    await assertSucceeds(update(room(as('u0')), aiSeatPatch(1, BOT)));
    await playing();
    await assertFails(update(room(as('u0')), aiSeatPatch(1, BOT)));                                      // the guest's seat, mid-match
    await assertFails(update(room(as('u0')), { 'seats/1/kind': 'ai' }));
  });
  test('start: the host only, with both seats filled', async () => {
    await seedLobby();
    await assertFails(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));                        // one seat
    await seedLobby({ withGuest: true });
    await assertFails(update(room(as('u1')), startPatch(SETTINGS, OPENING, 0)));
    await assertSucceeds(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));
    await assertFails(update(room(as('u0')), startPatch(SETTINGS, OPENING, 0)));                        // match is write once
  });
  test('append: the current player, the next index, nothing rewritten', async () => {
    await playing();
    await assertFails(update(room(as('u1')), step(2)));                                                  // not their turn
    await assertFails(update(room(as('u0')), { ...step(2), 'actions/3': move, 'head/n': 4 }));           // skips
    await assertSucceeds(update(room(as('u0')), step(2)));
    await assertFails(set(ref(as('u0'), 'rooms/ABC234/actions/1'), '{"type":"endTurn"}'));               // rewrite
    await assertFails(remove(ref(as('u0'), 'rooms/ABC234/actions/0')));                                   // delete
    await assertFails(update(room(as('u0')), { 'head/n': 1 }));                                           // counter back
    await assertFails(update(room(as('u0')), step(3, 'x'.repeat(513))));
  });
  test('head fields never move without an append', async () => {
    await playing();
    for (const [path, value] of [['head/turnAt', Date.now() + 600_000], ['head/hash', 'ffffffffffffffff'], ['head/seat', 1],
      ['head/at', Date.now()], ['head/paused', 5_000], ['head/n', 3]] as const) {
      await assertFails(update(room(as('u0')), { [path]: value }));
    }
    await assertFails(update(room(as('u0')), { ...step(2), 'head/turnAt': Date.now() + 600_000 }));      // an append that is not a turn pass
  });
  test('the turn passes only with endTurn or a resign', async () => {
    await playing();
    await assertFails(update(room(as('u0')), step(2, '{"tech":"bronze","type":"research"}', { seatAfter: 1, turnPassed: true, snap: '{}' })));
    await assertSucceeds(update(room(as('u0')), endTurnAt(2, 1)));
  });
  test('timeout: the waiting player may end the turn only once the clock has run out', async () => {
    await playing();
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));                                         // 60 s not yet up
    await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000 });
    await assertFails(update(room(as('u1')), step(2)));                                                   // only endTurn
    await assertFails(update(room(as('u9')), endTurnAt(2, 1)));                                         // not a member
    await assertSucceeds(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('no timeout when the clock is off', async () => {
    await playing(); await seed({ 'rooms/ABC234/meta/clock': 0, 'rooms/ABC234/head/turnAt': 1 });
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('a credited pause pushes the timeout back', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000, 'rooms/ABC234/head/paused': 30_000 });
    await assertFails(update(room(as('u1')), endTurnAt(2, 1)));
  });
  test('return credit: only the current player, only coming back, never more than the time away', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 100_000 }); await awayFor('u0', 60_000);
    await assertFails(update(room(as('u0')), { 'head/paused': 20_000 }));                                // no presence with it
    await assertFails(update(room(as('u0')), presentPatch('u0', 70_000)));                               // more than 60 s away
    await assertFails(update(room(as('u0')), { ...presentPatch('u0', 20_000), 'head/turnAt': Date.now() })); // moves the turn start
    await assertFails(update(room(as('u1')), presentPatch('u1', 20_000)));                               // not the current player
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 50_000)));
    await assertFails(update(room(as('u0')), presentPatch('u0', 55_000)));                               // already back: no more credit
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', null)));                              // presence alone is always fine
  });
  test('return credit is capped at three minutes and at the time since the turn began', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 400_000 }); await awayFor('u0', 300_000);
    await assertFails(update(room(as('u0')), presentPatch('u0', 180_001)));
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 180_000)));
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 20_000 }); await awayFor('u0', 100_000);
    await assertFails(update(room(as('u0')), presentPatch('u0', 30_000)));                               // away since before this turn
    await assertSucceeds(update(room(as('u0')), presentPatch('u0', 15_000)));
  });
  test('either player may resign, but only themselves', async () => {
    await playing();
    await assertFails(update(room(as('u1')), resignAs(2, 0)));
    await assertSucceeds(update(room(as('u1')), resignAs(2, 1)));
  });
  test('an AI seat is played by the host alone, and only the host moves its dial', async () => {
    await playing();
    await seed({ 'rooms/ABC234/seats/1': { ...BOT, level: 'adaptive' }, 'rooms/ABC234/head/seat': 1 });
    // u1 is still in members: a member who is not the host
    const aiMove = step(2, move, { adapt: { seat: 1, value: { dial: 0.55, trend: 0.05 } } });
    await assertFails(update(room(as('u1')), aiMove));
    await assertFails(update(room(as('u0')), { 'seats/1/adapt': { dial: 0.9, trend: 0 } }));            // only with an append
    await assertSucceeds(update(room(as('u0')), aiMove));
    await assertSucceeds(update(room(as('u0')), endTurnAt(3, 0)));
  });
  test('an absent player\'s seat can be taken over, a present one cannot', async () => {
    await playing();
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 2)));
    await seed({ 'rooms/ABC234/presence/u1': { on: false, at: 1 }, 'rooms/ABC234/desync/u1': { n: 2, hash: '0123456789abcdef', build: 'x' } });
    await assertFails(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 3)));                          // other rules
    await assertSucceeds(update(room(as('u7')), takeoverPatch('u7', 1, 'u1', 2)));
    await assertFails(update(room(as('u1')), step(2)));                                                   // the old uid is out
    expect((await get(ref(as('u0'), 'rooms/ABC234/desync/u1'))).exists()).toBe(false);                 // its desync went with it
  });
  test('the host role moves only to a human seat', async () => {
    await playing();
    await assertSucceeds(update(room(as('u1')), { 'meta/hostId': 'u1' }));
    await assertFails(update(room(as('u1')), { 'meta/hostId': 'u9' }));
  });
  test('presence and desync belong to their owner; a non-member\'s desync may be cleared by anyone', async () => {
    await playing();
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/presence/u0'), { on: false, at: serverTimestamp() }));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/presence/u1'), { on: true, at: serverTimestamp() }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/desync/u0'), { n: 2, hash: '0123456789abcdef', build: 'x' }));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/desync/u1'), { n: 2, hash: '0123456789abcdef', build: 'x' }));
    await assertFails(remove(ref(as('u0'), 'rooms/ABC234/desync/u1')));                                  // u1 is still a member
    await seed({ 'rooms/ABC234/desync/gone': { n: 1, hash: '0123456789abcdef', build: 'x' } });
    await assertSucceeds(remove(ref(as('u0'), 'rooms/ABC234/desync/gone')));
  });
  test('delete: the creator, or anyone once the room is idle for 30 days; never a child write', async () => {
    await playing();
    await assertFails(remove(ref(as('u1'), 'rooms/ABC234')));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234'), { meta: null, actions: { 0: 'x' } }));
    await assertSucceeds(remove(ref(as('u0'), 'rooms/ABC234')));
    await playing(); await seed({ 'rooms/ABC234/head/at': Date.now() - 2_592_000_001 });
    await assertSucceeds(remove(ref(as('u9'), 'rooms/ABC234')));
  });
  test('CANARY: the delete grant does not open the children', async () => {
    await playing();
    for (const path of ['actions/2', 'head/n', 'seats/1/uid', 'match/settings', 'checks/9', 'meta/phase']) {
      await assertFails(set(ref(as('u9'), `rooms/ABC234/${path}`), 'x'));
    }
  });
});
```

`SETTINGS` is `{ seed: 42, factions: ['spartans', 'mongols'] }` and `OPENING` is `hashState(createMatch(SETTINGS))`. Timings in the credit tests leave seconds of slack against the emulator's `now`, which runs on the same machine.

`rulesMirror.test.ts` (plain `npm test`) reads `database.rules.json` as text and expects it to contain `=== 1` next to `schema` (matching `SCHEMA`), each of `CLOCK_CHOICES`, `180000` (`DROP_PAUSE_MS`), `2592000000` (`ROOM_IDLE_TTL_MS`), `512`, `200000` and `16`, and the timeout clause as `now >=` (not `now >`). Its comment: "change both or the phones and the server disagree".

- [ ] **Step 2: Run them and see them fail.** `npm run test:emu`. Expected: every rules test except the first canary fails against the locked file.
- [ ] **Step 3: Write `database.rules.json` and `src/net/patches.ts`.** Use `newData` paths for anything written in the same update and `root`/`data` for what was there before (the emulator evaluates `root` before the write). The append clauses on `$n` are `!data.exists() && newData.isString() && newData.val().length <= 512 && $n === '' + root.child('rooms').child($code).child('head/n').val()`; the 2026-11-18 draft's author checked that `$n === '' + ...` form against database emulator v4.11.2 (overwrite, gap, skip, decrement and delete refused; the in-order append accepted). For the head fields, put each rule in that child's `.write` (a `.validate` alone cannot refuse an unchanged-looking write that a cascading grant allowed, and there is no cascading grant).
- [ ] **Step 4: Run `npm run test:emu` and `npm test`; all pass.** Then break one clause at a time by hand (the `!data.exists()` on actions, the `now >=` on timeout, the presence check on takeover, the `rules` check on join, the `now - presence.at` bound on the credit, the `head/turnAt` pin) and see the matching test go red. Restore.
- [ ] **Step 5: Commit**

```bash
git add database.rules.json src/net/patches.ts src/net/rules.emu.test.ts src/net/rulesMirror.test.ts
git commit -m "Add the database rules: who may append, no rewritten history, tidy rooms"
```

The controller deploys the rules (F4 and F5) once this task is reviewed, and after every later change to the file.

**What changed from rev 2:** the timeout clause is `now >=` (I1); `pausePatch` is gone and the return credit is `presentPatch`, presence and credit in one update, bounded by the server's own view of the time away (C1); every `head` field is pinned unless `head/n` moves, with negative tests for `turnAt`, `hash`, `seat`, `at`, `paused` and `n` (I7); AI seats are host-only and lobby-only, tested from a non-host and mid-match (I7); `members/<x>` only for one's own uid, tested (I7); takeover deletes the old uid's `desync` and anyone may clear a non-member's entry (I8); "counter back" writes 1 (M5); no cascading grants, stated.

---
### Task 5: The Net layer, on Firebase and in memory, under one contract

**Files:**
- Create: `src/net/net.ts`, `src/net/firebaseNet.ts`, `src/net/fakeNet.ts`, `src/net/contract.ts`, `src/net/fakeNet.test.ts`, `src/net/firebaseNet.emu.test.ts`

**Interfaces:**
- Consumes: Task 2's `fb`, `ensureSignedIn`, `watchConnected`, `serverOffset`, `reconnect`, `setOnline`, `configMissing`; Task 3's types, codecs and `NET_TIMEOUT_MS`; Task 4's `patches.ts`.
- Produces:

```ts
// net.ts (types only: the app may import it with `import type`)
export type Refusal = 'offline' | 'schema' | 'notFound' | 'full' | 'started' | 'version' | 'refused' | 'notSetUp';
export interface Append { n: number; action: string; seatAfter: PlayerId; hash: string; turnPassed: boolean; over: boolean;
  snap: string | null;                                       // JSON of the state after this action, sent when turnPassed or over
  adapt: { seat: PlayerId; value: AdaptState } | null }      // an AI seat's dial, sent with the AI turn's first action
export interface Watcher { room(r: Room | null): void; actions(list: string[] | null): void; connected(ok: boolean): void }
export interface CreateInput { code: string; name: string; hostFaction: FactionId; clock: ClockSec; rulesVersion: number; build: string }
export interface Live { head: Head | null; presence: Presence | null }   // read fresh from the server, not from the cache
export interface Net {
  uid(): Promise<string>;
  serverNow(): number;                                        // Date.now() + the server offset
  create(input: CreateInput): Promise<true | Refusal>;
  join(code: string, name: string, rules: number): Promise<{ seat: PlayerId } | Refusal>;   // an existing member gets their seat back
  takeOver(code: string, seat: PlayerId, rules: number): Promise<true | Refusal>;
  setLobby(code: string, patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<true | Refusal>;
  setAiSeat(code: string, seat: PlayerId, s: Extract<RoomSeat, { kind: 'ai' }>): Promise<true | Refusal>;   // host, lobby only
  start(code: string, settings: MatchSettings, openingHash: string): Promise<true | Refusal>;
  append(code: string, a: Append): Promise<true | 'refused' | 'notSetUp'>;   // pending while offline; never 'offline'
  readLive(code: string): Promise<Live | Refusal>;
  present(code: string, pausedTo: number | null): Promise<true | Refusal>;    // arms onDisconnect, then presentPatch
  claimHost(code: string): Promise<void>;                     // a transaction on meta/hostId; does nothing when already host
  readStart(code: string): Promise<{ settings: MatchSettings; snap: Snap | null; checks: Record<number, string> } | Refusal>;
  reportDesync(code: string, d: Desync | null): Promise<void>;
  watch(code: string, w: Watcher): () => void;               // listens only; writes nothing
  remove(code: string): Promise<boolean>;
}
export function firebaseNet(name?: string, opts?: { schemaOverride?: number; timeoutMs?: number }): Net;   // firebaseNet.ts
export interface FakeServer {
  as(uid: string): Net; setNow(ms: number): void; now(): number;
  drop(uid: string): void;            // connected(false) to uid's watchers, then their data callbacks stop, appends are held, presence goes off
  back(uid: string): Promise<void>;   // connected(true), then held appends land in order, then the current tree is replayed to uid's watchers
  hold(uid: string): void;            // uid stays connected and its writes go through, but its watchers' data events are queued
  release(uid: string): void;         // the queued events are delivered in order
  tree(): unknown; write(path: string, value: unknown): void;   // write: rules-free, for tests that forge a bad record
  failNext(uid: string): void;        // the next write from uid is refused, to force races
  failCreatesWith(r: Refusal): void;  // every create answers r (Task 11's stale-rules test)
  log(): { uid: string; paths: string[] }[];   // every write that landed, in order, with its writer
  idle(): boolean;                    // no write in flight and no watcher delivery queued (for settle())
}
export function fakeServer(start?: number): FakeServer;       // fakeNet.ts
export interface ContractKit { a: Net; b: Net; c: Net;
  ageTurn(code: string, ms: number): Promise<void>; stopPresence(net: Net, code: string): Promise<void>;
  drop(net: Net): void; back(net: Net): Promise<void>; wait(ms: number): Promise<void> }
export function contract(name: string, make: () => Promise<ContractKit>): void;   // contract.ts
```

Rules for `firebaseNet`:

- Every method answers `'notSetUp'` when `configMissing()` is true, without touching the network.
- **Offline behaviour, as the SDK really does it.** `update()` and `set()` do not reject when the connection is lost: the SDK keeps the write and sends it on reconnect, and the promise stays pending. So:
  - `append` has no time limit. It resolves `true` when the server accepts, `'refused'` when the rules refuse (the SDK then rolls the local cache back), and stays pending while offline. Callers never send a second append while one is pending (Task 9).
  - Every other method (`create`, `join`, `takeOver`, `setLobby`, `setAiSeat`, `start`, `readLive`, `present`, `readStart`) races its work against `opts.timeoutMs ?? NET_TIMEOUT_MS` and answers `'offline'` when the time runs out. The SDK may still deliver such a write later; each is safe to land late (a late `create` leaves an unlisted lobby that the 30-day rule sweeps; a late `join` or `takeOver` is found as membership on the next open; a late `present` is refused or harmless).
  - `close` of a session does not cancel writes the SDK still holds. They land when the phone reconnects (or never, if the page is gone), and the rules check them like any other write: a held append whose index was taken is refused and rolled back.
- `create` reads `rooms/<code>/meta` first: present is `'refused'` without writing; absent and then refused is `'schema'` (every other create clause is met by the client's own values). The caller picks a new code on `'refused'`.
- `join` reads the room once: missing is `'notFound'`; this uid in `members` returns that seat; `meta.rulesVersion !== rules` is `'version'`; `phase !== 'lobby'` is `'started'`; no empty seat is `'full'`.
- `append` sends one `update()` with `appendPatch`; it never queues and never retries.
- `readLive` reads `head` and `presence/<uid>` with `get()`, which asks the server when connected.
- `present` first sets `onDisconnect(presence/<uid>).set({ on: false, at: serverTimestamp() })` (an `onDisconnect` fires once and must be armed again after every reconnect), then sends `presentPatch(uid, pausedTo)` in one `update()`.
- `watch` attaches `onValue` to `meta`, `seats`, `members`, `presence`, `head`, `desync` and `actions` separately, folds the first six into `normalizeRoom`, passes `readActions(actions)` to `w.actions`, and passes `.info/connected` to `w.connected`. It writes nothing. On a `visibilitychange` to visible while disconnected it calls `reconnect`. The returned function cancels the `onDisconnect`, writes `presence/<uid> = { on: false, at }` best effort, and detaches everything.
- Firebase raises a local `onValue` event from inside `update()` before the server answers, and a second one when a refused write is rolled back. Callers treat every event as a fresh reading of the truth (Task 6's `follow` does). After a reconnect, `.info/connected` turns true before the listeners have the server's fresh data, so a caller must not decide anything from the cache at that moment (Task 9 reads `readLive` first).
- No write is fire-and-forget: every promise is awaited or has a `.catch` that reports `'refused'` (permission denied) or, for the timed methods, `'offline'`.

`fakeNet` keeps one in-memory tree per server, builds every write from `patches.ts`, and applies the same decisions as the rules for the paths it writes: append index and writer, the `head` pins, the return credit bound (from its own `now` and the stored presence), timeout at `now >= turnAt + clock*1000 + paused`, takeover only when absent (and its `desync` delete), a non-member's `desync` cleared by anyone, AI seats lobby-only, `rules` equal to `rulesVersion`, schema, the AI dial only by the host with an append. A write is applied in a microtask after the call (so a `drop` made in the same tick as the call holds it), and watchers are called after the write resolves, asynchronously (a `queueMicrotask`), so the fake never hides a re-entrancy bug the real SDK would show. `drop`, `back`, `hold` and `release` behave as their comments say; a dropped uid's non-append calls answer `'offline'` at once (what `firebaseNet` answers after its time limit). `drop` stops the uid's data callbacks *before* it writes that uid's presence off, so the dropped phone's own cache still says it is present, exactly as on a real phone; `back` delivers `connected(true)` before the fresh tree, exactly as the SDK does.

- [ ] **Step 1: Write the contract.** `contract.ts` exports one `describe` body, so the same tests run against `fakeServer` in `fakeNet.test.ts` (always) and against the emulator in `firebaseNet.emu.test.ts` (with `firebaseNet('a')`, `firebaseNet('b')` and `firebaseNet('c', { timeoutMs: 1_000 })`, each signed in before the tests start). `code` is a fresh `makeRoomCode()` per test. Helpers inside: `ann(code)` = `a.create({ code, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })`; `latest(net, code, pred)` watches and resolves with the next room and action list where a predicate holds (5 s timeout); `started(code)` creates, joins as Ben, starts with `SETTINGS`, and calls `present(code, null)` for `a` and `b`. `SETTINGS` is `{ seed: 42, factions: ['spartans', 'mongols'] }`.

```ts
test('create, join, rejoin, and a third phone is turned away', async () => {
  expect(await ann(code)).toBe(true);
  expect(await b.join(code, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
  expect(await b.join(code, 'Ben', RULES_VERSION)).toEqual({ seat: 1 });
  expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('full');
  expect(await c.join('ZZZZZZ', 'Cy', RULES_VERSION)).toBe('notFound');
  expect(await ann(code)).toBe('refused');
});
test('a phone on other rules cannot join', async () => {
  await ann(code);
  expect(await b.join(code, 'Ben', RULES_VERSION + 1)).toBe('version');
});
test('the watcher sees the room and the actions; presence comes from present()', async () => {
  await ann(code); await b.join(code, 'Ben', RULES_VERSION);
  expect(await a.present(code, null)).toBe(true);
  const { room, actions } = await latest(a, code, r => r?.seats[1] !== null && r?.presence !== undefined);
  expect(room!.seats.map(s => s?.name)).toEqual(['Ann', 'Ben']);
  expect(room!.presence[await a.uid()]?.on).toBe(true);
  expect(actions).toEqual([]);
});
test('appends go in order and only from the player whose turn it is', async () => {
  await started(code);
  const s0 = createMatch(SETTINGS);
  const m = legalActions(s0).find(x => x.type === 'move')!; const s1 = must(applyAction(s0, m));
  const s2 = must(applyAction(s1, { type: 'endTurn' })); const s3 = must(applyAction(s2, { type: 'endTurn' }));
  const add = (net: Net, n: number, action: Action, after: MatchState, passed: boolean) =>
    net.append(code, { n, action: encodeAction(action), seatAfter: after.current, hash: hashState(after), turnPassed: passed,
      over: false, snap: passed ? JSON.stringify(after) : null, adapt: null });
  expect(await add(b, 0, m, s1, false)).toBe('refused');
  expect(await add(a, 0, m, s1, false)).toBe(true);
  expect(await add(a, 0, m, s1, false)).toBe('refused');
  expect(await add(a, 2, { type: 'endTurn' }, s2, true)).toBe('refused');
  expect(await add(a, 1, { type: 'endTurn' }, s2, true)).toBe(true);
  expect(await add(b, 2, { type: 'endTurn' }, s3, true)).toBe(true);
  const { actions } = await latest(b, code, (_r, l) => l?.length === 3);
  expect(actions).toEqual([encodeAction(m), '{"type":"endTurn"}', '{"type":"endTurn"}']);
  const start = await a.readStart(code);
  expect(typeof start === 'object' && start.settings).toEqual(SETTINGS);
  expect(typeof start === 'object' && start.snap!.n).toBe(3);
  expect(typeof start === 'object' && start.checks).toEqual({ 2: hashState(s2), 3: hashState(s3) });
});
test('two phones racing for the same index: exactly one wins', async () => {
  await started(code);
  await ageTurn(code, 125_000);
  const s0 = createMatch(SETTINGS); const m = legalActions(s0).find(x => x.type === 'move')!;
  const s1 = must(applyAction(s0, m)); const e = must(applyAction(s0, { type: 'endTurn' }));
  const results = await Promise.all([
    a.append(code, { n: 0, action: encodeAction(m), seatAfter: 0, hash: hashState(s1), turnPassed: false, over: false, snap: null, adapt: null }),
    b.append(code, { n: 0, action: '{"type":"endTurn"}', seatAfter: 1, hash: hashState(e), turnPassed: true, over: false, snap: JSON.stringify(e), adapt: null }),
  ]);
  expect(results.filter(r => r === true)).toHaveLength(1);
  const { actions } = await latest(a, code, (_r, l) => l?.length === 1);
  expect(actions).toHaveLength(1);
});
test('a write made offline waits, and on reconnect lands or is refused by the rules', async () => {
  await started(code);
  await ageTurn(code, 125_000);
  const s0 = createMatch(SETTINGS); const m = legalActions(s0).find(x => x.type === 'move')!;
  const s1 = must(applyAction(s0, m)); const e = must(applyAction(s0, { type: 'endTurn' }));
  drop(a);
  const held = a.append(code, { n: 0, action: encodeAction(m), seatAfter: 0, hash: hashState(s1), turnPassed: false, over: false, snap: null, adapt: null });
  expect(await Promise.race([held, wait(500).then(() => 'pending')])).toBe('pending');          // not 'offline': the SDK holds it
  expect(await b.append(code, { n: 0, action: '{"type":"endTurn"}', seatAfter: 1, hash: hashState(e), turnPassed: true, over: false,
    snap: JSON.stringify(e), adapt: null })).toBe(true);                                          // the backup timeout takes index 0
  await back(a);
  expect(await held).toBe('refused');
  const { actions } = await latest(a, code, (_r, l) => l?.length === 1 && l[0] === '{"type":"endTurn"}');
  expect(actions).toEqual(['{"type":"endTurn"}']);                                                 // the rollback left the server's list
});
test('every call but append gives up when offline', async () => {
  await ann(code);
  drop(c);
  expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('offline');
  expect(await c.readLive(code)).toBe('offline');
  await back(c);
});
test('a return credit lands with presence, and only for the time away', async () => {
  await started(code);
  drop(a); await wait(1_500); await back(a);
  const live = await a.readLive(code);
  expect(typeof live === 'object' && live.presence?.on).toBe(false);
  expect(await a.present(code, 60_000)).toBe('refused');                                          // more than the time away
  expect(await b.present(code, 500)).toBe('refused');                                             // not b's turn, and b never left
  expect(await a.present(code, 500)).toBe(true);
  const { room } = await latest(b, code, r => r?.head?.paused === 500);
  expect(room!.presence[await a.uid()]?.on).toBe(true);
});
test('a resign out of turn is accepted for yourself only', async () => {
  await started(code);
  const resign = (seat: PlayerId) => ({ n: 0, action: `{"player":${seat},"type":"resign"}`, seatAfter: 0, hash: '0'.repeat(16),
    turnPassed: false, over: true, snap: '{}', adapt: null });
  expect(await b.append(code, resign(0))).toBe('refused');
  expect(await b.append(code, resign(1))).toBe(true);
});
test('a seat can be taken over only while its owner is away, and the old desync goes with it', async () => {
  await started(code);
  const bu = await b.uid();
  await b.reportDesync(code, { n: 0, hash: '0'.repeat(16), build: 'x' });
  await latest(a, code, r => r?.presence[bu]?.on === true);
  expect(await c.takeOver(code, 1, RULES_VERSION)).toBe('refused');
  await stopPresence(b, code);
  expect(await c.takeOver(code, 1, RULES_VERSION)).toBe(true);
  expect(await c.join(code, 'x', RULES_VERSION)).toEqual({ seat: 1 });
  const { room } = await latest(a, code, r => r?.members[bu] === undefined);
  expect(room!.desync).toEqual({});
});
test('the creator can remove a room; a stranger cannot', async () => {
  await ann(code);
  expect(await b.remove(code)).toBe(false);
  expect(await a.remove(code)).toBe(true);
  expect(await c.join(code, 'Cy', RULES_VERSION)).toBe('notFound');
});
```

Kit helpers: `ageTurn` moves `head/turnAt` back by `ms`: the fake through a rules-free `write` of `head/turnAt`, the emulator through a rules-disabled write with `@firebase/rules-unit-testing`'s `withSecurityRulesDisabled` on the app's namespace (`initializeTestEnvironment({ projectId: 'demo-banners', database: { host: '127.0.0.1', port: 9010 } })`; it must not pass `rules`, or it would replace the rules the app's namespace runs under). `stopPresence` writes the owner's `on: false` (the fake through `drop` and `back` with no time between; the emulator through `setOnline(fb(name), false)`, then waiting until another phone sees `on: false`, then `setOnline(fb(name), true)`) and resolves once it has landed. `drop` and `back` are `server.drop(uid)`/`server.back(uid)` on the fake and `setOnline(fb(name), false/true)` on the emulator (a clean close, so the server runs the `onDisconnect` at once); `back` resolves once `.info/connected` is true again. `wait(ms)` is `server.setNow(now + ms)` plus a microtask flush on the fake, and a real sleep on the emulator.

- [ ] **Step 2: Run them and see them fail.** `npm test` and `npm run test:emu`.
- [ ] **Step 3: Implement `net.ts`, `fakeNet.ts`, `firebaseNet.ts`.**
- [ ] **Step 4: Run both suites and see the contract pass on both sides.** Add one emulator-only test in `firebaseNet.emu.test.ts`: `firebaseNet('s', { schemaOverride: 2 }).create(...)` answers `'schema'` (the option sets `meta/schema` in the create patch and is used by no other code).
- [ ] **Step 5: Commit**

```bash
git add src/net/net.ts src/net/firebaseNet.ts src/net/fakeNet.ts src/net/contract.ts src/net/fakeNet.test.ts src/net/firebaseNet.emu.test.ts
git commit -m "Add the Net layer on Firebase and in memory, held to one contract"
```

**What changed from rev 2:** the contract states what the SDK really does offline: `append` stays pending and is never `'offline'`, every other call gives up after `NET_TIMEOUT_MS`, and held writes land on reconnect and are checked by the rules; the fake holds a dropped phone's writes and lands them on `back`, and the contract proves the pending, the late refusal and the rollback on both sides (I4). `watch` no longer writes presence; `present` writes presence and the drop credit in one update and `readLive` gives the fresh truth after a reconnect (C1); `creditPause` is gone. `drop` delivers `connected(false)` before stopping callbacks and `back` delivers `connected(true)` before fresh data, as the SDK does (C1, I5). `hold`/`release` stage a race where one phone has not yet seen the other's write; `log` records who wrote what (I5). `firebaseNet`'s second argument is in its signature (M2). `failCreatesWith` is declared here, so Task 11 does not touch `fakeNet.ts`.

---

### Task 6: Following the record: apply, compare hashes, rebuild

**Files:**
- Create: `src/online/sync.ts`, `src/online/sync.test.ts`

**Interfaces:**
- Consumes: `applyAction`, `createMatch`, `hashState`, `replay`, `legalActions`, `playerView` from the engine; `decodeAction`, `encodeAction`, `Head`, `Snap` from `wire.ts`. Snapshot trust follows `record.ts`'s lesson: a hash proves a snapshot is the one written, not that this build can read it, so a snapshot is used only if `playerView` and `legalActions` run on it.
- Produces:

```ts
export interface Followed { settings: MatchSettings; actions: string[]; state: MatchState }
export interface Step { action: Action; before: MatchState; after: MatchState; events: GameEvent[] }
export type Follow =
  | { kind: 'same' }
  | { kind: 'wait' }                                         // the list and head disagree on length: a write is mid-flight
  | { kind: 'advanced'; followed: Followed; steps: Step[] }
  | { kind: 'rebuilt'; followed: Followed }                  // the list no longer extends ours: started again from it
  | { kind: 'broken'; at: number; reason: 'refused' | 'hash' };
export function opening(settings: MatchSettings): Followed;
export function follow(local: Followed, remote: string[], head: Head): Follow;
export function rebuild(settings: MatchSettings, remote: string[], snap: Snap | null, checks: Record<number, string>):
  { ok: true; followed: Followed; fromSnap: boolean } | { ok: false; at: number; reason: 'refused' | 'hash' };
export function applyLocal(local: Followed, action: Action): { followed: Followed; step: Step; encoded: string } | null;   // null when refused
```

`Step` matches the store's digest input (`TurnStep { before, after, events }` in `src/app/digest.ts`) plus the action, so the store can hand steps straight to `digestFor` and to `last`.

Rules:

- `follow`: if `remote.length !== head.n`, answer `wait`. If `remote` equals `local.actions`, compare `hashState(local.state)` with `head.hash`: equal is `same`, unequal goes to the rebuild below. If `local.actions` is a prefix of `remote`, apply the rest in order with `decodeAction` and `applyAction`; a refusal is `broken` with `refused` at that index; afterwards compare with `head.hash`. Anything else (ours is longer, or differs at some index) is a full `rebuild` with no snapshot, reported as `rebuilt`.
- A hash mismatch after applying is retried once as a full `rebuild` from the action list with no snapshot. If that agrees with `head.hash`, the answer is `rebuilt`; if not, `broken` with `hash` at `head.n`.
- `rebuild` uses the snapshot only if `snap.n <= remote.length`, `hashState(JSON.parse(snap.state)) === snap.hash`, `checks[snap.n]` is absent or equal to `snap.hash`, and `playerView(state, 0)`, `playerView(state, 1)` and `legalActions(state)` do not throw. Otherwise it replays from the opening. A parse error in the snapshot is a fallback, not a failure.

- [ ] **Step 1: Write the failing tests**

```ts
const SETTINGS: MatchSettings = { seed: 42, factions: ['spartans', 'mongols'] };
function script(n: number): { list: string[]; states: MatchState[] } {
  let s = createMatch(SETTINGS); const list: string[] = []; const states = [s];
  for (let i = 0; i < n; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    const a = legal[(i * 7) % legal.length]!; s = must(applyAction(s, a)); list.push(encodeAction(a)); states.push(s);
  }
  return { list, states };
}
const headAt = (k: number, states: MatchState[]): Head => ({ n: k, seat: states[k]!.current, hash: hashState(states[k]!), at: 0, turnAt: 0, paused: 0 });

test('new actions are applied in order with their events', () => {
  const { list, states } = script(30);
  const f = follow(opening(SETTINGS), list.slice(0, 12), headAt(12, states));
  expect(f.kind).toBe('advanced');
  if (f.kind !== 'advanced') return;
  expect(f.steps).toHaveLength(12); expect(hashState(f.followed.state)).toBe(hashState(states[12]!));
  expect(f.steps[11]!.after).toBe(f.followed.state);
  expect(follow(f.followed, list.slice(0, 12), headAt(12, states))).toEqual({ kind: 'same' });
});
test('a list ahead of its head, or behind it, waits', () => {
  const { list, states } = script(10);
  expect(follow(opening(SETTINGS), list.slice(0, 5), headAt(4, states))).toEqual({ kind: 'wait' });
  expect(follow(opening(SETTINGS), list.slice(0, 3), headAt(4, states))).toEqual({ kind: 'wait' });
});
test('our own write that lost a race is replaced by the winner', () => {
  const { list, states } = script(10);
  const mine = follow(opening(SETTINGS), list.slice(0, 6), headAt(6, states)) as Extract<Follow, { kind: 'advanced' }>;
  const other = legalActions(mine.followed.state).find(a => encodeAction(a) !== list[6])!;
  const ahead = applyLocal(mine.followed, other)!;                         // we played something else at index 6
  const r = follow(ahead.followed, list.slice(0, 7), headAt(7, states));
  expect(r.kind).toBe('rebuilt');
  expect(r.kind === 'rebuilt' && hashState(r.followed.state)).toBe(hashState(states[7]!));
});
test('a hash that disagrees after a full rebuild breaks the match at that point', () => {
  const { list, states } = script(10);
  expect(follow(opening(SETTINGS), list, { ...headAt(10, states), hash: '0000000000000000' })).toEqual({ kind: 'broken', at: 10, reason: 'hash' });
});
test('an action this phone refuses breaks the match at its index', () => {
  const { list, states } = script(5);
  const bad = [...list.slice(0, 3), '{"to":"9,9","type":"move","unit":0}'];
  expect(follow(opening(SETTINGS), bad, headAt(4, states))).toEqual({ kind: 'broken', at: 3, reason: 'refused' });
});
test('rejoin: a good snapshot is used, a bad one is ignored', () => {
  const { list, states } = script(40);
  const good: Snap = { n: 30, hash: hashState(states[30]!), state: JSON.stringify(states[30]) };
  const r1 = rebuild(SETTINGS, list, good, { 30: good.hash });
  expect(r1.ok && r1.fromSnap).toBe(true); expect(r1.ok && hashState(r1.followed.state)).toBe(hashState(states[40]!));
  const tampered = { ...good, state: JSON.stringify({ ...states[30], stamp: 999 }) };
  const r2 = rebuild(SETTINGS, list, tampered, {});
  expect(r2.ok && r2.fromSnap).toBe(false); expect(r2.ok && hashState(r2.followed.state)).toBe(hashState(states[40]!));
  expect(rebuild(SETTINGS, list, { ...good, state: '{' }, {}).ok).toBe(true);
  expect(rebuild(SETTINGS, list, { ...good, n: 41 }, {}).ok).toBe(true);
  const unreadable = { units: 'x' };
  expect(rebuild(SETTINGS, list, { n: 30, hash: hashState(unreadable as never), state: JSON.stringify(unreadable) }, {}).ok && 'fallback').toBe('fallback');
});
test('applyLocal refuses what the engine refuses and encodes what it accepts', () => {
  expect(applyLocal(opening(SETTINGS), { type: 'move', unit: 99, to: '0,0' })).toBeNull();
  expect(applyLocal(opening(SETTINGS), { type: 'endTurn' })!.encoded).toBe('{"type":"endTurn"}');
});
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `sync.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online/sync.ts src/online/sync.test.ts
git commit -m "Follow the online record: apply, compare hashes, rebuild"
```

**What changed from rev 2:** `playerView` named in Consumes (M3). The logic is unchanged.

---

### Task 7: The turn clock, the drop pause and the return credit

**Files:**
- Create: `src/online/clock.ts`, `src/online/clock.test.ts`

**Interfaces:**
- Consumes: `Head`, `Presence`, `DROP_PAUSE_MS`, `TIMEOUT_LEAD_MS`, `TIMEOUT_GRACE_MS`, `CREDIT_MARGIN_MS` from `wire.ts`.
- Produces:

```ts
export type ClockView =
  | { kind: 'off' }
  | { kind: 'running'; endsAt: number }                      // server time
  | { kind: 'paused'; leftMs: number; resumesAt: number };   // the current player dropped; resumesAt is when the pause allowance runs out
export function clockView(clockSec: number, head: Head, current: Presence | null, serverNow: number): ClockView;
export function timeoutDue(view: ClockView, serverNow: number, mine: boolean): boolean;   // mine: this phone holds the current seat (or plays it as host)
export function pauseCredit(head: Head, offAt: number, serverNow: number): number;        // the head.paused a return may claim
export function creditOnReturn(head: Head | null, holdsCurrent: boolean, own: Presence | null, serverNow: number): number | null;
export function secondsLeft(view: ClockView, serverNow: number): number | null;           // whole seconds rounded down, never below 0; paused gives leftMs; null when off
export function formatClock(seconds: number): string;                                     // 125 -> '2:05'
```

Definitions: `base = head.turnAt + clockSec * 1000 + head.paused`. If the clock is off: `off`. If `current` is null or `on`: `running` with `endsAt = base`. Otherwise the player dropped at `offAt = max(current.at, head.turnAt)` (a drop that began in an earlier turn counts from this turn's start) with `allowance = DROP_PAUSE_MS - head.paused` left. If `offAt >= base`: `running` with `endsAt = base` (a drop after the deadline pauses nothing). While `serverNow - offAt < allowance` the view is `paused` with `leftMs = base - offAt` and `resumesAt = offAt + allowance`; after that it is `running` with `endsAt = base + allowance`.

`timeoutDue` is true when running and `serverNow >= endsAt + TIMEOUT_LEAD_MS` (mine) or `serverNow >= endsAt + TIMEOUT_GRACE_MS` (not mine). The rules accept at `now >= endsAt`, so the current phone's write is 500 ms clear of the boundary even with a few hundred milliseconds of error in `.info/serverTimeOffset`.

`pauseCredit = min(DROP_PAUSE_MS, head.paused + max(0, serverNow - CREDIT_MARGIN_MS - max(offAt, head.turnAt)))`: the phone claims 2 s less than its estimate of the time away, so the rules' bound (`<= now - presence.at`, from the server's own clock) holds even when the offset is off by up to 2 s. `creditOnReturn` is `pauseCredit(head, own.at, serverNow)` when `head` is not null, `holdsCurrent` is true, `own` is not null and `own.on` is false, and the result is greater than `head.paused`; otherwise null (the return writes presence alone). An AI seat has no presence: pass `null` to `clockView`, so its clock simply runs.

- [ ] **Step 1: Write the failing tests**

```ts
const H: Head = { n: 10, seat: 0, hash: '0123456789abcdef', at: 1_000_000, turnAt: 1_000_000, paused: 0 };
const on: Presence = { on: true, at: 900_000 };
test('off is off', () => { expect(clockView(0, H, on, 5_000_000)).toEqual({ kind: 'off' }); expect(timeoutDue({ kind: 'off' }, 9e12, true)).toBe(false); });
test('a running clock', () => {
  expect(clockView(120, H, on, 1_050_000)).toEqual({ kind: 'running', endsAt: 1_120_000 });
  expect(clockView(120, { ...H, paused: 30_000 }, on, 1_050_000)).toEqual({ kind: 'running', endsAt: 1_150_000 });
  expect(secondsLeft({ kind: 'running', endsAt: 1_120_000 }, 1_050_400)).toBe(69);
  expect(secondsLeft({ kind: 'running', endsAt: 1_120_000 }, 1_200_000)).toBe(0);
  expect(formatClock(69)).toBe('1:09'); expect(formatClock(120)).toBe('2:00'); expect(formatClock(0)).toBe('0:00');
});
test('a drop pauses it, for at most three minutes', () => {
  const off: Presence = { on: false, at: 1_030_000 };
  expect(clockView(120, H, off, 1_100_000)).toEqual({ kind: 'paused', leftMs: 90_000, resumesAt: 1_210_000 });
  expect(clockView(120, H, off, 1_250_000)).toEqual({ kind: 'running', endsAt: 1_300_000 });
  expect(clockView(120, { ...H, paused: 150_000 }, off, 1_050_000)).toEqual({ kind: 'paused', leftMs: 240_000, resumesAt: 1_060_000 });
});
test('a drop that began before this turn counts from the turn start', () => {
  expect(clockView(120, H, { on: false, at: 900_000 }, 1_100_000)).toEqual({ kind: 'paused', leftMs: 120_000, resumesAt: 1_180_000 });
});
test('a drop after the deadline pauses nothing', () => {
  expect(clockView(60, H, { on: false, at: 1_070_000 }, 1_080_000)).toEqual({ kind: 'running', endsAt: 1_060_000 });
});
test('an AI seat has no presence and its clock runs', () => {
  expect(clockView(60, H, null, 1_010_000)).toEqual({ kind: 'running', endsAt: 1_060_000 });
});
test('who ends the turn, and when: the current phone half a second late, the other three seconds late', () => {
  const v: ClockView = { kind: 'running', endsAt: 1_120_000 };
  expect(timeoutDue(v, 1_120_499, true)).toBe(false); expect(timeoutDue(v, 1_120_500, true)).toBe(true);
  expect(timeoutDue(v, 1_122_999, false)).toBe(false); expect(timeoutDue(v, 1_123_000, false)).toBe(true);
  expect(timeoutDue({ kind: 'paused', leftMs: 1, resumesAt: 2 }, 9e12, false)).toBe(false);
});
test('the pause credited on return claims two seconds less than the time away', () => {
  expect(pauseCredit(H, 1_030_000, 1_090_000)).toBe(58_000);
  expect(pauseCredit({ ...H, paused: 150_000 }, 1_030_000, 1_090_000)).toBe(180_000);
  expect(pauseCredit(H, 1_030_000, 1_000_000)).toBe(0);
  expect(pauseCredit(H, 900_000, 1_050_000)).toBe(48_000);                    // from the turn start, not the drop
});
test('a credit is written only by the current player coming back, and only when it adds something', () => {
  const off: Presence = { on: false, at: 1_030_000 };
  expect(creditOnReturn(H, true, off, 1_150_000)).toBe(118_000);
  expect(creditOnReturn(H, false, off, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, on, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, null, 1_150_000)).toBeNull();
  expect(creditOnReturn(null, true, off, 1_150_000)).toBeNull();
  expect(creditOnReturn({ ...H, paused: 180_000 }, true, off, 1_150_000)).toBeNull();
  expect(creditOnReturn(H, true, { on: false, at: 1_149_000 }, 1_150_000)).toBeNull();
});
test('after the credit lands, the returning player sees the time they were promised', () => {
  // dropped 30 s into a 2 min turn, back at 150 s: past the original deadline but inside the allowance
  const credit = creditOnReturn(H, true, { on: false, at: 1_030_000 }, 1_150_000)!;
  const view = clockView(120, { ...H, paused: credit }, { on: true, at: 1_150_000 }, 1_150_000);
  expect(view).toEqual({ kind: 'running', endsAt: 1_238_000 });
  expect(timeoutDue(view, 1_150_000, true)).toBe(false); expect(secondsLeft(view, 1_150_000)).toBe(88);
});
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `clock.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online/clock.ts src/online/clock.test.ts
git commit -m "Add the turn clock, the drop pause and the credit a return claims"
```

**What changed from rev 2:** the current phone ends its own turn 500 ms after the deadline, so the rules' `now >=` is never raced at the boundary (I1); `creditOnReturn` decides the credit written with presence, claims 2 s less than the estimate so the rules' bound holds, and the C1 scenario (drop at 30 s, back at 150 s) is pinned as pure arithmetic (C1); a drop that began in an earlier turn counts from this turn's start (matching the rules' second bound).

---

### Task 8: The host role and online AI seats

**Files:**
- Create: `src/online/host.ts`, `src/online/host.test.ts`, `src/online/aiSeat.ts`, `src/online/aiSeat.test.ts`

**Interfaces:**
- Consumes: `Room`, `RoomSeat`, `HOST_AWAY_MS` from `wire.ts`; from plan 3: `aiStep`, `afterThink`, `afterAct`, `START`, `Cursor`, `FIRST_THINK_MS`, `REPLAN_MS` (`src/ai/driver.ts`), `adaptStep`, `gapOf`, `AdaptState` (`src/ai/adapt.ts`), `LEVEL_DIAL` (`src/ai/types.ts`), `aiInputFor` (`src/ai/input.ts`), `planTurn` (the tests' main-thread planner), and the `AiClient` interface, `isSuperseded` and `SupersededError` from `src/app/aiClient.ts` (`aiClient.ts` imports nothing from the store; the tests use `SupersededError`).
- Produces:

```ts
// host.ts
export function hostMove(room: Room, me: string, serverNow: number): 'reclaim' | 'standIn' | null;
export function aiSeatToPlay(room: Room, state: MatchState, me: string): PlayerId | null;

// aiSeat.ts
export interface AiSeatDeps {
  ai: AiClient;
  state(): MatchState | null;                                   // the session's current followed state
  live(): boolean;                                              // still host, still this seat's turn, session open
  append(action: Action, adapt: AdaptState | null): Promise<boolean>;   // true once the write landed and the state moved on
}
export type AiSeatEnd = 'ended' | 'stopped' | 'passed';
export function playAiSeat(seat: PlayerId, info: Extract<RoomSeat, { kind: 'ai' }>, turnFresh: boolean, deps: AiSeatDeps): Promise<AiSeatEnd>;
```

Rules for `host.ts`: `reclaim` when `me` is `meta.creatorId`, `me` is present, and `meta.hostId !== me`. `standIn` when the host's presence has been off since at least `HOST_AWAY_MS` before `serverNow`, `me` is a present human member who is not the host, and `me` has the earliest `presence.at` among present human members other than the host (ties broken by uid order). `aiSeatToPlay` is the current seat when that seat is `kind: 'ai'`, `phase` is `playing`, the match is not over, and `me === meta.hostId`; otherwise null.

Rules for `playAiSeat`, the online twin of the store's `playAi` (same driver steps, no screen pacing, no local save):

- The dial: for `adaptive`, when `turnFresh` (no action yet in this AI turn: the list is empty or its last action is `endTurn`), `adapt = adaptStep(info.adapt, gapOf(state, seat))`, sent with the turn's first append and never again; otherwise the stored `info.adapt.dial` (a stand-in host that picks up mid-turn does not step the dial twice). Fixed levels use `LEVEL_DIAL[level]`. `salt` is `info.salt`, so the plan seeds (`planSeed(salt, stamp, replans)`) are the same on whichever phone hosts.
- The loop: `aiStep(cur, state, { player: seat, dial, salt })`. A `think` calls `deps.ai.think(aiInputFor(state, seat), { dial, seed, refused, deadlineMs })` with `FIRST_THINK_MS` for the first plan and `REPLAN_MS` after, then checks `live()`. An `act` tries `applyAction` locally first: refused means `afterAct(cur, action, false)` and loop (an `endTurn` refusal stops with `'stopped'`). Accepted means `await deps.append(action, adapt)` (then `adapt = null`); `false` from `append` (a lost race, the host role gone, the connection gone) stops with `'stopped'`, and the session's next room event decides who plays on. Ending on `endTurn` or a winner returns `'ended'`.
- Failures: a superseded think, or `live()` false after any await, returns `'stopped'`. Any other throw retries the same step once, then appends `endTurn` and returns `'passed'` (plan 3's ruling: the AI passes rather than freeze the match).
- Handover: a new host simply calls `playAiSeat` again from the current state with `turnFresh` computed from the action list. The AI keeps no memory between calls other than `salt` and `adapt`, both in the database seat.

- [ ] **Step 1: Write the failing tests**

```ts
// host.test.ts
const room = (over: Partial<Room> = {}): Room => ({
  code: 'ABC234',
  meta: { createdAt: 1, creatorId: 'u0', hostId: 'u0', schema: 1, rulesVersion: 2, build: 't', clock: 120, hostFaction: 'spartans', phase: 'playing' },
  seats: [{ uid: 'u0', name: 'Ann', kind: 'human', rules: 2 }, { uid: 'u1', name: 'Ben', kind: 'human', rules: 2 }],
  members: { u0: 0, u1: 1 }, presence: { u0: { on: true, at: 100 }, u1: { on: true, at: 200 } }, head: null, desync: {}, ...over,
});
const BOT: RoomSeat = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal', salt: 7, adapt: { dial: 0.5, trend: 0 } };
test('the creator takes the host role back when present', () => {
  expect(hostMove(room({ meta: { ...room().meta, hostId: 'u1' } }), 'u0', 10_000)).toBe('reclaim');
  expect(hostMove(room(), 'u0', 10_000)).toBeNull();
});
test('a stand-in only after the host has been gone 30 seconds', () => {
  const gone = room({ presence: { u0: { on: false, at: 1_000 }, u1: { on: true, at: 200 } } });
  expect(hostMove(gone, 'u1', 30_999)).toBeNull();
  expect(hostMove(gone, 'u1', 31_000)).toBe('standIn');
  expect(hostMove(gone, 'u0', 31_000)).toBeNull();
});
test('the AI seat is played by the host alone', () => {
  const r = room({ seats: [room().seats[0]!, BOT], members: { u0: 0 } });
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] }); const t = must(applyAction(s, { type: 'endTurn' }));
  expect(aiSeatToPlay(r, s, 'u0')).toBeNull();
  expect(aiSeatToPlay(r, t, 'u0')).toBe(1);
  expect(aiSeatToPlay(r, t, 'u1')).toBeNull();
  expect(aiSeatToPlay(room({ ...r, meta: { ...r.meta, phase: 'over' } }), t, 'u0')).toBeNull();
});
```

```ts
// aiSeat.test.ts: a planner on the main thread stands in for the worker, as store.test.ts's `thinker` does
const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
function harness(start: MatchState) {
  let state = start; const sent: { action: Action; adapt: AdaptState | null }[] = [];
  const deps: AiSeatDeps = {
    ai: thinker(), state: () => state, live: () => true,
    append: async (action, adapt) => { const r = applyAction(state, action); if (!r.ok) return false; state = r.state; sent.push({ action, adapt }); return true; },
  };
  return { deps, sent, now: () => state };
}
const AFTER_ONE = () => must(applyAction(createMatch({ seed: 42, factions: ['spartans', 'mongols'] }), { type: 'endTurn' }));

test('an AI seat plays a whole turn and ends it', async () => {
  const h = harness(AFTER_ONE());
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('ended');
  expect(h.sent.at(-1)!.action).toEqual({ type: 'endTurn' }); expect(h.now().current).toBe(0);
  expect(h.sent.every(x => x.adapt === null)).toBe(true);                  // a fixed level has no dial to send
});
test('the same salt plays the same turn on any phone', async () => {
  const a = harness(AFTER_ONE()); const b = harness(AFTER_ONE());
  await playAiSeat(1, BOT as never, true, a.deps); await playAiSeat(1, BOT as never, true, b.deps);
  expect(a.sent.map(x => encodeAction(x.action))).toEqual(b.sent.map(x => encodeAction(x.action)));
});
test('adaptive: the dial moves once, with the first action, and not again after a handover', async () => {
  const seat = { ...BOT, level: 'adaptive' } as Extract<RoomSeat, { kind: 'ai' }>;
  const h = harness(AFTER_ONE());
  await playAiSeat(1, seat, true, h.deps);
  expect(h.sent[0]!.adapt).not.toBeNull(); expect(h.sent.slice(1).every(x => x.adapt === null)).toBe(true);
  const mid = harness(AFTER_ONE());
  mid.deps.live = () => mid.sent.length < 1;                                // the host leaves after its first action
  expect(await playAiSeat(1, seat, true, mid.deps)).toBe('stopped');
  const standIn = harness(mid.now());
  await playAiSeat(1, { ...seat, adapt: mid.sent[0]!.adapt! }, false, standIn.deps);
  expect(standIn.sent.every(x => x.adapt === null)).toBe(true);
  expect(standIn.now().current).toBe(0);
});
test('a lost write stops the AI; the session decides who plays on', async () => {
  const h = harness(AFTER_ONE()); h.deps.append = async () => false;
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('stopped');
});
test('a planner that keeps failing passes the turn', async () => {
  const h = harness(AFTER_ONE()); h.deps.ai = { think: async () => { throw new Error('boom'); }, dispose: () => {} };
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('passed');
  expect(h.sent.map(x => x.action)).toEqual([{ type: 'endTurn' }]);
});
test('a superseded think stops quietly', async () => {
  const h = harness(AFTER_ONE()); h.deps.ai = { think: async () => { throw new SupersededError(); }, dispose: () => {} };
  expect(await playAiSeat(1, BOT as never, true, h.deps)).toBe('stopped'); expect(h.sent).toEqual([]);
});
```

These tests run the real planner; give the file a 30 s timeout (plan 3's ruling for planner tests on this shared machine).

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `host.ts` and `aiSeat.ts`.** Copy no planner logic: `aiSeat.ts` only sequences plan 3's step functions.
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online/host.ts src/online/host.test.ts src/online/aiSeat.ts src/online/aiSeat.test.ts
git commit -m "Add the host stand-in and the online AI seat driver"
```

**What changed from rev 2:** `SupersededError` and `planTurn` named in Consumes (M3). The logic is unchanged.

---
### Task 9: The online session

**Files:**
- Create: `src/online/session.ts`, `src/online/session.test.ts`, `src/net/sessionKit.ts` (test helpers and the shared test bodies), `src/net/session.emu.test.ts`

**Interfaces:**
- Consumes: `type Net`, `type Refusal`, `type Live` from `src/net/net.ts` (type-only in `session.ts`); `follow`, `rebuild`, `applyLocal`, `opening`, `Followed`, `Step`; `clockView`, `timeoutDue`, `creditOnReturn`, `secondsLeft`; `hostMove`, `aiSeatToPlay`; `playAiSeat`; `liveDesync`, `SCHEMA`, `TIMEOUT_RETRY_MS`; `RULES_VERSION`, `hashState`, `createMatch`. The tests import `fakeServer` and the helpers from `src/net/sessionKit.ts` (a test file importing `src/net` is exempt from the boundary guard; `sessionKit.ts` lives in `src/net`, which may import `src/online`).
- Produces:

```ts
export type SessionPhase = 'connecting' | 'notFound' | 'version' | 'join' | 'lobby' | 'playing' | 'over' | 'desync' | 'failed';
export interface SessionView {
  phase: SessionPhase; code: string; me: string | null; mySeat: PlayerId | null; room: Room | null;
  followed: Followed | null;              // null before the match starts
  connected: boolean;
  returning: boolean;                     // connected again, but the return write (presence and credit) has not landed yet
  clock: ClockView; secondsLeft: number | null;
  myTurn: boolean;                        // connected, not returning, playing, my seat is current, no live desync, nothing being rebuilt, not sending an endTurn
  sending: boolean;                       // a write is on its way (it stays true while offline: the SDK holds it)
  hostIsMe: boolean;
  absent: PlayerId[];                     // human seats whose presence is off
  remoteVersion: number | null;           // meta.rulesVersion when it differs from this phone's
  remoteSchema: number | null;            // meta.schema when it is newer than this phone's SCHEMA
  lastSteps: { seq: number; steps: Step[]; mine: boolean } | null;   // what just arrived or was just played, for effects and the digest
  timedOut: number | null;                // index of the endTurn with which the clock ended this phone's own turn, for the timeUp line
  failure: Refusal | null;                // the last refused join, takeover or start
}
export interface SessionDeps { net: Net; ai: AiClient; build: string; rulesVersion?: number;   // defaults to RULES_VERSION; tests vary it
  setTimer(fn: () => void, ms: number): () => void }
export interface Session {
  view(): SessionView;
  act(a: Action): Step | null;            // null when not my turn or the engine refuses; never throws; the step is applied at once
  resign(): boolean;                      // { type: 'resign', player: mySeat }, on either player's turn; false when not possible now
  join(name: string): Promise<true | Refusal>;
  takeOver(seat: PlayerId): Promise<true | Refusal>;
  setLobby(patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<true | Refusal>;
  start(seed: number): Promise<true | Refusal>;   // host only, both seats filled
  close(): void;
}
export function openSession(code: string, deps: SessionDeps, onChange: (v: SessionView) => void): Session;
```

Behaviour:

- **Opening:** watch the room. Missing: `notFound`. `meta.schema > SCHEMA`: `version` with `remoteSchema` set. `meta.rulesVersion !== rulesVersion`: `version` with `remoteVersion` set. In either `version` case nothing is written (not even presence: the watch is detached at once). Not a member and in the lobby: `join`. Not a member, playing, and some human seat is absent: `join` (the screen offers takeover for the `absent` seats). Not a member and nobody absent: `join` with `failure: 'full'`. Member: run **the return** (below), then `lobby`, or for a match in progress read the start once, `rebuild` with the snapshot, then follow.
- **The return** runs when the session opens as a member, after a successful `join` or `takeOver`, and on every `connected(true)` that follows a `connected(false)`. It sets `returning: true` and then:
  1. `readLive(code)` (fresh `head` and own presence from the server; the cache at this moment may still show this phone as present and the old `head`).
  2. `credit = creditOnReturn(live.head, mySeat === live.head?.seat, live.presence, net.serverNow())`.
  3. `present(code, credit)`. On `true`, `returning` turns false. On `'refused'` (the head moved between the read and the write, for example a timeout landed), go back to 1; the third attempt sends `present(code, null)`. On `'offline'`, stay `returning`; the next `connected(true)` starts over.
  While `returning` is true: `myTurn` is false, `act` returns null, no timeout is written, and no AI turn starts. This is what stops a returning phone ending its own turn from a stale view: its first clock decision is taken from a `head` that already holds its credit.
- **Acting:** `act` applies with `applyLocal` at once (the board moves without waiting), queues the encoded action, and sends the queue one write at a time (when nothing is in flight, `act` hands the write to `append` before it returns, so a connection lost right after the tap holds that write in the SDK) with the hash of the state after it, `turnPassed` for `endTurn` (or a resign of the current seat when the match goes on), `over` when the match is over, and the state JSON as `snap` when `turnPassed` or `over`. A `'refused'` answer clears the queue and waits for the watcher, whose next reading rebuilds (`follow` answers `rebuilt`). While offline the write in flight stays pending (`sending` stays true) and the rest of the queue waits behind it. `close` drops the part of the queue not yet handed to `append`; a write already handed over may still land later, and the rules check it against the index like any other.
- **Not connected:** `myTurn` is false and `act` refuses, so nothing new is queued while offline.
- **Following:** every `room` or `actions` event runs `follow` against the latest pair. A re-entry flag stops `follow` from running inside its own `append` (Firebase raises local events from inside a write: Deutsch Dash's `inSnapshot` lesson); the skipped reading is run once the write settles. `advanced` and `rebuilt` replace `followed` and set `lastSteps` (`rebuilt` has no steps and the board simply redraws; `mine` is false for steps from the database and true for this phone's own `act`). `broken` sets phase `desync`, writes `desync/<me>` with this phone's `n`, hash and build, and stops acting. When the phone later agrees with `head.hash` (after a reload on a fixed build) it removes its entry. While any entry in `liveDesync(room)` exists (a current member's), nobody's `myTurn` is true; an entry left by a uid that is no longer a member is ignored, and the session removes it (best effort; the rules allow any member to).
- **Clock:** a timer ticks once a second while playing, updating `secondsLeft`. When connected, not `returning`, nothing is `sending`, and `timeoutDue` is true for this phone (mine means my seat, or an AI seat I host; otherwise this phone is the backup), it appends `endTurn` for that `head.n`. If that write is refused and `head.n` has not moved after `TIMEOUT_RETRY_MS`, it is tried once more if `timeoutDue` still holds; after that no more attempts for that `n`. `timedOut` is set to `n` when an `endTurn` at index `n` ended this phone's own turn and this phone did not tap End turn: either its own timeout write landed, or it arrived from the other phone's backup.
- **Resign:** `resign()` queues `{ type: 'resign', player: mySeat }` through the same queue when connected, not `returning`, playing, and no live desync, on either player's turn; it returns false otherwise. The engine accepts it (Task 1) and the rules accept it from that seat (Task 4, writer 4).
- **Host:** on every room event run `hostMove` and act on it with `claimHost`. When `aiSeatToPlay` names a seat, no AI turn is running and the session is not `returning`, call `playAiSeat` with `turnFresh` from the action list and an `append` that goes through the same queue as `act` (with `adapt`), and `live()` = session open, not `returning`, and `aiSeatToPlay` still names that seat with `head.n` unchanged except by its own writes.
- **Close:** detach the watcher (presence goes off), cancel timers, stop any AI turn. The match stays in the database.

`src/net/sessionKit.ts` exports (none of it is imported by app code):

```ts
export interface ManualTimers {
  setTimerFor(uid: string): (fn: () => void, ms: number) => () => void;
  tick(ms: number): void;     // moves time forward to now + ms in steps: at each step the earliest due timer of a
                              // non-frozen uid fires (server.setNow to its time first). A one-shot timer fires once;
                              // one re-armed while firing fires again if its new time is still inside the tick, so a
                              // timer re-armed every second fires once per second of the tick. Ends with setNow(now + ms).
                              // tick is synchronous: no promise runs inside it, so tests call settle() after it.
  freeze(uid: string): void;  // that uid's timers stop firing (its phone is asleep but still connected)
  thaw(uid: string): void;    // they fire again from the next tick, at most once each for time already passed
}
export function manualTimers(server: FakeServer): ManualTimers;
export function settle(server: FakeServer): Promise<void>;    // awaits setImmediate until server.idle() twice in a row, at most 200 rounds
export function until(pred: () => boolean, ms?: number): Promise<void>;   // polls with settle-like flushes, real time limit (default 10 s)
export interface Pair { a: Session; b: Session | null; server: FakeServer; timers: ManualTimers;
  open(uid: 'u0' | 'u1'): Promise<Session>; openAs(uid: string, code: string): Promise<Session> }
export function pair(opts?: { clock?: ClockSec; second?: 'human' | AiLevel; ai?: Partial<Record<string, AiClient>> }): Promise<Pair>;
export function bareServer(): Promise<{ server: FakeServer; timers: ManualTimers; openAs(uid: string, code: string): Promise<Session> }>;
export function playTurns(a: Session, b: Session, n: number): Promise<void>;  // each side makes its first legal move and ends its turn
export function spyReadStart(server: FakeServer): { usedSnap: boolean };
export function headOf(server: FakeServer): Head; export function meta(server: FakeServer): RoomMeta;
export const thinker: () => AiClient;                          // planTurn on the main thread
export const hanging: () => AiClient;                         // think never resolves (a host phone stuck mid AI turn)

// the bodies run against both the fake and the emulator (I6)
export interface SessionKit {
  start(opts?: { clock?: ClockSec }): Promise<{ a: Session; b: Session }>;   // fresh code; Ann creates, Ben joins, Ann starts with seed 42
  reopen(who: 'a' | 'b'): Promise<Session>;                    // a new session on the same identity
  drop(who: 'a' | 'b'): void; back(who: 'a' | 'b'): Promise<void>;
  rewind(turnMs: number, away?: { who: 'a' | 'b'; ms: number }): Promise<void>;   // head/turnAt (and that phone's presence/at)
                                                               // moved back, in ONE rules-free update, so no phone ever sees half of it
  head(): Promise<Head | null>;
  until(pred: () => boolean, ms?: number): Promise<void>;
}
export function fakeKit(): SessionKit;                         // pair() underneath; rewind is server.write of both paths at once
export function firebaseKit(k: number): SessionKit;            // identities firebaseNet(`a${k}`) and firebaseNet(`b${k}`), a fresh
                                                               // makeRoomCode() per start, real timers, drop/back through setOnline,
                                                               // rewind through withSecurityRulesDisabled on demo-banners
export const sharedBodies: Record<string, (kit: SessionKit) => Promise<void>>;
```

`pair({ clock = 120, second = 'human', ai })` creates room `ABC234` as `u0` (Ann, spartans), joins as `u1` (Ben) or writes an AI seat of that level, starts with seed 42, and opens one session per human uid, each with `setTimerFor(uid)` and `ai[uid] ?? thinker()`. All fake tests use `fakeServer(1_000_000)`, so the match starts with `head.turnAt = 1_000_000`.

- [ ] **Step 1: Write the failing tests** (`session.test.ts`, against the fake).

```ts
test('both phones see the same match after a few turns', async () => { await sharedBodies['same match'](fakeKit()); });
test('only the player whose turn it is can act', async () => {
  const { a, b } = await pair();
  expect(b!.view().myTurn).toBe(false); expect(b!.act({ type: 'endTurn' })).toBeNull();
  expect(a.view().myTurn).toBe(true);
});
test('a double tap on End turn ends one turn', async () => {
  const { a, server } = await pair();
  expect(a.act({ type: 'endTurn' })).not.toBeNull(); expect(a.act({ type: 'endTurn' })).toBeNull(); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
});
test('the clock ends a turn on the current phone, just after the deadline', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(120_000); await settle(server); expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(1); expect(a.view().timedOut).toBe(0);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('a refused timeout is tried once more', async () => {
  const { b, server, timers } = await pair();
  server.failNext('u0'); timers.tick(121_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server);
  expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('the waiting phone ends the turn 3 s after the deadline when the current phone is asleep', async () => {
  const { a, b, server, timers } = await pair();
  timers.freeze('u0');                                   // Ann's phone stops ticking but stays connected
  timers.tick(122_000); await settle(server); expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(1_000); await settle(server); expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u1');
  timers.thaw('u0'); await settle(server); expect(a.view().timedOut).toBe(0);
});
test('a drop pauses the clock, and the backup waits for the pause', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); server.drop('u0'); await settle(server);
  expect(b!.view().clock).toMatchObject({ kind: 'paused', leftMs: 90_000 });
  timers.tick(210_000); await settle(server);            // 240 s: the 180 s pause has run out at 210 s; the clock now ends at 300 s
  expect(b!.view().followed!.state.current).toBe(0);
  timers.tick(63_000); await settle(server);             // 303 s: the backup's 3 s are up
  expect(b!.view().followed!.state.current).toBe(1);
  await server.back('u0'); await settle(server);
  expect(a.view().followed!.state.current).toBe(1); expect(a.view().myTurn).toBe(false); expect(a.view().returning).toBe(false);
  expect(server.log().at(-1)).toEqual({ uid: 'u0', paths: ['presence/u0'] });   // not its turn: presence alone, no credit
});
test('back from a drop past the deadline but inside the allowance: nobody ends the turn', async () => {
  const { a, b, server, timers } = await pair();
  timers.tick(30_000); server.drop('u0'); await settle(server);
  timers.tick(120_000); await settle(server);            // 150 s: past the 120 s deadline, 120 s into a 180 s allowance
  await server.back('u0'); await settle(server);
  expect(headOf(server).paused).toBe(118_000);           // 120 s away, less the 2 s margin, written with presence
  for (const s of [a, b!]) {
    expect(s.view().followed!.actions).toEqual([]);
    expect(s.view().clock).toEqual({ kind: 'running', endsAt: 1_238_000 });
  }
  expect(a.view().myTurn).toBe(true);
  timers.tick(88_000); await settle(server);             // 238 s: deadline reached, not yet the 500 ms lead
  expect(a.view().followed!.actions).toEqual([]);
  timers.tick(1_000); await settle(server);              // 239 s: Ann's own phone ends the turn
  expect(b!.view().followed!.state.current).toBe(1);
  expect(server.log().find(w => w.paths.includes('actions/0'))!.uid).toBe('u0');
});
test('the race: my last move against the timeout, before I have seen it; one lands, my phone rebuilds', async () => {
  const { a, b, server, timers } = await pair();
  timers.freeze('u0'); server.hold('u0');                // Ann's phone neither ticks nor hears the server
  timers.tick(123_000); await settle(server);            // Ben's backup ends the turn
  expect(b!.view().followed!.state.current).toBe(1);
  expect(a.view().followed!.actions).toEqual([]);        // Ann has not seen it
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  expect(a.act(move)).not.toBeNull();                    // accepted locally: Ann still believes it is her turn
  await settle(server);
  server.release('u0'); timers.thaw('u0'); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
  expect(a.view().followed!.actions).toEqual(b!.view().followed!.actions);
  expect(a.view().followed!.state.current).toBe(1); expect(a.view().phase).toBe('playing');
  expect(server.log().filter(w => w.uid === 'u0' && w.paths.some(p => p.startsWith('actions/')))).toEqual([]);
});
test('a move held while offline is refused on return when the clock ended the turn meanwhile', async () => {
  const { a, b, server, timers } = await pair();
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  a.act(move); server.drop('u0'); await settle(server);  // the write was handed to the SDK, then the connection went
  expect(a.view().sending).toBe(true); expect(a.view().connected).toBe(false);
  timers.tick(303_000); await settle(server);            // pause allowance, then the clock, then the backup's 3 s
  expect(b!.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
  await server.back('u0'); await settle(server);         // the held move lands late and is refused at index 0
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']); expect(a.view().sending).toBe(false);
  expect(a.view().phase).toBe('playing'); expect(a.view().followed!.state.current).toBe(1);
});
test('a reload mid-turn loses nothing that reached the database, and the clock resumes with the drop credited', async () => {
  const { a, server, timers, open } = await pair();
  const moves = legalActions(a.view().followed!.state).filter(x => x.type === 'move').slice(0, 2);
  a.act(moves[0]!); await settle(server);
  server.drop('u0'); await settle(server);
  expect(a.view().connected).toBe(false); expect(a.act(moves[1]!)).toBeNull();   // not connected: refused, nothing queued
  a.close(); timers.tick(10_000); await server.back('u0');
  const again = await open('u0'); await settle(server);
  expect(again.view().followed!.actions).toEqual([encodeAction(moves[0]!)]);
  expect(again.view().myTurn).toBe(true);
  expect(again.view().clock).toEqual({ kind: 'running', endsAt: 1_000_000 + 120_000 + 8_000 });
});
test('rejoin uses the snapshot and matches the other phone', async () => {
  const { a, b, open, server } = await pair();
  await playTurns(a, b!, 8);
  b!.close(); const spy = spyReadStart(server);
  const again = await open('u1'); await settle(server);
  expect(hashState(again.view().followed!.state)).toBe(hashState(a.view().followed!.state));
  expect(spy.usedSnap).toBe(true);
});
test('a different rules version, or a newer wire schema, is refused and nothing is written', async () => {
  const { server, openAs } = await bareServer();
  await server.as('u0').create({ code: 'ABC234', name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION + 1, build: 't' });
  await server.as('u0').create({ code: 'DEF567', name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' });
  server.write('rooms/DEF567/meta/schema', SCHEMA + 1);
  const before = JSON.stringify(server.tree());
  const s = await openAs('u1', 'ABC234'); await settle(server);
  expect(s.view().phase).toBe('version'); expect(s.view().remoteVersion).toBe(RULES_VERSION + 1);
  const t = await openAs('u1', 'DEF567'); await settle(server);
  expect(t.view().phase).toBe('version'); expect(t.view().remoteSchema).toBe(SCHEMA + 1);
  expect(JSON.stringify(server.tree())).toBe(before);
});
test('a hash that disagrees pauses both phones', async () => {
  const { a, b, server } = await pair();
  const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
  server.write('rooms/ABC234/actions/0', encodeAction(move));
  server.write('rooms/ABC234/head', { ...headOf(server), n: 1, hash: '0000000000000000' });
  await settle(server);
  expect(b!.view().phase).toBe('desync'); expect(a.view().myTurn).toBe(false);
  expect((server.tree() as any).rooms.ABC234.desync).toHaveProperty('u1');
});
test('a desync entry left by someone who is no longer in the match freezes nothing', async () => {
  const { a, b, server, openAs } = await pair();
  server.write('rooms/ABC234/desync/ghost', { n: 0, hash: '0'.repeat(16), build: 'x' }); await settle(server);
  expect(a.view().myTurn).toBe(true);
  server.write('rooms/ABC234/desync/u1', { n: 0, hash: '0'.repeat(16), build: 'x' }); await settle(server);
  expect(a.view().myTurn).toBe(false);                   // Ben is a member: the match waits for him
  b!.close(); await settle(server);
  const c = await openAs('u7', 'ABC234'); expect(await c.takeOver(1)).toBe(true); await settle(server);
  expect(a.view().myTurn).toBe(true);                    // Ben's seat has a new owner and his entry went with the takeover
  expect((server.tree() as any).rooms.ABC234.desync ?? {}).toEqual({});
});
test('resign from the waiting phone ends the match on both', async () => { await sharedBodies['resign out of turn'](fakeKit()); });
test('a newcomer can take an absent seat and play on', async () => {
  const { a, b, server, openAs } = await pair(); b!.close(); await settle(server);
  const c = await openAs('u7', 'ABC234'); await settle(server);
  expect(c.view().phase).toBe('join'); expect(c.view().absent).toEqual([1]);
  expect(await c.takeOver(1)).toBe(true); await settle(server);
  expect(c.view().mySeat).toBe(1); expect(hashState(c.view().followed!.state)).toBe(hashState(a.view().followed!.state));
});
test('an AI seat is played by the host', async () => {
  const { a } = await pair({ second: 'normal' });
  a.act({ type: 'endTurn' });
  await until(() => a.view().followed!.state.current === 0 && a.view().followed!.actions.length > 2);
  expect(a.view().followed!.actions.at(-1)).toBe('{"type":"endTurn"}');
});
test('the AI seat carries on from another device of the same person', async () => {
  // Ann's phone is stuck mid AI turn and closes; Ann opens the link on a second device (new uid u9). Takeover of seat 0
  // makes u9 a member. The stand-in rule (a present human member, the host away 30 s) elects u9; reclaim never fires
  // because u9 is not the creator. The AI turn is then played from u9's session, with its dial stepped once.
  const { a, server, openAs, timers } = await pair({ second: 'adaptive', ai: { u0: hanging() } });
  a.act({ type: 'endTurn' }); await settle(server);
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);       // the AI turn has not started writing
  a.close(); await settle(server);
  timers.tick(30_000);
  const other = await openAs('u9', 'ABC234'); expect(await other.takeOver(0)).toBe(true);
  timers.tick(1_000);
  await until(() => other.view().followed?.state.current === 0);
  expect(other.view().hostIsMe).toBe(true);
  const aiWrites = server.log().filter(w => w.paths.includes('head/n')).slice(1);   // after Ann's endTurn
  expect(aiWrites.length).toBeGreaterThan(1);
  expect(aiWrites.every(w => w.uid === 'u9')).toBe(true);
  expect(aiWrites[0]!.paths).toContain('seats/1/adapt'); expect(aiWrites.slice(1).some(w => w.paths.includes('seats/1/adapt'))).toBe(false);
});
test('the guest stands in as host 30 s after the host leaves, and the creator takes it back', async () => {
  const { a, b, open, server, timers } = await pair();
  a.close(); await settle(server);
  timers.tick(29_000); await settle(server); expect(meta(server).hostId).toBe('u0');
  timers.tick(1_000); await settle(server); expect(meta(server).hostId).toBe('u1'); expect(b!.view().hostIsMe).toBe(true);
  await open('u0'); await settle(server); expect(meta(server).hostId).toBe('u0');
});
```

The shared bodies in `sessionKit.ts`, written out:

```ts
export const sharedBodies: Record<string, (kit: SessionKit) => Promise<void>> = {
  'same match': async (kit) => {
    const { a, b } = await kit.start();
    for (let turn = 0; turn < 6; turn++) {
      const s = turn % 2 === 0 ? a : b;
      await kit.until(() => s.view().myTurn);
      const legal = legalActions(s.view().followed!.state).filter(x => x.type !== 'resign' && x.type !== 'endTurn');
      if (legal.length) expect(s.act(legal[0]!)).not.toBeNull();
      expect(s.act({ type: 'endTurn' })).not.toBeNull();
      await kit.until(() => a.view().followed!.state.stamp === turn + 1 && b.view().followed!.state.stamp === turn + 1);
    }
    expect(hashState(a.view().followed!.state)).toBe(hashState(b.view().followed!.state));
  },
  'reload mid-turn': async (kit) => {
    const { a } = await kit.start();
    await kit.until(() => a.view().myTurn);
    const move = legalActions(a.view().followed!.state).find(x => x.type === 'move')!;
    a.act(move); await kit.until(() => !a.view().sending);
    kit.drop('a'); await kit.until(() => !a.view().connected);
    expect(a.act({ type: 'endTurn' })).toBeNull();
    a.close(); await kit.back('a');
    const again = await kit.reopen('a');
    await kit.until(() => again.view().myTurn);
    expect(again.view().followed!.actions).toEqual([encodeAction(move)]);
  },
  'resign out of turn': async (kit) => {
    const { a, b } = await kit.start();
    await kit.until(() => a.view().myTurn && b.view().phase === 'playing');
    expect(b.resign()).toBe(true);
    await kit.until(() => a.view().phase === 'over' && b.view().phase === 'over');
    expect(a.view().followed!.state.winner).toBe(0);
  },
  'clock through the server': async (kit) => {
    const { a, b } = await kit.start({ clock: 60 });
    await kit.until(() => a.view().myTurn);
    await kit.rewind(61_000);
    await kit.until(() => b.view().followed?.state.current === 1, 10_000);
    expect(a.view().timedOut).toBe(0);
  },
  'back from a drop keeps the turn': async (kit) => {
    const { a, b } = await kit.start();
    await kit.until(() => a.view().myTurn);
    kit.drop('a'); await kit.until(() => b.view().absent.includes(0), 10_000);
    await kit.rewind(150_000, { who: 'a', ms: 120_000 });       // dropped 30 s into the turn, now 150 s in
    await kit.back('a');
    await kit.until(() => a.view().myTurn, 10_000);
    const head = (await kit.head())!;
    expect(head.n).toBe(0);
    expect(head.paused).toBeGreaterThan(115_000); expect(head.paused).toBeLessThan(DROP_PAUSE_MS);   // about 118 s plus the reconnect time
    await new Promise(r => setTimeout(r, 4_000));                 // past both phones' lead and grace
    expect((await kit.head())!.n).toBe(0);
  },
};
```

On the fake, `fakeKit().rewind` is one rules-free write and `until` flushes the fake between polls; the clock bodies need real seconds only on the emulator (on the fake the 4 s wait passes no fake time, so `'back from a drop keeps the turn'` is also covered by the fake test above with manual time).

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `session.ts` and `sessionKit.ts`.** Keep the decisions in Tasks 6 to 8; the session only wires them.
- [ ] **Step 4: Run them and see them pass.** Then `src/net/session.emu.test.ts`: inside `describe.runIf(process.env.EMULATOR === '1')`, one test per entry of `sharedBodies`, each with `firebaseKit(k)` for a fresh `k`, so every test has its own identities and its own room code. Give each a 30 s timeout. Run `npm run test:emu`.
- [ ] **Step 5: Stage, run `npm test` (the boundary guard must accept `session.test.ts` importing `sessionKit.ts`), then commit:**

```bash
git add src/online/session.ts src/online/session.test.ts src/net/sessionKit.ts src/net/session.emu.test.ts
git commit -m "Add the online session: acting, following, clock, drops, host and AI seats"
```

**What changed from rev 2:** a return writes presence and the drop credit in one `present` call from a fresh `readLive`, and no clock decision is taken while `returning`, with a fake test (drop at 30 s, back at 150 s) and an emulator body proving neither phone ends the turn and both clocks show the credited time (C1); a reload also credits its drop (Review Focus 2). The current phone's timeout comes 500 ms after the deadline and a refused one is retried once (I1). Offline writes are pending (`sending` stays true), a held move landing after the backup timeout is refused and rolled back, and `close` is specified for writes the SDK still holds (I4). The race test holds Ann's watcher back so her move really races Ben's timeout; the reload test settles after `drop`; the AI handover test parks Ann's AI turn on a thinker that never answers and checks that u9 made the AI writes and stepped the dial once (I5). The emulator runs five shared bodies through `firebaseKit`, with fresh codes and identities, drops through `setOnline`, and one timeout through the real server (I6). Only current members' `desync` entries block, and a takeover clears the old one (I8). `resign()` returns whether it was queued. `freeze` is on the timers, and `tick` is defined (M11). The helpers moved to `src/net/sessionKit.ts`, so `src/online` stays pure (I2). A newer `schema` is a `version` room (M8).

---

### Task 10: This phone's online matches, kept apart from the saves

**Files:**
- Create: `src/app/onlineList.ts`, `src/app/onlineList.test.ts`

**Interfaces:**
- Consumes: `KeyValue`, `writeSave`, `listSaves` from `saves.ts`; `MatchRecord`, `Seat`, `newRecord`, `append`, `restore`, `Restored` from `record.ts`; `FINISHED_SWEEP_MS`, `ROOM_IDLE_TTL_MS`, `isRoomCode`, `CODE_ALPHABET` from `wire.ts`.
- Produces:

```ts
export interface OnlineEntry { code: string; seat: PlayerId; names: [string, string]; factions: [FactionId, FactionId];
  round: number; current: PlayerId; over: boolean; rulesVersion: number; createdHere: boolean; updatedAt: number }
export const MAX_ONLINE = 20;
export function listOnline(kv: KeyValue): OnlineEntry[];              // newest first; never throws
export function rememberOnline(kv: KeyValue, e: OnlineEntry, cache: MatchRecord | null): void;   // cache: the last known record, for an instant start
export function readOnlineCache(kv: KeyValue, code: string): Restored | null;   // through record.ts's restore
export function forgetOnline(kv: KeyValue, code: string): void;
export function dueForSweep(list: OnlineEntry[], now: number): string[];   // created here and over for FINISHED_SWEEP_MS, or created here and idle ROOM_IDLE_TTL_MS
export function setPendingRoom(kv: KeyValue, code: string | null): void;  // a room to reopen after an update reload
export function takePendingRoom(kv: KeyValue): string | null;             // reads and clears
```

Keys: `warbanners.online.v1` (the list), `warbanners.online.<code>` (the cached record, a plan 2 `MatchRecord` with id `online-<code>` whose `snapshot` is the last followed state), `warbanners.online.pending`. Nothing here touches `warbanners.saves.v1` or `warbanners.save.<id>`, so the 20 saves, their eviction order and `listSaves` are exactly as plan 2 left them. When the list passes `MAX_ONLINE`, the oldest finished entries go first, then the oldest unfinished; their cache goes with them.

- [ ] **Step 1: Write the failing tests**

```ts
const memKv = () => { const map = new Map<string, string>(); return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } }; };
const entry = (code: string, over: Partial<OnlineEntry> = {}): OnlineEntry => ({ code, seat: 0, names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'],
  round: 3, current: 0, over: false, rulesVersion: RULES_VERSION, createdHere: true, updatedAt: 1_000, ...over });

test('online entries are swept only when created here and finished or idle', () => {
  const kv = memKv();
  rememberOnline(kv, entry('ABC234', { over: true }), null);
  rememberOnline(kv, entry('DEF567'), null);
  rememberOnline(kv, entry('GHJ789', { over: true, createdHere: false }), null);
  expect(dueForSweep(listOnline(kv), 1_000 + 86_400_001)).toEqual(['ABC234']);
  expect(dueForSweep(listOnline(kv), 1_000 + 2_592_000_001).sort()).toEqual(['ABC234', 'DEF567']);
});
test('online entries never touch the saves', () => {
  const kv = memKv(); const rec = newRecord('s1', { seed: 1, factions: ['spartans', 'mongols'] }, ['Ann', 'Ben'], 5);
  writeSave(kv, rec, createMatch(rec.settings));
  for (let i = 0; i < 25; i++) rememberOnline(kv, entry(`ABCD${CODE_ALPHABET[i]}2`, { updatedAt: i }), null);
  expect(listSaves(kv).map(s => s.id)).toEqual(['s1']);
  expect(listOnline(kv).length).toBe(MAX_ONLINE);
  expect([...kv.map.keys()].filter(k => k.startsWith('warbanners.save')).sort()).toEqual(['warbanners.save.s1', 'warbanners.saves.v1']);
});
test('the cache gives the last known board, and garbage gives nothing', () => {
  const kv = memKv(); const settings = { seed: 42, factions: ['spartans', 'mongols'] as [FactionId, FactionId] };
  const state = must(applyAction(createMatch(settings), { type: 'endTurn' }));
  const rec = append(newRecord('online-ABC234', settings, ['Ann', 'Ben'], 1), { type: 'endTurn' }, state, 2);
  rememberOnline(kv, entry('ABC234'), rec);
  const back = readOnlineCache(kv, 'ABC234')!;
  expect(back.ok && hashState(back.state)).toBe(hashState(state));
  kv.setItem('warbanners.online.DEF567', '{');
  expect(readOnlineCache(kv, 'DEF567')).toBeNull();
  forgetOnline(kv, 'ABC234'); expect(readOnlineCache(kv, 'ABC234')).toBeNull(); expect(listOnline(kv)).toEqual([]);
});
test('a pending room is read once', () => {
  const kv = memKv(); setPendingRoom(kv, 'ABC234');
  expect(takePendingRoom(kv)).toBe('ABC234'); expect(takePendingRoom(kv)).toBeNull();
  kv.setItem('warbanners.online.pending', 'nonsense'); expect(takePendingRoom(kv)).toBeNull();
});
test('a corrupt list reads as empty', () => {
  const kv = memKv(); kv.setItem('warbanners.online.v1', '[{"code":7}]'); expect(listOnline(kv)).toEqual([]);
});
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `onlineList.ts`.**
- [ ] **Step 4: Run them and the saves and record tests; all pass.** Commit:

```bash
git add src/app/onlineList.ts src/app/onlineList.test.ts
git commit -m "Keep this phone's online matches apart from its saves"
```

**What changed from rev 2:** nothing but the Consumes list, which now names everything the tests import.

---

### Task 11: The app store goes online

**Files:**
- Modify: `src/app/store.ts`, `src/app/useApp.ts` (only if `browserDeps` grows a field it must pass)
- Create: `src/app/store.online.test.ts`

**Interfaces:**
- Consumes: `openSession`, `Session`, `SessionView` (Task 9); `listOnline`, `rememberOnline`, `readOnlineCache`, `forgetOnline`, `dueForSweep`, `setPendingRoom`, `takePendingRoom` (Task 10); `codeFromSearch`, `makeRoomCode`, `toRecordSeat` (Task 3); `type Net` (Task 5); `netReady` from `src/netReady.ts` (static import; it holds no URL); `Hit` from `src/ui/interaction.ts` as `{ unit: number | null; hex: HexKey | null }`. From the store as it is on `main` after plan 3 (quoted so the brief needs no guessing):

```ts
export interface Deps { kv: KeyValue; now(): number; newSeed(): number; newId(): string; updater?: Updater; ai: AiClient; sleep(ms: number): Promise<void> }
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result';
export type Notice = 'saveFailed' | 'saveRepaired' | 'saveDropped' | 'saveUnreadable' | 'saveOldVersion' | 'blockedUnseen' | 'aiPassed';
// AppState: screen, record, state, viewer, selection, last { seq; events; before }, digest, notice, saves, update, aiBusy,
//   openSetup, startMatch, resume, removeSave, ready, tap, run, arm, select, nextUnit, setUpdate, applyUpdate, goHome,
//   dismissNotice, dismissDigest, recover
// accept(action) refuses unless screen === 'match', viewer === state.current and !aiBusy; tap, nextUnit and arm have the same guard.
// openMatch() starts playAi() when the record has one person (soloSeat) and it is not their turn.
```

- Produces (additions only; every existing field and test stays):

```ts
// Deps gains, all optional so plan 2 and 3's test deps compile unchanged:
//   openNet?: () => Promise<Net>                 browserDeps: () => import('../net/firebaseNet').then(m => m.firebaseNet())
//   online?: () => boolean                       browserDeps: navigator.onLine (true in Node)
//   roomFromUrl?: () => string | null            browserDeps: codeFromSearch(location.search)
//   clearRoomFromUrl?: () => void                browserDeps: history.replaceState to the same path without ?room
//   inviteBase?: () => string                    browserDeps: location.origin + import.meta.env.BASE_URL
//   build?: string                               browserDeps: BUILD from src/version.ts
//   setTimer?: (fn: () => void, ms: number) => () => void
//   netReady?: () => boolean                     browserDeps: netReady from src/netReady.ts
export type Screen = 'home' | 'setup' | 'pass' | 'match' | 'result' | 'onlineSetup' | 'lobby' | 'join';
export type Notice = /* plan 2 and 3's seven */ | 'needsConnection' | 'notSetUp' | 'serverOutOfDate' | 'roomGone' | 'updateDuringOnline';
// AppState gains:
//   mode: 'local' | 'online';
//   online: SessionView | null;                  // the open session's view, null in local mode
//   onlineList: OnlineEntry[];
//   inviteLink: string | null;                   // for the lobby's share button
//   openOnline(): void;                          // screen 'onlineSetup'
//   openJoin(): void;                            // screen 'join' with a code field
//   createRoom(input: { name: string; faction: FactionId; clock: ClockSec }): Promise<void>;
//   openRoom(code: string): void;                // from a link, a typed code, or Continue on Home
//   joinAs(name: string): Promise<void>; takeSeat(seat: PlayerId): Promise<void>;
//   setLobby(patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): void;
//   startOnline(): void;
//   resignOnline(): void;                        // session.resign(), on either player's turn; the Menu's Resign in online mode
//   forgetRoom(code: string): void;              // Home's remove button: forget here; delete the room when created here and over
//   updateForRoom(): void;                       // the join screen's "Update" on a newer room: pending room, then Home
//   applyUpdate(confirmed?: boolean): void;      // as before, plus the online confirm
```

Rules:

- On creation the store reads `roomFromUrl()`, else `takePendingRoom(kv)`; a code opens that room (`openRoom`) and `clearRoomFromUrl()` runs, so a later reload does not reopen a room the player has left. Without one it starts on `home` as before. `onlineList` is read on creation and on every return to Home.
- **Local mode is unchanged.** Every path into a local match (`startMatch`, `resume`) sets `mode: 'local'`, `online: null`. `openMatch`'s `playAi` runs only in local mode; in online mode it never runs, even for a record with one person (an online AI seat belongs to the session's host logic). Pin this with a test.
- **Online mode:** `viewer` is always `online.mySeat` once the match has started; the `pass` screen is never used; `screen` is `match` for the whole match, mine or not, and `result` when it is over. The guards in `accept`, `tap`, `nextUnit` and `arm` gain one condition: in online mode the action path also needs `online.myTurn`. `tap` in online mode while it is not my turn still updates the selection (the player can look at their units and the tiles while waiting), with an empty offer list, so it never yields an action. `run` and `tap` hand actions to `session.act`; the returned `Step` sets `state`, `last` and `selection` exactly as `commit` does locally, but nothing is written to the saves. Resign does not go through `run` online (its guard needs `myTurn`): the Menu calls `resignOnline`, which calls `session.resign()` on either turn.
- `last` (the effects feed) is also set from `online.lastSteps` when `mine` is false, so effects play for actions that arrive from the other phone, filtered by the viewer's visible tiles as `watchMs` and the board already do. The digest is `digestFor(mySeat, steps)` over the opponent's steps since my last turn, shown when the turn comes back.
- Each session change refreshes this phone's `OnlineEntry` and its cached record (`rememberOnline`), so Home lists it and reopening shows the last known board at once while the session connects; the database wins as soon as it answers.
- `goHome` and `recover` in online mode close the session; the match stays in the database; the entry stays on Home. On reaching Home the store calls `remove` for each `dueForSweep` code, best effort, then forgets it.
- `createRoom` checks `netReady()` (`notSetUp`) and `online()` (`needsConnection`) before loading `src/net`, makes a code, calls `create`, retries with a new code up to 5 times on `'refused'`, and turns `'schema'` into `notice: 'serverOutOfDate'` and `'offline'` into `needsConnection`. Success opens the session: screen `lobby`, `inviteLink` set.
- `applyUpdate` still acts only on `home` with `update.updateReady` (`CLAUDE.md`: never mid-match). When an unfinished online entry exists and `confirmed` is not true, it sets `notice: 'updateDuringOnline'` instead; `applyUpdate(true)` applies.
- `updateForRoom` (the join screen on a `version` room that is newer by rules version or by schema) sets the pending room, closes the session and goes Home, where the update banner is; after the reload the store reopens the room. An older room (`remoteVersion < RULES_VERSION`) has no update path: the screen says so.

- [ ] **Step 1: Write the failing tests** in `src/app/store.online.test.ts`. A helper `online(over)` builds plan 3's `deps()` (the `thinker` AI client, a memory `kv`, `now`, `sleep: async () => {}`) plus `fakeServer(1_000_000)` (or `over.server`), `openNet: async () => server.as(uid)`, `online: () => true`, `netReady: () => true`, `setTimer` from `manualTimers(server).setTimerFor(uid)`, `build: 't'`, `inviteBase: () => 'https://sonofwatt.github.io/warbanners/'`, and returns the store with `server`, `kv`, `deps`, `cleared` (calls of `clearRoomFromUrl`) and `code`. `twoStores()` makes a host store as `u0` and a guest store as `u1` on the same server. `lobbyOnServer(code, { rulesVersion? })` creates a lobby as `u0` through the fake; `startedPair({ second? })` is `twoStores()` through create, join and start. `settle` and `until` come from `src/net/sessionKit.ts`. The file mocks the digest module to watch its calls:

```ts
vi.mock('./digest', async (orig) => { const m = await orig<typeof import('./digest')>(); return { ...m, digestFor: vi.fn(m.digestFor) }; });

test('a link with a room code opens that room, once', async () => {
  const { server } = await lobbyOnServer('ABC234');
  const g = online({ uid: 'u1', server, roomFromUrl: () => 'ABC234' }); await settle(server);
  expect(g.get().screen).toBe('join'); expect(g.cleared).toBe(1);
});
test('host: create, wait, start, and play with no curtain', async () => {
  const { host, guest, server } = await twoStores();
  await host.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(host.get().screen).toBe('lobby'); expect(host.get().inviteLink).toMatch(/\/warbanners\/\?room=[A-HJ-NP-Z2-9]{6}$/);
  guest.get().openRoom(host.get().online!.code); await settle(server); await guest.get().joinAs('Ben');
  host.get().startOnline(); await settle(server);
  expect(host.get()).toMatchObject({ screen: 'match', mode: 'online', viewer: 0 });
  host.get().run({ type: 'endTurn' }); await settle(server);
  expect(host.get().screen).toBe('match'); expect(host.get().viewer).toBe(0); expect(host.get().online!.myTurn).toBe(false);
  expect(guest.get()).toMatchObject({ screen: 'match', viewer: 1 }); expect(guest.get().online!.myTurn).toBe(true);
});
test('the waiting player can look but not act', async () => {
  const { guest } = await startedPair();
  const before = guest.get().state;
  const mine = guest.get().state!.units.find(u => u.owner === 1)!;
  guest.get().tap({ unit: mine.id, hex: mine.pos });
  expect(guest.get().selection).toMatchObject({ kind: 'unit', id: mine.id });
  guest.get().run({ type: 'endTurn' });
  expect(guest.get().state).toBe(before);
});
test('the waiting player can resign', async () => {
  const { host, guest, server } = await startedPair();
  expect(guest.get().online!.myTurn).toBe(false);
  guest.get().resignOnline(); await settle(server);
  expect(host.get().screen).toBe('result'); expect(guest.get().screen).toBe('result');
  expect(host.get().state!.winner).toBe(0);
});
test('the other phone\'s moves arrive with effects', async () => {
  const { host, guest, server } = await startedPair();
  const seq = guest.get().last?.seq ?? 0;
  const move = legalActions(host.get().state!).find(a => a.type === 'move')!;
  host.get().run(move); await settle(server);
  expect(guest.get().last!.seq).toBeGreaterThan(seq);
  expect(hashState(guest.get().state!)).toBe(hashState(host.get().state!));
});
test('the digest is built for my seat from the opponent\'s steps when the turn comes back', async () => {
  const { host, guest, server } = await startedPair();
  const move = legalActions(host.get().state!).find(a => a.type === 'move')!;
  vi.mocked(digestFor).mockClear();
  host.get().run(move); host.get().run({ type: 'endTurn' }); await settle(server);
  const [viewer, steps] = vi.mocked(digestFor).mock.lastCall!;
  expect(viewer).toBe(1); expect(steps).toHaveLength(2);
  expect(hashState(steps.at(-1)!.after)).toBe(hashState(guest.get().state!));
  expect(guest.get().digest).toEqual(digestFor(1, steps));
});
test('online play never starts the solo AI loop, and solo play never opens the network', async () => {
  const think = vi.fn(thinker().think); const opened = vi.fn();
  const local = online({ uid: 'u0', ai: { think, dispose: () => {} }, openNet: async () => { opened(); return null as never; } });
  local.get().startMatch({ names: ['Ann', 'Bot'], factions: ['spartans', 'mongols'], second: 'easy' });
  local.get().run({ type: 'endTurn' }); await until(() => local.get().aiBusy === false && local.get().state!.current === 0);
  expect(think).toHaveBeenCalled(); expect(opened).not.toHaveBeenCalled();
  const onlineThink = vi.fn(thinker().think);
  const { host } = await startedPair({ second: 'easy', ai: { think: onlineThink, dispose: () => {} } });
  const busy: boolean[] = []; host.subscribe(s => { busy.push(s.aiBusy); });
  host.get().run({ type: 'endTurn' });
  await until(() => host.get().state!.current === 0);
  expect(onlineThink).toHaveBeenCalled();                     // the AI seat was played
  expect(busy.includes(true)).toBe(false);                    // and not by playAi, which is the only code that sets aiBusy
});
test('rooms on stale rules say so', async () => {
  const s = online({ uid: 'u0' }); s.server.failCreatesWith('schema');
  await s.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(s.get().notice).toBe('serverOutOfDate'); expect(s.get().screen).toBe('onlineSetup');
});
test('no connection, or no config, says so before loading the network', async () => {
  const opened = vi.fn();
  const off = online({ uid: 'u0', online: () => false, openNet: async () => { opened(); return null as never; } });
  off.get().openOnline(); await off.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(off.get().notice).toBe('needsConnection');
  const bare = online({ uid: 'u0', netReady: () => false, openNet: async () => { opened(); return null as never; } });
  await bare.get().createRoom({ name: 'Ann', faction: 'spartans', clock: 120 });
  expect(bare.get().notice).toBe('notSetUp'); expect(opened).not.toHaveBeenCalled();
});
test('an update asks first while an online match is unfinished, and only from Home', async () => {
  const { host } = await startedPair(); const apply = vi.fn(async () => {});
  host.deps.updater = { apply, check: () => {}, homeReached: () => {} };
  host.get().setUpdate({ offlineReady: true, updateReady: true });
  host.get().applyUpdate(true); expect(apply).not.toHaveBeenCalled();          // mid-match: never
  host.get().goHome();
  host.get().applyUpdate(); expect(host.get().notice).toBe('updateDuringOnline'); expect(apply).not.toHaveBeenCalled();
  host.get().applyUpdate(true); expect(apply).toHaveBeenCalledTimes(1);
});
test('a newer room sends the player Home to update, and the room comes back after the reload', async () => {
  const { server } = await lobbyOnServer('ABC234', { rulesVersion: RULES_VERSION + 1 });
  const g = online({ uid: 'u1', server, roomFromUrl: () => 'ABC234' }); await settle(server);
  expect(g.get().online!.phase).toBe('version');
  g.get().updateForRoom(); expect(g.get().screen).toBe('home');
  const after = online({ uid: 'u1', server, kv: g.kv }); await settle(server);
  expect(after.get().online!.code).toBe('ABC234');
});
test('reopening the game lists the online match and resumes it; the saves are untouched', async () => {
  const { host, server } = await startedPair();
  host.get().run({ type: 'endTurn' }); await settle(server); host.get().goHome();
  const savesBefore = host.get().saves;
  const again = online({ uid: 'u0', server, kv: host.kv }); await settle(server);
  expect(again.get().onlineList.map(e => e.code)).toEqual([host.code]);
  expect(again.get().saves).toEqual(savesBefore);
  again.get().openRoom(host.code); await settle(server);
  expect(again.get().screen).toBe('match'); expect(hashState(again.get().state!)).toBe(hashState(host.get().state!));
});
```

`startedPair`'s `ai` option is the AI client of the host store (so the online AI seat is played through it). Run the whole of `src/app/store.test.ts` unchanged as part of this task: it must pass with no edits.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the store changes.** `browserDeps().openNet` is `() => import('../net/firebaseNet').then(m => m.firebaseNet())`; `browserDeps().netReady` is `netReady` from `../netReady`. The store imports `src/online` statically (pure code) and `src/net` only through `openNet` and `import type`.
- [ ] **Step 4: Run `npm test`, `npm run typecheck`, `npm run lint`**, then `npm run build` and check the bundle split: the main chunk contains no `firebaseio`; one lazily loaded chunk does (`grep -l firebaseio dist/assets/*.js` lists exactly one file, not `index-*.js`). Stage, then commit:

```bash
git add src/app/store.ts src/app/store.online.test.ts
git commit -m "Put online matches in the app store: no curtain, your own view, waiting states"
```

(Add `src/app/useApp.ts` to the `git add` only if it changed.)

**What changed from rev 2:** `resignOnline` gives the waiting player a path to resign, with a store test (I9); the look-while-waiting test uses the real `Hit` shape (I11); `netReady` comes from `src/netReady.ts`, so the database URL stays out of the main chunk (I2); helpers come from `src/net/sessionKit.ts` and `fakeNet.ts` is no longer modified here (`failCreatesWith` is in Task 5); the digest test checks the viewer and the steps `digestFor` was given, and the AI test checks the session's planner ran while `aiBusy` never turned true (M12).

---
### Task 12: Online screens

**Files:**
- Create: `src/ui/screens/OnlineSetup.tsx`, `src/ui/screens/Lobby.tsx`, `src/ui/screens/Join.tsx`, `src/ui/screens/online.test.tsx`
- Modify: `src/ui/text.ts`, `src/ui/screens/{Home,Match,Result,NoticeLine,Setup}.tsx`, `src/ui/panels/{Hud,Menu}.tsx`, `src/ui/App.tsx`, `src/ui/theme.css`

**Interfaces:**
- Consumes: the store from Task 11 through `useApp`; `CLOCK_CHOICES`, `DEFAULT_CLOCK`, `MAX_NAME` (`wire.ts`; `Setup.tsx`'s own `MAX_NAME = 16` now imports it); `formatClock`; `versionLine()` from `src/ui/Version.tsx` (on `main`); `fill` and `T` from `text.ts`.
- `HudProps` gains `status?: string` (shown in place of the units-to-act line: `yourTurn`, `theirTurn`, `clockPaused`), `clock?: string` (an `m:ss` pill beside the turn pill, `data-testid="clock"`). `MenuProps` gains `onlineNote?: string` (shown under "Back to home"); resign stays available on both turns online.
- `App.tsx`'s `Screens` gains the three screens. `Match.tsx` reads `mode` and `online`: `endDisabled` and `nextDisabled` also when `online !== null && !online.myTurn`; `thinking` is false online (the AI seat's turn shows `theirTurn` with the bot's name); `onResign` calls `resignOnline()` online and runs `{ type: 'resign' }` locally (unchanged).
- Strings added to `T.ui` (exact wording; placeholders in braces are filled with `fill`):

| Key | Text |
|---|---|
| `playOnline` | Play online |
| `joinWithCode` | Join with a code |
| `onlineMatches` | Online matches |
| `needsConnection` | Online play needs a connection. Solo and pass-the-phone games work without one. |
| `notSetUp` | Online play is not set up in this build. |
| `serverOutOfDate` | Online play needs a server update before new matches can start. Try again later. |
| `roomGone` | That match is no longer on the server. |
| `onlineTitle` | Play online |
| `yourName` | Your name |
| `yourFaction` | Your side |
| `clockLabel` | Turn clock |
| `clockOff` | Off |
| `clockMinutes` | {n} min |
| `createRoom` | Open a lobby |
| `roomCode` | Room code |
| `shareInvite` | Send the invite |
| `inviteText` | Join my Warbanners match |
| `copied` | Link copied |
| `waitingForGuest` | Waiting for the second player to join |
| `waitingForHost` | Waiting for {name} to start |
| `startOnline` | Start the match |
| `codeLabel` | Room code |
| `joinButton` | Join |
| `noSuchRoom` | There is no match with that code. Check it and try again. |
| `roomFull` | That match already has two players. |
| `areYou` | This match is being played by {a} and {b}. Are you one of them? |
| `imName` | I'm {name} |
| `newerVersion` | This match uses rules {theirs}, and this phone has rules {mine}. Update the game to join it. |
| `newerBuild` | This match was made by a newer version of the game. Update the game to join it. |
| `goUpdate` | Update the game |
| `olderVersion` | This match uses rules {theirs}, and this phone has rules {mine}. It cannot be continued on this version. |
| `theirTurn` | {name}'s turn |
| `yourTurn` | Your turn |
| `connecting` | Connecting |
| `reconnecting` | No connection. Your match is safe and will carry on when you are back online. |
| `dropped` | {name} has lost their connection. The clock is paused. |
| `droppedWaiting` | {name} has lost their connection. |
| `droppedNoClock` | {name} has lost their connection. The match will wait for them. |
| `clockPaused` | Paused |
| `timeUp` | Time ran out, so the turn ended. |
| `desync` | Your phones disagree about the match, so it is paused. Make sure both phones have the latest version, then reopen the match. |
| `updateDuringOnline` | Your match with {name} is still going. If this update changes the rules, that match cannot continue. Update now? |
| `onlineWith` | Online with {name} |
| `homeWaits` | The match will wait for you. |

Which drop line shows: `droppedNoClock` when the clock is off; `dropped` when the clock is on and the absent player holds the current seat (only then is the clock paused); `droppedWaiting` when the clock is on and the absent player is waiting for their turn.

What each screen holds:

- **Home:** "Play online" and "Join with a code" under "New match". With no connection both are disabled and `needsConnection` shows beneath them; with no Firebase config, `notSetUp`. Online matches are listed under `onlineMatches` (apart from the saves, same row style), each marked `onlineWith`, with "Continue" (or "See result") and a remove button that forgets it here (and deletes the room when created here and over). The version line stays.
- **OnlineSetup:** your name (default "Player 1", at most 16 characters), your side (the two factions, Spartans chosen), the turn clock as a row of choices (Off, 1 min, 2 min, 3 min, 5 min; 2 min chosen, `aria-pressed`), "Open a lobby".
- **Lobby:** the room code in large letters, "Send the invite" (the share sheet with `inviteText` and the link; without `navigator.share`, copy the link and show `copied`), the two seats with names and sides, the clock. The host can still change side and clock; "Start the match" appears when both seats are filled. The guest sees the same, read-only, with `waitingForHost`.
- **Join:** a code field when opened from "Join with a code"; a name field and "Join" for a lobby; `areYou` with one `imName` button per absent seat for a match in progress; `noSuchRoom`, `roomFull`, `newerVersion` or `newerBuild` (each with "Update the game", which runs `updateForRoom`) or `olderVersion`, as the session reports. Every rules version message names both rules numbers, the same number the version line shows, so the owner can tell which phone is behind.
- **Match (online):** no curtain. The Hud shows `yourTurn` or `theirTurn`, and the clock as `m:ss` (or `clockPaused`). A thin banner shows `reconnecting` (also while `returning`), one of the drop lines, or `timeUp` (for 4 seconds after the clock ended your turn). End turn, Next unit and every command are disabled when `myTurn` is false. `desync` shows as a sheet that blocks the board, with Home.
- **Menu (online):** Resign on either player's turn (through `resignOnline`); Home with `homeWaits`; the version line as now.
- **Result:** unchanged, plus the online entry is marked over, and `data-testid="result"` on its root if it is missing.

- [ ] **Step 1: Write the failing tests** (`online.test.tsx`, static markup as plan 2's `screens.test.tsx` does, each screen given a store from Task 11's helpers through `StoreContext`):

```tsx
test('home offers online play, or says why not', () => {
  expect(render(homeWith({ online: () => true }))).toContain(T.ui.playOnline);
  const off = render(homeWith({ online: () => false }));
  expect(off).toMatch(/data-testid="play-online"[^>]*disabled/); expect(off).toContain(T.ui.needsConnection);
  expect(render(homeWith({ netReady: () => false }))).toContain(T.ui.notSetUp);
});
test('home lists online matches apart from the saves', () => {
  const html = render(homeWith({ onlineEntries: [entry('ABC234')], saves: 1 }));
  expect(html).toContain(T.ui.onlineMatches); expect(html).toContain(fill(T.ui.onlineWith, { name: 'Ben' }));
  expect(html.match(/data-testid="save"/g)).toHaveLength(1); expect(html.match(/data-testid="online-row"/g)).toHaveLength(1);
});
test('setup offers the five clock choices with 2 min chosen', () => {
  const html = render(screen('onlineSetup'));
  expect(html.match(/data-testid="clock-choice"/g)).toHaveLength(5);
  expect(html).toMatch(/aria-pressed="true"[^>]*>2 min</);
});
test('the lobby shows the code and waits', () => {
  const lone = render(lobby({ guest: false }));
  expect(lone).toContain('ABC234'); expect(lone).toContain(T.ui.shareInvite); expect(lone).toContain(T.ui.waitingForGuest);
  expect(lone).not.toContain('data-testid="start-online"');
  expect(render(lobby({ guest: true }))).toContain('data-testid="start-online"');
  expect(render(lobby({ guest: true, asGuest: true }))).toContain(fill(T.ui.waitingForHost, { name: 'Ann' }));
});
test('the join screen offers only absent seats', () => {
  const html = render(joinInProgress({ absent: [1] }));
  expect(html).toContain(fill(T.ui.imName, { name: 'Ben' })); expect(html).not.toContain(fill(T.ui.imName, { name: 'Ann' }));
});
test('the match while waiting: their turn, a clock, and nothing to press', () => {
  const html = render(guestMatch());
  expect(html).toContain(fill(T.ui.theirTurn, { name: 'Ann' })); expect(html).toContain('2:00');
  expect(html).toMatch(/data-testid="end-turn"[^>]*disabled/); expect(html).toMatch(/data-testid="next-unit"[^>]*disabled/);
  expect(html).not.toContain('data-testid="pass"');
});
test('the drop line says the clock is paused only when the absent player is the one on the clock', () => {
  expect(render(guestMatch({ absent: [0], current: 0 }))).toContain(fill(T.ui.dropped, { name: 'Ann' }));
  const waiting = render(hostMatch({ absent: [1], current: 0 }));
  expect(waiting).toContain(fill(T.ui.droppedWaiting, { name: 'Ben' })); expect(waiting).not.toContain('The clock is paused');
  expect(render(guestMatch({ absent: [0], current: 0, clock: 0 }))).toContain(fill(T.ui.droppedNoClock, { name: 'Ann' }));
});
test('version and connection messages name both versions', () => {
  const newer = render(versionRoom({ rules: RULES_VERSION + 1 }));
  expect(newer).toContain(fill(T.ui.newerVersion, { theirs: RULES_VERSION + 1, mine: RULES_VERSION })); expect(newer).toContain(T.ui.goUpdate);
  expect(render(versionRoom({ rules: RULES_VERSION - 1 }))).not.toContain(T.ui.goUpdate);
  const schema = render(versionRoom({ rules: RULES_VERSION, schema: 2 }));
  expect(schema).toContain(T.ui.newerBuild); expect(schema).toContain(T.ui.goUpdate);
  expect(render(guestMatch({ connected: false }))).toContain(T.ui.reconnecting);
  expect(render(guestMatch({ returning: true }))).toContain(T.ui.reconnecting);
});
test('the menu offers resign on the other player\'s turn and says the match waits', () => {
  const html = render(guestMatch({ menuOpen: true }));
  expect(html).toContain('data-testid="resign"'); expect(html).toContain(T.ui.homeWaits);
});
```

The helpers (`render`, `homeWith`, `screen`, `lobby`, `joinInProgress`, `guestMatch`, `hostMatch`, `versionRoom`) build a store in a given state (an `online` view set directly on the store) and render with `renderToStaticMarkup`; write them in the test file. The store-level resign on the other player's turn is proved in Task 11 (`the waiting player can resign`); this file proves only that the button is there.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the screens and the changes.** Every new button is at least 44 by 44 CSS pixels; layouts hold from 360 by 640 portrait to 915 by 412 landscape (plan 2's rules), and the Hud's two-row limit holds with the clock pill at 360 wide (plan 3's Next unit already made that row tight: shorten the status to the icon plus `m:ss` there if needed). The room code is shown in a font where the code alphabet cannot be misread (no O, 0, I, 1 by construction). Add the test ids Task 13 uses (`play-online`, `online-name`, `create-room`, `room-code`, `join-name`, `join`, `start-online`, `hud-status`, `take-seat-<n>`, `result`).
- [ ] **Step 4: Run `npm test`; all pass.** Then `npm run emu` in one terminal tab and `npm run dev` in another (the dev server talks to the emulator), open two phone-sized windows, and play two turns by hand. Stop both afterwards.
- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/OnlineSetup.tsx src/ui/screens/Lobby.tsx src/ui/screens/Join.tsx src/ui/screens/online.test.tsx src/ui/screens/Home.tsx src/ui/screens/Match.tsx src/ui/screens/Result.tsx src/ui/screens/NoticeLine.tsx src/ui/screens/Setup.tsx src/ui/panels/Hud.tsx src/ui/panels/Menu.tsx src/ui/App.tsx src/ui/text.ts src/ui/theme.css
git commit -m "Add the online screens: setup, lobby, join and the waiting states"
```

**What changed from rev 2:** the Menu's Resign calls `resignOnline` in online mode (I9); the drop line says "The clock is paused" only when the absent player holds the current seat, with `droppedWaiting` otherwise, and a test (M6); `newerBuild` for a room from a newer wire schema (M8); `returning` shows the reconnecting banner; files are staged by name; `Setup.tsx` is listed (it imports `MAX_NAME`).

---

### Task 13: Two phones in two browsers, against the emulator

**Files:**
- Create: `src/browser/online.test.ts`
- Modify: `src/browser/harness.ts`, `src/browser/offline.test.ts`, `src/browser/coverage.test.ts`, `package.json`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `openApp(query, { outDir, width, height, beforeOpen })` from `src/browser/harness.ts`. Each call launches its own Chromium, so two calls are two phones with separate storage and separate anonymous identities.
- Produces:
  - Two optional `openApp` options, a small harness change: `storageState?: Awaited<ReturnType<BrowserContext['storageState']>>`, passed to `browser.newContext`, and `port?: number`, used in place of `freePort()` (the preview server already sets `strictPort: true`). Storage is kept per origin, so a browser that comes back with its saved storage must come back on the same port. No existing caller passes either, so plan 2's and plan 3's browser tests are unchanged.
  - Script `"test:online": "vite build --mode emu --outDir dist-emu && firebase emulators:exec --only database,auth --project demo-banners \"cross-env BROWSER=1 EMULATOR=1 vitest run src/browser/online.test.ts\""`. The production `dist` is never built in emulator mode, and `dist-emu` is never uploaded (the Pages artifact path stays `dist`).

`test:browser` keeps running every file in `src/browser`, including `online.test.ts`, which then skips its inner block because `EMULATOR` is unset. Gate: the file's outer block is exactly `describe.runIf(process.env.BROWSER === '1')` (the coverage regex), with `describe.runIf(process.env.EMULATOR === '1')` inside it.

- [ ] **Step 1: Write the failing tests.** Re-check the seed 7 facts at the top of `src/browser/flow.test.ts` on the merged engine first (plan 3's tuning may have moved them) and use the same facts here: the host opens `?seed=7`, so the room's seed is 7. `tapTile` comes from `offline.test.ts` (move it into `harness.ts` and import it in both).

```ts
type Phone = Awaited<ReturnType<typeof openApp>>;
async function hostLobby(page: Page, name: string): Promise<string> {
  await page.getByTestId('play-online').tap();
  await page.getByTestId('online-name').fill(name);
  await page.getByTestId('create-room').tap();
  const code = (await page.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  return code;
}
async function joinAs(page: Page, name: string): Promise<void> {
  await page.getByTestId('join-name').fill(name); await page.getByTestId('join').tap();
}
async function startedMatch(): Promise<{ A: Phone; B: Phone; code: string }> {
  const A = await openApp('?seed=7', { outDir: 'dist-emu' });
  try {
    const code = await hostLobby(A.page, 'Ann');
    const B = await openApp(`?room=${code}`, { outDir: 'dist-emu' });
    try {
      await joinAs(B.page, 'Ben');
      for (const p of [A.page, B.page]) { await expect.poll(() => p.locator('body').textContent()).toContain('Ben'); }
      await A.page.getByTestId('start-online').tap();
      await A.page.getByTestId('match').waitFor(); await B.page.getByTestId('match').waitFor();
      return { A, B, code };
    } catch (e) { await B.close(); throw e; }
  } catch (e) { await A.close(); throw e; }
}
async function annPlaysFirstTurn(A: Phone, B: Phone): Promise<void> {
  // the seed 7 first move (from flow.test.ts), then End turn
  await tapTile(A.page, '-2,5'); await tapTile(A.page, '-1,4'); await A.page.getByTestId('end-turn').tap();
  await expect.poll(() => B.page.getByTestId('hud-status').textContent(), { timeout: 5_000 }).toContain(T.ui.yourTurn);
}

const outer = describe.runIf(process.env.BROWSER === '1');
outer('online play in two browsers', () => {
  const emu = describe.runIf(process.env.EMULATOR === '1');
  emu('against the emulator', () => {
    test('two phones: lobby, invite, join, play, reload, a new browser takes the seat back, resign', async () => {
      const { A, B, code } = await startedMatch(); let A2: Phone | null = null;
      try {
        expect(await A.page.getByTestId('hud-status').textContent()).toContain(T.ui.yourTurn);
        expect(await B.page.getByTestId('hud-status').textContent()).toContain(fill(T.ui.theirTurn, { name: 'Ann' }));
        expect(await B.page.getByTestId('end-turn').isDisabled()).toBe(true);
        expect(await A.page.getByTestId('pass').count()).toBe(0);
        await annPlaysFirstTurn(A, B);
        const gold = await B.page.getByTestId('gold').textContent();
        await B.page.reload(); await B.page.getByTestId('match').waitFor();
        expect(await B.page.getByTestId('gold').textContent()).toBe(gold);
        await A.close();                                                            // A's browser is gone: onDisconnect fires
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 90_000 }).toContain(fill(T.ui.droppedWaiting, { name: 'Ann' }));
        // a fresh browser with no storage is a new identity (the iPhone home-screen case): it takes Ann's seat back
        A2 = await openApp(`?room=${code}`, { outDir: 'dist-emu' });
        await A2.page.getByTestId('take-seat-0').tap(); await A2.page.getByTestId('match').waitFor();
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 10_000 }).not.toContain('lost their connection');
        await B.page.getByTestId('open-menu').tap(); await B.page.getByTestId('resign').tap(); await B.page.getByTestId('resign-yes').tap();
        for (const p of [A2.page, B.page]) await p.getByTestId('result').waitFor();
      } finally { await A2?.close(); await A.close(); await B.close(); }
    }, 180_000);
    test('the same browser, closed and opened again from the link, comes straight back to the match', async () => {
      const { A, B, code } = await startedMatch(); let A2: Phone | null = null;
      try {
        await annPlaysFirstTurn(A, B);
        const port = Number(new URL(A.origin).port);
        const saved = await A.context.storageState({ indexedDB: true });           // the Firebase identity lives in IndexedDB
        await A.close();
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 90_000 }).toContain(fill(T.ui.droppedWaiting, { name: 'Ann' }));
        A2 = await openApp(`?room=${code}`, { outDir: 'dist-emu', storageState: saved, port });
        await A2.page.getByTestId('match').waitFor();
        expect(await A2.page.getByTestId('take-seat-0').count()).toBe(0);
        expect(await A2.page.getByTestId('join-name').count()).toBe(0);
        expect(await A2.page.getByTestId('hud-status').textContent()).toContain(fill(T.ui.theirTurn, { name: 'Ben' }));
        await expect.poll(() => B.page.locator('body').textContent(), { timeout: 10_000 }).not.toContain('lost their connection');
        await B.page.getByTestId('end-turn').tap();
        await expect.poll(() => A2!.page.getByTestId('hud-status').textContent(), { timeout: 5_000 }).toContain(T.ui.yourTurn);
      } finally { await A2?.close(); await A.close(); await B.close(); }
    }, 180_000);
  });
});
```

`A.close()` and `B.close()` are safe to call twice (the harness's `close` is idempotent).

Add to `offline.test.ts`: in the solo flow, the existing `beforeOpen` already records every request URL; after the flow, assert that no URL contains `firebaseio.com`, `identitytoolkit` or `securetoken`. Do not assert anything about which script chunks were fetched: that test allows service workers, and Workbox precaches every chunk, the lazy Firebase chunk included, by design. Add to `coverage.test.ts`: the workflow runs exactly `npm run test:online`.

- [ ] **Step 2: Run them and see them fail.** `npm run test:online`.
- [ ] **Step 3: Make them pass.** Fix in the app, not in the test, anything they find.
- [ ] **Step 4: CI.** Add `- run: npm run test:online` after `npm run test:browser` (Java and Chromium are both installed by then).
- [ ] **Step 5: Run `npm test`, `npm run test:emu`, `npm run test:browser`, `npm run test:online`, one after another; all pass.** Also run `npm run test:browser` with `GITHUB_PAGES_BASE=/warbanners/` (`CLAUDE.md`). Commit:

```bash
git add src/browser/online.test.ts src/browser/harness.ts src/browser/offline.test.ts src/browser/coverage.test.ts package.json .github/workflows/deploy.yml
git commit -m "Test a whole online match in two browser phones against the emulator"
```

**What changed from rev 2:** the second test is written out and closes the browser for real, then relaunches it with its saved storage (IndexedDB included) on the same port, and expects the match with no join screen (I10); the harness gains `storageState` and `port`, named as a small change (I10); the offline test checks only that no request goes to a Firebase host, since the precached Firebase chunk is fetched by the service worker by design (I3); the drop line in the browser tests is `droppedWaiting`, since Ann is not on the clock when she leaves (M6).

---

### Task 14: Docs, deploy and the two-phone check

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `src/version.ts` (`APP_VERSION`: the next minor after plan 3's)
- Create: `docs/online.md`

- [ ] **Step 1: Write the docs.** `docs/online.md`: the database layout from this plan; who may write what, including that every `head` field is pinned unless `head/n` moves and how the return credit is bounded; why everything is a JSON string; why `actions` and `seats` may come back as arrays; that local `onValue` events fire before the server answers and again on a rollback; that the SDK holds writes while offline and lands them on reconnect, and that `.info/connected` turns true before fresh data arrives (so a return reads `head` and presence with `get()` before deciding anything); that rules changes must be deployed by hand and how the `SCHEMA` tripwire shows a missed deploy; the emulator namespace, ports and the canaries; the iPhone storage split and seat takeover; never subscribe to a whole room; never compare phone clocks; how an AI seat's salt and dial live in the seat; the trust model's accepted gaps: fog is honour-based, any member may set `phase` to `over` and end a match with no winner, a lobby whose creator never returns stays until the 30-day sweep or a manual delete, and each fresh browser adds one anonymous user (all harmless at family scale); the one-time Firebase setup (F1 to F6) and how each step was checked. `CLAUDE.md` gains: run `npm run test:emu` before pushing anything touching `src/net`, `src/online` or the rules; after editing `database.rules.json` the controller deploys it; never deploy a `RULES_VERSION` bump while an online match is being played; never run `firebase init` in the repo. `README.md`: how to play online, and how to run the emulator suites.
- [ ] **Step 2: Run every suite**, one at a time: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser`, `npm run test:online`. All pass.
- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md src/version.ts docs/online.md
git commit -m "Document online play and its traps"
```

**Controller, after the final review and the owner's yes to merge and deploy (not a subagent's job):**

1. Firebase setup F1 to F6 are done: the API key in `src/netReady.ts` and the rest of the web config in `src/net/firebaseConfig.ts` committed, the database instance listed, the anonymous sign-up `curl` answering with an `idToken`.
2. `npx firebase deploy --only database --project banners-game`, then the `curl` check in F5. Deploy the rules before the site, so the new build never meets old rules.
3. Merge into `main`, push, and watch the workflow to green (it now runs `test:emu` and `test:online`).
4. On the live site in two phone-sized browsers (two `openApp`-style Chromium instances, or two browser profiles): create a room, join it, play two turns, reload both, finish with a resignation. Read the room back with an authenticated REST call or the console: the actions are strings and `head/n` matches. Then delete the test room as its creator.
5. On the Pixel 10 Pro over ADB (always `-s <serial>`; the tablet is attached too), once the owner has turned on wireless debugging: open the invite link in Chrome, join a room created on the desktop, play a turn each way, then toggle airplane mode for 30 seconds mid-turn and back: the banner shows, the clock pauses on the other side, the phone keeps its turn with the time credited, and the match carries on. Take screenshots of the lobby, a waiting state and the dropped banner and show each one directly in the reply to the owner.
6. Ask the owner to play one full match with someone on an iPhone and an Android phone, invite sent from one to the other, with the 2 minute clock, and to close the game once mid-match and reopen the link.
7. Write `docs/superpowers/plans/2026-11-18-plan-4-followups.md`: the outcome, the rulings made, and what carries into stage 3 (remote play: the clock-off match already waits for days; it needs the "text them" button and notifications).

**What changed from rev 2:** the docs name the SDK's offline behaviour, the reconnect ordering, the head pins and credit bound, and the trust model's accepted gaps (M10, M13); the API key lives in `src/netReady.ts`; the Pixel check also confirms the turn survives the airplane-mode drop.

---

## Plan 4 is done when

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser` and `npm run test:online` pass, locally and in the workflow.
- The live rules refuse an unauthenticated read and match `database.rules.json`; anonymous sign-up works against the live project.
- One phone opens a lobby and sends a link; a second phone opens it and joins; the two play a full live match to elimination or resignation with a working turn clock (spec 9).
- Closing the browser mid-match and reopening the link resumes the match on both phones; a dropped connection pauses the clock, a return keeps the turn with the time credited, and nothing is lost.
- Solo and pass-the-phone play still work in airplane mode, resume their saves, and never contact Firebase; no save made before this plan shows "From an older version".

## Decisions this plan makes

Each is the planner's call unless marked. Each ends with what it costs if wrong.

- **Resign-by-seat ships without a `RULES_VERSION` bump.** The new `player` field is additive: a plain `{ type: 'resign' }` plays exactly as before (pinned in Task 1), a version 2 record never contains `player`, and only phones with plan 4's code can open an online record. The fingerprint is pinned to version 2 after plan 3's last tuning commit. Cost if wrong: if some version 2 record could hold a seat resign and be replayed by a pre-plan-4 build, that build would eliminate the current player instead of the named one; no such path exists today.
- **One room is one match; the database record is the authority.** The phone keeps a cached copy for an instant start; whenever the two differ the database wins. Cost if wrong: a tap made in the instant before a crash, which never reached the database, has to be made again.
- **Layout: `rooms/$code` holds `meta`, `seats`, `members`, `presence`, `match`, `head`, `actions`, `checks`, `snap`, `desync`**, actions as JSON strings at `"0"`, `"1"`, ..., each append one multi-path update of `actions/<n>` and `head`, the rules tying the key to the counter with `$n === '' + ...head/n.val()` (checked on emulator v4.11.2 by the draft's author). Cost if wrong: if production evaluates that expression differently from the emulator, appends fail; the live check in Task 14 shows it on the first move.
- **Every `head` field is pinned by the rules unless `head/n` moves; there are no cascading `.write` grants.** `seat` and `turnAt` move only with a turn-passing append, `paused` only to 0 with a turn pass or by the return credit. Cost if wrong: a rules file a few dozen lines longer; a missed field would let the current player stretch the clock, and the negative tests in Task 4 are there to catch it.
- **A returning player's presence and drop credit are one atomic write, checked by the server** (new in rev 3, for the Critical finding). On every return (reconnect, reload, reopen) the session reads `head` and its own presence fresh with `get()`, computes the credit (the time away this turn, less a 2 s margin, capped at 3 minutes), and writes `presence/<uid>` and `head/paused` in one `update()`. The rules accept the credit only from the current seat's owner, only while their stored presence is off and the same update turns it on, only without moving `turnAt`, and only up to `now - presence.at` and `now - turnAt` by the server's own clock. Until that write lands the session takes no clock decision. Why this is correct under concurrent writes from two phones: the waiting phone's backup timeout and the return are both multi-path updates that the server applies one after the other. If the return lands first, the timeout is judged against the credited `paused` and refused unless the credited time has also run out. If the timeout lands first, `head/seat` and `turnAt` have moved, so the return's credit fails the "current seat" and "turnAt unchanged" clauses, the session reads again, and its next attempt writes presence alone (a lost turn the clock had genuinely earned). No phone ever sees presence on without the credit, because they arrive in one update. Why the margin: the phone estimates the time away with `.info/serverTimeOffset`; claiming 2 s less keeps it under the server's bound unless the offset is off by more than 2 s, and then the write is refused and retried, finally with presence alone. Cost if wrong: a returning player can lose up to 2 s of the pause per drop, or, with a badly skewed offset, the whole credit for that drop; the match itself is never stuck.
- **The clock's boundary: the rules accept at `now >= deadline`; the current phone writes 500 ms after, the waiting phone 3 s after; a refused timeout is tried once more 1 s later if `head.n` has not moved.** Cost if wrong: a turn ends up to half a second late on the current phone, or 4 s late when the first attempt is refused.
- **Offline writes are pending, as the SDK makes them.** `append` has no time limit and is never `'offline'`; every other `Net` call answers `'offline'` after 10 s. A held append that lands after its index was taken is refused and rolled back, and the phone rebuilds. Closing a session does not cancel what the SDK holds. Cost if wrong: if the SDK changed to rejecting offline writes, `sending` would clear sooner and the queue would rebuild from the watcher; nothing would be lost, but the contract test would fail and say so.
- **A `desync` entry blocks play only while its uid is a member; a takeover deletes the old uid's entry and anyone may clear a non-member's.** Cost if wrong: a desynced player who leaves and is replaced no longer holds the match, which is the point; a lingering entry from a member still pauses both phones until they agree.
- **The rules check the rules version too.** Every human seat records its phone's `RULES_VERSION`, and the rules refuse a seat whose version differs from the room's, on create, join and takeover. A room whose wire `schema` is newer than the phone's is treated like a newer rules version. Cost if wrong: none worth naming; a phone that skips the client check is still refused.
- **Fog is honesty-based online (spec 8.5).** Every member can read the whole room, including the snapshot under the other player's fog; the app only ever draws `playerView(state, mySeat)`, filters effects and the digest by the viewer's visible tiles, and offers no page that shows hidden state. This supersedes the plan 2 follow-up line "online play must not send hidden state to a client", which would need a server we do not have. Any member may also set `phase` to `over`. Cost if wrong: a player who opens the developer tools can see through the fog or end a match with no winner.
- **The host is seat 0 and moves first.** The host picks their own side; the guest gets the other. Cost if wrong: a "who goes first" switch in the lobby, an hour's work.
- **Turn clock choices: Off, 1, 2, 3 and 5 minutes; default 2.** Cost if wrong: one list and one rules literal.
- **When the clock runs out, the current player's own phone appends `endTurn`; the waiting phone does it as a backup 3 seconds after the deadline**, allowed by the rules only when the server's `now` has reached `turnAt + clock + paused`. Deadlines come from server timestamps and `.info/serverTimeOffset`. If both write, exactly one lands. Cost if wrong: a turn could end a second or two late on a sleeping phone.
- **A drop pauses the clock for up to 3 minutes per turn** (spec 6.1 leaves the length to the builder). After that it runs again from where it stopped. With the clock off the match waits for days. Nothing ever forfeits a match automatically. Cost if wrong: one number.
- **An absent player's seat can be taken over by anyone holding the room code**, which is how the iPhone home-screen app and Safari (separate storage, separate identity), Safari's seven-day purge and cleared site data still get back in. Cost if wrong: an invited friend could take an absent player's seat.
- **A snapshot is written with every `endTurn` and at the end, and a hash checkpoint `checks/<n>` for every turn.** A rejoining phone loads the snapshot, checks it, and replays only the rest. Cost if wrong: about 5 MB of uploads per long match, well inside the free plan.
- **A hash mismatch first rebuilds from the full list; if it still disagrees, the match pauses for both players** with a plain message, and resumes once the phones agree. Cost if wrong: a real non-determinism bug halts a match instead of limping on.
- **Online AI seats reuse plan 3's driver and worker, with the seat's `salt` and adaptive dial stored in the database seat; the dial moves once per AI turn, sent with its first action.** A stand-in host plays on with the same seeds and dial. AI seats can be set only in the lobby. Cost if wrong: a stand-in that picks up mid-turn plays the rest of that turn from a fresh plan, which is what plan 3's solo loop also does after a reload.
- **"Play the AI online" is built and tested but not offered in the stage 1 lobby.** With two seats it is solo play with a connection; the code path matters for stage 4. Cost if wrong: one lobby switch, a few hours with its browser test.
- **The host role keeps Deutsch Dash's two mechanisms:** the creator reclaims it at once when present; otherwise the longest-present human member stands in after 30 seconds. Cost if wrong: an AI turn or a lobby action waits 30 seconds after the host leaves.
- **Rooms are swept, not deleted on finish.** The creator may delete their room at any time; anyone may delete a room idle for 30 days; the creator's Home sweeps its own finished rooms after a day. Abandoned lobbies and anonymous users pile up slowly and are accepted (documented). Cost if wrong: finished rooms (about 70 KB each) stay a little longer.
- **Room codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; the invite link is `https://sonofwatt.github.io/warbanners/?room=ABC234`**, a query (not a path) so Pages and the service worker's `index.html` fallback both serve it; the store clears it from the address bar once read. Cost if wrong: none worth naming.
- **Firebase is loaded only when the player opens online play, a link, or an online match** (a dynamic `import()`). The chunk is precached by the service worker with the rest, so it opens offline and says it needs a connection; the offline browser test therefore checks requests to Firebase hosts, not which chunks were fetched. The "is it set up?" flag and the public API key live in `src/netReady.ts`, which has no URL and no imports, so the main chunk never names the database. Cost if wrong: a few hundred milliseconds when online play first opens.
- **The session test helpers live in `src/net/sessionKit.ts`, not in `src/online`**, and test files are exempt from the `src/net` import guard by name. `src/online`'s shipped code stays pure. Cost if wrong: none; it is where a file lives.
- **A `SCHEMA` number is written into every room and mirrored as a literal in the rules.** Stale deployed rules fail a create at once with "Online play needs a server update". Cost if wrong: none; it is a tripwire.
- **Database region `us-central1`.** It is the default and cannot be changed later. Cost if wrong: about 50 ms more per write from far away; moving means a new project.
- **Updates stay Home-only (`CLAUDE.md`).** A newer room sends the player Home with the room remembered and reopened after the reload; with an unfinished online match the update asks first. Cost if wrong: one extra tap for a player invited to a newer match.
- **Online matches live under their own keys (`warbanners.online.*`), at most 20, apart from the 20 saves.** Cost if wrong: an old online entry is dropped from Home's list (the match itself stays on the server for its other player).
- **The emulator project is `demo-banners` on ports 9010, 9110, hub 4410 and logging 4510**, so it never collides with Deutsch Dash's emulator. The app's URL uses `?ns=demo-banners-default-rtdb`, the only namespace the emulator loads the rules into; the rules tests use `demo-banners-rules`. A Node process without `EMULATOR=1` cannot reach Firebase at all. Cost if wrong: none.
- **Anonymous sign-in is enabled with `firebase deploy --only auth`, the console only as a fallback.** Cost if wrong: one console visit with the owner's sign-in.

## Needs the owner

- A yes to Firebase setup F1 to F4 on `banners-game`: register the Warbanners web app, create the database in `us-central1` (permanent), enable anonymous sign-in, deploy the rules. Everything in them is done by an agent with the CLI.
- Only if the CLI is refused at F2 or F3: the Firebase console step, which needs his Google sign-in (he does it, or says yes to Claude in Chrome doing it in his signed-in browser).
- Optional: rename the project's display name from "Banners" to "Warbanners" in the Firebase console's project settings (no CLI command; the project id stays `banners-game`, players never see either).
- Optional hardening: restrict the browser API key to `sonofwatt.github.io` and `127.0.0.1` in the Google Cloud console (no `gcloud` on ClaudeComputer). The rules are the real protection; this only stops other sites using the key.
- Whether "play the AI online" should be offered in the stage 1 lobby (built either way).
- Whether 2 s is an acceptable loss of pause per drop (the return credit's margin; see decisions). Only matters if he notices it; no work waits on it.
- Wireless debugging on the Pixel 10 Pro for the ADB check in Task 14, step 5.
- One real match on an iPhone and an Android phone (Task 14, step 6).
- A yes to merge and push, since every push to `main` deploys.

## Changes from rev 2

- **C1** (fixed): a return reads `head` and presence fresh, then writes presence and the credit in one `presentPatch` update; the rules bound the credit by the server's own view of the time away; the session takes no clock decision while `returning`; Task 4 rules tests, Task 7 pure test, Task 9 fake test (drop at 30 s, back at 150 s) and an emulator body prove neither phone ends the turn and both clocks show the credited time.
- **I1** (fixed): rule `now >=`; the current phone writes at deadline + 500 ms, the backup at + 3 s; a refused timeout is retried once after 1 s if `head.n` has not moved (Task 7, Task 9 test "a refused timeout is tried once more"); `rulesMirror` checks the `>=`.
- **I2** (fixed): the guard exempts `*.test.ts(x)` by name; the session helpers moved to `src/net/sessionKit.ts`, so no shipped `src/online` file imports `src/net`; the configured flag moved to `src/netReady.ts` (no URL, no imports, guarded by a test), so the main chunk stays free of `firebaseio`.
- **I3** (fixed): the offline browser test asserts only that no request reaches a Firebase host; the chunk assertion is gone and the decision says why.
- **I4** (fixed): the contract states pending-until-reconnect for `append` and a 10 s `'offline'` limit for every other call; the fake holds a dropped phone's writes and lands them on `back`; contract tests prove the pending write and its late refusal and rollback on both sides; `close` with SDK-held writes is specified; a session test lands a held move after the backup timeout and sees it refused.
- **I5** (fixed): the race test freezes Ann's timers and holds her watcher, lets Ben's backup land, then has Ann's `act` accepted locally and rebuilt away; `drop` delivers `connected(false)` first and the reload test settles before acting; the AI handover test parks Ann's AI turn on a thinker that never answers, settles before `close`, and checks that u9 made every AI write and stepped the dial once.
- **I6** (fixed): `sessionKit.ts` has `fakeKit` and `firebaseKit(k)` (fresh identities and a fresh code per test, real timers, drops through `setOnline`, rules-free `rewind`) and five shared bodies, one of them a timeout through the real server and one the C1 return.
- **I7** (fixed): rules pin every `head` field unless `head/n` moves, the credit cannot move `turnAt`, AI seats are host-only and lobby-only, `members/<x>` only for one's own uid; negative tests for each; no cascading grants, stated in Global Constraints.
- **I8** (fixed): `liveDesync` counts only members' entries; `takeoverPatch` deletes the old uid's entry; the rules let any member clear a non-member's entry; rules, contract and session tests.
- **I9** (fixed): store action `resignOnline()` calls `session.resign()` on either turn, the Menu uses it online, and a store test has the waiting player resign.
- **I10** (fixed): the second browser test is written out: it saves `storageState({ indexedDB: true })`, closes the browser, relaunches on the same port through the new `openApp` options `storageState` and `port`, and expects the match with no join screen.
- **I11** (fixed): `tap({ unit: mine.id, hex: mine.pos })`, no `as never`.
- **M1** (fixed): Task 0 says the version line is on `main`, not `plan-3-ai`, and to check it survived the merge.
- **M2** (fixed): `firebaseNet(name?, opts?: { schemaOverride?, timeoutMs? })` in Produces.
- **M3** (fixed): `playerView` in Task 6's Consumes; `SupersededError` and `planTurn` in Task 8's.
- **M4** (fixed): a Global Constraint and Task 2 Step 6 say to stage new files by name before running the `git ls-files` guards.
- **M5** (fixed): "counter back" writes `head/n: 1`.
- **M6** (fixed): `droppedWaiting` for an absent player who is not on the clock; `dropped` only when they hold the current seat; a screen test and the browser tests use the right line.
- **M7** (fixed): `usingEmulator()` throws in Node without `EMULATOR=1`, with a plain test.
- **M8** (fixed): `normalizeRoom` validates and keeps `schema`; the session treats `schema > SCHEMA` as a `version` room with `remoteSchema`; `newerBuild` text and tests in Tasks 3, 9 and 12.
- **M9** (fixed): F2 runs in a terminal tab and names the "Are you ready to proceed?" prompt.
- **M10** (fixed): abandoned lobbies and anonymous users are noted in F6, the decisions and `docs/online.md`.
- **M11** (fixed): `freeze`/`thaw` are on `ManualTimers`; `tick` is defined (steps to each due timer, a re-armed timer fires once per period, synchronous, settle after).
- **M12** (partly fixed): the AI test now proves the session's planner ran while `aiBusy` never turned true; the digest test checks `digestFor` was called for seat 1 with the opponent's two steps ending at the guest's state. It does not force a non-empty digest (a scripted attack on seed 42 would cost more than it proves; `digest.test.ts` already covers the lines).
- **M13** (fixed): noted in the rules list, the decisions and `docs/online.md`.
- **M14** (fixed): the store imports `FIRST_THINK_MS` and `REPLAN_MS` for its own use and re-exports them.
- **M15** (fixed): the Global Constraint now allows `src/net` the one type-only edge to `src/app/record.ts` through `wire.ts`.
- **Mismatch, `Hit` shape** (fixed): see I11; `Hit` is named in Task 0 and Task 11's Consumes.
- **Mismatch, `Version.tsx`** (fixed): see M1.
- **Mismatch, `firebaseNet` signature** (fixed): see M2.
- **Mismatch, Consumes missing `SupersededError` and `playerView`** (fixed): see M3.
- **Mismatch, test id `result`** (fixed): Task 12 adds `data-testid="result"` to the Result screen if missing.
- **Mismatch, `src/vite-env.d.ts`** (fixed): Task 2 no longer lists `vite.config.ts`; `tsconfig.json` already types `import.meta.env`.
