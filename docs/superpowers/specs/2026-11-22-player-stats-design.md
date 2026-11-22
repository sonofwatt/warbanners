# Player names and stats (draft, waiting on David)

Status: brainstorming. Nothing here is approved yet.

## Request

Each phone remembers the names entered at setup and offers them next time, and records stats per player name,
filterable by kind of match (computer, pass-the-phone, online), and likely by faction and AI level. Per phone
(localStorage), no accounts or sync.

## Findings

- Every match record keeps its full action list. At match end the app can replay it through `applyAction` and count
  stats from the engine's own events (`attacked` with damage and counter, `splashed`, `died`, `captured`,
  `heroTrait`, `treasure`). No rule changes.
- Each match has a stable id (local uuid, or the room code online). Counted ids are remembered, so resume, reload
  or reopening a result never counts a match twice. Resigns end the match and are counted.
- Store one small line per player per finished match, not running totals, so any filter is a re-count. About 200 KB
  per thousand matches.
- Setup starts blank today; online setup and join have a name field too.

## Proposed stat list

Matches, wins, losses, win rate, current and longest win streak, average damage dealt and taken per match, total
kills and deaths, cities captured, heroes made, treasures claimed, average match length in rounds, favourite faction.

## Proposed screen

A Stats button in Home's button row under New match (one line in Home). Stats screen: player chips, filter chips
(match kind, faction, AI level), stat tiles, a short Recent list.

## Open questions for David

1. Is the stat list right?
2. Pass-the-phone: each name gets its own line from its own seat; blank default names are not recorded?
3. Online: record only this phone's player; the opponent's name is a label in Recent, no profile?
4. Names: prefill name 1 with the last used name, recent names as tap chips under each field (online too); a name
   can be forgotten from Stats, deleting its stats?
