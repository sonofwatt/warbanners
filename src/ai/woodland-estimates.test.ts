import { expect, test } from 'vitest';
import { CONFIG, ambushes, attackOf, damageFor, defenceOf, isHidden, key, maxMp, parseKey, reachable, strikeDamage } from '../engine';
import type { MatchState, Unit } from '../engine';
import { addCity, addUnit, blankMatch, give, setTile } from '../engine/testkit';
import { dangerMap, healthFactor, hiddenDanger, strikeEstimate, threatOn } from './assess';
import { counterEstimate } from './plan';
import { forestCost } from './sim';

// rules 11: the AI's own estimates of Woodland hits, counters and the danger on hidden units.

const atkOf = (s: MatchState, u: Unit): number => attackOf(s, u) * healthFactor(u);

function woodlandAgainstMongols(): MatchState {
  const s = blankMatch({ factions: ['woodland', 'mongols'], radius: 6 });
  addCity(s, 0, 0, 5);
  addCity(s, 1, 0, -6);
  return s;
}

// ---- hiddenDanger and the threat valueOf weighs ----

// A Horse Archer and the tiles just inside and just outside the rough reach hiddenDanger gives it.
function riderAt(): { s: MatchState; inside: string; outside: string; reach: number } {
  const s = woodlandAgainstMongols();
  const e = addUnit(s, 'horseArcher', 1, 0, -4);
  const reach = Math.floor(maxMp(s, e) / 2) + Math.min(1, CONFIG.hiddenRevealRange);
  return { s, inside: key({ q: 0, r: -4 + reach }), outside: key({ q: 0, r: -4 + reach + 1 }), reach };
}

test('hiddenDanger counts an enemy just inside its reach and not one just outside, where the danger map still does', () => {
  const { s, inside, outside } = riderAt();
  expect(hiddenDanger(s, 0, inside)).toBeGreaterThan(0);
  expect(hiddenDanger(s, 0, outside)).toBe(0);
  expect(dangerMap(s, 0)[outside] ?? 0).toBeGreaterThan(0);       // a Horse Archer shoots 2: it is in danger when seen
});

test('a Woodland unit in forest cover weighs only the hidden danger; the same unit on an open field the whole map', () => {
  const { s, outside } = riderAt();
  const at = parseKey(outside);
  const u = addUnit(s, 'skirmisher', 0, at.q, at.r);
  const danger = dangerMap(s, 0);
  expect(threatOn(s, 0, danger, u)).toBe(danger[outside]);         // on a field: seen from afar
  setTile(s, at.q, at.r, { terrain: 'forest' });
  expect(isHidden(s, u)).toBe(true);
  const forest = dangerMap(s, 0);
  expect(forest[outside] ?? 0).toBeGreaterThan(0);
  expect(threatOn(s, 0, forest, u)).toBe(0);                       // in forest cover: the rider must come next to it
});

test('a Spartan Scout, hidden by its trait, weighs the danger map exactly as before rules 11', () => {
  const s = blankMatch({ factions: ['spartans', 'mongols'], radius: 6 });
  addCity(s, 0, 0, 5);
  addCity(s, 1, 0, -6);
  const e = addUnit(s, 'horseArcher', 1, 0, -4);
  const reach = Math.floor(maxMp(s, e) / 2) + 1;
  const scout = addUnit(s, 'scout', 0, 0, -4 + reach + 1);
  expect(isHidden(s, scout)).toBe(true);
  const danger = dangerMap(s, 0);
  expect(danger[scout.pos] ?? 0).toBeGreaterThan(0);
  expect(hiddenDanger(s, 0, scout.pos)).toBe(0);
  expect(threatOn(s, 0, danger, scout)).toBe(danger[scout.pos]);
});

// ---- strikeEstimate ----

test('a Skirmisher 2 tiles off is costed as melee without Archery and as a bow shot with it', () => {
  const s = woodlandAgainstMongols();
  const u = addUnit(s, 'skirmisher', 0, 0, 0);
  const t = addUnit(s, 'warrior', 1, 0, 2);
  const melee = strikeDamage(s, t, { ...u, pos: '0,1' }, atkOf(s, u));   // the hit after walking up next to it
  const bow = strikeDamage(s, t, u, atkOf(s, u));                         // the engine's bow number at 2 tiles
  expect(bow).not.toBe(melee);
  expect(strikeEstimate(s, t, u, atkOf(s, u))).toBe(melee);
  give(s, 0, 'archery');
  expect(strikeEstimate(s, t, u, atkOf(s, u))).toBe(bow);
});

