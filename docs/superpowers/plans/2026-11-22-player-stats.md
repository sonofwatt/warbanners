# Player Names and Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember player names per phone and record per-name stats for every finished match, with a Stats screen and a per-match table on the Result screen.

**Architecture:** A pure `src/app/tally.ts` replays a finished `MatchRecord` and counts engine events per seat. `src/app/stats.ts` stores stat lines and recent names in a `KeyValue`, and sums lines under filters. One store subscription records each finished match once. New `Stats` screen; small edits to Home, Setup, OnlineSetup, Join and Result.

**Tech Stack:** React, TypeScript, zustand vanilla store, Vitest, Playwright browser suites.

**Spec:** `docs/superpowers/specs/2026-11-22-player-stats-design.md`

## Global Constraints

- No em or en dashes anywhere (code, copy, commits). `src/noEmDash.test.ts` checks.
- The app imports the engine only through `../engine`. No engine change, no `RULES_VERSION` change.
- No storage access at module load.
- Storage keys: `warbanners.stats.v1`, `warbanners.names.v1`. Caps: 1000 lines, 2000 counted ids, 8 names.
- Online opponent details are dropped 30 days (30 * 86400000 ms) after the match ended.
- All user-visible text goes in `src/ui/text.ts`.
- Home change is one Stats button line, nothing else.

## Review Focus

- A finished match seen many times (resume, reopened result, online view firing on every update) is counted once. Test in Task 3.
- Storage that throws on write: recording fails quietly, the match screen still reaches Result. Test in Task 2 and Task 3.
- Malformed or foreign JSON in either key: reads return empty, never throw. Test in Task 2.
- An online match whose winning write is still sending is not counted until it lands. Test in Task 3.
- Two pass-the-phone players with the same name: two lines, a win and a loss, under that name. Test in Task 2.

---

### Task 1: Per-seat tallies from a record

**Files:** Create `src/app/tally.ts`, test `src/app/tally.test.ts`.

**Interfaces:**
- Produces: `interface Tally { dealt: number; taken: number; kills: number; deaths: number; cities: number; heroes: number; treasures: number }`; `interface MatchTallies { tallies: [Tally, Tally]; rounds: number; winner: PlayerId | null }`; `matchTallies(settings: MatchSettings, actions: readonly Action[]): MatchTallies` (replays from `createMatch`, stops at a refused action).

- [ ] Tests: a fresh match is all zeros, round 1, no winner; for `randomPlayoutLog(seed, 40)` over several seeds, `kills[0] === deaths[1]`, `kills[1] === deaths[0]`, `taken[0] === dealt[1]`, and dealt totals equal the sum of `attacked.damage + counter` and `splashed.damage` over a replay; winner and rounds match `replay`; a resign at the end gives the other seat the win.
- [ ] Run `npx vitest run src/app/tally.test.ts`: FAIL, then implement per the spec's counting rules, then PASS.
- [ ] Commit.

### Task 2: Stats storage, names and filters

**Files:** Create `src/app/stats.ts`, test `src/app/stats.test.ts`.

**Interfaces:**
- Consumes: `Tally` (Task 1), `KeyValue` (`./saves`), `AiLevel`.
- Produces:
  - `type MatchKind = 'computer' | 'pass' | 'online'`
  - `interface StatLine { match: string; at: number; name: string; kind: MatchKind; faction: FactionId; ai: AiLevel | null; won: boolean; rounds: number; tally: Tally; opponent: { name: string; faction: FactionId; tally: Tally } | null }`
  - `readLines(kv, now): StatLine[]` (newest first, prunes online opponents older than 30 days)
  - `isCounted(kv, match): boolean`
  - `recordLines(kv, match: string, lines: StatLine[], now): boolean` (adds to `counted` even when `lines` is empty; false if storage refused)
  - `forgetPlayer(kv, name): void` (drops its lines and its recent name; keeps counted ids)
  - `recentNames(kv): string[]`, `rememberNames(kv, names: string[]): void` (skips blanks, `T.ui.playerOne`, `T.ui.playerTwo` and AI names are not passed by callers; newest first, deduped case-sensitively, at most 8)
  - `interface Filter { kind: MatchKind | 'all'; faction: FactionId | 'all'; ai: AiLevel | 'any' }`
  - `interface Summary { played; wins; losses; winRate: number | null; streak; bestStreak; avgDealt: number | null; avgTaken: number | null; kills; deaths; cities; heroes; treasures; avgRounds: number | null; favourite: FactionId | null }`
  - `summarize(lines: StatLine[], name: string, filter: Filter): Summary`; `filtered(lines, name, filter): StatLine[]`; `playerNames(lines, kv): string[]` (names with lines, most recent first)
