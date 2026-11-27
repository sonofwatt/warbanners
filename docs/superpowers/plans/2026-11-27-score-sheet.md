# Score sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a score sheet per human seat on the result screen, one line per scoring item with its points, and a total.

**Architecture:** the existing replay in `src/app/tally.ts` also counts villages and factions wiped out; a pure
`scoreSheet` in `src/app/score.ts` turns the record, the final state and the tallies into lines; `Result.tsx`
renders one `ScoreSheet` per human seat. No engine or state change.

**Tech Stack:** React, TypeScript, vitest, Playwright browser suite.

**Spec:** `docs/superpowers/specs/2026-11-27-score-sheet-design.md`

## Global Constraints

- No em or en dashes anywhere (code, text, docs, commits); `src/noEmDash.test.ts` checks.
- The app reaches the engine only through `../engine` (or `../../engine`); `src/boundaries.test.ts` checks.
- No new fields in `Tally` (the stats store validates its keys); new counts go on `MatchTallies`.
- Every number is the spec's table: turn 20 per turn under 60; kill +10; loss -5; tile +1; village +40;
  treasure +30; city +10 per level above 1; road +25 per joined city and +150 when all joined; wiped +200;
  factor `round1(1 + (dial - 0.2) / 0.65)`, `LEVEL_DIAL` for fixed levels, `adapt.dial` for adaptive.

## Review Focus

- A match won by resignation: the winner's "Factions wiped out" is 0, the victory line still scores.
- A Mongol seat: no roads line at all.
- A losing human against the AI: victory line 0 with a "no victory" label, the difficulty still applies.
- A subtotal below 0 (many losses, nothing else): difficulty adds 0, total 0.
- A two-person match: two sheets, winner first, no difficulty line.

---

### Task 1: Count villages and factions wiped out in the replay

**Files:** Modify `src/app/tally.ts`; Test `src/app/tally.test.ts`

**Interfaces:**
- Produces: `MatchTallies.conquest: [Conquest, Conquest]`, `export interface Conquest { villages: number; wiped: number }`.

- [ ] Test `villages and wipes are counted from the events`: for seeds 1, 2, 5, 11, 42 of `randomPlayoutLog(seed, 60)`,
  `villages[p]` equals an independent count of `captured` events whose city id is absent from the state before,
  by `e.by`, and `villages[p] <= tallies[p].cities`; `wiped` of the winner is 1 when the last action is a
  capture and 0 otherwise.
- [ ] Test `a resign wipes out nobody`: `[{endTurn},{resign}]` gives `conquest` of `[{0,0},{0,0}]`.
- [ ] Run `npx vitest run src/app/tally.test.ts`: FAIL (no `conquest`).
- [ ] Implement: in the `captured` case, `before.cities.some(c => c.id === e.city)` false means a village; an
  `eliminated` event during a `capture` action credits `before.current`.
- [ ] Run again: PASS. Commit "Tally: villages captured and factions wiped out".

### Task 2: The score function

**Files:** Create `src/app/score.ts`, `src/app/score.test.ts`

**Interfaces:**
- Consumes: `MatchTallies` (Task 1), `MatchRecord`, `isConnected`, `FACTIONS`, `LEVEL_DIAL` from `src/ai/types`.
- Produces:
  ```ts
  export type ScoreKey = 'victory' | 'kills' | 'losses' | 'explored' | 'villages' | 'treasures' | 'cities' | 'roads' | 'wiped';
  export interface ScoreLine { key: ScoreKey; count: number; of?: number; best?: number; points: number }
  export interface ScoreSheet { seat: PlayerId; lines: ScoreLine[]; subtotal: number;
    difficulty: { level: AiLevel; factor: number; points: number } | null; total: number }
  export const SCORE: { turnLimit: 60; perTurn: 20; kill: 10; loss: -5; tile: 1; village: 40; treasure: 30; level: 10; road: 25; allRoads: 150; wiped: 200 };
  export function difficultyFactor(dial: number): number;
  export function scoreSheet(record: MatchRecord, state: MatchState, t: MatchTallies, seat: PlayerId): ScoreSheet;
  export function scoreSheets(record: MatchRecord, state: MatchState, t: MatchTallies): ScoreSheet[]; // human seats, winner first
  ```
  Counts: victory `count` = the round when the seat won, else 0; explored `of` = tiles on the map; cities `count`
  = cities held, `best` = highest level; roads `count` = cities joined, `of` = cities held minus the capital.

- [ ] Tests with a hand-built `MatchTallies` and a final state from `createMatch` edited in place: each line's
  points from the spec table; `difficultyFactor(0.2) === 1`, `(0.5) === 1.5`, `(0.85) === 2`, `(0.1) === 0.8`;
  the review-focus cases above (resign, Mongol, loss, negative subtotal, two humans); lines plus difficulty sum to
  the total.
- [ ] Run `npx vitest run src/app/score.test.ts`: FAIL. Implement. PASS. Commit "Score: a sheet from the match".

### Task 3: The sheet on the result screen

**Files:** Modify `src/ui/screens/Result.tsx`, `src/ui/text.ts` (a `score` block), `src/ui/theme.css`;
Test `src/ui/screens/stats.test.tsx`, `src/browser/stats.test.ts`

- [ ] Unit test: after `finishOne`, the result markup has `score-sheet-0` and `score-sheet-1`, the winner's first,
  each with `score-line-*` rows and a `score-total`, and no `score-difficulty`.
- [ ] Browser test (the existing resigned match against Easy AI): `score-sheet-0` shows a `score-total` equal to
  the sum of its row points, a `score-difficulty` row, and the Home button can be scrolled to and tapped; screenshot
  `result` with `SHOT_DIR`.
- [ ] Implement `ScoreSheet` as a `<table>` like the tally: caption with the name, rows label + small count +
  signed points, subtotal, difficulty, total in the winner colour (`var(--player)`), tabular digits.
- [ ] Run `npx vitest run` and `npm run test:browser -- src/browser/stats.test.ts`: PASS. Lint and typecheck.
  Commit "Result: the score sheet".
