import { expect, test, vi } from 'vitest';
import { legalActions, playerView } from '../engine';
import { addCity, addUnit, blankMatch } from '../engine/testkit';
import { indexActions, marksFor } from './interaction';
import type { Selection } from './interaction';

// rules 6: no unit carries pathfinder since rules 8, so this gives the Scout the trait back to check the fog step mark.
// Alone in its file because vi.mock binds a whole file.
vi.mock('../engine/data/units', async (orig) => {
  const m = await orig<typeof import('../engine/data/units')>();
  return { UNITS: { ...m.UNITS, scout: { ...m.UNITS.scout, traits: [...m.UNITS.scout.traits, 'pathfinder'] } } };
});

const unitSel = (id: number): Selection => ({ kind: 'unit', id, armed: null, askLure: null });

test("a pathfinder's step into the fog is marked as a move that ends the turn", () => {
  const s = blankMatch({ unexplored: true });
  addCity(s, 0, 0, 4); addCity(s, 1, 0, -4);
  const scout = addUnit(s, 'scout', 0, 0, 0);
  s.players[0]!.explored = ['-1,0', '-1,1', '0,-1', '0,0', '0,1', '1,-1', '1,0'].sort();
  const ix = indexActions(legalActions(s));
  const m = marksFor(unitSel(scout.id), playerView(s, 0), ix);
  const fog = (ix.moves[scout.id] ?? []).filter((k) => !s.players[0]!.explored.includes(k));
  expect(fog.length).toBeGreaterThan(0);
  for (const k of fog) expect(m[k]).toBe('moveEnds');
  expect(m['1,0']).toBe('move');
});
