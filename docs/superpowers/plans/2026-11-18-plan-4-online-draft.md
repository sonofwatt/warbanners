# Banners Plan 4: Live Online Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Draft status:** written 2026-11-18 while plan 2 is being built and plan 3 is being drafted. Every interface taken from plan 2 is marked **(plan 2)** and every guess about plan 3 is marked **(plan 3 assumption)**. Revise against the merged code before execution; the last section lists what to re-check.

**Goal:** Two people, each on their own phone, play a full live Spartans against Mongols match: one opens a lobby and sends an invite link, the other joins, turns go in order with a turn clock, and a dropped connection, a reload or a closed tab loses nothing.

**Architecture:** The match record lives in Firebase Realtime Database under a six-letter room code: settings, seats, and the ordered list of actions stored as JSON strings. The phone whose turn it is checks each action with the engine and appends it with one atomic write; the database rules allow that write only from the right player, only at the next index, and never over an existing action. Every phone replays the list with the engine and compares `hashState` with the hash the writer stored. All decisions (who may act, when the clock runs out, who stands in as host, whether the replay agrees) are pure functions tested without a network; a thin `Net` layer talks to Firebase and is tested against the emulator, with an in-memory fake held to the same contract tests.

**Tech Stack:** firebase ^12.18.0 (Realtime Database, anonymous Auth), firebase-tools ^15.28.1 (emulator, rules deploy), @firebase/rules-unit-testing ^5.0.2, a JVM (Java 21) for the database emulator, on top of plan 2's React 19, Zustand 5, Vite 8, Vitest 4, Playwright 1.62, cross-env 10 and Node 24. Versions match `~/projects/deutsch-dash`.

**Spec:** `docs/superpowers/specs/2026-11-18-banners-design.md` (sections 3, 6.1, 7 "Running it", 8.2, 8.3, 8.5, 8.7, 9). Also `docs/superpowers/plans/2026-11-18-plan-1-followups.md` ("Plan 4" items) and `docs/superpowers/plans/2026-11-18-plan-2-game-on-screen.md` (the record, store and screens this plan extends). Executors read all three. Deutsch Dash's `handoff.md` sections on rules deploys, the emulator, CI and presence are recommended background.

**Where this sits:** Stage 1 of the design is four plans. This is the fourth.

1. Rules engine (done, on `main`).
2. The game on screen (being built): board, hot-seat play, saves on the phone, offline install, deploy.
3. AI: easy, normal, hard, adaptive (being drafted).
4. Live online play (this plan): lobby, invite link, turn clock, rejoin, version check.

**Not in this plan:** remote play over days with notifications (stage 3), more than two seats (stage 4), chat, spectators, offering an AI seat in the online lobby (wired and tested, not offered; see decisions).

## Decisions this plan makes

Each is the planner's call. Each line ends with what it costs if wrong.

