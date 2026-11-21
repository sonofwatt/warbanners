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
  const rider = addUnit(s, 'horseman', 1, 0, 0, { mp: 6 }).id;
  const scout = addUnit(s, 'scout', 0, 2, 0).id;
  return { state: finish(s), rider, scout };
}

export function spartanLine(): MatchState {
  const s = base(0);
  addUnit(s, 'hoplite', 0, 0, 1);
  addUnit(s, 'hoplite', 0, 2, 0);
  addUnit(s, 'scout', 0, 1, -1);
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
