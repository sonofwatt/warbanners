import { describe, expect, test } from 'vitest';
import { applyAction, legalActions } from './apply';
import { CONFIG } from './data/config';
import { coverAt, damageFor, defenceOf } from './combat';
import { hashState } from './hash';
import { restHealAt } from './turn';
import { cityById, unitById } from './state';
import { playerView } from './vision';
import { addCity, addUnit, blankMatch, must, setTile } from './testkit';
import type { MatchState } from './types';

const end = { type: 'endTurn' } as const;
const hunker = (unit: number) => ({ type: 'hunker', unit }) as const;
const round = (s: MatchState): MatchState => must(applyAction(must(applyAction(s, end)), end));

// Player 0 owns a city at 0,0 (radius 1), player 1 one at 3,0.
function field(): MatchState {
  const s = blankMatch(); addCity(s, 0, 0, 0); addCity(s, 1, 3, 0);
  return s;
}

describe('hunker: who may', () => {
  test('a unit that has done nothing this turn hunkers, spending its turn, and legalActions lists it', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -1, 0);
    expect(legalActions(s)).toContainEqual(hunker(u.id));
    const r = applyAction(s, hunker(u.id));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events).toEqual([{ type: 'hunkered', unit: u.id }]);
    expect(unitById(r.state, u.id)).toMatchObject({ hunkered: true, mp: 0, attacks: 0, moved: false, acted: false });
    expect(legalActions(r.state).filter((a) => 'unit' in a && a.unit === u.id)).toEqual([]);
  });
  test('refused after moving, attacking or using an ability, when fresh, already hunkered, or for a siege unit; a drink is fine (rules 8)', () => {
    const s = field();
    const moved = addUnit(s, 'warrior', 0, -1, 0, { moved: true });
    const acted = addUnit(s, 'warrior', 0, -1, 1, { acted: true });
    const fresh = addUnit(s, 'warrior', 0, -2, 0, { fresh: true });
    const dug = addUnit(s, 'warrior', 0, -2, 1, { hunkered: true });
    const cat = addUnit(s, 'catapult', 0, -2, 2);
    const drank = addUnit(s, 'warrior', 0, -3, 1, { item: null, itemTurn: s.stamp });
    const theirs = addUnit(s, 'warrior', 1, 3, -1);
    const why = (id: number): string => { const r = applyAction(s, hunker(id)); return r.ok ? 'ok' : r.reason; };
    expect(why(moved.id)).toBe('unit already acted this turn');
    expect(why(acted.id)).toBe('unit already acted this turn');
    expect(why(drank.id)).toBe('ok');                                   // rules 8: CONFIG.hunker.drinkKeepsHunker
    expect(why(fresh.id)).toBe('unit is too new');
    expect(why(dug.id)).toBe('already hunkered');
    expect(why(cat.id)).toBe('siege engines cannot hunker');
    expect(why(theirs.id)).toBe('not your unit');
    expect(why(999)).toBe('no such unit');
    const listed = legalActions(s).filter((a) => a.type === 'hunker');
    expect(listed).toEqual([hunker(drank.id)]);
  });
  test('the flag is in the state hash and in both players\' views', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, 1, 0);
    addUnit(s, 'warrior', 1, 2, 0);
    const t = must(applyAction(s, hunker(u.id)));
    expect(hashState(t)).not.toBe(hashState(must(applyAction(s, { type: 'move', unit: u.id, to: '1,1' }))));
    const before = structuredClone(t); unitById(before, u.id)!.hunkered = false;
    expect(hashState(before)).not.toBe(hashState(t));
    expect(playerView(t, 1).units.find((x) => x.id === u.id)!.hunkered).toBe(true);
    expect(playerView(t, 0).units.find((x) => x.id === u.id)!.hunkered).toBe(true);
  });
});

