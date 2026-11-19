import { describe, expect, test } from 'vitest';
import { applyAction, createMatch, distance, parseKey } from '../engine';
import type { Action, FactionId, GameEvent, HexKey, MatchState, PlayerId } from '../engine';
import { addCity, addUnit, blankMatch } from '../engine/testkit';
import { aiInputFor, viewKey } from './input';
import { planTurn } from './plan';
import { openVillage, riderRaid, spartanLine } from './scenarios';
import { LEVEL_DIAL } from './types';

interface Played { plan: Action[]; events: GameEvent[][]; end: MatchState }

// Plays the AI's plan for `me` on the real state, stopping before its endTurn: the position it ends its turn on.
function playTurn(s: MatchState, me: PlayerId, dial: number, seed: number): Played {
  const plan = planTurn(aiInputFor(s, me), { dial, seed, refused: [] }).actions;
  const events: GameEvent[][] = [];
  let end = s;
  for (const a of plan) {
    if (a.type === 'endTurn') break;
    const r = applyAction(end, a);
    if (!r.ok) throw new Error(`refused ${JSON.stringify(a)}: ${r.reason}`);
    end = r.state; events.push(r.events);
  }
  return { plan, events, end };
}

// One whole AI turn on the real match, the way Task 7's driver will play it: after each applied action
// the real view is compared with the one the plan expected, and a refusal (an unseen blocker) or any
// difference (a newly seen enemy) asks for a new plan, at most MAX_REPLANS times; then the turn ends.
const MAX_REPLANS = 6;
function aiTurn(s: MatchState, dial: number, seed: number): MatchState {
  const me = s.current;
  const refused: Action[] = [];
  for (let replan = 0; replan <= MAX_REPLANS; replan++) {
    const plan = planTurn(aiInputFor(s, me), { dial, seed: seed + replan, refused });
    let stale = false;
    for (const [i, a] of plan.actions.entries()) {
      const r = applyAction(s, a);
      if (!r.ok) { refused.push(a); stale = true; break; }
      s = r.state;
      if (a.type === 'endTurn' || s.winner !== null) return s;
      if (viewKey(aiInputFor(s, me)) !== plan.expect[i]) { stale = true; break; }
    }
    if (!stale) break;
  }
  const r = applyAction(s, { type: 'endTurn' });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

function passiveTurn(s: MatchState): MatchState {
  const r = applyAction(s, { type: 'endTurn' });
  if (!r.ok) throw new Error(r.reason);
  return r.state;
}

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const dist = (a: HexKey, b: HexKey): number => distance(parseKey(a), parseKey(b));

// Normal must hold for at least 8 of the 10 seeds, hard for all 10.
function holdsAtBothLevels(make: () => MatchState, me: PlayerId, check: (p: Played) => boolean): void {
  const passes = (dial: number) => SEEDS.filter((seed) => check(playTurn(make(), me, dial, seed))).length;
  expect(passes(LEVEL_DIAL.normal)).toBeGreaterThanOrEqual(8);
  expect(passes(LEVEL_DIAL.hard)).toBe(10);
}

describe('each faction plays to its character', () => {
  test('Spartans close the line rather than charge', () => {
    holdsAtBothLevels(spartanLine, 0, ({ plan, end }) => {
      const hoplites = end.units.filter((u) => u.id === 0 || u.id === 1);   // the two in the line, not one trained this turn
      const enemies = end.units.filter((u) => u.owner === 1);
      return !plan.some((a) => a.type === 'attack')
        && hoplites.length === 2 && dist(hoplites[0]!.pos, hoplites[1]!.pos) === 1
        && hoplites.every((h) => enemies.every((e) => dist(h.pos, e.pos) >= 2));
    });
  });

  test('Mongol riders strike and ride away', () => {
    holdsAtBothLevels(riderRaid, 1, ({ plan, events, end }) => {
      const strike = plan.findIndex((a) => a.type === 'attack' && a.target === '0,0');
      if (strike < 0) return false;
      const hit = events[strike]!.find((e) => e.type === 'attacked');
      const archer = end.units.find((u) => u.owner === 1 && u.type === 'horseArcher');
      return hit?.type === 'attacked' && hit.damage === 5 && hit.counter === 0
        && plan.slice(strike + 1).some((a) => a.type === 'move')
        && archer !== undefined && dist(archer.pos, '0,0') >= 3;
    });
  });

  test('Mongol riders spread to an open village', () => {
    holdsAtBothLevels(openVillage, 1, ({ end }) => end.units.some((u) => u.owner === 1 && u.pos === '2,-2'));
  });

  // The brief puts the rider on 0,1, where spartanLine's first hoplite stands, so both ways of making room
  // are checked: the hoplite steps back to 0,2 beside the city, or the rider takes its place.
  test.each([
    ['the hoplite steps back to 0,2', '0,2'],
    ['the rider takes the hoplite\'s place', null],
  ] as const)('Spartans keep a garrison in a threatened city (%s)', (_name, hopliteTo) => {
    const threatened = (): MatchState => {
      const s = spartanLine();
      s.units = s.units.filter((u) => u.type !== 'scout');
      const first = s.units.find((u) => u.pos === '0,1')!;
      if (hopliteTo === null) s.units = s.units.filter((u) => u !== first);
      else first.pos = hopliteTo;
      s.units.push({ ...structuredClone(s.units.find((u) => u.type === 'horseman')!), id: s.nextUnitId++, pos: '0,1' });
      for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
      return s;
    };
    holdsAtBothLevels(threatened, 0, ({ end }) => end.units.some((u) => u.owner === 0 && u.pos === '0,3'));
  });
});

// A Spartan army at home, the enemy city known, nothing in sight: it marches, keeping a garrison.
function spartanMarch(): MatchState {
  const s = blankMatch();
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  addUnit(s, 'warrior', 0, 0, 3);                 // the garrison
  addUnit(s, 'hoplite', 0, -1, 3);
  addUnit(s, 'hoplite', 0, 0, 2);
  addUnit(s, 'hoplite', 0, 1, 2);
  for (const p of s.players) { p.explored = Object.keys(s.tiles).sort(); p.gold = 0; }
  return s;
}

// A strong army three tiles from an enemy city held by one hurt Warrior; the rival has no gold to train.
function weakCity(attacker: FactionId): MatchState {
  const s = blankMatch({ factions: attacker === 'mongols' ? ['spartans', 'mongols'] : ['mongols', 'spartans'] });
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  addUnit(s, 'warrior', 0, 0, 3, { hp: 5 });     // the lone defender, at half health
  const army = attacker === 'mongols' ? 'horseArcher' : 'hoplite';
  for (const [q, r] of [[-1, 1], [0, 0], [1, 0]] as const) addUnit(s, army, 1, q, r);
  for (const p of s.players) { p.explored = Object.keys(s.tiles).sort(); p.gold = 0; }
  s.current = 1;
  return s;
}

describe('the army leaves home and finishes what it starts', () => {
  test('a Spartan army with nothing threatening home marches on the enemy city, as a group, keeping a garrison', () => {
    const TURNS = 3;
    const start = spartanMarch();
    const hopliteIds = start.units.filter((u) => u.type === 'hoplite').map((u) => u.id);
    const startD = new Map(start.units.map((u) => [u.id, dist(u.pos, '0,-3')]));
    const marches = (dial: number, seed: number): boolean => {
      let s = start;
      for (let t = 0; t < TURNS; t++) s = passiveTurn(aiTurn(s, dial, seed * 100 + t));
      const hoplites = s.units.filter((u) => hopliteIds.includes(u.id));
      return hoplites.length === 3
        && hoplites.every((h) => dist(h.pos, '0,-3') <= startD.get(h.id)! - 2)          // each two tiles nearer
        && hoplites.every((h) => hoplites.some((o) => o !== h && dist(h.pos, o.pos) === 1))  // still a group
        && s.units.some((u) => u.owner === 0 && u.pos === '0,3');                      // and a garrison at home
    };
    expect(SEEDS.filter((seed) => marches(LEVEL_DIAL.normal, seed)).length).toBeGreaterThanOrEqual(8);
    expect(SEEDS.filter((seed) => marches(LEVEL_DIAL.hard, seed)).length).toBe(10);
  });

  // The bound is in own turns. Measured on seeds 0 to 9: Mongols take the city on turn 3 at every level;
  // Spartans (move 1, three tiles away) on turn 4, once 6 at normal. Easy Spartans often attack alone
  // and the defender heals, which is easy's job; easy is not asserted here.
  test.each([['mongols', 4], ['spartans', 6]] as const)('%s with a clear advantage strike the lone defender and take the city', (attacker, bound) => {
    const takes = (dial: number, seed: number): number | null => {
      let s = weakCity(attacker);
      const defender = s.units.find((u) => u.owner === 0)!;
      let struck = false;
      for (let t = 1; t <= bound; t++) {
        s = aiTurn(s, dial, seed * 100 + t);
        const hp = s.units.find((u) => u.id === defender.id)?.hp ?? 0;
        struck ||= hp < defender.hp;               // the passive defender only ever heals
        if (s.winner !== null) return struck && s.winner === 1 ? t : null;
        s = passiveTurn(s);
      }
      return null;
    };
    const turns = (dial: number) => SEEDS.map((seed) => takes(dial, seed));
    expect(turns(LEVEL_DIAL.normal).filter((t) => t !== null).length).toBeGreaterThanOrEqual(8);
    expect(turns(LEVEL_DIAL.hard).every((t) => t !== null)).toBe(true);
  });
});

// AI against AI on a real map, both seats at `dial`, until a winner or `maxRounds` rounds.
function aiMatch(seed: number, factions: [FactionId, FactionId], dial: number, maxRounds: number): { winner: PlayerId | null; rounds: number } {
  let s = createMatch({ seed, factions });
  let rounds = 0;
  while (s.winner === null && rounds < maxRounds) {
    s = aiTurn(s, dial, seed * 1000 + rounds * 2 + s.current);
    if (s.current === 0) rounds++;
  }
  return { winner: s.winner, rounds };
}

describe('matches between two AIs end', () => {
  // Measured: seed 7, Spartans first, at hard, ends in round 13 (Mongols win).
  test('at hard on a seeded map, the match reaches a winner within the measured bound', () => {
    expect(aiMatch(7, ['spartans', 'mongols'], LEVEL_DIAL.hard, 20).winner).not.toBeNull();
  }, 60_000);

  // Measured on seeds 1 to 8 with both seatings: at normal every match ends by round 31; at hard 15 of
  // the 16 end by round 42, and seed 5 with the Mongols first is still going at round 80 (the Spartans
  // hold three cities).
  describe.runIf(process.env.SLOW === '1')('many seeds (SLOW=1)', () => {
    const seatings: [FactionId, FactionId][] = [['spartans', 'mongols'], ['mongols', 'spartans']];
    const ended = (dial: number, bound: number): number => [1, 2, 3, 4, 5, 6, 7, 8]
      .flatMap((seed) => seatings.map((f) => aiMatch(seed, f, dial, bound).winner !== null)).filter(Boolean).length;
    test('at normal, all 16 matches end within 40 rounds', () => {
      expect(ended(LEVEL_DIAL.normal, 40)).toBe(16);
    }, 600_000);
    test('at hard, at least 15 of 16 matches end within 60 rounds', () => {
      expect(ended(LEVEL_DIAL.hard, 60)).toBeGreaterThanOrEqual(15);
    }, 600_000);
  });
});
