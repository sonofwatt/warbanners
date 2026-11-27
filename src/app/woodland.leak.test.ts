// rules 11: no hidden information leaks in AI against AI play. After every step of every turn, for both players, the
// board effects, the digest, the player view and the AI input must hold no unit the viewer cannot see (nor its tile),
// and no enemy snare. A shot from a hidden unit may name the attacker's kind, never its tile. Built from the final
// review's leak check script, cut to fit a test run: one seed, a capped number of turns.
import { expect, test } from 'vitest';
import { createMatch, playerView } from '../engine';
import type { FactionId, MatchState } from '../engine';
import { runAiTurn } from '../ai/driver';
import { aiInputFor } from '../ai/input';
import { effectsFor, seenBy } from '../ui/board/effects';
import { hearingFor, soundFor } from '../ui/sound';
import { digestFor } from './digest';

const TURNS = 50;

function leaksIn(factions: [FactionId, FactionId], seed: number): { leaks: string[]; woodlandEvents: number; hiddenSeen: number } {
  let s: MatchState = createMatch({ seed, factions });
  const leaks: string[] = [];
  let woodlandEvents = 0;
  let hiddenSeen = 0;   // steps where some enemy unit was hidden from a viewer, so the check had something to guard
  for (let turn = 0; s.winner === null && turn < TURNS; turn++) {
    const p = s.current;
    const log = runAiTurn(s, { player: p, dial: 0.6, salt: seed * 7 + p });
    log.steps.forEach((step, i) => {
      const before = step.before;
      const after = i + 1 < log.steps.length ? log.steps[i + 1]!.before : log.state;
      for (const e of step.events) if (e.type === 'snared' || e.type === 'dashStrike' || e.type === 'ability') woodlandEvents += 1;
      for (const v of [0, 1] as const) {
        const seen = seenBy(before, after, v);
        const all = [...before.units, ...after.units];
        const hidden = all.filter((u) => u.owner !== v && !seen.seenUnits.has(u.id));
        const hiddenIds = new Set(hidden.map((u) => u.id));
        if (hiddenIds.size > 0) hiddenSeen += 1;
        const seenPos = new Set(all.filter((u) => seen.seenUnits.has(u.id)).map((u) => u.pos));
        const hiddenPos = new Set(hidden.map((u) => u.pos).filter((k) => !seenPos.has(k)));
        for (const f of effectsFor(step.events, before, after, seen.visible, seen.seenUnits, v, seen.visibleBefore)) {
          const j = JSON.stringify(f);
          if ('unit' in f && hiddenIds.has(f.unit)) leaks.push(`effect names a hidden unit: ${j} (viewer ${v})`);
          if (f.kind === 'lunge' && hiddenPos.has(f.from)) leaks.push(`effect starts on a hidden tile: ${j} (viewer ${v})`);
          if ('at' in f && hiddenPos.has(f.at) && f.kind !== 'burst') leaks.push(`effect at a hidden tile: ${j} (viewer ${v})`);
        }
        if (v !== before.current) {
          for (const l of digestFor(v, [{ before, after, events: step.events }])) {
            if (l.kind !== 'snareSprung' && hiddenPos.has(l.at)) leaks.push(`digest at a hidden tile: ${JSON.stringify(l)} (viewer ${v})`);
          }
        }
        const view = playerView(after, v);
        if ((view.snares ?? []).some((n) => n.owner !== v)) leaks.push(`view holds an enemy snare (viewer ${v})`);
        const input = JSON.stringify(aiInputFor(after, v));
        for (const n of after.snares ?? []) {
          if (n.owner !== v && input.includes(`"owner":${n.owner},"at":"${n.at}"`)) leaks.push(`AI input holds an enemy snare (viewer ${v})`);
        }
        for (const u of after.units) {
          if (u.owner !== v && !view.units.some((x) => x.id === u.id) && new RegExp(`"id":${u.id},"type":"${u.type}"`).test(input)) {
            leaks.push(`AI input holds unseen unit ${u.id} (viewer ${v})`);
          }
        }
        soundFor(step.events, hearingFor(before, after, v));   // must not throw on any Woodland event
      }
    });
    s = log.state;
  }
  return { leaks, woodlandEvents, hiddenSeen };
}

test.each([[['woodland', 'mongols']], [['spartans', 'woodland']], [['woodland', 'woodland']]] as [[FactionId, FactionId]][])(
  'rules 11: AI against AI, %j, leaks nothing hidden to either player', (factions) => {
    const { leaks, woodlandEvents, hiddenSeen } = leaksIn(factions, 3);
    expect(leaks.slice(0, 8)).toEqual([]);
    // the check had something to see: hidden enemies, and the Woodland side used what it has
    expect(hiddenSeen).toBeGreaterThan(0);
    expect(woodlandEvents).toBeGreaterThan(0);
  }, 60_000);