describe('hunker: how long', () => {
  test('it lasts over turns; a hunkered unit may then move, which ends it', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -1, 0);
    let t = round(must(applyAction(s, hunker(u.id))));
    expect(unitById(t, u.id)).toMatchObject({ hunkered: true, mp: 2, attacks: 1 });
    t = round(t);
    expect(unitById(t, u.id)!.hunkered).toBe(true);
    const r = applyAction(t, { type: 'move', unit: u.id, to: '-2,0' });
    expect(r.ok && r.events[0]).toEqual({ type: 'hunkerEnded', unit: u.id });
    expect(r.ok && unitById(r.state, u.id)!.hunkered).toBe(false);
  });
  test('attacking ends it, and the attacker gets no hunker defence against the counter', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, 1, 0, { hunkered: true });
    const e = addUnit(s, 'warrior', 1, 2, 0);
    const plain = structuredClone(s); unitById(plain, u.id)!.hunkered = false;
    const r = applyAction(s, { type: 'attack', unit: u.id, target: e.pos });
    const p = applyAction(plain, { type: 'attack', unit: u.id, target: e.pos });
    expect(r.ok && p.ok).toBe(true);
    if (!r.ok || !p.ok) return;
    expect(r.events[0]).toEqual({ type: 'hunkerEnded', unit: u.id });
    expect(unitById(r.state, u.id)!.hunkered).toBe(false);
    expect(r.events[1]).toEqual(p.events[0]);
  });
  test('an ability, a capture and a treasure claim end it', () => {
    const s = field();
    const piper = addUnit(s, 'piper', 0, -1, 0, { hunkered: true });
    addUnit(s, 'warrior', 0, -1, 1, { hp: 5 });
    const r = applyAction(s, { type: 'ability', unit: piper.id, ability: 'heal', target: '-1,1' });
    expect(r.ok && unitById(r.state, piper.id)!.hunkered).toBe(false);

    const c = field();
    const village = '-3,0';
    setTile(c, -3, 0, { village: true });
    const cap = addUnit(c, 'warrior', 0, -3, 0, { hunkered: true });
    const rc = applyAction(c, { type: 'capture', unit: cap.id });
    expect(rc.ok).toBe(true);
    expect(rc.ok && rc.events.some((e) => e.type === 'hunkerEnded')).toBe(true);
    expect(rc.ok && unitById(rc.state, cap.id)!.hunkered).toBe(false);
    expect(village).toBe(cap.pos);

    const g = field();
    setTile(g, -3, 0, { treasure: true });
    const finder = addUnit(g, 'warrior', 0, -3, 0, { hunkered: true });
    const rg = applyAction(g, { type: 'claimTreasure', unit: finder.id });
    expect(rg.ok && unitById(rg.state, finder.id)!.hunkered).toBe(false);
  });
  test('a refused action leaves it hunkered', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -1, 0, { hunkered: true });
    const r = applyAction(s, { type: 'move', unit: u.id, to: '4,0' });
    expect(r.ok).toBe(false);
    expect(unitById(s, u.id)!.hunkered).toBe(true);
  });
  test('being attacked, striking back, being healed, taunted or blinded do not end it', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 1, -1, 0, { hunkered: true, hp: 6 });
    addUnit(s, 'warrior', 0, -2, 0);
    const piper = addUnit(s, 'piper', 0, 0, -1);
    const caller = addUnit(s, 'skyCaller', 1, -1, 1);
    const a = must(applyAction(s, { type: 'attack', unit: s.units[1]!.id, target: u.pos }));
    expect(unitById(a, u.id)!.hunkered).toBe(true);
    const b = must(applyAction(a, { type: 'ability', unit: piper.id, ability: 'taunt', target: u.pos }));
    expect(unitById(b, u.id)).toMatchObject({ hunkered: true, taunted: true });
    const c = must(applyAction(b, end));
    const d = must(applyAction(c, { type: 'ability', unit: caller.id, ability: 'heal', target: u.pos }));
    expect(unitById(d, u.id)!.hunkered).toBe(true);
    const blinded = structuredClone(d); unitById(blinded, u.id)!.blinded = true;
    expect(unitById(must(applyAction(blinded, end)), u.id)!.hunkered).toBe(true);
  });
  test('being lured off its tile ends it', () => {
    const s = blankMatch({ factions: ['mongols', 'spartans'] });
    addCity(s, 0, -3, 0); addCity(s, 1, 3, 0);
    const rider = addUnit(s, 'horseman', 0, 0, 0);
    const v = addUnit(s, 'warrior', 1, 1, 0, { hunkered: true });
    const a = must(applyAction(s, { type: 'attack', unit: rider.id, target: v.pos, lure: true }));
    const r = applyAction(a, { type: 'move', unit: rider.id, to: '-1,0' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.events.map((e) => e.type)).toContain('lured');
    expect(r.events).toContainEqual({ type: 'hunkerEnded', unit: v.id });
    expect(unitById(r.state, v.id)!.hunkered).toBe(false);
  });
});

describe('hunker: defence', () => {
  test('+1 defence when attacked, before cover', () => {
    const s = field();
    setTile(s, -1, 0, { terrain: 'forest' });
    const u = addUnit(s, 'warrior', 1, -1, 0, { hunkered: true });
    const a = addUnit(s, 'warrior', 0, -2, 0);
    const r = applyAction(s, { type: 'attack', unit: a.id, target: u.pos });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const want = damageFor(4, defenceOf(s, u) + CONFIG.hunker.def, coverAt(s, u));
    const plain = damageFor(4, defenceOf(s, u), coverAt(s, u));
    expect(want).toBeLessThan(plain);
    expect(r.events[0]).toMatchObject({ type: 'attacked', damage: want });
  });
});

