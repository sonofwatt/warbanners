# Player names and stats

Status: approved by David on 2026-11-22 (answers relayed by the controller session). Built on branch `player-stats`.

## Why

Families pass one phone around and play the computer or each other. The phone should know who they are, so setup
is quicker, and keep score, so there is something to beat next time. Per phone only: no accounts, no sync.

## Goals

- Names entered at setup (local, online setup, join) are remembered and offered next time.
- Every finished match is recorded once per player on this phone, and a Stats screen shows the totals.
- Stats filter by kind of match (computer, pass-the-phone, online), by faction and by AI level.
- The end-of-game screen shows both sides' numbers for that match.

## Non-goals and anti-goals

- No accounts, no cloud, no sharing of stats between phones.
- No change to the rules, the engine or `RULES_VERSION`. Nothing is added to the online wire or database rules.
- A match must never count twice (resume, reload, reopening a result, the online view firing again).
- Storage access only inside functions the app calls, never at module load.
- Recording must never break a match: a refused or full storage loses the stat line, not the game.

## David's decisions

1. The stat list below is right.
2. Pass-the-phone: each player gets stats, even default names such as "Player 1".
3. Online: the phone's own player gets running stats. The opponent's numbers for that match are kept with the match,
   shown at the end of the game and in the Recent list, and may be deleted after 30 days.
4. Name 1 is prefilled with the last name used; recent names show as tap chips under each name field (online too);
   a name can be forgotten from the Stats screen, which deletes its stats.

## Stats

Per player name, over the lines that pass the filters:

- matches played, wins, losses, win rate;
- current and longest win streak (in time order);
- average damage dealt and average damage taken, per match;
- total kills and total deaths;
- cities captured;
- heroes made (a unit reaching hero);
- treasures claimed;
- average match length in rounds;
- favourite faction (most played; a tie goes to the most recent).

## Approaches

- **Replay the finished record (chosen).** When a match is over, replay its action list from `createMatch` with
  `applyAction` and count the events. One pure function, the same for local and online, works on resume and on a
  match finished before this feature shipped but still saved. Costs one replay per finished match, the same work a
  save repair already does.
- Count events as they happen in `commit`. Cheaper, but the AI turn, the online view and resume each need their own
  hook, and a match resumed from a save would miss what came before. Rejected.
- Add counters to the engine state. Changes the rules version and the hash, and the engine is meant to stay pure
  game rules. Rejected.

## How the numbers are counted

`matchTallies(record)` replays the record and returns a tally per seat. For each accepted action, owners are looked
up in the state before the action:

- `attacked`: the attacker's owner deals `damage`, the target's owner deals `counter`;
- `splashed`: damage dealt by the player whose turn it is;
- `died`: a death for the unit's owner and a kill for the other player;
- `captured`: a city for `by`;
- `heroTrait` with `hero: true`: a hero for the unit's owner;
- `treasure`: a treasure for the player whose turn it is.

Damage taken is the other side's damage dealt. Rounds are `roundOf` the final state. Chain self-damage is not
counted. A resign is a loss for the resigning seat (the engine already sets the winner).

## Storage

Key `warbanners.stats.v1`: `{ lines: StatLine[], counted: string[] }`.

- A `StatLine` is one player in one match: match id, end time, name, kind (`computer`, `pass`, `online`), own
  faction, AI level of the opponent or null, won, rounds, own tally, and `opponent: { name, faction, tally } | null`.
- `counted` holds every match id already recorded, so a forgotten player's matches are not re-recorded when an old
  result is reopened. Capped at 2000 ids, oldest dropped.
- At most 1000 lines; the oldest go first. Around 300 bytes a line.
- Online lines drop `opponent` 30 days after the match ended (checked whenever stats are read or written). The line,
  its result and the phone player's own tally stay.

Key `warbanners.names.v1`: recently typed names, newest first, at most 8. AI seat names are never stored. Blank names
stored as their default ("Player 1") are recorded in stats but not offered as chips.

Reads never throw; anything malformed is skipped.

## When a match is recorded

One store subscription: whenever the store's state has a record with a winner, and online the session is no longer
sending (the server holds the end), and the id is not yet counted, the lines are written.

- Local against the computer: one line, the person's seat, kind `computer`, AI level set.
- Local pass-the-phone: two lines, one per seat, kind `pass`, each with the other as opponent.
- Online: one line for this phone's seat, kind `online`; AI level set when the other seat is an online AI seat.

## Screens

- **Home**: one Stats button in its own line under the online buttons. Kept to one line so it merges with the
  Settings menu work.
- **Stats** (new): player chips, filter chips (match kind, faction, AI level), stat tiles, a Recent list (last 10
  in the filter, each with the result, opponent, faction, rounds and both sides' damage and kills when known), and
  Forget with a confirm step, like Delete on Home. An empty state when nothing is recorded yet.
- **Setup, Online setup, Join**: name 1 (or the online name) prefilled with the last name used; chips of recent names
  under each name field; tapping one fills that field.
- **Result**: a small table of both sides' damage, kills, deaths, cities, heroes and treasures for this match,
  computed from the record.

## Left to the builder

Exact copy, chip styling within the existing theme, and test names.