test('an ambush raises the estimate', () => {
  const s = woodlandAgainstMongols();
  give(s, 0, 'archery');
  const u = addUnit(s, 'skirmisher', 0, 0, 0);
  const t = addUnit(s, 'swordsman', 1, 0, 2);
  const open = strikeEstimate(s, t, u, atkOf(s, u));
  setTile(s, 0, 0, { terrain: 'forest' });
  expect(ambushes(s, u, t)).toBe(true);
  expect(strikeEstimate(s, t, u, atkOf(s, u))).toBeGreaterThan(open);
});

test('a Spartan or Mongol hit is estimated exactly as strikeDamage works it', () => {
  const s = blankMatch({ factions: ['spartans', 'mongols'] });
  const hoplite = addUnit(s, 'hoplite', 0, 0, 0);
  const warrior = addUnit(s, 'warrior', 1, 0, 1);
  const archer = addUnit(s, 'horseArcher', 1, 1, 1);
  expect(strikeEstimate(s, warrior, hoplite, atkOf(s, hoplite))).toBe(strikeDamage(s, warrior, hoplite, atkOf(s, hoplite)));
  s.current = 1;
  expect(strikeEstimate(s, hoplite, archer, atkOf(s, archer))).toBe(strikeDamage(s, hoplite, archer, atkOf(s, archer)));
});

// ---- counterEstimate ----

test('the counter estimate has the bow counter for a Skirmisher with Archery 2 tiles off, else the melee one', () => {
  const s = blankMatch({ factions: ['spartans', 'woodland'] });
  const u = addUnit(s, 'warrior', 0, 0, 0);
  const e = addUnit(s, 'skirmisher', 1, 0, 2);
  const melee = damageFor(attackOf(s, e) * CONFIG.counterFactor * healthFactor(e), defenceOf(s, u), 1);
  expect(counterEstimate(s, e, u, parseKey(u.pos))).toBe(melee);   // no Archery: no bow
  give(s, 1, 'archery');
  const bow = Math.max(1, Math.round(CONFIG.woodland.bowShare
    * damageFor(CONFIG.woodland.bowAtk * CONFIG.counterFactor * healthFactor(e), defenceOf(s, u), 1)));
  expect(bow).not.toBe(melee);
  expect(counterEstimate(s, e, u, parseKey(u.pos))).toBe(bow);
  expect(counterEstimate(s, e, u, parseKey('0,1'))).toBe(melee);   // struck from next to it: melee
});

test('the counter estimate takes the agile cut off a counter on a Skirmisher', () => {
  const s = woodlandAgainstMongols();
  const u = addUnit(s, 'skirmisher', 0, 0, 0);
  const e = addUnit(s, 'swordsman', 1, 0, 1);
  const melee = damageFor(attackOf(s, e) * CONFIG.counterFactor * healthFactor(e), defenceOf(s, u), 1);
  expect(counterEstimate(s, e, u, parseKey(u.pos))).toBe(Math.max(1, melee - CONFIG.heroes.agilityCut));
});

test('a Spartan or Mongol counter is estimated with the formula used before rules 11', () => {
  const s = blankMatch({ factions: ['spartans', 'mongols'] });
  const u = addUnit(s, 'hoplite', 0, 0, 0);
  for (const type of ['horseArcher', 'knight', 'warrior'] as const) {
    const e = addUnit(s, type, 1, 0, 2, { hp: 7 });
    const old = damageFor(attackOf(s, e) * CONFIG.counterFactor * healthFactor(e), defenceOf(s, u), 1);
    expect(counterEstimate(s, e, u, parseKey(u.pos))).toBe(old);
    s.units = s.units.filter((x) => x.id !== e.id);
  }
});

// ---- the sim's forest-entry stat ----

test('the sim counts a forest entry short of mp against what a forest costs the faction, as movement charges it', () => {
  expect(forestCost('woodland')).toBe(CONFIG.terrain.field.enterCost);
  expect(forestCost('spartans')).toBe(CONFIG.terrain.forest.enterCost);
  expect(forestCost('mongols')).toBe(CONFIG.terrain.forest.enterCost);
  // past its first step, a Woodland foot unit with a field's cost left enters a forest beside it; a Spartan one cannot
  for (const faction of ['woodland', 'spartans'] as const) {
    const s = blankMatch({ factions: [faction, 'mongols'] });
    setTile(s, 0, 1, { terrain: 'forest' });
    const u = addUnit(s, 'spearman', 0, 0, 0, { mp: CONFIG.terrain.field.enterCost, moved: true });
    expect('0,1' in reachable(s, u.id)).toBe(CONFIG.terrain.field.enterCost >= forestCost(faction));
  }
  expect(CONFIG.terrain.field.enterCost).toBeLessThan(forestCost('spartans'));   // so the two cases differ
});