describe('hunker: healing', () => {
  test('a unit that only hunkered rests: home 5, unclaimed 3, enemy land 2', () => {
    const s = field();
    const home = addUnit(s, 'warrior', 0, -1, 0, { hp: 3 });
    const wild = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
    const enemy = addUnit(s, 'warrior', 0, 3, 1, { hp: 3 });
    expect(cityById(s, 1)!.owner).toBe(1);
    let t = s;
    for (const u of [home, wild, enemy]) t = must(applyAction(t, hunker(u.id)));
    t = round(t);
    expect([home, wild, enemy].map((u) => unitById(t, u.id)!.hp)).toEqual([8, 6, 5]);
    expect([home, wild, enemy].map((u) => restHealAt(t, unitById(t, u.id)!))).toEqual([5, 3, 2]);
  });
  test('it keeps resting turn after turn while it stays hunkered', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -3, 0, { hp: 1 });
    const t = round(round(must(applyAction(s, hunker(u.id)))));
    expect(unitById(t, u.id)!.hp).toBe(7);
  });
  test('beside a seen enemy it still heals half the regular heal, rounded up: 2, 1, 1', () => {
    const s = field();
    const home = addUnit(s, 'warrior', 0, 0, -1, { hp: 3, hunkered: true });
    const wild = addUnit(s, 'warrior', 0, -3, 0, { hp: 3, hunkered: true });
    const enemy = addUnit(s, 'warrior', 0, 3, 1, { hp: 3, hunkered: true });
    const plain = addUnit(s, 'warrior', 0, -3, 2, { hp: 3 });
    addUnit(s, 'warrior', 1, 1, -2); addUnit(s, 'warrior', 1, -3, 1); addUnit(s, 'warrior', 1, 2, 1);
    for (const u of s.units) if (u.owner === 1) u.hunkered = true;   // they stay put
    const t = round(s);
    expect([home, wild, enemy, plain].map((u) => unitById(t, u.id)!.hp)).toEqual([5, 4, 4, 3]);
  });
  test('a Heal on a hunkered unit gives one more, up to full', () => {
    const s = field();
    const piper = addUnit(s, 'piper', 0, -1, 0);
    const piper2 = addUnit(s, 'piper', 0, -2, 2);
    const dug = addUnit(s, 'warrior', 0, -1, 1, { hp: 3, hunkered: true });
    const near = addUnit(s, 'warrior', 0, -2, 1, { hp: 8, hunkered: true });
    const a = must(applyAction(s, { type: 'ability', unit: piper.id, ability: 'heal', target: dug.pos }));
    expect(unitById(a, dug.id)!.hp).toBe(3 + CONFIG.abilityHeal + 1);
    const b = must(applyAction(a, { type: 'ability', unit: piper2.id, ability: 'heal', target: near.pos }));
    expect(unitById(b, near.id)!.hp).toBe(10);
  });
});

