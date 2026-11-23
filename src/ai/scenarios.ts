// Small hand-built positions the AI tests share. Test support, not game code.
import type { MatchState } from '../engine';
import { visibleTiles } from '../engine';
import { addCity, addUnit, blankMatch, setTile } from '../engine/testkit';

function base(current: number): MatchState {
  const s = blankMatch();
  addCity(s, 0, 0, 3);
  addCity(s, 1, 0, -3);
  s.current = current;
  return s;
}

function finish(s: MatchState): MatchState {
  for (const p of s.players) p.explored = [...visibleTiles(s, p.id)].sort();
  return s;
}

export function hiddenScout(): { state: MatchState; rider: number; scout: number } {
  const s = base(1);
  const rider = addUnit(s, 'horseman', 1, 0, 0, { mp: 5 }).id;
  const scout = addUnit(s, 'scout', 0, 2, 0).id;
  return { state: finish(s), rider, scout };
}

export function spartanLine(): MatchState {
  const s = base(0);
  addUnit(s, 'hoplite', 0, 0, 1);
  addUnit(s, 'hoplite', 0, 2, 0);
  // A Watchful Scout on a mountain sees 3 tiles, as every Scout did before rules 7, so both riders stay in view.
  addUnit(s, 'scout', 0, 1, -1, { heroTraits: ['watchful'] });
  setTile(s, 1, -1, { terrain: 'mountain' });
  addUnit(s, 'horseman', 1, 0, -3);
  addUnit(s, 'horseArcher', 1, 1, -3);
  return finish(s);
}

export function riderRaid(): MatchState {
  const s = base(1);
  addUnit(s, 'warrior', 0, 0, 0);
  addUnit(s, 'horseArcher', 1, 0, -2, { mp: 6 });
  return finish(s);
}

export function openVillage(): MatchState {
  const s = base(1);
  setTile(s, 2, -2, { village: true });
  addUnit(s, 'horseman', 1, 0, -1, { mp: 6 });
  return finish(s);
}

export function lureFromCity(): MatchState {
  const s = base(1);
  addUnit(s, 'warrior', 0, 0, -2);
  addUnit(s, 'horseman', 1, 0, -3, { mp: 6 });
  return finish(s);
}

export function hopelessCharge(): MatchState {
  const s = base(1);
  addUnit(s, 'hoplite', 0, 0, 0);
  addUnit(s, 'horseman', 1, 0, -1, { hp: 3, mp: 6 });
  return finish(s);
}

// A Mongol rider beside a Spartan Warrior in the open: no village or city where a lure would pull it, and free
// ground to ride back to. A safe lure.
export function safeLure(): MatchState {
  const s = base(1);
  addUnit(s, 'horseman', 1, 0, 0, { mp: 6 });
  addUnit(s, 'warrior', 0, 1, 0);
  return finish(s);
}

// A Mongol Warrior carrying a Battle draught beside a full Spartan Warrior on a field. One attack leaves the
// target at 4; a second, drunk for, finishes it.
export function draughtFinish(): MatchState {
  const s = base(1);
  addUnit(s, 'warrior', 1, 0, 0, { item: 'draught' });
  addUnit(s, 'warrior', 0, 1, 0);
  return finish(s);
}

// A Spartan Hoplite at 4 of 15 health three tiles from two Mongol Horsemen (within their reach), its home city behind
// it; a Scout sees the riders. One step back takes the Hoplite out of reach.
export function woundedHoplite(): MatchState {
  const s = base(0);
  s.players[0]!.techs.push('bronze');
  addUnit(s, 'hoplite', 0, 0, 1, { hp: 4 });
  addUnit(s, 'scout', 0, 0, -1);                       // beside both riders: since rules 7 a Scout sees 1 tile (was 1,0)
  addUnit(s, 'horseman', 1, 0, -2);
  addUnit(s, 'horseman', 1, 1, -2);
  for (const p of s.players) p.gold = 0;
  return finish(s);
}

// A Mongol Horse Archer that cannot move, with two targets in range: a Spartan Warrior at 2 health (a kill) and a full
// Hoplite (3 damage).
export function killOrChip(): MatchState {
  const s = base(1);
  s.players[1]!.techs.push('riding');
  addUnit(s, 'horseArcher', 1, 0, -1, { mp: 0 });
  addUnit(s, 'warrior', 0, -1, 1, { hp: 2 });
  addUnit(s, 'hoplite', 0, 1, 0);
  return finish(s);
}

// A Spartan Piper between a Hoplite and an Archer, a Mongol Horseman two tiles off that could reach both next turn.
// A taunt turns its blow onto the Hoplite.
export function pipersTaunt(): MatchState {
  const s = base(0);
  s.players[0]!.techs.push('bronze', 'hunting');
  addUnit(s, 'piper', 0, 0, 1);
  addUnit(s, 'hoplite', 0, -1, 1);
  addUnit(s, 'archer', 0, 1, 1);
  addUnit(s, 'horseman', 1, 0, -1);
  for (const p of s.players) p.gold = 0;
  return finish(s);
}
