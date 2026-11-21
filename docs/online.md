# Online play

How live online matches work in Warbanners, what the database rules allow, and the traps that cost time to find. Read this before touching `src/net`, `src/online`, `database.rules.json` or `firebase.json`.

Solo and pass-the-phone play never load `src/net` and never contact Firebase. A request leaves the phone only after the player opens online play, opens an invite link, or continues an online match. Requests go to `banners-game-default-rtdb.firebaseio.com`, `identitytoolkit.googleapis.com` and `securetoken.googleapis.com`.

## Where the code is

- `database.rules.json`, `firebase.json`, `.firebaserc`: the rules, the emulator and the project (`banners-game`).
- `src/netReady.ts`: the public API key and `netReady()`. No imports, no URL, safe in the main chunk.
- `src/net`: everything that touches Firebase. `firebase.ts` (lazy app, auth, emulator wiring), `firebaseConfig.ts` (the rest of the public web config), `net.ts` (the `Net` interface), `patches.ts` (the exact multi-path writes, shared by the real net, the fake and the rules tests), `firebaseNet.ts`, `fakeNet.ts` (in memory, same contract), `contract.ts` (the contract tests, run against both), `sessionKit.ts` (session test helpers; nothing in the app imports it).
- `src/online`: pure logic, no Firebase and no UI. `wire.ts` (constants, room types, codes, links, encoding, defensive reads), `sync.ts` (apply the remote list, compare hashes, rebuild), `clock.ts`, `host.ts`, `aiSeat.ts`, `session.ts` (one open room).
- `src/app/onlineList.ts`: this phone's list of online matches and its cached copy of each.

## Database layout

Everything lives under `rooms/<code>`. Times are server milliseconds.

```
meta     { createdAt (written once, = now), creatorId, hostId, schema: 1, rulesVersion, build,
           clock: 0 | 60 | 120 | 180 | 300 (seconds, 0 is off), hostFaction: 'spartans' | 'mongols',
           phase: 'lobby' | 'playing' | 'over' }
seats    { "0": Seat, "1": Seat }
           human: { uid, name, kind: 'human', rules }     rules = the phone's RULES_VERSION when it took the seat
           ai:    { uid: 'ai_<s>', name, kind: 'ai', level, salt, adapt: { dial, trend } }
members  { <uid>: seat number }       reverse index, so the rules can find a writer's seat
presence { <uid>: { on: boolean, at } }
match    { settings: JSON string, startedAt }    written once
head     { n, seat, hash, at, turnAt, paused }
actions  { "0": JSON string, "1": ... }          append only
checks   { <n>: hash }                           written with each endTurn, once
snap     { n, hash, state: JSON string }         replaced with each endTurn and at the end
desync   { <uid>: { n, hash, build } }
```

`head.n` is the number of actions so far. `head.seat` is whose turn it is. `head.hash` is `hashState` after the last action (the opening hash when `n` is 0). `head.at` is the server time of the last append, `head.turnAt` the server time the current turn began, `head.paused` the milliseconds of drop pause credited to this turn. A room code is 6 characters; invite links carry it as `?room=<code>`.

## Who may write what

The rules never trust a client. Every leaf that may be written has its own `.write`; no grant sits at `rooms/$code`, `head` or `seats/$s` except the delete-only grant on the room, so nothing cascades to a child it did not mean to open. Reads need a signed-in user. Everything else is closed.