// rules 8: a unit hunkered when its owner ends the turn heals then, and not again at the start of its next turn.
describe('hunker: healing at the end of the turn (rules 8)', () => {
  test('the heal lands on the end turn itself, by land: home, unclaimed, enemy, with an event and a rest deed', () => {
    expect(CONFIG.hunker.healAtTurnEnd).toBe(true);
    const s = field();
    const home = addUnit(s, 'warrior', 0, -1, 0, { hp: 3 });
    const wild = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
    const enemy = addUnit(s, 'warrior', 0, 3, 1, { hp: 3 });
    let t = s;
    for (const u of [home, wild, enemy]) t = must(applyAction(t, hunker(u.id)));
    const want = [home, wild, enemy].map((u) => restHealAt(t, unitById(t, u.id)!));
    expect(want).toEqual([CONFIG.restHeal.home + CONFIG.hunker.restBonus, CONFIG.restHeal.neutral + CONFIG.hunker.restBonus, CONFIG.restHeal.enemy + CONFIG.hunker.restBonus]);
    const r = applyAction(t, end);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect([home, wild, enemy].map((u) => unitById(r.state, u.id)!.hp)).toEqual(want.map((h) => 3 + h));
    for (const [i, u] of [home, wild, enemy].entries()) expect(r.events).toContainEqual({ type: 'restHealed', unit: u.id, hp: want[i] });
    expect(unitById(r.state, home.id)!.deeds.rest).toBe(1);
    expect(r.events.findIndex((e) => e.type === 'restHealed')).toBeLessThan(r.events.findIndex((e) => e.type === 'turnStarted'));
  });
  test('it never heals twice: nothing more when its owner\'s next turn starts', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -3, 0, { hp: 1 });
    const once = must(applyAction(must(applyAction(s, hunker(u.id))), end));
    const hp = unitById(once, u.id)!.hp;
    expect(hp).toBe(1 + CONFIG.restHeal.neutral + CONFIG.hunker.restBonus);
    const next = must(applyAction(once, end));                    // player 0's next turn starts
    expect(unitById(next, u.id)!.hp).toBe(hp);
    expect(unitById(next, u.id)!.deeds.rest).toBe(1);
    const twice = must(applyAction(must(applyAction(next, end)), end));   // still hunkered: one more heal, at its end
    expect(unitById(twice, u.id)!.hp).toBe(hp + CONFIG.restHeal.neutral + CONFIG.hunker.restBonus);
  });
  test('beside a seen enemy as the turn ends it heals the share; an enemy arriving later changes nothing', () => {
    const s = field();
    const dug = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
    addUnit(s, 'warrior', 1, -3, 1);
    const t = must(applyAction(must(applyAction(s, hunker(dug.id))), end));
    expect(unitById(t, dug.id)!.hp).toBe(3 + Math.ceil(CONFIG.restHeal.neutral * CONFIG.hunker.besideEnemyShare));
    const q = field();
    const calm = addUnit(q, 'warrior', 0, -3, 0, { hp: 3 });
    const foe = addUnit(q, 'warrior', 1, -5, 2);
    const a = must(applyAction(must(applyAction(q, hunker(calm.id))), end));
    const healed = unitById(a, calm.id)!.hp;
    expect(healed).toBe(3 + CONFIG.restHeal.neutral + CONFIG.hunker.restBonus);
    const b = must(applyAction(must(applyAction(a, { type: 'move', unit: foe.id, to: '-4,1' })), end));
    expect(unitById(b, calm.id)!.hp).toBe(healed);                // the foe beside it now: no heal at the start, none lost
  });
  test('it heals no further than its max health and emits nothing at full health', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -1, 0, { hp: 9 });
    const full = addUnit(s, 'warrior', 0, -1, 1);
    const r = applyAction(must(applyAction(must(applyAction(s, hunker(u.id))), hunker(full.id))), end);
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(unitById(r.state, u.id)!.hp).toBe(10);
    expect(r.events).toContainEqual({ type: 'restHealed', unit: u.id, hp: 1 });
    expect(r.events.some((e) => e.type === 'restHealed' && e.unit === full.id)).toBe(false);
    expect(unitById(r.state, full.id)!.deeds.rest).toBe(0);
  });
  test('a unit that rests without hunkering still heals at the start of its next turn', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, -3, 0, { hp: 3 });
    const t = must(applyAction(s, end));
    expect(unitById(t, u.id)!.hp).toBe(3);
    expect(unitById(must(applyAction(t, end)), u.id)!.hp).toBe(3 + CONFIG.restHeal.neutral);
  });
});

// rules 8: drinking a draught neither blocks a hunker nor ends one (CONFIG.hunker.drinkKeepsHunker).
describe('hunker: a draught (rules 8)', () => {
  test('a unit that drank this turn may still hunker', () => {
    expect(CONFIG.hunker.drinkKeepsHunker).toBe(true);
    const s = field();
    const u = addUnit(s, 'warrior', 0, -1, 0, { item: 'draught' });
    const drunk = must(applyAction(s, { type: 'useItem', unit: u.id }));
    expect(legalActions(drunk)).toContainEqual(hunker(u.id));
    expect(unitById(must(applyAction(drunk, hunker(u.id))), u.id)!.hunkered).toBe(true);
  });
  test('drinking while hunkered keeps the hunker; attacking after still ends it', () => {
    const s = field();
    const u = addUnit(s, 'warrior', 0, 2, 0, { item: 'draught', hunkered: true });
    addUnit(s, 'warrior', 1, 3, -1);
    const r = applyAction(s, { type: 'useItem', unit: u.id });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.events.some((e) => e.type === 'hunkerEnded')).toBe(false);
    expect(unitById(r.state, u.id)).toMatchObject({ hunkered: true, item: null });
    const a = applyAction(r.state, { type: 'attack', unit: u.id, target: '3,-1' });
    expect(a.ok && a.events[0]).toEqual({ type: 'hunkerEnded', unit: u.id });
  });
});
