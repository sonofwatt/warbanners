import { describe, expect, test } from 'vitest';
import { addCity, addUnit, blankMatch, randomPlayout, setTile } from './testkit';
import { playerView } from './vision';
import { isHidden, isVeiled } from './woodland';
import { assertNoWoodlandKeys } from './woodland.testkit';
import type { MatchState } from './types';

const match = (): MatchState => blankMatch({ factions: ['woodland', 'mongols'], unexplored: true });
const seen = (s: MatchState, id: number): boolean => playerView(s, 1).units.some((u) => u.id === id);

describe('Woodland cover', () => {
  test('a Skirmisher in a forest is unseen from 2 tiles and seen from 1', () => {
    const s = match(); setTile(s, 2, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 2, 0);
    const horse = addUnit(s, 'horseman', 1, 0, 0);
    expect(seen(s, sk.id)).toBe(false);
    horse.pos = '1,0';
    expect(seen(s, sk.id)).toBe(true);
  });
  test('the same Skirmisher on a field 2 tiles away is seen', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 2, 0); addUnit(s, 'horseman', 1, 0, 0);
    expect(seen(s, sk.id)).toBe(true);
  });
  test('a Spartan Hoplite in a forest 2 tiles away is seen', () => {
    const s = blankMatch({ unexplored: true }); setTile(s, 2, 0, { terrain: 'forest' });
    const h = addUnit(s, 'hoplite', 0, 2, 0); addUnit(s, 'horseman', 1, 0, 0);
    expect(seen(s, h.id)).toBe(true);
  });
  test('an enemy city next to a forest Woodland unit reveals it', () => {
    const s = match(); setTile(s, 2, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 2, 0); addCity(s, 1, 3, 0);
    expect(seen(s, sk.id)).toBe(true);
  });
  test('the owner always sees it, and isHidden follows the tile', () => {
    const s = match(); setTile(s, 2, 0, { terrain: 'forest' });
    const sk = addUnit(s, 'skirmisher', 0, 2, 0);
    expect(playerView(s, 0).units.some((u) => u.id === sk.id)).toBe(true);
    expect(isHidden(s, sk)).toBe(true);
    sk.pos = '1,0';
    expect(isHidden(s, sk)).toBe(false);
  });
  test('isVeiled: through the named stamp and not after; absent is never veiled', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 1, 0, { veilUntil: 5 });
    s.stamp = 5; expect(isVeiled(s, sk)).toBe(true);
    s.stamp = 6; expect(isVeiled(s, sk)).toBe(false);
    const plain = addUnit(s, 'skirmisher', 0, 0, 1);
    expect(isVeiled(s, plain)).toBe(false);
  });
  test('a veiled unit on a field is hidden', () => {
    const s = match(); const sk = addUnit(s, 'skirmisher', 0, 2, 0, { veilUntil: 5 }); addUnit(s, 'horseman', 1, 0, 0);
    expect(seen(s, sk.id)).toBe(false);
  });
  test.each([1, 2, 3])('hash compat: a Spartan and Mongol playout holds no Woodland key (seed %i)', (seed) => {
    assertNoWoodlandKeys(randomPlayout(seed, 8));
  });
});