- **Create.** One update writes `meta`, `seats/0` and `members/<creator>` together. `meta.createdAt` must equal `now`, `schema` must be 1 (see the tripwire below), the creator is also host and seat 0, and `phase` is `lobby`.
- **Lobby.** Only the host changes `clock` and `hostFaction`, and only in the lobby. Any member may write `meta/hostId` to a human seat's uid, its own included, so a guest can make itself host (this is how the stand-in host works; see "AI seats online"). A guest takes seat 1 only when it is empty and writes its own `members` entry in the same update, with a `rules` equal to `meta.rulesVersion`. The host may fill a seat with an AI (`uid` is `ai_<s>`, with `name`, `level`, `salt`, `adapt` all present and no `rules`). Names are 1 to 16 characters.
- **Start.** Only the host, only from `lobby`, only once both seats exist. One update writes `match`, the opening `head` (`n` 0, `seat` 0, `at` and `turnAt` equal to `now`, `paused` 0) and `meta/phase` as `playing`.
- **Actions.** `actions/<n>` is written once, as a string up to 512 characters, only while `phase` is `playing`, only at index `head.n`, and only together with `head.n` moving to `n + 1`. The writer must be the current seat's human, or the host when the current seat is an AI, or any member for a timeout `endTurn` (see below). Two phones writing the same index: the second is refused.
- **What an action may contain.** Anything that holds `player` or a backslash is refused unless it is exactly the writer's own resign, `{"player":<seat>,"type":"resign"}`. This closes forging a resign for the opponent (task 4 added this rule beyond the plan). A waiting member may resign for their own seat at any time.
- **End of turn.** An `endTurn` must hand the turn to the other seat (`1 - seat`), set `head.turnAt` to `now` and `head.paused` to 0 (task 4 added this rule too; it stops a player keeping the turn or handing over a spent clock). A resign moves `head.seat` and `head.turnAt` only when `meta/phase` becomes `over`.
- **Both of those two rules assume two seats.** `1 - seat` and the "resign moves the turn only when it ends the match" clause are wrong for three or more players. Stage 4 (more players) must revisit them.
- **Timeout.** With a clock on, any member may append `{"type":"endTurn"}` once `now >= head.turnAt + clock * 1000 + head.paused`. The server's `now` decides, never a phone's clock.
- **Head pins.** Every `head` field is pinned: a write that does not move `head.n` must leave the field as it was. When `head.n` moves, `hash` is free, `at` must be `now`, `seat` and `turnAt` follow the `endTurn` rules above, and `paused` resets to 0. Every head write also needs a signed-in writer. This is why a phone cannot edit the clock, the turn or the hash on its own.
- **Return credit.** A dropped phone's presence is written off by the server (`onDisconnect`). When the current player returns, `head/paused` may grow, in the same update that writes `presence/<uid>/on: true`, by at most the time the server saw them away: the increase is at most `now - presence.at` and at most `now - head.turnAt`, the whole `paused` is at most 180 000 ms (`DROP_PAUSE_MS`), only for the same turn (`turnAt` unchanged), and only for the current seat's own uid. `paused` goes back to 0 only in the update that moves `turnAt` (the `endTurn`).
- **Checks and snap.** `checks/<n>` is written once, as `head.n` moves, and must be 16 hex characters. `snap` may be replaced by any member; its `n` cannot pass `head.n`.
- **Desync.** A member writes `desync/<own uid>`. Their own entry, or any non-member's entry, may be cleared by any member. The room must exist (a write under an unknown code would leave a node nothing can delete).
- **Presence.** Each user writes only their own, and only for a room that exists.
- **Members.** Only your own uid, only for the seat that already holds your uid (a join or a takeover). A takeover deletes the old uid's entry in the same update.
- **Takeover.** While `playing`, a signed-in non-member may replace a human seat's uid with their own, write `members/<own uid>`, delete `members/<old uid>` and `desync/<old uid>`, and set `seats/<s>/rules` to the room's `rulesVersion`, only when `presence/<old uid>/on` is not `true`.
- **Phase.** Moves `lobby` to `playing` only through the start update, and `playing` to `over` by any member.
- **Delete.** The room may be deleted by its creator, or by anyone once it has been idle 30 days (`ROOM_IDLE_TTL_MS`, measured from `head.at`, or `meta.createdAt` for a room never started). A room with no `meta` may be deleted by anyone.

`src/net/rulesMirror.test.ts` guards the constants the rules mirror (`SCHEMA`, the clock choices, `DROP_PAUSE_MS`, `ROOM_IDLE_TTL_MS` and the size limits). The rules set no limit on the number of actions; `MAX_ACTIONS` (100 000) is the client's own bound on what it reads, and a longer or malformed list stops the match on both phones with a sentence (`recordUnreadable`), never silently. `src/net/fakeNet.ts` is a hand copy of the rules; a SHA-256 of `database.rules.json` is pinned beside it, so any rules change fails the fake's tests until the copy has been looked at.

## Why every engine value is a JSON string

Firebase drops `null` and empty arrays, which would change what the engine hashes. So actions, settings and snapshots are stored as JSON strings, and actions are encoded with the engine's `canonical()` (sorted keys). The rules can then match exact strings such as `{"type":"endTurn"}`, and `decodeAction` refuses anything that is not already canonical.

Even so, Firebase turns an object with dense integer keys into an array. `actions`, `seats` and `checks` may all come back as arrays, or as plain objects when a key is missing. `readActions`, `normalizeRoom` and the readers in `src/net/read.ts` accept both.

## Every read is untrusted

Every value from the database goes through `normalizeRoom`, `readActions`, `decodeAction` or `decodeSettings` before use. The client never assumes the rules were deployed, or that a phone running another build wrote what the rules let through.