- [ ] Tests: round trip; malformed JSON in both keys reads empty; a throwing `setItem` returns false and leaves reads working; caps (1001st line drops the oldest; 9th name drops the oldest); 30-day prune of online opponents only; streaks (W W L W W W gives streak 3, best 3); favourite faction tie goes to most recent; filters by kind, faction and AI level; same-name pass match gives one win and one loss; `forgetPlayer` removes lines and name but `isCounted` stays true.
- [ ] Run, fail, implement, pass, commit.

### Task 3: Record finished matches from the store

**Files:** Modify `src/app/store.ts`; test `src/app/stats.store.test.ts`.

**Interfaces:**
- Consumes: Tasks 1 and 2; `soloSeat`.
- Produces: `linesFor(record: MatchRecord, mode: 'local' | 'online', mySeat: PlayerId | null, at: number): StatLine[]` exported from `src/app/stats.ts`; AppState gains `statLines: StatLine[]`, `openStats(): void`, `forgetPlayer(name: string): void`; `Screen` gains `'stats'`. `startMatch` calls `rememberNames` with human names; `createRoom` and `joinAs` remember their name.
- Recording: `store.subscribe` after creation. When `state.winner !== null`, `record` set, the id not in an in-memory set nor `isCounted`, and (online) `online.sending !== true` and `viewer !== null`: compute lines and `recordLines`. Wrapped in try/catch.
- [ ] Tests: AI match won by resign records one `computer` line with the AI level; pass match records two lines; going Home and resuming a finished save does not add lines; a throwing storage still reaches `result`; `startMatch` remembers typed names but not `Player 1`; `forgetPlayer` updates `statLines`; online via `linesFor(..., 'online', 1, ...)` gives one line for seat 1 with `ai` set when seat 0 is an AI seat.
- [ ] Online sending guard: test in `src/app/store.online.test.ts` style with the fake net, that a winning online action records once after the write lands.
- [ ] Run `npx vitest run src/app`, commit.

### Task 4: Screens

**Files:** Create `src/ui/screens/Stats.tsx`, `src/ui/screens/NameChips.tsx`; modify `App.tsx` (route), `Home.tsx` (one button), `Setup.tsx`, `OnlineSetup.tsx`, `Join.tsx`, `Result.tsx`, `text.ts`, `theme.css`; tests in `src/ui/screens/stats.test.tsx`.

- `NameChips({ names, onPick, exclude })`: buttons `data-testid="name-chip"`, hides the name already in the other field.
- Setup: name 1 starts as `recentNames[0] ?? ''`; chips under each human name field. OnlineSetup and Join: same for their one field.
- Stats: `data-testid="stats"`; player chips `stats-player`; filter chips `stats-kind-*`, `stats-faction-*`, `stats-ai-*`; tiles with `data-testid="stat-<key>"`; Recent list `stats-recent`; Forget `stats-forget` then `stats-forget-yes`; empty state `stats-empty`; Home button `stats-home`.
- Result: table `data-testid="result-tally"` with both names and rows dealt, kills, deaths, cities, heroes, treasures, from `matchTallies` (memoized).
- [ ] Tests (jsdom): Stats empty state; with seeded lines shows the right played and win rate, filters change them, Forget removes the player; Setup prefills name 1 and a chip fills name 2; Result shows the tally table.
- [ ] Run `npx vitest run src/ui`, commit.

### Task 5: Browser test and screenshots

**Files:** Create `src/browser/stats.test.ts` gated with `describe.runIf(process.env.BROWSER === '1')`.

- [ ] Play a match against the Easy AI with name "Ana", resign from the Menu, check Result shows the tally table, go Home, open Stats, check 1 played and 0 won; reload and check still 1 played; New match shows "Ana" prefilled. Save screenshots of Result, Stats and Setup to the scratchpad.
- [ ] `npm test`, `npm run test:browser`, `npm run test:emu` (store online code touched). Commit and push.