- **[Planner's call] One room is one match; the database record is the authority.** The phone keeps a cached copy for a fast start and for viewing with no connection, but whenever the two differ the database wins. Cost if wrong: a tap made in the instant before a crash, which never reached the database, has to be made again.
- **[Planner's call] Layout: `rooms/$code` holds `meta`, `seats`, `members`, `presence`, `match`, `head`, `actions`, `checks`, `snap`, `desync`.** Each action is a JSON string at key `"0"`, `"1"`, ... An append is one multi-path update writing `actions/<n>` and `head` together. The rules tie the key to the counter with `$n === '' + root...head/n.val()`; this was checked against database emulator v4.11.2 on 2026-11-18 (overwrite, gap, skip, decrement and delete were all refused; the in-order append was accepted). Cost if wrong: if production evaluates that expression differently from the emulator, appends fail; the two-phone check in Task 13 would show it on the first move.
- **[Planner's call] The engine gains `resign` with an optional `player`, and a resigning current player passes the turn.** Online, the player who is waiting must be able to resign. `RULES_VERSION` goes from 1 to 2. Cost if wrong: hot-seat saves made on version 1 become "from an older version" (plan 2's rule), so a half-played local match at the moment of the deploy cannot be resumed.
- **[Planner's call] A rules fingerprint test pins `hashState` of a scripted match to `RULES_VERSION`.** Any change to how the game plays fails it until the version is bumped. Cost if wrong: one extra step whenever plan 3 tunes a number, which is the point.
- **[Planner's call] The host is seat 0 and moves first.** The host picks their own faction; the guest gets the other. Cost if wrong: a "who goes first" switch in the lobby, an hour's work.
- **[Planner's call] Turn clock choices: Off, 1, 2, 3 and 5 minutes; default 2.** Cost if wrong: one list and one rules literal to edit.
- **[Planner's call] When the clock runs out, the current player's own phone appends `endTurn`. The waiting phone appends it as a backup 3 seconds after the deadline.** The rules let a seated player who is not current append exactly `{"type":"endTurn"}` only when the server's `now` is past `turnAt + clock + paused`. Deadlines are computed from server timestamps and `.info/serverTimeOffset`, never from two phone clocks. If both write, the rules let exactly one land. Cost if wrong: a turn could end a second or two late on a sleeping phone.
- **[Planner's call] A drop pauses the clock for up to 3 minutes per turn.** While the current player's presence is off, their clock stands still; after 3 minutes of absence in that turn it runs again from where it stopped. Each later turn of an absent player gets the same 3 minutes. With the clock off the match simply waits, for days if need be. Nothing ever forfeits a match automatically (design 3, anti-goal). Cost if wrong: one number.
- **[Planner's call] A seat whose player is offline can be taken over from another device by anyone holding the room code.** On iPhone the home-screen app and Safari keep separate storage, so opening the invite link in Safari after installing gives a new anonymous identity. The rejoin screen offers "I'm Ben" for any seat whose player is not connected. This follows the trust model (design 8.5: the room code is the credential). Cost if wrong: an invited friend could take an absent player's seat.
- **[Planner's call] A snapshot of the state (a JSON string) is written with every `endTurn`, replacing the last one, and a hash checkpoint `checks/<n>` is kept for every turn.** A rejoining phone loads the snapshot, checks it, and replays only the rest. Measured on the build machine: replaying 1,245 actions takes about 0.5 s and the state is about 24 KB, so a phone would take a second or two without it. Cost if wrong: about 5 MB of uploads per long match; well inside the free plan.
- **[Planner's call] A hash mismatch first rebuilds from the full action list. If the rebuilt state still disagrees, the match pauses for both players** with a plain message and an offer to update, and resumes on its own once the phones agree. Nobody's state is silently overwritten. Cost if wrong: a real non-determinism bug halts a match instead of limping on.
- **[Planner's call] AI seats are built into the layout, the rules, the host role and the session, and tested with a stub AI, but the stage 1 lobby does not offer one.** Two seats with one AI is just solo play. Cost if wrong: one lobby switch to show them.
- **[Planner's call] Rooms are swept, not deleted on finish.** The creator may delete their room at any time; anyone may delete a room idle for 30 days. The creator's home screen sweeps its own finished rooms after a day. Cost if wrong: finished rooms (about 70 KB each) sit in the database a little longer.
- **[Planner's call] Room codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (as Deutsch Dash), and the invite link is `https://sonofwatt.github.io/banners/?room=ABC234`.** A query, not a path, so GitHub Pages and the service worker's `index.html` fallback both serve it. Cost if wrong: none worth naming.
- **[Planner's call] Firebase is loaded only when the player opens online play or an online match** (a dynamic `import()` of `src/net`). Solo and hot-seat play never open a socket, so plan 2's offline test keeps proving that no request leaves the phone. Cost if wrong: a few hundred milliseconds when online play first opens.
- **[Planner's call] A `SCHEMA` number is written into every new room and mirrored as a literal in `database.rules.json`.** If the deployed rules are older than the code, creating a room fails at once with "Online play needs a server update" rather than misbehaving quietly later (Deutsch Dash lost a playtest to undeployed rules). Cost if wrong: none; it is a tripwire.
- **[Planner's call] Database region `us-central1`.** It is the free plan's default and cannot be changed later. Cost if wrong: about 50 ms more per write from far away.
- **[Planner's call] The emulator project is `demo-banners` on ports 9010 (database) and 9110 (auth)**, so it never collides with Deutsch Dash's emulator on 9000 and 9099. The app's emulator URL uses `?ns=demo-banners-default-rtdb`, the only namespace the emulator loads the rules into. Cost if wrong: none.
- **[Planner's call] Updating while an unfinished online match exists asks first:** "Your match with Ben is still going. If this update changes the rules, that match cannot continue. Update now?" Cost if wrong: one confirm dialog.

## Global Constraints

- Never write an em dash or an en dash anywhere: code, comments, tests, commit messages, docs, text the game shows. Use a hyphen, a colon, or a new sentence.
- Nothing is copied from Hexonia or any other game. Wording is our own.
- Plan 2's constraints all still hold, with one amendment: requests may leave the phone for Firebase (`<project>-default-rtdb.firebaseio.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`) only after the player opens online play or an online match. Solo and hot-seat play never contact Firebase.
- Code outside `src/engine` imports the engine only through `src/engine/index.ts`. Add `src/net` and `src/online` to the folders `src/boundaries.test.ts` checks.
- Nothing outside the engine changes a `MatchState`. Every change, local or received, goes through `applyAction`.
- No Firebase, DOM, storage, clock or randomness access when a module loads. `src/net/firebase.ts` creates the app on first call, never on import.
- Everything stored in the database that came from the engine is a JSON string: actions, settings, snapshots. Firebase drops `null` and empty arrays, which would change the hash (plan 1 follow-up).
- Actions are encoded with the engine's `canonical()` (sorted keys), so the rules can match exact strings such as `{"type":"endTurn"}`.
- Any read of the database is untrusted: every value goes through `normalizeRoom`, `readActions` or `decodeAction` before use. The rules are also enforced, but the client never assumes they were deployed.
- Never subscribe to a whole room. Listen to `meta`, `seats`, `members`, `presence`, `head`, `desync` and `actions` separately; read `snap` and `match` once with `get()`. A snapshot is 24 KB and must not be pushed to the other phone at every turn.
- Never compare two phones' clocks. Every deadline is computed from server timestamps plus `.info/serverTimeOffset`, and the rules check server `now`.
- Rules changes are half done until deployed: after any edit to `database.rules.json`, the controller runs `npx firebase deploy --only database --project banners-game`. Subagents never deploy.
- Emulator suites gate on `describe.runIf(process.env.EMULATOR === '1')`. CI runs `npm run test:emu`, and `src/net/emulatorCoverage.test.ts` fails if it stops doing so.
- Every display string lives in `src/ui/text.ts`. Online play says plainly that it needs a connection and that the match is safe when one is lost.
- Dependencies are limited to the Tech Stack list.
- `npm test`, `npm run typecheck` and `npm run lint` are clean at every commit; `npm run test:emu` is clean at every commit that touches `src/net`, `src/online` or the rules.
- Every commit message ends with a `Co-Authored-By:` trailer naming the model that wrote the commit, with the address `noreply@anthropic.com`.
- Work on branch `plan-4-online-play` in `~/projects/banners`. Do not push: the controller pushes in Task 13.

## Review Focus

1. Both phones write at the same instant: the waiting phone's timeout `endTurn` against the current player's last move, or a double tap on End turn. Exactly one write lands, the other phone rebuilds from the database, and no turn is ended twice. Pinned in Task 5 (contract) and Task 9.
2. A reload or a killed app between a local move and its write reaching the database. On reopening, the database wins: the board shows what was stored, the lost tap is simply gone, nothing else is lost, and the clock resumes with the drop credited. Pinned in Task 9.
3. The same person on a different identity: the invite link opened in Safari after installing to the iPhone home screen, or cleared site data. The rejoin screen offers "I'm Ben" for the absent seat and the match carries on. Pinned in Task 4 (rules) and Task 9.
4. A new build lands between sessions mid-match (closing every tab lets a waiting service worker take over). Same rules version: the match carries on. Different rules version: a plain message, the match stays in the database, and nothing is deleted or overwritten. Pinned in Task 9 (version refused, nothing written) and Task 10 (update asks first).
5. Database rules in production older than the code. Creating a room fails at once with a sentence naming the cause. Pinned in Task 4 (schema literal test) and Task 5.

---

## Controller steps: one-time Firebase setup

Done by the controller (not a subagent) once Task 2 is merged into the branch, and before Task 13. The Firebase CLI on the build machine is signed in to the owner's account. Run from `~/projects/banners` with the repo's own CLI (`npx firebase`, firebase-tools 15.28.1).

1. **Create the default Realtime Database instance in `us-central1`, locked mode.** `npx firebase database:instances:create` cannot do this: in 15.28.1 it refuses when the project has no default instance yet (read in its source, `commands/database-instances-create.js`). Use `npx firebase init database --project banners-game`, which is interactive (run it in a terminal tab): pick `us-central1`, and answer **No** when asked to overwrite `database.rules.json`. Then `git checkout firebase.json database.rules.json .firebaserc` if `init` touched them. The console route is equivalent: Build, Realtime Database, Create database, `us-central1`, Start in locked mode.
2. **Register a web app and fetch its config.**
   ```bash
   npx firebase apps:create WEB "Banners web" --project banners-game
   npx firebase apps:sdkconfig WEB <appId printed above> --project banners-game
   ```
   Copy `apiKey`, `authDomain`, `databaseURL` (expect `https://banners-game-default-rtdb.firebaseio.com`), `projectId` and `appId` into `src/net/firebaseConfig.ts` and commit. These values are public by design; the rules are what make them safe.
3. **Enable anonymous sign-in. This cannot be done from the CLI** (firebase-tools has only `auth:import` and `auth:export`). Firebase console, Authentication, Get started, Sign-in method, Anonymous, Enable. It needs a browser signed in to the owner's Google account: ask the owner, or use a browser session already signed in to that account. While there, add `sonofwatt.github.io` under Authentication, Settings, Authorized domains as a precaution.
4. **Deploy the rules.** `npx firebase deploy --only database --project banners-game`. Check with `curl -s https://banners-game-default-rtdb.firebaseio.com/rooms.json`: expected `{"error":"Permission denied"}` (rules are on and refuse an unauthenticated read).
5. **Stay on the free plan.** No billing account, no Functions.

---

## File Structure

```
firebase.json, .firebaserc, database.rules.json, .env.emu
src/engine/capture.ts               resign by seat; a resigning current player passes the turn (modify)
src/engine/types.ts                 resign gains player?; RULES_VERSION 2 (modify)
src/engine/index.ts                 export canonical (modify)
src/engine/fingerprint.test.ts      RULES_VERSION pinned to the rules
src/net/firebaseConfig.ts           the public web config (filled by the controller)
src/net/firebase.ts                 lazy app, auth, database, emulator wiring, server time, reconnect
src/net/net.ts                      the Net interface every online module talks to
src/net/firebaseNet.ts              Net on Firebase
src/net/fakeNet.ts                  Net in memory, same contract, for store and session tests
src/net/contract.ts                 the contract tests, run against both
src/net/*.emu.test.ts               rules, contract on Firebase, two-client match
src/net/emulatorCoverage.test.ts    CI must run the emulator suite
src/online/wire.ts                  constants, room types, codes, links, encoding, normalizing reads
src/online/sync.ts                  follow the remote list: apply, compare hashes, rebuild
src/online/clock.ts                 turn clock and drop pause
src/online/host.ts                  host stand-in and AI seats
src/online/session.ts               one open room: ties Net, sync, clock and host together
src/app/onlineList.ts               this phone's online matches and rooms it created
src/app/store.ts                    online mode, new screens (modify, plan 2)
src/ui/screens/{OnlineSetup,Lobby,Join}.tsx   new screens
src/ui/screens/{Home,Match,Result}.tsx, src/ui/panels/{Hud,Menu}.tsx, src/ui/text.ts   (modify, plan 2)
src/browser/online.test.ts          two phones in two browser pages against the emulator
.github/workflows/deploy.yml        JVM, emulator jar cache, test:emu (modify, plan 2)
```

Database layout under `rooms/$code` (every number is milliseconds unless named otherwise):

```
meta     { createdAt: server time (write once), creatorId, hostId, schema: 1, rulesVersion, build,
           clock: 0|60|120|180|300 (seconds), hostFaction: 'spartans'|'mongols', phase: 'lobby'|'playing'|'over' }
seats    { "0": { uid, name, kind: 'human'|'ai', level? }, "1": {...} }
members  { <uid>: seat number }                  reverse index so the rules can find a writer's seat
presence { <uid>: { on: boolean, at: server time } }   onDisconnect writes { on: false, at }
match    { settings: JSON string of MatchSettings, startedAt: server time }   write once
head     { n: actions so far, seat: whose turn, hash: hashState after action n-1, at: server time of last write,
           turnAt: server time the current turn began, paused: ms of drop pause credited this turn }
actions  { "0": JSON string, "1": ... }          append only
checks   { <n>: hash }                           written with each endTurn; write once
snap     { n, hash, state: JSON string }         replaced with each endTurn
desync   { <uid>: { n, hash, build } }           owner-written, removed by its owner once the phones agree
```

---

### Task 1: Engine hand-over: resign by seat, rules fingerprint, canonical export

**Files:**
- Modify: `src/engine/types.ts`, `src/engine/capture.ts`, `src/engine/index.ts`, `src/engine/capture.test.ts`, `docs/rules/stage1-rules.md`
- Create: `src/engine/fingerprint.test.ts`

**Interfaces:**
- Produces: `Action` variant `{ type: 'resign'; player?: PlayerId }`; `RULES_VERSION = 2`; `canonical(value: unknown): string` exported from `src/engine/index.ts`.

Rules for the new resign: `player` absent means `s.current` (today's behaviour). `player` present must be an integer naming an alive player, or the action is refused with `'invalid player'`. The named player is eliminated. If the match goes on and the eliminated player was current, the turn passes exactly as `endTurn` would pass it (call the same code; do not duplicate it). `legalActions` keeps listing the plain `{ type: 'resign' }`.

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
test('a resigning current player hands the turn on when others remain', () => {
  const s = blankMatch(); s.players.push({ ...structuredClone(s.players[1]!), id: 2 });
  addCity(s, 0, 0, 0); addCity(s, 1, 3, 0); addCity(s, 2, -3, 0);
  const r = applyAction(s, { type: 'resign', player: 0 }); const t = must(r);
  expect(t.winner).toBeNull(); expect(t.current).toBe(1); expect(t.stamp).toBe(s.stamp + 1);
  expect(r.ok && r.events.map(e => e.type)).toEqual(['eliminated', 'turnStarted']);
});

// fingerprint.test.ts
const FINGERPRINT: Record<number, string> = { 2: 'PASTE_ONCE' };
test('RULES_VERSION changes whenever the rules do', () => {
  let s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] });
  for (let i = 0; i < 400 && s.winner === null; i++) {
    const legal = legalActions(s).filter(a => a.type !== 'resign');
    s = must(applyAction(s, legal[(i * 7) % legal.length]!));
  }
  expect(hashState(s)).toBe(FINGERPRINT[RULES_VERSION]);
});
```

The fingerprint test carries a comment: "If this fails, the game plays differently. Bump RULES_VERSION in types.ts and add the new hash here. Two phones on different rules must never meet in a match."

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/engine`. Expected: the two resign tests fail; the fingerprint test fails on `PASTE_ONCE`.
- [ ] **Step 3: Implement the resign change and bump `RULES_VERSION` to 2.** Export `canonical` from the index. Update `docs/rules/stage1-rules.md` (the resign rule).
- [ ] **Step 4: Fix the fingerprint.** Run the fingerprint test, copy the received hash into `FINGERPRINT[2]`, run `npm test` and see all engine tests pass (plan 2's tests use `RULES_VERSION` symbolically).
- [ ] **Step 5: Commit**

```bash
git add src/engine docs/rules && git commit -m "Let a player resign out of turn and pin the rules version to the rules"
```

---

### Task 2: Firebase toolchain, emulator and CI

**Files:**
- Create: `firebase.json`, `.firebaserc`, `database.rules.json` (locked: `{ "rules": { ".read": false, ".write": false } }` until Task 4), `.env.emu`, `src/net/firebaseConfig.ts`, `src/net/firebase.ts`, `src/net/firebase.emu.test.ts`, `src/net/emulatorCoverage.test.ts`
- Modify: `package.json`, `.gitignore`, `.github/workflows/deploy.yml` **(plan 2)**, `src/boundaries.test.ts` **(plan 2)**

**Interfaces:**
- Produces:

```ts
// firebaseConfig.ts: public client identifiers, filled by the controller
export const firebaseConfig: { apiKey: string; authDomain: string; databaseURL: string; projectId: string; appId: string };
export const isConfigured: boolean;                  // apiKey !== 'PASTE_ME'

// firebase.ts: nothing runs on import
export const EMU = { projectId: 'demo-banners', dbPort: 9010, authPort: 9110,
  databaseURL: 'http://127.0.0.1:9010?ns=demo-banners-default-rtdb' } as const;
export function usingEmulator(): boolean;            // EMULATOR=1 in Node, VITE_EMULATOR=1 in a build, or a dev server without VITE_USE_PROD=1
export interface Fb { app: FirebaseApp; db: Database; auth: Auth }
export function fb(name?: string): Fb;               // created on first call per name; a second name gives a second identity (tests)
export function ensureSignedIn(f: Fb): Promise<string>;      // anonymous; returns the uid
export function watchConnected(f: Fb, cb: (ok: boolean) => void): () => void;
export function serverOffset(f: Fb, cb: (ms: number) => void): () => void;   // .info/serverTimeOffset
export function reconnect(f: Fb): void;              // goOffline then goOnline; only when believed offline
```

- `package.json` scripts: `"emu": "firebase emulators:start --only database,auth --project demo-banners"`, `"test:emu": "firebase emulators:exec --only database,auth --project demo-banners \"cross-env EMULATOR=1 vitest run\""`. Dependencies: `firebase@^12.18.0`; dev: `firebase-tools@^15.28.1`, `@firebase/rules-unit-testing@^5.0.2`.
- `firebase.json`: `{ "database": { "rules": "database.rules.json" }, "emulators": { "database": { "port": 9010 }, "auth": { "port": 9110 }, "ui": { "enabled": false }, "singleProjectMode": false } }`. `.firebaserc`: default project `banners-game`. `.env.emu`: `VITE_EMULATOR=1`. `.gitignore`: `database-debug.log`, `firebase-debug.log`, `.firebase/`, `dist-emu/`.
- `fb()` uses `initializeAuth` with `[indexedDBLocalPersistence, browserLocalPersistence]` in a browser (so a phone keeps its identity across reloads) and `inMemoryPersistence` in Node. With the emulator it calls `connectDatabaseEmulator` and `connectAuthEmulator`. An unconfigured production build uses the emulator config object but connects nowhere; the app shows "Online play is not set up in this build" (Task 11).
- System Java 21 is on the build machine's PATH, so Deutsch Dash's `scripts/with-java.mjs` is not needed. If a machine lacks Java, `npm run test:emu` fails with the CLI's own message.

- [ ] **Step 1: Install.** `npm install firebase@^12.18.0 && npm install -D firebase-tools@^15.28.1 @firebase/rules-unit-testing@^5.0.2`
- [ ] **Step 2: Write the failing tests**

```ts
// firebase.emu.test.ts
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

// emulatorCoverage.test.ts (plain npm test)
test('CI runs the emulator suite, with a JVM and a cached jar', () => {
  const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(wf).toMatch(/^\s*-\s*run:\s*npm run test:emu\s*$/m);
  expect(wf).toContain('actions/setup-java');
  expect(wf).toContain('~/.cache/firebase/emulators');
});
test('every emulator suite gates on EMULATOR, and there are some', () => {
  const files = execSync('git ls-files "src/**/*.emu.test.ts"').toString().trim().split('\n');
  expect(files).toContain('src/net/firebase.emu.test.ts');
  for (const f of files) expect(readFileSync(f, 'utf8')).toContain("describe.runIf(process.env.EMULATOR === '1')");
});
test('nothing imports firebase on load outside src/net', () => {
  // every tracked file under src/ui, src/app and src/main.tsx: no static import from 'firebase/' or from '../net' / '../../net';
  // only `await import(...)` of src/net is allowed there. Expect the file list to include src/app/store.ts.
});
```

- [ ] **Step 3: Run them and see them fail.** Run: `npm test` (the coverage tests fail) and `npm run test:emu` (the emulator tests fail: no `firebase.ts`).
- [ ] **Step 4: Implement `firebase.ts`, the config placeholder, the scripts and the files above.** `firebaseConfig.ts` holds `'PASTE_ME'` values with the comment that the controller fills them and that they are public by design.
- [ ] **Step 5: CI.** In plan 2's workflow, before `npm ci`: `actions/setup-java@v6` (`distribution: temurin`, `java-version: '21'`) and `actions/cache@v6` on `~/.cache/firebase/emulators` keyed `firebase-emulators-${{ runner.os }}-${{ hashFiles('package-lock.json') }}` with that prefix as a restore key. Replace the `npm test` step with `npm run test:emu` (a strict superset). Add `src/net` and `src/online` to `src/boundaries.test.ts`.
- [ ] **Step 6: Run `npm test`, `npm run test:emu`, `npm run typecheck`, `npm run lint`; all pass.**
- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Add Firebase, the emulator suite and the CI steps it needs"
```

---

### Task 3: The wire: constants, room types, codes, links, encoding

**Files:**
- Create: `src/online/wire.ts`, `src/online/wire.test.ts`

**Interfaces:**
- Consumes: `canonical`, `applyAction`'s `Action` and `MatchSettings`, `FactionId`, `PlayerId` from the engine.
- Produces:

```ts
export const SCHEMA = 1;                          // mirrored as a literal in database.rules.json
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const CLOCK_CHOICES = [0, 60, 120, 180, 300] as const;     // seconds; 0 is off
export type ClockSec = (typeof CLOCK_CHOICES)[number];
export const DEFAULT_CLOCK: ClockSec = 120;
export const DROP_PAUSE_MS = 180_000;             // mirrored in the rules
export const TIMEOUT_GRACE_MS = 3_000;
export const HOST_AWAY_MS = 30_000;
export const ROOM_IDLE_TTL_MS = 30 * 86_400_000;  // mirrored in the rules
export const FINISHED_SWEEP_MS = 86_400_000;
export const MAX_ACTION_CHARS = 512; export const MAX_SNAP_CHARS = 200_000; export const MAX_NAME = 16;
export const SEATS = 2;

export type Phase = 'lobby' | 'playing' | 'over';
export type SeatKind = 'human' | 'ai';
export interface Seat { uid: string; name: string; kind: SeatKind; level: string | null }
export interface RoomMeta { createdAt: number; creatorId: string; hostId: string; schema: number; rulesVersion: number;
  build: string; clock: ClockSec; hostFaction: FactionId; phase: Phase }
export interface Head { n: number; seat: PlayerId; hash: string; at: number; turnAt: number; paused: number }
export interface Presence { on: boolean; at: number }
export interface Desync { n: number; hash: string; build: string }
export interface Snap { n: number; hash: string; state: string }
export interface Room { code: string; meta: RoomMeta; seats: (Seat | null)[]; members: Record<string, PlayerId>;
  presence: Record<string, Presence>; head: Head | null; desync: Record<string, Desync> }

export function makeRoomCode(rand?: () => number): string;   // default: crypto.getRandomValues
export function isRoomCode(v: unknown): v is string;
export function inviteLink(base: string, code: string): string;
export function codeFromSearch(search: string): string | null;   // tolerant of case and spaces
export function factionsFor(hostFaction: FactionId): [FactionId, FactionId];
export function encodeAction(a: Action): string;                 // canonical(a)
export function decodeAction(s: unknown): Action | null;         // a string of at most MAX_ACTION_CHARS that parses to an object with a string type
export function encodeSettings(s: MatchSettings): string; export function decodeSettings(v: unknown): MatchSettings | null;
export function readActions(raw: unknown): string[] | null;       // array or integer-keyed object; null on a gap or a non-string
export function normalizeRoom(code: string, raw: unknown): Room | null;   // never throws
```

`normalizeRoom` reads the separately fetched nodes put together as `{ meta, seats, members, presence, head, desync }`. Firebase returns `seats` and `actions` as arrays when their keys are `0..n`, and as objects otherwise: both forms are accepted. A seat that is not an object with string `uid` and `name` and a known `kind` becomes `null`. Names are cut to `MAX_NAME`. A `meta` missing `creatorId`, `createdAt` or a known `phase` makes the whole room `null`. Numbers that are not finite numbers are replaced with 0.

- [ ] **Step 1: Write the failing tests**

```ts
test('room codes', () => {
  expect(makeRoomCode(() => 0)).toBe('AAAAAA');
  expect(makeRoomCode(() => 0.9999)).toBe('999999');
  expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  expect(isRoomCode('ABC234')).toBe(true);
  for (const v of ['abc234', 'ABC23', 'ABC2340', 'ABCO34', 7, null]) expect(isRoomCode(v)).toBe(false);
});
test('invite links', () => {
  expect(inviteLink('https://sonofwatt.github.io/banners/', 'ABC234')).toBe('https://sonofwatt.github.io/banners/?room=ABC234');
  expect(codeFromSearch('?room=abc234')).toBe('ABC234');
  expect(codeFromSearch('?seed=7&room=%20ABC234%20')).toBe('ABC234');
  expect(codeFromSearch('?room=ABC')).toBeNull(); expect(codeFromSearch('')).toBeNull();
});
test('factions follow the host', () => {
  expect(factionsFor('mongols')).toEqual(['mongols', 'spartans']);
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
  expect(decodeSettings('{"seed":1}')).toBeNull();
});
test('the action list comes back as an array or an object', () => {
  expect(readActions(['a', 'b'])).toEqual(['a', 'b']);
  expect(readActions({ 0: 'a', 1: 'b', 2: 'c' })).toEqual(['a', 'b', 'c']);
  expect(readActions(null)).toEqual([]);
  expect(readActions({ 0: 'a', 2: 'c' })).toBeNull();
  expect(readActions(['a', null, 'c'])).toBeNull();
  expect(readActions(['a', 7])).toBeNull();
});
test('a room is read defensively', () => {
  const meta = { createdAt: 5, creatorId: 'u1', hostId: 'u1', schema: 1, rulesVersion: 2, build: 'abc1234', clock: 120, hostFaction: 'spartans', phase: 'lobby' };
  const r = normalizeRoom('ABC234', { meta, seats: [{ uid: 'u1', name: 'A very long name indeed', kind: 'human' }], members: { u1: 0 } })!;
  expect(r.seats).toEqual([{ uid: 'u1', name: 'A very long name', kind: 'human', level: null }, null]);
  expect(r.head).toBeNull(); expect(r.presence).toEqual({});
  expect(normalizeRoom('ABC234', { meta, seats: { 1: { uid: 'u2', name: 'Ben', kind: 'robot' } } })!.seats).toEqual([null, null]);
  expect(normalizeRoom('ABC234', { meta: { ...meta, phase: 'nope' } })).toBeNull();
  for (const v of [null, 7, 'x', [], {}]) expect(normalizeRoom('ABC234', v)).toBeNull();
});
```

- [ ] **Step 2: Run them and see them fail.** Run: `npx vitest run src/online`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `wire.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online && git commit -m "Add the online wire format: codes, links, encoded actions, defensive reads"
```

---

### Task 4: Database rules, tested against the emulator

**Files:**
- Modify: `database.rules.json`
- Create: `src/net/rules.emu.test.ts`, `src/net/rulesMirror.test.ts`

**Interfaces:**
- Consumes: the layout above; `SCHEMA`, `CLOCK_CHOICES`, `DROP_PAUSE_MS`, `ROOM_IDLE_TTL_MS`, `MAX_ACTION_CHARS`, `MAX_SNAP_CHARS`, `MAX_NAME` from `wire.ts`.
- Produces: `database.rules.json`, which every later task relies on.

What the rules enforce (R below is `root.child('rooms').child($code)`, the room before the write):

- Root and anything outside `rooms` are closed. A room is readable by any signed-in user (the code is the credential).
- **Create:** one multi-path update writes `meta`, `seats/0` and `members/<uid>`. `meta/createdAt` is write-once and equals `now`; `creatorId` and `hostId` equal `auth.uid`; `schema` equals the literal `1`; `clock` is one of 0, 60, 120, 180, 300; `phase` is `lobby`.
- **Lobby:** the host may change `clock` and `hostFaction` while `phase` is `lobby`. A signed-in user who is not a member may claim an empty seat (writing `seats/<s>` with their own uid and `members/<uid>` = s) while `phase` is `lobby`. A seat's owner may rename it. The host may write an AI seat (`kind: 'ai'`, uid starting `ai_`). Names are strings of 1 to 16 characters.
- **Start:** only the host, only from `lobby` with both seats filled: writes `match` (write once), `head` with `n: 0`, `turnAt: now`, `paused: 0`, and `meta/phase: 'playing'`.
- **Append** (`actions/$n`): never over an existing value, never a delete, `phase === 'playing'`, a string of at most 512 characters, `$n === '' + R.head.n`, and the new `head/n` is the old one plus 1. Allowed writers:
  1. the uid in `seats/<R.head.seat>`;
  2. the host, when that seat's `kind` is `ai`;
  3. any member, when the value is exactly `{"type":"endTurn"}`, `meta/clock > 0`, and `now > R.head.turnAt + R.meta.clock * 1000 + R.head.paused`;
  4. any member, when the value is exactly `'{"player":' + R.members[auth.uid] + ',"type":"resign"}'`.
  `head/seat` may change only when the value is `{"type":"endTurn"}` or starts with `{"player":`; when it changes, `head/turnAt` must equal `now` and `head/paused` must be 0. `head/at` equals `now`.
- **Head extras:** the current seat's uid may raise `head/paused` up to `180000` (never lower it within a turn).
- **Checks and snapshot:** `checks/$n` is write-once, a 16-character hex string, written by whoever may append. `snap` may be replaced by any member; `state` at most 200,000 characters; `n` at most `head/n`.
- **Phase over:** any member may set `meta/phase` from `playing` to `over`.
- **Presence:** `presence/<uid>` only by that uid: `{ on: boolean, at: now }`.
- **Takeover:** while `phase` is `playing`, a signed-in user who is not a member may replace `seats/<s>/uid` with their own and in the same update write `members/<own uid> = s` and delete `members/<old uid>`, only when `presence/<old uid>/on` is not `true`.
- **Host:** any member may set `meta/hostId` to a member uid of a human seat.
- **Desync:** `desync/<uid>` only by that uid.
- **Delete:** `rooms/$code` admits only a delete (`!newData.exists()`), by the creator, or by anyone when `(R.head.at or R.meta.createdAt) + 2592000000 < now`. As in Deutsch Dash, this grant must not cascade a write to any child.

- [ ] **Step 1: Write the failing tests.** `rules.emu.test.ts` uses `initializeTestEnvironment` with projectId `demo-banners-rules` (deliberately not the app's namespace, so pushing rules here cannot mask a broken app namespace: Deutsch Dash's trap) and the rules file read from disk. Helpers: `as(uid)` gives an authenticated context's database, `anon()` an unauthenticated one, `seed(tree)` writes with rules disabled, `playing(over?)` seeds a started room `ABC234` with `u0` in seat 0, `u1` in seat 1, `clock: 60`, `head: { n: 2, seat: 0, hash: '0123456789abcdef', at: T, turnAt: T, paused: 0 }` where `T = Date.now()`, and actions `"0"` and `"1"`.

```ts
const emu = describe.runIf(process.env.EMULATOR === '1');
emu('database rules', () => {
  test('CANARY: the rules are loaded (an unauthenticated read is refused)', async () => {
    await assertFails(get(ref(anon(), 'rooms/ABC234')));
  });
  test('create: the creator writes meta, seat 0 and membership in one update', async () => {
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), createPatch('u0')));
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...createPatch('u9'), 'meta/schema': 0 }));   // stale code
    await assertFails(update(ref(as('u9'), 'rooms/XYZ789'), { ...createPatch('u9'), 'meta/clock': 45 }));
    await assertFails(update(ref(as('u9'), 'rooms/ABC234'), createPatch('u9')));                          // code taken
  });
  test('join: an empty seat in the lobby, once', async () => {
    await seedLobby();
    await assertSucceeds(update(ref(as('u1'), 'rooms/ABC234'), joinPatch('u1', 1)));
    await assertFails(update(ref(as('u2'), 'rooms/ABC234'), joinPatch('u2', 1)));
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), { 'seats/1/name': '' }));
  });
  test('start: the host only, with both seats filled', async () => {
    await seedLobby({ withGuest: true });
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), startPatch()));
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), startPatch()));
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), startPatch()));                               // match is write once
  });
  test('append: the current player, the next index, nothing rewritten', async () => {
    await playing();
    const next = { 'actions/2': '{"to":"1,0","type":"move","unit":0}', 'head/n': 3, 'head/hash': 'fedcba9876543210', 'head/at': serverTimestamp() };
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), next));                                       // not their turn
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { ...next, 'actions/3': next['actions/2'], 'head/n': 4 }));
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), next));
    await assertFails(set(ref(as('u0'), 'rooms/ABC234/actions/1'), '{"type":"endTurn"}'));                // rewrite
    await assertFails(remove(ref(as('u0'), 'rooms/ABC234/actions/0')));                                    // delete
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { 'head/n': 2 }));                            // counter back
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { 'actions/3': 'x'.repeat(513), 'head/n': 4 }));
  });
  test('the turn passes only with endTurn or a resign', async () => {
    await playing();
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { 'actions/2': '{"tech":"bronze","type":"research"}', 'head/n': 3, 'head/seat': 1, 'head/turnAt': serverTimestamp(), 'head/paused': 0, 'head/at': serverTimestamp() }));
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), endTurnPatch(2, 1)));
  });
  test('timeout: the waiting player may end the turn only after the clock', async () => {
    await playing();
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), endTurnPatch(2, 1)));                        // 60 s not yet up
    await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000 });
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), { 'actions/2': '{"tech":"bronze","type":"research"}', 'head/n': 3, 'head/at': serverTimestamp() }));
    await assertFails(update(ref(as('u9'), 'rooms/ABC234'), endTurnPatch(2, 1)));                        // not a member
    await assertSucceeds(update(ref(as('u1'), 'rooms/ABC234'), endTurnPatch(2, 1)));
  });
  test('a drop pause pushes the timeout back', async () => {
    await playing(); await seed({ 'rooms/ABC234/head/turnAt': Date.now() - 61_000, 'rooms/ABC234/head/paused': 30_000 });
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), endTurnPatch(2, 1)));
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), { 'head/paused': 40_000 }));                 // only the current player
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { 'head/paused': 20_000 }));                 // never lower
    await assertFails(update(ref(as('u0'), 'rooms/ABC234'), { 'head/paused': 180_001 }));
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), { 'head/paused': 180_000 }));
  });
  test('either player may resign, but only themselves', async () => {
    await playing();
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), resignPatch(2, 0)));
    await assertSucceeds(update(ref(as('u1'), 'rooms/ABC234'), resignPatch(2, 1)));
  });
  test('an AI seat is played by the host alone', async () => {
    await playing(); await seed({ 'rooms/ABC234/seats/1': { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal' }, 'rooms/ABC234/head/seat': 1 });
    // u1 is still in members (a member who is not host)
    await assertFails(update(ref(as('u1'), 'rooms/ABC234'), endTurnPatch(2, 0)));
    await assertSucceeds(update(ref(as('u0'), 'rooms/ABC234'), endTurnPatch(2, 0)));
  });
  test('an absent player's seat can be taken over, a present one cannot', async () => {
    await playing(); await seed({ 'rooms/ABC234/presence/u1': { on: true, at: 1 } });
    await assertFails(update(ref(as('u7'), 'rooms/ABC234'), takeoverPatch('u7', 1, 'u1')));
    await seed({ 'rooms/ABC234/presence/u1': { on: false, at: 1 } });
    await assertSucceeds(update(ref(as('u7'), 'rooms/ABC234'), takeoverPatch('u7', 1, 'u1')));
  });
  test('presence and desync belong to their owner', async () => {
    await playing();
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/presence/u0'), { on: false, at: serverTimestamp() }));
    await assertSucceeds(set(ref(as('u1'), 'rooms/ABC234/presence/u1'), { on: true, at: serverTimestamp() }));
    await assertFails(set(ref(as('u1'), 'rooms/ABC234/desync/u0'), { n: 2, hash: '0123456789abcdef', build: 'x' }));
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
    for (const path of ['actions/2', 'head/n', 'seats/1/uid', 'match/settings', 'checks/9']) {
      await assertFails(set(ref(as('u9'), `rooms/ABC234/${path}`), 'x'));
    }
  });
});
```

Write the helpers (`createPatch`, `seedLobby`, `joinPatch`, `startPatch`, `endTurnPatch(n, nextSeat)`, `resignPatch(n, seat)`, `takeoverPatch(newUid, seat, oldUid)`) in the file; each returns the exact multi-path object the app's `Net` will send (Task 5 imports them from here so the two cannot drift: move them to `src/net/patches.ts` and import them in both).

`rulesMirror.test.ts` (plain `npm test`): reads `database.rules.json` as text and expects it to contain `=== 1` next to `schema` (matching `SCHEMA`), each of `CLOCK_CHOICES`, `180000` (`DROP_PAUSE_MS`), `2592000000` (`ROOM_IDLE_TTL_MS`), `512`, `200000` and `16`. Its comment says: "change both or the phones and the server disagree".

- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:emu`. Expected: every rules test except the first canary fails against the locked file.
- [ ] **Step 3: Write `database.rules.json` and `src/net/patches.ts`.** Prefer `newData` paths for anything written in the same update and `root`/`data` for what was there before (the emulator evaluates `root` before the write).
- [ ] **Step 4: Run `npm run test:emu` and `npm test`; all pass.** Then break one clause at a time by hand (the `!data.exists()` on actions, the `now >` on timeout, the presence check on takeover) and see the matching test go red. Restore.
- [ ] **Step 5: Commit**