## Local events, rollbacks and offline writes

- `onValue` fires for the phone's own write immediately, before the server has answered, and fires again with the old value if the server refuses the write (a rollback). A reading is not a fact until the write behind it has been answered. The session holds a disagreeing reading while a write is pending, and every answer to a pending write re-runs the follow step.
- The SDK holds writes made while offline and sends them on reconnect; it does not reject them. `append` may stay pending as long as the phone is offline. Every other `Net` call answers `'offline'` after `NET_TIMEOUT_MS` (10 seconds). A held write that lands late is checked by the rules like any other: a held move that lost its index is refused and the phone rebuilds from the database.
- `.info/connected` turns true before fresh data arrives. So a return reads `head` and its own presence once with `get()` (from the server, not the cache) before deciding anything. A phone that has just reconnected takes no clock decision until its return write (`present`) has landed.
- On a return the database wins: the board shows what was stored, nothing is deleted or overwritten.
- A phone whose tab slept (a locked phone, a hidden page whose timers were held back) can wake with a dead socket that the SDK still believes in, and a cache that still shows it present. So a tick more than 5 seconds after the one before (`SLEPT_MS`) starts the return first, exactly as a reconnect does, and no clock decision is taken until the return write has landed. Without this the phone could end its own turn as "time ran out" while it was owed the drop pause. The page becoming visible again (`visibilitychange`, through `Deps.onVisible`) counts the same: the store calls `Session.wake()`, which starts the return at once rather than on the next tick, which a hidden tab's throttled timers may hold back for a minute.
- Continue on Home with no connection shows the board cached on this phone and opens the session as usual; it shows the reconnecting line until the connection is back, then the database wins. Without a cached board this build can play (none, or one cached under other rules), it says online play needs a connection.

## Reopening a match: the snapshot is never trusted

`snap`, `checks/<n>` and `head/hash` are all written by the phone that ended the turn, and the rules cannot run the engine, so a hand-written client could write a doctored state with hashes that agree with it. A reopening phone therefore uses the snapshot only to draw the board at once (`fromSnapshot` in `sync.ts`), with `verifying` set: no move, no resign, no clock decision and no AI turn while it is. It then replays every action from the opening (`replay`), 20 actions at a time with a pause between, so no task on the main thread runs long. Measured in Chromium on a 3 000-action match: about 2.2 s in all with the longest chunk 14 to 23 ms, and about 7 s with the longest chunk 62 to 74 ms with the CPU slowed four times. If the replay is refused anywhere or disagrees with the snapshot or any check, the replay's state is the match, the phone reports a desync against the record, and it never withdraws that report for this record, whatever the head hash says. A rebuild after a lost race (a list that no longer extends this phone's, `diverged` from `follow`) goes through the same chunked replay (`rebuildFrom`), with `verifying` set while it runs; a newer reading that settles the match first discards it, and it waits while a write of this phone's is still unanswered.

## Finished, on this phone and on the server

A winning move or a resign shows the result at once, but Home's entry for the match is marked finished only once the write has landed (`sending` false), and the result screen says "Sending..." until then. The sweep and Remove delete only rooms made here whose entry is finished, so a room whose last write never reached the server is never deleted from this phone.

## A desync on both phones

The phone that finds the disagreement writes `desync/<uid>` and shows the desync card. The other phone sees the entry in the room (`blocked`) and shows the same card. On both, moves and resigning wait until the phones agree (the card says so), and Home is the way out.

## Rules 4: the use-item action

Rules 4 (heroes and treasures) adds one action, `{"type":"useItem","unit":<id>}`, which drinks a carried draught. `database.rules.json` did not change for it, and nothing needed to. The rules special-case only the exact `endTurn` and `resign` strings; any other action that contains `player` or a backslash is refused, and `useItem` contains neither, so it is accepted like a move or an attack (a string of at most 512 characters, written once at `head.n`). Versions are compared as values: a seat's `rules` must equal the room's `meta/rulesVersion`, whatever number that is, so moving `RULES_VERSION` from 3 to 4 needs no edit to the rules. A rules 3 room cannot be continued on 0.4.0: a phone on rules 4 sees a room whose `rulesVersion` is 3 as a different rules version and writes nothing to it, and the same holds the other way round. Finish or leave such rooms before updating. The deploy rule below still applies to any later rules change, and never to a `RULES_VERSION` bump while an online match is being played.

## Rules 5: the chain kill cost

