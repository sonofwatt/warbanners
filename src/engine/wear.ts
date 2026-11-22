import type { Unit, Wear } from './types';

// Battle wear: what Gritty mode draws on a unit. Cosmetic only. Nothing in the rules reads it, but it is part of the
// match state (hashed, replayed, public to both players) so every phone shows the same marks.

export type WearStage = 0 | 1 | 2 | 3 | 4;   // clean, scuffed, dented, battered, broken
export type BloodLevel = 0 | 1 | 2;          // none, slight, more

/** The armour a heal leaves, by the wound stage just before it: battered heals to dented, broken to battered. */
export const SCAR_AFTER: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 2, 3];
/** Battles that bring the armour to scuffed, dented and battered on their own. Fights alone never show broken. */
export const BATTLE_FLOOR: readonly [number, number, number] = [1, 4, 10];

export function freshWear(): Wear {
  return { battles: 0, scar: 0, bleeding: false };
}

/** The wound stage from health alone: 0 at full, 1 above 75%, 2 above 50%, 3 above 25%, else 4. */
export function woundStage(hp: number, maxHp: number): WearStage {
  if (hp >= maxHp) return 0;
  if (4 * hp > 3 * maxHp) return 1;
  if (2 * hp > maxHp) return 2;
  if (4 * hp > maxHp) return 3;
  return 4;
}

function battleFloor(battles: number): WearStage {
  if (battles >= BATTLE_FLOOR[2]) return 3;
  if (battles >= BATTLE_FLOOR[1]) return 2;
  if (battles >= BATTLE_FLOOR[0]) return 1;
  return 0;
}

/** What to draw (maxHp is maxHpOf(u)): the worst of the wound, the scars of past heals and the battles fought; blood only while bleeding. */
export function wearLook(u: Unit, maxHp: number): { stage: WearStage; blood: BloodLevel } {
  const wound = woundStage(u.hp, maxHp);
  const stage = Math.max(wound, u.wear.scar, battleFloor(u.wear.battles)) as WearStage;
  const blood: BloodLevel = !u.wear.bleeding || wound < 3 ? 0 : wound === 3 ? 1 : 2;
  return { stage, blood };
}

/** After a unit lost health and lived: it bleeds once the wound is battered or worse. */
export function noteHurt(u: Unit, maxHp: number): void {
  if (woundStage(u.hp, maxHp) >= 3) u.wear.bleeding = true;
}

/** After a unit gained health: the blood is gone, and the wound it had leaves its scar on the armour. */
export function noteHealed(u: Unit, hpBefore: number, maxBefore: number): void {
  if (u.hp <= hpBefore) return;
  u.wear.bleeding = false;
  const scar = SCAR_AFTER[woundStage(hpBefore, maxBefore)]!;
  if (scar > u.wear.scar) u.wear.scar = scar;
}
