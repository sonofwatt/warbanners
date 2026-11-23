# Phalanx brace (rules 7, folded in): design and build brief

Decided by David on 2026-11-22. Joins rules 7 on `connected-cities` with hunker, before the branch merges; the rules 7
balance runs are redone with it in.

## The rule

- A Hoplite is **braced** when at least two other Hoplites of the same owner stand next to it (distance 1). Only
  units with the `phalanx` trait count (today only the Hoplite has it), as in a real phalanx. The existing phalanx
  defence bonus (+1 per adjacent phalanx mate, up to +2) is unchanged and still applies.
- **Defence:** a braced Hoplite has +2 defence when a unit with the `chain` trait (Knight, Khan's Guard) attacks it.
  It adds to the defence it has when attacked (after `defenceOf`, alongside the hunker bonus), before terrain cover
  multiplies. It applies only when the Hoplite is the defender against a chain attacker, never to its counter-attack
  or its own attacks, and never against other attackers.
- **Chain stop:** when a chain unit kills a braced Hoplite, that kill grants no extra attack and costs the chain unit
  no chain health (`chainKillCost`), because the health cost is the price of the extra attack. Bracing is judged at
  the moment of the attack, before the Hoplite is removed. The kill still counts as a kill everywhere else (deeds,
  hero traits, stats, census). If one attack kills several units (splash), only the braced Hoplite kills lose their
  chain grant; the others still grant theirs.
- Numbers in `CONFIG` (for example `brace: { mates: 2, def: 2 }`), never inline. Add an `on` flag only if the
  stage 1 provenance tests need it, as hunker did.

Ruling by the controller: no chain health cost on a braced kill. Cheap to change.

## What changes

- Engine: a `bracedAgainst(s, target, attacker)` helper (or similar) in `src/engine/combat.ts`, used by the
  attacked-defence and the chain grant. Tests: two mates braced, one mate not, enemy Hoplites and non-Hoplite
  neighbours do not count, +2 only against a chain attacker, counter-attack unchanged, cover multiplies after,
  braced kill gives no extra attack and no health cost, unbraced kill unchanged, splash case, Khan's Guard too.
- Combat preview: whatever the UI shows for expected damage must use the same defence, so a preview against a braced
  Hoplite matches the result.
- AI: its damage estimates must use the same defence (reuse the engine function, never a copy). Its chain planning
  must not count an extra attack after killing a braced Hoplite. Keep any planner change small. The AI must not get
  worse: run the existing AI tests; re-pin fingerprints and speed digests only where the rule change explains it,
  and say which in the report.
- UI: the unit card of a braced Hoplite shows a "Braced" line (text in `src/ui/text.ts`), like the "Hunkered" line.
  No new board mark, no sound.
- Rules: `docs/rules/stage1-rules.md` phalanx trait row and the chain row, plus a changelog line under rules 7;
  `docs/rules/stage2-rules.md` section 9 (chain health cost) gets one sentence. `whatsNew` for 0.5.0 mentions it.
- No em or en dashes anywhere (project CLAUDE.md).