Rules 5 (0.4.1) makes a chain unit pay health for each kill (docs/rules/stage2-rules.md, section 9). It adds no action and
no field to the wire, so `database.rules.json` did not change. A rules 5 phone cannot share a match with a rules 4 one: a
seat's `rules` must equal the room's `meta/rulesVersion`, so a rules 4 room cannot be continued on 0.4.1, and a rules 5
room is refused by a 0.4.0 phone. Finish or leave rules 4 rooms before updating, and never deploy this bump while an online
match is being played.

## Rules are deployed by hand

Editing `database.rules.json` changes nothing live until it is deployed:

```
npx firebase deploy --only database --project banners-game
curl -s https://banners-game-default-rtdb.firebaseio.com/rooms.json     # expect Permission denied
```

The controller does this, never a subagent. Deploy the rules before the site, so a new build never meets old rules. Never deploy a `RULES_VERSION` bump while an online match is being played: the rules compare every seat's `rules` with the room's `rulesVersion`.

The `SCHEMA` tripwire shows a missed deploy. `meta.schema` is written by the client from `SCHEMA` in `src/online/wire.ts` and checked against the same literal in the rules. Rules older than the code refuse a create, and the app reports that online play needs a server update (`serverOutOfDate`) instead of failing quietly. A room whose `schema` is newer than the phone's is treated like a newer rules version: nothing is written, not even presence.

Do not run `firebase init` in the repo. It rewrites `firebase.json` and `database.rules.json`.

## The emulator

- Project id `demo-banners`, so the emulators never touch a real project. Database on port 9010, auth on 9110, hub 4410, logging 4510, no UI.
- The app's database URL in emulator mode is `http://127.0.0.1:9010?ns=demo-banners-default-rtdb`. The namespace is the project id plus `-default-rtdb`, and the project id used to load the rules in `rules.emu.test.ts` is deliberately different, so loading rules there cannot hide a broken app namespace.
- In Node (Vitest) `usingEmulator()` throws unless `EMULATOR=1`, so no test can reach the live database. A browser build uses the emulator when built with `VITE_EMULATOR=1` (`.env.emu`, used by `vite build --mode emu --outDir dist-emu`), or in `vite dev` unless `VITE_USE_PROD=1`.
- Canaries. `src/net/rules.emu.test.ts` opens with a test that an unauthenticated read is refused, so a run with no rules loaded cannot pass, and has a second that the delete grant does not open the children. `src/net/firebase.emu.test.ts` has a canary that a signed-in write to the root is refused in the app's own namespace, which fails if the namespace has no rules. If either is red, fix the setup before trusting any other emulator test.
- Suites: `npm run test:emu` (the whole unit suite plus the `*.emu.test.ts` files), `npm run test:online` (two phone-sized Chromium instances play a match against an emulator build in `dist-emu`), `npm run test:browser` (no emulator). Emulator suites gate on `EMULATOR === '1'`; `src/net/emulatorCoverage.test.ts` fails if CI stops running them. CI needs Java for the database emulator.
- The machine runs out of memory when too much is left running. Run one emulator suite at a time and never leave `npm run emu` running.

## iPhone storage and seat takeover

A phone's identity is an anonymous Firebase user kept in IndexedDB. On an iPhone the Safari tab and the home-screen app have separate storage, so the same person opening the invite link in the other one is a new user. Safari's seven-day storage purge and cleared site data do the same. The rules therefore allow a takeover: while the match is playing, a new user may take a human seat whose owner is absent. The join screen offers "I'm <name>" for each absent seat; taking it deletes the old user's membership and `desync` entry and the match carries on. The same browser with its storage intact comes straight back with no questions.

This phone's own list of online matches lives under `warbanners.online.*` and is kept apart from the saves (`warbanners.saves.v1`, `warbanners.save.<id>`). It keeps at most 20 matches. Making room drops finished matches first, then the oldest unfinished one, and the player is told when an unfinished one goes; the room itself stays on the server. A write that fails is reported, never silent.

## Three rules for the code

- **Never subscribe to a whole room.** Listen to `meta`, `seats`, `members`, `presence`, `head`, `desync` and `actions` separately. Read `match`, `snap`, `checks`, and the fresh `head` and own presence on a return, once with `get()`. A whole-room listener re-downloads the whole action list on every move.
- **Never compare two phones' clocks.** Every deadline is computed from server timestamps plus `.info/serverTimeOffset`, and the rules check the server's `now`.
- **Nothing outside the engine changes a `MatchState`.** Every change, local or received, goes through `applyAction`.

## AI seats online