```bash
git add database.rules.json src/net && git commit -m "Add the database rules: who may append, no rewritten history, tidy rooms"
```

The controller deploys the rules (Controller step 4) once this task is reviewed, and after every later change to the file.

---

### Task 5: The Net layer, on Firebase and in memory, under one contract

**Files:**
- Create: `src/net/net.ts`, `src/net/firebaseNet.ts`, `src/net/fakeNet.ts`, `src/net/contract.ts`, `src/net/fakeNet.test.ts`, `src/net/firebaseNet.emu.test.ts`

**Interfaces:**
- Consumes: Task 2's `fb`, `ensureSignedIn`, `watchConnected`, `serverOffset`, `reconnect`; Task 3's types and codecs; Task 4's `patches.ts`.
- Produces:

```ts
// net.ts
export type Refusal = 'offline' | 'schema' | 'notFound' | 'full' | 'started' | 'refused';
export interface Append { n: number; action: string; seatAfter: PlayerId; hash: string; turnPassed: boolean; over: boolean;
  snap: string | null }                 // snap: JSON of the state after this action, sent when turnPassed or over
export interface Watcher { room(r: Room | null): void; actions(list: string[]): void; connected(ok: boolean): void }
export interface Net {
  uid(): Promise<string>;
  serverNow(): number;                                         // Date.now() + the server offset
  create(input: { code: string; name: string; hostFaction: FactionId; clock: ClockSec; rulesVersion: number; build: string }): Promise<true | Refusal>;
  join(code: string, name: string): Promise<{ seat: PlayerId } | Refusal>;     // also succeeds for an existing member, returning their seat
  takeOver(code: string, seat: PlayerId): Promise<true | Refusal>;
  setLobby(code: string, patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<true | Refusal>;
  start(code: string, settings: MatchSettings, openingHash: string): Promise<true | Refusal>;
  append(code: string, a: Append): Promise<true | Refusal>;    // 'refused' means another write took index n first, or the rules said no
  creditPause(code: string, pausedMs: number): Promise<void>;
  claimHost(code: string): Promise<void>;                      // a transaction on meta/hostId; does nothing when already host
  readStart(code: string): Promise<{ settings: MatchSettings; snap: Snap | null; checks: Record<number, string> } | null>;
  reportDesync(code: string, d: Desync | null): Promise<void>;
  watch(code: string, w: Watcher): () => void;                 // also runs presence for this uid while watched
  remove(code: string): Promise<boolean>;
}
export function firebaseNet(name?: string): Net;               // firebaseNet.ts
export interface FakeServer { as(uid: string): Net; setNow(ms: number): void; drop(uid: string): void; back(uid: string): void;
  tree(): unknown; failNext(uid: string): void }               // failNext: the next write from uid is refused, to force races
export function fakeServer(start?: number): FakeServer;        // fakeNet.ts
export function contract(name: string, make: () => Promise<{ a: Net; b: Net; c: Net; ageTurn(code: string, ms: number): Promise<void> }>): void;   // contract.ts
```

