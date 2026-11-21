import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { abilityTargets } from './abilities';
import { attackTargets } from './combat';
import { canUseItem, useItemRefusal } from './items';
import { unitAt, unitById } from './state';
import { addUnit, blankMatch, give, must, rngFor, setTile } from './testkit';
import type { Action } from './types';

const drink = (unit: number): Action => ({ type: 'useItem', unit });

describe('the Battle draught', () => {
  test('a draught gives one more attack this turn and is gone', () => {
    const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught' });
    addUnit(s, 'defender', 1, 1, 0);
    const first = must(applyAction(s, { type: 'attack', unit: u.id, target: '1,0' }));
    expect(unitById(first, u.id)).toMatchObject({ attacks: 0, item: 'draught' });
    expect(attackTargets(first, u.id)).toEqual([]);
    const r = applyAction(first, drink(u.id)); const t = must(r);
    expect(unitById(t, u.id)).toMatchObject({ attacks: 1, item: null });
    expect(r.ok && r.events).toEqual([{ type: 'usedItem', unit: u.id, item: 'draught' }]);
    expect(attackTargets(t, u.id)).toEqual(['1,0']);
    expect(must(applyAction(t, { type: 'attack', unit: u.id, target: '1,0' })).units.length).toBeGreaterThan(0);
  });

  test('drinking is refused for a fresh unit, an empty hand, a Camp and a siege unit that moved', () => {
    const s = blankMatch();
    const ok = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught' });
    const fresh = addUnit(s, 'warrior', 0, 1, 0, { item: 'draught', fresh: true });
    const empty = addUnit(s, 'warrior', 0, 2, 0);
    const camp = addUnit(s, 'camp', 0, 3, 0, { item: 'draught' });
    const siege = addUnit(s, 'catapult', 0, -1, 0, { item: 'draught', moved: true });
    const theirs = addUnit(s, 'warrior', 1, -2, 0, { item: 'draught' });
    expect(useItemRefusal(s, ok.id)).toBeNull();
    expect(useItemRefusal(s, fresh.id)).toBe('unit is too new');
    expect(useItemRefusal(s, empty.id)).toBe('nothing to use');
    expect(useItemRefusal(s, camp.id)).toBe('cannot attack');
    expect(useItemRefusal(s, siege.id)).toBe('cannot attack');
    expect(useItemRefusal(s, theirs.id)).toBe('not your unit');
    expect(useItemRefusal(s, 999)).toBe('no such unit');
    for (const bad of ['3', null, undefined, 'constructor']) expect(useItemRefusal(s, bad)).toBe('bad item use');
    for (const id of [fresh.id, empty.id, camp.id, siege.id, theirs.id, 999]) expect(applyAction(s, drink(id)).ok).toBe(false);
    expect(applyAction(s, { type: 'useItem', unit: 'constructor' } as unknown as Action)).toEqual({ ok: false, reason: 'bad item use' });
    expect(canUseItem(s, ok.id)).toBe(true);
    // a siege unit that has not moved may drink
    siege.moved = false;
    expect(canUseItem(s, siege.id)).toBe(true);
  });

  test('drinking alone does not stop a unit resting', () => {
    const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught', hp: 4 });
    addUnit(s, 'warrior', 1, 4, 0);
    const t = must(applyAction(s, drink(u.id)));
    expect(unitById(t, u.id)).toMatchObject({ moved: false, acted: false });
    const next = must(applyAction(t, { type: 'endTurn' }));
    expect(unitById(next, u.id)!.rested).toBe(true);
  });

  test('legalActions lists useItem only when canUseItem, right after the claim entry', () => {
    const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught' });
    const fresh = addUnit(s, 'warrior', 0, 2, 0, { item: 'draught', fresh: true });
    const listed = legalActions(s).filter((a) => a.type === 'useItem');
    expect(listed).toEqual([drink(u.id)]);
    expect(canUseItem(s, fresh.id)).toBe(false);
    for (const a of legalActions(s)) if (a.type === 'useItem') expect(applyAction(s, a).ok).toBe(true);
  });

  test('a carried draught is lost with its unit', () => {
    const s = blankMatch(); const v = addUnit(s, 'warrior', 0, 0, 0, { item: 'draught' });
    const k = addUnit(s, 'knight', 1, 1, 0); s.current = 1;
    const killed = must(applyAction(s, { type: 'attack', unit: k.id, target: v.pos }));
    expect(unitById(killed, v.id)).toBeUndefined();
    expect(killed.units.some((x) => x.item !== null)).toBe(false);
  });

  test('a draught found this turn is drunk only on a later turn of its owner', () => {
    const s = blankMatch({ unexplored: true });
    setTile(s, 1, 0, { treasure: true });
    const u = addUnit(s, 'warrior', 0, 1, 0);
    addUnit(s, 'defender', 1, 2, 0);
    s.rng = rngFor('draught');
    const found = must(applyAction(s, { type: 'claimTreasure', unit: u.id }));
    expect(unitById(found, u.id)).toMatchObject({ item: 'draught', attacks: 0, acted: true });
    expect(useItemRefusal(found, u.id)).toBe('found this turn');
    expect(canUseItem(found, u.id)).toBe(false);
    expect(legalActions(found).filter((a) => a.type === 'useItem')).toEqual([]);
    expect(applyAction(found, drink(u.id))).toEqual({ ok: false, reason: 'found this turn' });
    const later = must(applyAction(must(applyAction(found, { type: 'endTurn' })), { type: 'endTurn' }));
    expect(canUseItem(later, u.id)).toBe(true);
    expect(legalActions(later).filter((a) => a.type === 'useItem')).toEqual([drink(u.id)]);
    expect(unitById(must(applyAction(later, drink(u.id))), u.id)).toMatchObject({ item: null, attacks: 2 });
  });

  test('a draught gives one more attack, never a second ability', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] }); give(s, 0, 'riding');
    const caller = addUnit(s, 'skyCaller', 0, 0, 0, { item: 'draught' });
    addUnit(s, 'horseman', 0, 1, 0);
    addUnit(s, 'warrior', 1, -1, 0);
    const hasten: Action = { type: 'ability', unit: caller.id, ability: 'hasten', target: '1,0' };
    // ability first, then drink: the extra attack cannot pay for another ability
    const used = must(applyAction(s, hasten));
    const drunk = must(applyAction(used, drink(caller.id)));
    expect(unitById(drunk, caller.id)!.attacks).toBe(1);
    expect(abilityTargets(drunk, caller.id, 'hasten')).toEqual([]);
    expect(applyAction(drunk, hasten)).toEqual({ ok: false, reason: 'no attacks left' });
    expect(legalActions(drunk).some((a) => a.type === 'ability')).toBe(false);
    expect(attackTargets(drunk, caller.id)).toEqual(['-1,0']);
    // drink first: one ability, then the extra attack is still an attack
    const first = must(applyAction(s, drink(caller.id)));
    expect(abilityTargets(first, caller.id, 'hasten')).toEqual(['1,0']);
    const after = must(applyAction(first, hasten));
    expect(abilityTargets(after, caller.id, 'hasten')).toEqual([]);
    expect(attackTargets(after, caller.id)).toEqual(['-1,0']);
    expect(unitAt(after, '1,0')!.mp).toBe(unitAt(s, '1,0')!.mp + 2);
  });
});