An AI seat records its `level`, its `salt` (a number fixed when the host fills the seat) and its `adapt` (`{ dial, trend }`) inside the seat, in the lobby, and not afterwards. The host's phone plays the AI turns. If the host drops, the other phone steps in after 30 seconds (`HOST_AWAY_MS`); a host that never wrote presence is measured from the room's creation (`meta.createdAt`). Every phone that plays an AI turn takes the dial and salt from the seat, so two phones plan the same move for the same state. The adaptive dial moves once, as the turn starts, and is sent with the turn's first action (the rules let the host write `seats/<s>/adapt` only together with an append for that seat). A phone that takes over midway reads the stored dial, which already moved. If a think fails, the host retries and then passes the turn.

## Trust model: what the rules accept by design

This is a game for a family. These gaps are known and left open.

- **Fog is honour-based.** Every phone downloads the whole action list, so a modified client could read what the fog hides.
- **A drop can be faked for a credit.** The server cannot tell a real drop from a claimed one. The current player may write their own presence off, wait, and come back with a return credit, stretching any turn by up to 3 minutes (`DROP_PAUSE_MS`).
- **Any member may set `phase` to `over`** and end a match with no winner.
- **Abandoned lobbies.** A lobby whose creator never returns stays until the 30-day idle sweep or a manual delete.
- **One anonymous user per fresh browser.** Each fresh browser or cleared storage adds one anonymous user to the project. Harmless on the free plan.
- **No lobby leave and no AI-seat clear in stage 1.** A guest who comes back on a new identity before the match starts finds the room full; once it has started, a takeover lets them back in. The host cannot turn an AI seat back to empty.
- **The turn handover rules assume two seats** (see "Who may write what"). They are correct today and must be reopened for stage 4.
- **The host may move an AI seat's `adapt`** with any append, not only its own.
- A resign may move `head.seat` and `head.turnAt` only with `phase` going to `over`; harmless with two seats.
- **The creator may delete the room at any time**, mid-match included.
- **Anyone holding the room code may take an absent player's seat** while the match is playing (see "iPhone storage and seat takeover"), and then play or resign for it. The room code is the credential. A seat taken this way has no stored presence, so it gets no drop credit: a player who comes back on a new identity after their deadline has their turn ended at once.
- **A member can freeze a match** with a desync entry, or with an action the engine refuses. No server can run the engine; the other phone shows the desync card.
- **A snapshot or a check can be forged** by a hand-written client (it writes `snap`, `checks/<n>` and `head/hash` itself). A phone never trusts them: it replays the actions and reports a desync (see "Reopening a match").
- **Any signed-in user may write their own `presence`** under any existing room, member or not.
- **There is no App Check**, so anyone with the public config can sign in anonymously and create rooms.

## One-time Firebase setup (F1 to F6)

The project `banners-game` exists on the free plan. None of these steps has been done yet: the controller runs them with the owner's yes after the final review. Each ends with a check.

- **F1. Register the web app.** `npx firebase apps:create WEB "Warbanners" --project banners-game`, then `npx firebase apps:sdkconfig WEB <appId> --project banners-game`. Put `apiKey` in `src/netReady.ts` and the rest in `src/net/firebaseConfig.ts`, then commit. These values are public by design; the rules make them safe. Do this before F3, or `deploy --only auth` makes a "Default Web App" of its own. Check: the build no longer says online play is not set up.
- **F2. Create the default database in `us-central1`** (permanent). `database:instances:create` cannot, so run `firebase init database` in an empty scratch folder outside the repo and pick `us-central1`, then delete the folder. Check: `npx firebase database:instances:list --project banners-game` lists `banners-game-default-rtdb`.
- **F3. Enable anonymous sign-in.** `npx firebase deploy --only auth --project banners-game` (it reads `firebase.json`). Check: `curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=<apiKey>" -H 'Content-Type: application/json' -d '{"returnSecureToken":true}'` returns an `idToken`. If it answers `ADMIN_ONLY_OPERATION` or `OPERATION_NOT_ALLOWED`, enable Anonymous in the console (Authentication, Sign-in method).
- **F4. Deploy the rules.** `npx firebase deploy --only database --project banners-game`.
- **F5. Check they are live.** `curl -s https://banners-game-default-rtdb.firebaseio.com/rooms.json` prints a permission denied error. Repeat F4 and F5 after every change to the rules file.
- **F6. Stay on the free plan.** No billing account, no Functions (Spark: 1 GB stored, 10 GB a month downloaded, 100 connections at once). The two slow leaks above are accepted.

Restricting the browser API key to `sonofwatt.github.io` and `127.0.0.1` in the Google Cloud console is optional hardening.
