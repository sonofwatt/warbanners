import { expect, test } from 'vitest';
import { applyAction } from './apply';
import { CONFIG } from './data/config';
import { grantTrait, maxHpOf } from './heroes';
import { unitById } from './state';
import { addUnit, blankMatch, must } from './testkit';
import { playerView } from './vision';
import { noteHealed, noteHurt, wearLook, woundStage } from './wear';

test('the wound stage comes from health alone', () => {
  expect([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((hp) => woundStage(hp, 10))).toEqual([0, 1, 1, 2, 2, 3, 3, 3, 4, 4]);
  expect(woundStage(12, 10)).toBe(0);
});

test('an attack wears both units, and a battered survivor bleeds', () => {
  // warrior on warrior: 6 dealt, 2 back, so the target is left at 4 of 10 (battered) and the attacker at 8 (scuffed)
  const s = blankMatch(); const a = addUnit(s, 'warrior', 0, 0, 0); const d = addUnit(s, 'warrior', 1, 1, 0);
  const t = must(applyAction(s, { type: 'attack', unit: a.id, target: '1,0' }));
  const ta = unitById(t, a.id)!, td = unitById(t, d.id)!;
  expect(ta.wear).toEqual({ battles: 1, scar: 0, bleeding: false });
  expect(td.wear).toEqual({ battles: 1, scar: 0, bleeding: true });
  expect(wearLook(ta, maxHpOf(ta))).toEqual({ stage: 1, blood: 0 });
  expect(wearLook(td, maxHpOf(td))).toEqual({ stage: 3, blood: 1 });
});

test('a heal stops the bleeding and leaves armour by how bad the wound was', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  u.hp = 2; noteHurt(u, 10);
  expect(wearLook(u, 10)).toEqual({ stage: 4, blood: 2 });
  u.hp = 6; noteHealed(u, 2, 10);   // broken, healed to dented health
  expect(u.wear).toMatchObject({ scar: 3, bleeding: false });
  expect(wearLook(u, 10)).toEqual({ stage: 3, blood: 0 });
  u.hp = 10; noteHealed(u, 6, 10);  // a later heal from dented never lowers the scar
  expect(wearLook(u, 10)).toEqual({ stage: 3, blood: 0 });

  const v = addUnit(s, 'warrior', 0, 1, 0);
  v.hp = 4; noteHurt(v, 10);
  v.hp = 10; noteHealed(v, 4, 10);  // battered, healed in full: dented
  expect(wearLook(v, 10)).toEqual({ stage: 2, blood: 0 });
  v.hp = 4; noteHurt(v, 10);        // a new wound bleeds again
  expect(wearLook(v, 10)).toEqual({ stage: 3, blood: 1 });
});

test('battles alone wear the armour, never past battered', () => {
  const s = blankMatch(); const u = addUnit(s, 'warrior', 0, 0, 0);
  const at = (n: number) => { u.wear.battles = n; return wearLook(u, 10).stage; };
  expect([0, 1, 3, 4, 9, 10, 50].map(at)).toEqual([0, 1, 1, 2, 2, 3, 3]);
});

test('the Heal ability and Fierce both count as heals', () => {
  const s = blankMatch(); const p = addUnit(s, 'piper', 0, 0, 0); const w = addUnit(s, 'warrior', 0, 1, 0);
  w.hp = 2; w.wear.bleeding = true;
  const t = must(applyAction(s, { type: 'ability', unit: p.id, ability: 'heal', target: '1,0' }));
  expect(unitById(t, w.id)!.hp).toBe(2 + CONFIG.abilityHeal);
  expect(unitById(t, w.id)!.wear).toMatchObject({ scar: 3, bleeding: false });

  const f = addUnit(s, 'warrior', 0, 2, 0); f.hp = 4; f.wear.bleeding = true;
  grantTrait(s, f, 'fierce', []);
  expect(f.wear).toMatchObject({ scar: 2, bleeding: false });
});

test('the opponent sees battle wear, though deeds stay private', () => {
  const s = blankMatch(); addUnit(s, 'warrior', 0, 0, 0); const e = addUnit(s, 'warrior', 1, 1, 0);
  e.wear = { battles: 5, scar: 2, bleeding: true }; e.deeds.fight = 3;
  const seen = playerView(s, 0).units.find((u) => u.id === e.id)!;
  expect(seen.wear).toEqual({ battles: 5, scar: 2, bleeding: true });
  expect(seen.deeds.fight).toBe(0);
});