Rules for `firebaseNet`:

- `create` retries nothing; the caller picks a new code on `'refused'`. To tell a taken code from stale rules, `create` reads `rooms/<code>/meta` first: present is `'refused'` without writing; absent and then refused is `'schema'` (every other create clause is satisfied by the client's own values).
- `join` reads the room once: missing is `'notFound'`; this uid in `members` returns that seat; `phase !== 'lobby'` is `'started'`; no empty seat is `'full'`.
- `append` sends one `update()` with `patches.ts`'s append patch. Writes are awaited one at a time by the caller (Task 9); `append` itself never queues.
- `watch` attaches `onValue` to `meta`, `seats`, `members`, `presence`, `head`, `desync` and `actions` separately, folds the first six into `normalizeRoom`, passes `readActions(actions)` to `w.actions`, and on `.info/connected` true sets `presence/<uid>` to `{ on: true, at: serverTimestamp() }` with an `onDisconnect` that sets `{ on: false, at: serverTimestamp() }`. On a `visibilitychange` to visible while disconnected it calls `reconnect`. The returned function cancels the `onDisconnect`, writes `on: false`, and detaches everything.
- Firebase raises a local `onValue` event from inside `update()` before the server answers, and a second one when a refused write is rolled back. Callers must treat every event as a fresh reading of the truth (Task 6's `follow` does).
- No firebase write is fire-and-forget: every promise is awaited or has a `.catch` that reports `'offline'` or `'refused'`.

`fakeNet` keeps one in-memory tree per server and applies the same decisions as the rules for the paths it writes (append index and writer, timeout after `turnAt + clock*1000 + paused` by its settable `now`, takeover only when absent, schema). `drop(uid)` sets that uid's presence off at `now` and makes its writes return `'offline'` and its watchers stop; `back(uid)` reverses both.

- [ ] **Step 1: Write the contract.** `contract.ts` exports one `describe` body, so the same tests run against `fakeServer` in `fakeNet.test.ts` (always) and against the emulator in `firebaseNet.emu.test.ts` (with `firebaseNet('a')`, `firebaseNet('b')`, `firebaseNet('c')`). Inside, `code` is a fresh `makeRoomCode()` per test.

```ts
test('create, join, rejoin, and a third phone is turned away', async () => {
  expect(await a.create({ code, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
  expect(await b.join(code, 'Ben')).toEqual({ seat: 1 });
  expect(await b.join(code, 'Ben')).toEqual({ seat: 1 });
  expect(await c.join(code, 'Cy')).toBe('full');
  expect(await c.join('ZZZZZZ', 'Cy')).toBe('notFound');
  expect(await a.create({ code, name: 'Ann', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })).toBe('refused');
});
test('the watcher sees the room, the actions and its own presence', async () => {
  // a creates, b joins, a watches: the latest room has two seats named Ann and Ben, presence[a's uid].on === true, actions []
});
test('appends go in order and only from the player whose turn it is', async () => {
  // a creates, b joins, a starts with { seed: 42, factions: ['spartans','mongols'] } and hashState(createMatch(...))
  // b.append(n 0) -> 'refused'; a.append(n 0 move) -> true; a.append(n 0 again) -> 'refused'; a.append(n 2) -> 'refused'
  // a.append(n 1 endTurn, seatAfter 1, turnPassed, snap) -> true; b.append(n 2 endTurn, seatAfter 0) -> true
  // b's watcher ends with 3 actions equal to the three strings sent; readStart gives the settings, a snap with n 2, checks {2: hash, 3: hash}
});
test('two phones racing for the same index: exactly one wins', async () => {
  // after start and a's turn: ageTurn(code, 125_000); then Promise.all([a.append(n k, move...), b.append(n k, endTurn timeout)])
  // exactly one result is true; the watcher's list has length k + 1
});
test('a resign out of turn is accepted for yourself only', async () => {
  // at a's turn: b.append({ action: '{"player":0,"type":"resign"}' }) -> 'refused'; '{"player":1,"type":"resign"}' with over: true -> true
});
test('a seat can be taken over only while its owner is away', async () => {
  // started match; b watching (present): c.takeOver(code, 1) -> 'refused'; stop b's watch; c.takeOver(code, 1) -> true; c.join(code, 'x') -> { seat: 1 }
});
test('the creator can remove a room; a stranger cannot', async () => {
  // b.remove(code) -> false; a.remove(code) -> true; c.join(code) -> 'notFound'
});
```

Write each commented test out in full. `ageTurn` moves `head/turnAt` back by `ms` (the fake by `setNow`, the emulator by a rules-disabled write through `@firebase/rules-unit-testing` on the app's namespace `demo-banners-default-rtdb`).

- [ ] **Step 2: Run them and see them fail.** Run: `npm test` and `npm run test:emu`.
- [ ] **Step 3: Implement `net.ts`, `fakeNet.ts`, `firebaseNet.ts`.**
- [ ] **Step 4: Run both suites and see the contract pass on both sides.** Add one emulator-only test: against rules where `SCHEMA` differs (set `meta/schema` to 2 in the patch through a test hook), `create` answers `'schema'`.
- [ ] **Step 5: Commit**

```bash
git add src/net && git commit -m "Add the Net layer on Firebase and in memory, held to one contract"
```

---

### Task 6: Following the record: apply, compare hashes, rebuild

**Files:**
- Create: `src/online/sync.ts`, `src/online/sync.test.ts`

**Interfaces:**
- Consumes: `applyAction`, `createMatch`, `hashState`, `replay` from the engine; `decodeAction`, `Head`, `Snap` from `wire.ts`.
- Produces:

```ts
export interface Followed { settings: MatchSettings; actions: string[]; state: MatchState }
export interface Step { action: Action; before: MatchState; events: GameEvent[] }
export type Follow =
  | { kind: 'same' }
  | { kind: 'wait' }                                         // the list and head disagree on length: a write is mid-flight
  | { kind: 'advanced'; followed: Followed; steps: Step[] }
  | { kind: 'rebuilt'; followed: Followed }                  // the list no longer extends ours: started again from it
  | { kind: 'broken'; at: number; reason: 'refused' | 'hash' };
export function opening(settings: MatchSettings): Followed;
export function follow(local: Followed, remote: string[], head: Head): Follow;
export function rebuild(settings: MatchSettings, remote: string[], snap: Snap | null, checks: Record<number, string>): { ok: true; followed: Followed; fromSnap: boolean } | { ok: false; at: number; reason: 'refused' | 'hash' };
export function applyLocal(local: Followed, action: Action): { followed: Followed; step: Step; encoded: string } | null;   // null when refused
```

Rules:

- `follow`: if `remote.length !== head.n`, answer `wait`. If `remote` equals `local.actions`, compare `hashState(local.state)` with `head.hash` (when `head.n > 0`): equal is `same`, unequal goes to the rebuild below. If `local.actions` is a prefix of `remote`, apply the rest in order with `decodeAction` and `applyAction`; a refusal is `broken` with `refused` at that index; afterwards compare with `head.hash`. Anything else (ours is longer, or differs at some index) is a full `rebuild` with no snapshot, reported as `rebuilt`.
- A hash mismatch after applying is retried once as a full `rebuild` from the action list with no snapshot. If that agrees with `head.hash`, the answer is `rebuilt`; if not, `broken` with `hash` at `head.n`.
- `rebuild` uses the snapshot only if `snap.n <= remote.length`, `hashState(JSON.parse(snap.state)) === snap.hash`, and `checks[snap.n]` is absent or equal to `snap.hash`. Otherwise it replays from the opening. A parse error in the snapshot is a fallback, not a failure.

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
  const r = follow(ahead.followed, list.slice(0, 7), headAt(7, states));  // but action 6 is something else
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
git add src/online && git commit -m "Follow the online record: apply, compare hashes, rebuild"
```

---

### Task 7: The turn clock and the drop pause

**Files:**
- Create: `src/online/clock.ts`, `src/online/clock.test.ts`

**Interfaces:**
- Consumes: `Head`, `Presence`, `DROP_PAUSE_MS`, `TIMEOUT_GRACE_MS` from `wire.ts`.
- Produces:

```ts
export type ClockView =
  | { kind: 'off' }
  | { kind: 'running'; endsAt: number }                  // server time
  | { kind: 'paused'; leftMs: number; resumesAt: number };   // the current player dropped; resumesAt is when the pause allowance runs out
export function clockView(clockSec: number, head: Head, current: Presence | null, serverNow: number): ClockView;
export function timeoutDue(view: ClockView, serverNow: number, mine: boolean): boolean;   // mine: this phone holds the current seat
export function pauseCredit(head: Head, offAt: number, backAt: number): number;           // the new head.paused to write on return
export function secondsLeft(view: ClockView, serverNow: number): number | null;           // whole seconds rounded down, never below 0; paused gives leftMs; null when off
```

Definitions: `base = head.turnAt + clockSec * 1000 + head.paused`. If the clock is off: `off`. If `current` is absent or `on`, or it went off at or after `base`: `running` with `endsAt = base`. Otherwise the player dropped at `offAt = current.at` with `allowance = DROP_PAUSE_MS - head.paused` left: while `serverNow - offAt < allowance` the view is `paused` with `leftMs = base - offAt` and `resumesAt = offAt + allowance`; after that it is `running` with `endsAt = base + allowance`. `timeoutDue` is true when running and `serverNow >= endsAt` (mine) or `serverNow >= endsAt + TIMEOUT_GRACE_MS` (not mine). `pauseCredit = min(DROP_PAUSE_MS, head.paused + max(0, backAt - offAt))`.

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
});
test('a drop pauses it, for at most three minutes', () => {
  const off: Presence = { on: false, at: 1_030_000 };
  expect(clockView(120, H, off, 1_100_000)).toEqual({ kind: 'paused', leftMs: 90_000, resumesAt: 1_210_000 });
  expect(clockView(120, H, off, 1_250_000)).toEqual({ kind: 'running', endsAt: 1_300_000 });
  expect(clockView(120, { ...H, paused: 150_000 }, off, 1_050_000)).toEqual({ kind: 'paused', leftMs: 240_000, resumesAt: 1_060_000 });
});
test('a drop after the deadline pauses nothing', () => {
  expect(clockView(60, H, { on: false, at: 1_070_000 }, 1_080_000)).toEqual({ kind: 'running', endsAt: 1_060_000 });
});
test('who ends the turn, and when', () => {
  const v: ClockView = { kind: 'running', endsAt: 1_120_000 };
  expect(timeoutDue(v, 1_119_999, true)).toBe(false); expect(timeoutDue(v, 1_120_000, true)).toBe(true);
  expect(timeoutDue(v, 1_122_999, false)).toBe(false); expect(timeoutDue(v, 1_123_000, false)).toBe(true);
  expect(timeoutDue({ kind: 'paused', leftMs: 1, resumesAt: 2 }, 9e12, false)).toBe(false);
});
test('the pause credited on return', () => {
  expect(pauseCredit(H, 1_030_000, 1_090_000)).toBe(60_000);
  expect(pauseCredit({ ...H, paused: 150_000 }, 1_030_000, 1_090_000)).toBe(180_000);
  expect(pauseCredit(H, 1_030_000, 1_000_000)).toBe(0);
});
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `clock.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online && git commit -m "Add the turn clock and the drop pause"
```

---

### Task 8: The host role and AI seats

**Files:**
- Create: `src/online/host.ts`, `src/online/host.test.ts`

**Interfaces:**
- Consumes: `Room`, `HOST_AWAY_MS` from `wire.ts`; `MatchState`, `Action`, `PlayerId` from the engine.
- Produces:

```ts
export function hostMove(room: Room, me: string, serverNow: number): 'reclaim' | 'standIn' | null;
export function aiSeatToPlay(room: Room, state: MatchState, me: string): PlayerId | null;
export interface AiDriver { chooseTurn(state: MatchState, seat: PlayerId, level: string): Promise<Action[]> }   // (plan 3 assumption) a whole turn ending in endTurn
export const stubAi: AiDriver;     // tests and the stage 1 build: [{ type: 'endTurn' }]
```

Rules: `reclaim` when `me` is `meta.creatorId`, `me` is present, and `meta.hostId !== me`. `standIn` when the host's presence has been off since at least `HOST_AWAY_MS` before `serverNow`, `me` is a present human member who is not the host, and `me` has the earliest `presence.at` among present human members other than the host (ties broken by uid order). `aiSeatToPlay` is the current seat when that seat is `kind: 'ai'`, the match is not over, and `me === meta.hostId`; otherwise null. A new host simply picks up the AI's turn from the current state: the AI keeps no memory between calls **(plan 3 assumption)**.

- [ ] **Step 1: Write the failing tests**

```ts
const room = (over: Partial<Room> = {}): Room => ({
  code: 'ABC234',
  meta: { createdAt: 1, creatorId: 'u0', hostId: 'u0', schema: 1, rulesVersion: 2, build: 't', clock: 120, hostFaction: 'spartans', phase: 'playing' },
  seats: [{ uid: 'u0', name: 'Ann', kind: 'human', level: null }, { uid: 'u1', name: 'Ben', kind: 'human', level: null }],
  members: { u0: 0, u1: 1 }, presence: { u0: { on: true, at: 100 }, u1: { on: true, at: 200 } }, head: null, desync: {}, ...over,
});
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
  const r = room({ seats: [room().seats[0]!, { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal' }], members: { u0: 0 } });
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] }); const t = must(applyAction(s, { type: 'endTurn' }));
  expect(aiSeatToPlay(r, s, 'u0')).toBeNull();
  expect(aiSeatToPlay(r, t, 'u0')).toBe(1);
  expect(aiSeatToPlay(r, t, 'u1')).toBeNull();
});
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `host.ts`.**
- [ ] **Step 4: Run them and see them pass**, then commit:

```bash
git add src/online && git commit -m "Add the host stand-in and the AI seat driver"
```

---

### Task 9: The online session

**Files:**
- Create: `src/online/session.ts`, `src/online/session.test.ts`

**Interfaces:**
- Consumes: `Net`, `fakeServer`; `follow`, `rebuild`, `applyLocal`, `opening`; `clockView`, `timeoutDue`, `pauseCredit`; `hostMove`, `aiSeatToPlay`, `AiDriver`; `RULES_VERSION`, `hashState`.
- Produces:

```ts
export type SessionPhase = 'connecting' | 'notFound' | 'version' | 'join' | 'lobby' | 'playing' | 'over' | 'desync';
export interface SessionView {
  phase: SessionPhase; code: string; me: string | null; mySeat: PlayerId | null; room: Room | null;
  followed: Followed | null;              // null before the match starts
  connected: boolean; clock: ClockView; secondsLeft: number | null;
  myTurn: boolean;                        // connected, playing, my seat is current, no desync, nothing being rebuilt
  sending: boolean;                       // a write is on its way
  absent: PlayerId[];                     // human seats whose presence is off
  remoteVersion: number | null;           // meta.rulesVersion when it differs from RULES_VERSION
  lastSteps: { seq: number; steps: Step[] } | null;   // what just arrived or was just played, for effects and the digest
}
export interface SessionDeps { net: Net; ai: AiDriver; build: string; setTimer(fn: () => void, ms: number): () => void }
export interface Session {
  view(): SessionView;
  act(a: Action): boolean;                // false when not my turn or the engine refuses; never throws
  resign(): void;                         // { type: 'resign', player: mySeat }, allowed on either player's turn
  join(name: string): Promise<Refusal | true>;
  takeOver(seat: PlayerId): Promise<Refusal | true>;
  setLobby(patch: { clock?: ClockSec; hostFaction?: FactionId; name?: string }): Promise<void>;
  start(seed: number): Promise<boolean>;  // host only, both seats filled
  close(): void;
}
export function openSession(code: string, deps: SessionDeps, onChange: (v: SessionView) => void): Session;
```

Behaviour:

- **Opening:** watch the room. Missing: `notFound`. `meta.rulesVersion !== RULES_VERSION`: `version` (and nothing is written). Not a member and in the lobby: `join`. Not a member, playing, and some human seat is absent: `join` with takeover offered for those seats (the screen reads `absent`). Member in the lobby: `lobby`. Member, playing: read the start once, `rebuild` with the snapshot, then follow.
- **Acting:** `act` applies with `applyLocal` at once (the board moves without waiting), queues the encoded action, and sends the queue one write at a time with `head.hash` of the state after it, `turnPassed` for `endTurn` or a resign of the current seat, `over` when the match is over, and the state JSON as `snap` when `turnPassed` or `over`. With `over`, it also sets `meta/phase` to `over`. A `'refused'` answer clears the queue and waits for the watcher, whose next reading rebuilds (`follow` answers `rebuilt`). An `'offline'` answer leaves the queue for the reconnect.
- **Not connected:** `myTurn` is false and `act` refuses, so nothing is queued by the Firebase SDK while offline.
- **Following:** every `room` or `actions` event runs `follow` against the latest pair. `advanced` and `rebuilt` replace `followed` and set `lastSteps` (for `rebuilt`, `steps` is empty and the board simply redraws). `broken` sets `desync`, writes `desync/<me>` with this phone's `n`, hash and build, and stops acting. When the phone later agrees with `head.hash` (after a reload on a fixed build) it removes its entry. While any `desync` entry exists, nobody's `myTurn` is true.
- **Clock:** a timer ticks once a second while playing, updating `secondsLeft`. When `timeoutDue` is true for this phone, it sends `endTurn` (once per turn: remember the `head.n` it tried at). A refused timeout is not retried for that `n`.
- **Drop pause:** when this phone holds the current seat and reconnects after its presence went off at `at`, it writes `pauseCredit(head, at, serverNow)` with `creditPause`.
- **Host:** on every room event run `hostMove` and act on it with `claimHost`; when `aiSeatToPlay` names a seat, ask `ai.chooseTurn` (once per `head.n`) and append its actions in order.
- **Close:** detach the watcher (presence goes off) and cancel timers. The match stays in the database.

- [ ] **Step 1: Write the failing tests.** All use `fakeServer(1_000_000)`, `vi.useFakeTimers()`, and a helper `pair()` that creates a room as `u0` (Ann, spartans, clock 120), joins as `u1` (Ben), starts with seed 42, and opens one session per uid. `settle()` runs pending promises and timers.

```ts
test('both phones see the same match after a few turns', async () => {
  const { a, b } = await pair();
  for (let turn = 0; turn < 6; turn++) {
    const s = turn % 2 === 0 ? a : b; const legal = legalActions(s.view().followed!.state).filter(x => x.type !== 'resign' && x.type !== 'endTurn');
    if (legal.length) expect(s.act(legal[0]!)).toBe(true);
    expect(s.act({ type: 'endTurn' })).toBe(true); await settle();
  }
  expect(hashState(a.view().followed!.state)).toBe(hashState(b.view().followed!.state));
  expect(a.view().followed!.state.stamp).toBe(6);
});
test('only the player whose turn it is can act', async () => {
  const { a, b } = await pair();
  expect(b.view().myTurn).toBe(false); expect(b.act({ type: 'endTurn' })).toBe(false);
  expect(a.view().myTurn).toBe(true);
});
test('a double tap on End turn ends one turn', async () => {
  const { a } = await pair();
  expect(a.act({ type: 'endTurn' })).toBe(true); expect(a.act({ type: 'endTurn' })).toBe(false); await settle();
  expect(a.view().followed!.actions).toEqual(['{"type":"endTurn"}']);
});
test('the clock ends a turn: the current phone first, the waiting phone as backup', async () => {
  const { a, b, server } = await pair();
  server.setNow(1_000_000 + 120_000); vi.advanceTimersByTime(1_000); await settle();
  expect(b.view().followed!.state.current).toBe(1);
  // backup: Ben's own phone is frozen (drop his timers by closing his clock), Ann's phone ends Ben's turn 3 s after the deadline
});
test('a drop pauses the clock, and the backup waits for the pause', async () => {
  // Ann (current) drops 30 s into her turn: Ben's view is paused with leftMs 90_000. At 3 min 30 s nothing has been written.
  // At turnAt + 120 s + 180 s + 3 s Ben's phone ends Ann's turn. Ann comes back: her phone rebuilds and shows Ben's turn.
});
test('the race: my last move against the timeout, one lands, the loser rebuilds', async () => {
  // server.failNext('u0') so Ann's move is refused as if Ben's timeout landed first; then Ben's timeout lands.
  // Ann's state equals Ben's; Ann's move is not in the list; nothing throws; a.view().phase is 'playing'.
});
test('a reload mid-turn loses nothing that reached the database', async () => {
  // Ann moves twice (both written), then a third move is applied locally while u0 is dropped (write answers 'offline').
  // close Ann's session; server.back('u0'); open a new session for u0: its state has the first two moves, not the third, and myTurn is true.
});
test('rejoin uses the snapshot and matches the other phone', async () => {
  // play 8 turns; open a fresh session for u1: view().followed hash equals a's; the fake records that readStart's snap was used (fromSnap)
});
test('a different rules version is refused and nothing is written', async () => {
  // create a room through the fake with rulesVersion RULES_VERSION + 1; open a session: phase 'version', remoteVersion RULES_VERSION + 1; server tree unchanged
});
test('a hash that disagrees pauses both phones', async () => {
  // write an action whose head.hash is wrong (through the fake, as u0): b's phase becomes 'desync', a's myTurn becomes false, desync/u1 exists
});
test('resign from the waiting phone ends the match on both', async () => {
  const { a, b } = await pair(); b.resign(); await settle();
  expect(a.view().phase).toBe('over'); expect(a.view().followed!.state.winner).toBe(0); expect(b.view().phase).toBe('over');
});
test('a newcomer can take an absent seat and play on', async () => {
  // close b's session (Ben absent); open a session as u7: phase 'join', absent [1]; takeOver(1) -> true; then mySeat 1 and the state matches a's
});
test('an AI seat is played by the host', async () => {
  // seats: u0 human, ai_1 AI (written through the fake before start); after Ann's endTurn, Ann's session appends the stub AI's endTurn
  // and it is Ann's turn again. Two seats cannot hold two humans and an AI, so the AI handover itself waits for stage 4.
});
test('the guest stands in as host 30 s after the host leaves, and the creator takes it back', async () => {
  // close a's session; at +29 s meta.hostId is u0; at +30 s it is u1; reopen a session for u0: hostId is u0 again
});
```

Write every commented test out in full.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `session.ts`.** Keep the decisions in Tasks 6 to 8; the session only wires them. Guard re-entry: Firebase raises local events from inside a write, so a flag stops `follow` from running inside its own `append` (Deutsch Dash's `inSnapshot` lesson).
- [ ] **Step 4: Run them and see them pass.** Then run the session tests against the emulator too: add `src/online/session.emu.test.ts` that runs the first, sixth and tenth tests above with `firebaseNet('a')` and `firebaseNet('b')` and real timers (clock tests stay fake-only).
- [ ] **Step 5: Commit**

```bash
git add src/online && git commit -m "Add the online session: acting, following, clock, drops, host"
```

---

### Task 10: The app store goes online

**Files:**
- Create: `src/app/onlineList.ts`, `src/app/onlineList.test.ts`
- Modify: `src/app/store.ts`, `src/app/store.test.ts` **(plan 2)**

**Interfaces:**
- Consumes: `openSession`, `SessionView`, `Session`; plan 2's `AppState`, `Deps`, `KeyValue`, `createAppStore`, `browserDeps`, `UpdateState`.
- Produces:

```ts
// onlineList.ts: this phone's online matches, kept apart from the five hot-seat saves so they are never evicted
export interface OnlineEntry { code: string; seat: PlayerId; names: [string, string]; factions: [FactionId, FactionId];
  over: boolean; rulesVersion: number; createdHere: boolean; updatedAt: number }
export function listOnline(kv: KeyValue): OnlineEntry[];          // newest first; never throws; at most 20
export function rememberOnline(kv: KeyValue, e: OnlineEntry): void;
export function forgetOnline(kv: KeyValue, code: string): void;
export function dueForSweep(list: OnlineEntry[], now: number): string[];   // created here and over for FINISHED_SWEEP_MS, or created here and idle ROOM_IDLE_TTL_MS

// store.ts additions (plan 2's AppState and Deps grow)
// Deps gains: openNet(): Promise<Net>   (dynamic import of src/net; the fake in tests); ai: AiDriver; build: string;
//             roomFromUrl(): string | null; online(): boolean   (navigator.onLine)
// Screen gains: 'onlineSetup' | 'lobby' | 'join'
// AppState gains:
//   mode: 'local' | 'online'; session: SessionView | null; onlineList: OnlineEntry[];
//   openOnline(): void; createRoom(input: { name: string; hostFaction: FactionId; clock: ClockSec }): Promise<void>;
//   openRoom(code: string): void; joinAs(name: string): Promise<void>; takeSeat(seat: PlayerId): Promise<void>;
//   setLobby(patch): void; startOnline(): void; leaveOnline(): void; forgetRoom(code: string): void
```

Rules:

- On creation the store reads `roomFromUrl()`; a code there opens that room (screen `join`, `lobby` or `match` once the session says which). Without one it starts on `home` as before.
- In online mode `viewer` is always `session.mySeat`; the `pass` screen is never used; `screen` is `match` for the whole match, mine or not. `run` and `tap` hand actions to `session.act` and do nothing when `myTurn` is false (selection still works so the player can look at their units while waiting).
- `last` (plan 2's effects feed) is set from `session.lastSteps` so effects play for actions that arrive from the other phone, filtered to the viewer's visible tiles as plan 2 already does. The digest is computed from the opponent's steps when the turn comes back.
- Each session change refreshes this phone's `OnlineEntry` and caches the record under `banners.online.<code>` (plan 2's `MatchRecord` with a new optional field `online: { code, seat }`) so Home can list it and the board can be shown with no connection.
- `goHome` and `leaveOnline` close the session; the match stays in the database. Home calls `remove` for each `dueForSweep` code, best effort, then forgets it.
- `applyUpdate` (plan 2: only on `home`) is also allowed on `onlineSetup`, `join` (when the session says `version`) and `lobby`; when an unfinished online entry exists it first asks (`notice: 'updateDuringOnline'`, confirmed with `applyUpdate(true)`).
- `createRoom` makes a code, calls `create`, retries with a new code up to 5 times on `'refused'`, and turns `'schema'` into `notice: 'serverOutOfDate'` and `'offline'` into `notice: 'needsConnection'`.

- [ ] **Step 1: Write the failing tests.** Use plan 2's `started()`/`deps()` helpers extended with a `fakeServer` and `openNet: async () => server.as('u0')`.

```ts
test('online entries are kept apart and swept only when finished and old', () => {
  const kv = memKv();
  rememberOnline(kv, entry('ABC234', { over: true, createdHere: true, updatedAt: 1_000 }));
  rememberOnline(kv, entry('DEF567', { over: false, createdHere: true, updatedAt: 1_000 }));
  rememberOnline(kv, entry('GHJ789', { over: true, createdHere: false, updatedAt: 1_000 }));
  expect(dueForSweep(listOnline(kv), 1_000 + 86_400_001)).toEqual(['ABC234']);
  expect(dueForSweep(listOnline(kv), 1_000 + 2_592_000_001)).toEqual(['ABC234', 'DEF567']);
});
test('a link with a room code opens that room', async () => { /* roomFromUrl -> 'ABC234' of a lobby room: screen 'join' */ });
test('host: create, wait, start, and play with no curtain', async () => {
  // createRoom: screen 'lobby'; guest joins through the fake; startOnline: screen 'match', viewer 0, mode 'online'
  // run endTurn: screen stays 'match' (never 'pass'), viewer stays 0, myTurn false
});
test('the waiting player can look but not act', async () => { /* guest store: tap selects own unit; run(move) changes nothing */ });
test('the other phone's moves arrive with effects', async () => { /* after host moves, guest store's last.seq rises and last.events has 'moved' only if visible */ });
test('rooms on stale rules say so', async () => { /* fake answers 'schema': notice 'serverOutOfDate', screen stays 'onlineSetup' */ });
test('an update asks first while an online match is unfinished', async () => {
  // with an unfinished entry on home: applyUpdate() sets notice 'updateDuringOnline' and does not apply; applyUpdate(true) applies once
});
test('reopening the game lists the online match and resumes it', async () => {
  // after two turns, a new store from the same kv: home lists the entry; openRoom(code): screen 'match', state hash equals the server's
});
```

Write each commented test out in full.

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `onlineList.ts` and the store changes.** `browserDeps().openNet` is `() => import('../net/firebaseNet').then(m => m.firebaseNet())`.
- [ ] **Step 4: Run them, and all of plan 2's store tests, and see them pass**, then commit:

```bash
git add src/app && git commit -m "Put online matches in the app store: no curtain, your own view, waiting states"
```

---

### Task 11: Online screens

**Files:**
- Create: `src/ui/screens/OnlineSetup.tsx`, `src/ui/screens/Lobby.tsx`, `src/ui/screens/Join.tsx`, `src/ui/screens/online.test.tsx`
- Modify: `src/ui/text.ts`, `src/ui/screens/{Home,Match,Result}.tsx`, `src/ui/panels/{Hud,Menu}.tsx`, `src/ui/App.tsx`, `src/ui/theme.css` **(plan 2)**

**Interfaces:**
- Consumes: the store from Task 10; `inviteLink`, `CLOCK_CHOICES`, `MAX_NAME`.
- Produces: the three screens and these strings in `text.ts` (exact wording):

| Key | Text |
|---|---|
| `playOnline` | Play online |
| `joinWithCode` | Join with a code |
| `needsConnection` | Online play needs a connection. Solo and pass-the-phone games work without one. |
| `notSetUp` | Online play is not set up in this build. |
| `serverOutOfDate` | Online play needs a server update before new matches can start. Try again later. |
| `clockLabel` | Turn clock |
| `clockOff` | Off |
| `clockMinutes` | `${n} min` |
| `createRoom` | Open a lobby |
| `roomCode` | Room code |
| `shareInvite` | Send the invite |
| `inviteText` | Join my Banners match |
| `copied` | Link copied |
| `waitingForGuest` | Waiting for the second player to join |
| `waitingForHost` | `Waiting for ${name} to start` |
| `start` | Start the match |
| `join` | Join |
| `noSuchRoom` | There is no match with that code. Check it and try again. |
| `roomFull` | That match already has two players. |
| `areYou` | `This match is being played by ${a} and ${b}. Are you one of them?` |
| `imName` | `I'm ${name}` |
| `newerVersion` | This match was started on a newer version of the game. Update to join it. |
| `olderVersion` | This match was started on an older version of the game and cannot be continued on this one. |
| `theirTurn` | `${name}'s turn` |
| `yourTurn` | Your turn |
| `reconnecting` | No connection. Your match is safe and will carry on when you are back online. |
| `dropped` | `${name} has lost their connection. The clock is paused.` |
| `droppedNoClock` | `${name} has lost their connection. The match will wait for them.` |
| `clockPaused` | Paused |
| `timeUp` | Time ran out, so the turn ended. |
| `desync` | Your phones disagree about the match, so it is paused. Make sure both phones have the latest version, then reopen the match. |
| `updateDuringOnline` | `Your match with ${name} is still going. If this update changes the rules, that match cannot continue. Update now?` |
| `onlineMatch` | `Online with ${name}` |

What each screen holds:

- **Home:** "Play online" and "Join with a code" under "New match". With no connection both are disabled and `needsConnection` shows beneath them; with no Firebase config, `notSetUp`. Online matches are listed with the other saves, marked `onlineMatch`, with "Continue" (or "See result"), and a remove button that forgets it on this phone (and deletes the room when created here and over).
- **OnlineSetup:** your name (default "Player 1", at most 16 characters), which faction you play, the turn clock as a row of choices (Off, 1 min, 2 min, 3 min, 5 min; 2 min selected), "Open a lobby".
- **Lobby:** the room code in large letters, "Send the invite" (the share sheet with `inviteText` and the link; without `navigator.share`, copy the link and show `copied`), the two seats with names and factions, the clock. The host can still change faction and clock; "Start the match" appears when both seats are filled. The guest sees the same, read-only, with `waitingForHost`.
- **Join:** a code field when opened from "Join with a code"; a name field and "Join" for a lobby; `areYou` with one `imName` button per absent seat for a match in progress; `noSuchRoom`, `roomFull`, `newerVersion` (with an "Update" button) or `olderVersion` as the session reports.
- **Match (online):** no curtain. The Hud shows `yourTurn` or `theirTurn`, and the clock as `m:ss` (or `clockPaused` with the dropped text). A thin banner shows `reconnecting`, `dropped`/`droppedNoClock`, or `timeUp` (for 4 seconds after a timeout ended your turn). End turn and every command are disabled when `myTurn` is false. `desync` shows as a sheet that blocks the board.
- **Menu (online):** Resign is available on either player's turn; "Back to home" says the match will wait.
- **Result:** unchanged, plus the room is forgotten from Home's list when the player taps "Home" and the match is over.

- [ ] **Step 1: Write the failing tests** (`online.test.tsx`, static markup, each screen given a store from Task 10's helpers):

```tsx
test('home offers online play, or says why not', () => { /* online() true: 'Play online' enabled; false: disabled and T.ui.needsConnection present */ });
test('setup offers the five clock choices with 2 min chosen', () => { /* five buttons, aria-pressed="true" on '2 min' */ });
test('the lobby shows the code and waits', () => { /* host: 'ABC234', T.ui.shareInvite, T.ui.waitingForGuest, no start button; after join: start button */ });
test('the join screen offers only absent seats', () => { /* Ann present, Ben absent: one button "I'm Ben" and none for Ann */ });
test('the match while waiting: their turn, a clock, and nothing to press', () => {
  // guest store after start: markup contains "Ann's turn", "2:00", End turn has disabled, no data-testid="pass" curtain, 127 data-hex
});
test('version and connection messages', () => { /* session phase 'version' newer: T.ui.newerVersion and an Update button; connected false: T.ui.reconnecting */ });
```

- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement the screens and the changes.** Every new button is at least 44 by 44 CSS pixels; layouts hold from 360 by 640 portrait to 915 by 412 landscape (plan 2's rules).
- [ ] **Step 4: Run `npm test`; all pass.** Then open `npm run dev` (it talks to the emulator: start `npm run emu` first) in two phone-sized windows and play two turns by hand.
- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the online screens: setup, lobby, join and the waiting states"
```

---

### Task 12: Two phones in two browsers, against the emulator

**Files:**
- Create: `src/browser/online.test.ts`
- Modify: `src/browser/harness.ts` **(plan 2)**, `src/browser/offline.test.ts` **(plan 2)**, `src/browser/coverage.test.ts` **(plan 2)**, `package.json`, `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: plan 2's `openApp(query, opts)`; it gains `opts.dist` (default `'dist'`) and `opts.context` (to open a second, separate browser context: a second phone with its own storage and so its own anonymous identity).
- Produces: script `"test:online": "vite build --mode emu --outDir dist-emu && firebase emulators:exec --only database,auth --project demo-banners \"cross-env BROWSER=1 EMULATOR=1 vitest run src/browser/online.test.ts\""`. The production `dist` is never built in emulator mode.

- [ ] **Step 1: Write the failing tests** (`online.test.ts`, gated with `describe.runIf(process.env.BROWSER === '1' && process.env.EMULATOR === '1')`):

```ts
test('two phones: lobby, invite, join, play, reload, resume', async () => {
  // Phone A (412 x 915): Home, "Play online", name "Ann", 2 min, "Open a lobby". Read the six-letter code from the page.
  // Phone B, own context: open "?room=<code>". Join screen: name "Ben", "Join". Both lobbies list Ann and Ben.
  // A: "Start the match". A shows "Your turn" and "2:00" or less; B shows "Ann's turn" and End turn disabled; neither page has the curtain.
  // A: move the warrior from -2,5 to -1,4, End turn. B: within 5 s shows "Your turn"; B's board has no [data-unit] at A's hidden tiles.
  // B: reload. B returns to the match (not Home), "Your turn", same Hud gold as before the reload.
  // A: close its page; B's banner shows "Ann has lost their connection" within 90 s (onDisconnect fires on socket close).
  // A: reopen "?room=<code>": A is back in the match, "Ben's turn", and B's banner clears.
  // B: Menu, Resign, confirm. Both pages show "Ann wins".
});
test('a second phone can take over a seat from a fresh browser', async () => {
  // start a match between A and B; close B; open a third context at "?room=<code>": "I'm Ben" is offered, tap it, the match shows "Your turn" or "Ann's turn" correctly
});
```

Add to plan 2's `offline.test.ts`: the solo flow records no request to any host containing `firebaseio.com` or `googleapis.com`. Add to `coverage.test.ts`: the workflow has a step running exactly `npm run test:online`.

- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:online`.
- [ ] **Step 3: Extend the harness and make them pass.** Fix in the app, not in the test, anything they find.
- [ ] **Step 4: CI.** Add `- run: npm run test:online` after plan 2's `npm run test:browser` step (Java and Playwright are both already installed by then).
- [ ] **Step 5: Run `npm test`, `npm run test:emu`, `npm run test:browser`, `npm run test:online`; all pass.** Commit:

```bash
git add -A && git commit -m "Test a whole online match in two browser phones against the emulator"
```

---

### Task 13: Docs, deploy and the two-phone check

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `src/version.ts` (`APP_VERSION` `'0.4.0'`)
- Create: `docs/online.md` (layout, rules summary, the traps below, how to run the emulator)

- [ ] **Step 1: Write the docs.** `docs/online.md` holds: the database layout from this plan; who may write what; why everything is a JSON string; why `actions` and `seats` may come back as arrays; that local `onValue` events fire before the server answers and again on a rollback; that rules changes must be deployed by hand and how the `SCHEMA` tripwire shows a missed deploy; the emulator namespace and the canaries; the iPhone storage split and seat takeover; never subscribe to a whole room; never compare phone clocks. `CLAUDE.md` gains three lines: run `npm run test:emu` before pushing anything touching `src/net`, `src/online` or the rules; after editing `database.rules.json` the controller deploys it; never deploy a `RULES_VERSION` bump while an online match is being played. `README.md`: how to play online.
- [ ] **Step 2: Run every suite**: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser`, `npm run test:online`. All pass.
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Document online play and its traps"
```

**Controller, after the final review and the owner's choice on merging (not a subagent's job):**

1. Make sure the Controller steps at the top are done: database instance, web app config committed in `src/net/firebaseConfig.ts`, anonymous sign-in on.
2. `npx firebase deploy --only database --project banners-game`, then the unauthenticated `curl` check. Deploy the rules before the site, so the new build never meets old rules.
3. Push `main` and watch the workflow run to green (it now runs `test:emu` and `test:online`).
4. In a phone-sized desktop browser and a second browser profile: create a room on the live site, join it, play two turns, reload both, finish with a resignation. Check the Firebase console that the room's actions are strings and `head/n` matches.
5. On the Android test phone over ADB (address it by serial with `-s`; other devices may be attached): open the invite link in Chrome, join a room created on the desktop, play a turn each way, then toggle airplane mode for 30 seconds mid-turn and back: the banner shows, the clock pauses on the other side, and the match carries on. Take screenshots of the lobby, a waiting state and the dropped banner, and show them to the owner directly in the conversation.
6. Ask the owner to play one full match with someone on an iPhone and an Android phone, invite sent from one to the other, with the 2 minute clock. Ask him to close the game once mid-match and reopen the link.
7. Write `docs/superpowers/plans/2026-11-18-plan-4-followups.md`: the outcome, the rulings made, and what carries into stage 3 (remote play: the clock-off match already waits for days; it needs the "text them" button and notifications).

---

## Plan 4 is done when

- `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:emu`, `npm run test:browser` and `npm run test:online` pass, locally and in the workflow.
- The live rules refuse an unauthenticated read and match `database.rules.json`.
- One phone opens a lobby and sends a link; a second phone opens it and joins; the two play a full live match to elimination or resignation with a working turn clock (design 9).
- Closing the browser mid-match and reopening the link resumes the match on both phones, and a dropped connection pauses the clock and loses nothing.
- Solo and pass-the-phone play still work in airplane mode and never contact Firebase.

## Assumptions to re-check after plans 2 and 3

Plan 2 (re-read the merged code, not the plan):

- `MatchRecord` in `src/app/record.ts` has the shape quoted in plan 2 Task 9, and can take an optional `online: { code; seat }` without breaking `restore`.
- The store is `createAppStore(deps)` on `zustand/vanilla` with `Deps`, `Screen`, `run`, `tap`, `viewer`, `last`, `digest`, `notice`, `goHome`, `applyUpdate` as in plan 2 Tasks 11 and 15. Online mode relies on `run` and `tap` being the only paths to an action, and on `applyUpdate` acting only on `home`.
- `browserDeps()` reads the URL inside a function (it already reads `?seed=`), so `?room=` fits beside it.
- The match screen calls `playerView(state, viewer)` and nothing else draws state; effects take `last` and filter by visible tiles.
- The Menu holds Resign with a confirm, and the Hud has room for a turn line and a clock.
- `src/browser/harness.ts` exposes `openApp(query, opts)` and serves `dist`; Task 12 adds `opts.dist` and `opts.context`.
- The deploy workflow has the steps plan 2 Task 16 lists; Task 2 and Task 12 edit it.
- `src/boundaries.test.ts` and `src/engine/purity.test.ts` exist as plan 2 Task 1 describes.
- Plan 2's global constraint about requests leaving the phone is amended as this plan's Global Constraints say.
- Whether plan 2 kept "a saved match from another rules version cannot be resumed": Task 1's bump to `RULES_VERSION` 2 relies on that rule to make old hot-seat saves fail politely.

Plan 3 (re-read when drafted):

- The AI's entry point. This plan assumes something adaptable to `chooseTurn(state, seat, level): Promise<Action[]>` that keeps no memory between calls and runs off the main thread. If it is stateful, a host handover mid-turn needs the AI's state in the database or a restart of the turn.
- Plan 3 will tune numbers, which changes the fingerprint in `src/engine/fingerprint.test.ts` and so `RULES_VERSION`. If plan 3 lands before plan 4, Task 1's version number is whatever comes next, not 2.
- Whether `MatchRecord.players[].kind` gains `'ai'` with a level, and how that maps to `seats/<s>/kind` and `level` here.
- Whether plan 3 adds a turn limit or a draw. If it does, `head` and the result screen need a draw outcome.
- The adaptive AI's remembered level lives on the phone; an online AI seat played by a stand-in host would use the stand-in's memory. Decide when AI seats are offered online (stage 4).
