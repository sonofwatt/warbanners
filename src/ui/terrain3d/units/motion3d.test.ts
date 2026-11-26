// The 3D look's motion: gaits along a slide, strikes fitted to each weapon, blocks and flinches timed to the blow,
// counter strikes; and the slide timings the board uses (board/motion.ts).
import { describe, expect, test } from 'vitest';
import { CYCLES_PER_HEX, gaitKind, gaitPose, gaitWeight, STILL } from './gait';
import {
  AT_REST, BLOCK_LEAD_MS, COUNTER_AFTER_MS, COUNTER_STRIKE_MS, exchange, impactMs, JAB_HOLD, JAB_WIND, LEVEL_TILT, levelTurn,
  MELEE_HIT, REACT_MS, reactKind, reactPose, STRIKE_MS, strikeKind, strikePose, UNMOVED,
} from './strike';
import { ALL_TYPES } from './figures';
import {
  HEX_MS, hexesBetween, paceOf, slideFrames, slideMs3d, SLIDE_MS, TRAVEL_CAP_MS, travelMs, travelPhase, TURN_LEAD_MS,
} from '../../board/motion';

describe('slide timing (board/motion.ts)', () => {
  test('a foot unit travels about 240 ms a hex, after turning on the spot', () => {
    expect(travelMs('warrior', 1)).toBe(HEX_MS);
    expect(slideMs3d('warrior', 1)).toBe(TURN_LEAD_MS + 240);
    expect(slideMs3d('warrior', 2)).toBe(TURN_LEAD_MS + 480);
    for (const t of ALL_TYPES) for (let h = 1; h <= 3; h++) {
      const per = travelMs(t, h) / h;
      if (travelMs(t, h) < TRAVEL_CAP_MS) { expect(per).toBeGreaterThanOrEqual(190); expect(per).toBeLessThanOrEqual(315); }
    }
  });

  test('riders and scouts are quicker, the trebuchet and the camp slower', () => {
    expect(paceOf('knight')).toBeLessThan(1);
    expect(paceOf('scout')).toBeLessThan(paceOf('knight'));
    expect(paceOf('catapult')).toBeGreaterThan(1);
    expect(travelMs('scout', 2)).toBeLessThan(travelMs('warrior', 2));
    expect(travelMs('catapult', 1)).toBeGreaterThan(travelMs('warrior', 1));
  });

  test('a long move is over in under a second', () => {
    for (const t of ALL_TYPES) for (let h = 1; h <= 8; h++) expect(slideMs3d(t, h)).toBeLessThan(1000);
    expect(travelMs('catapult', 8)).toBe(TRAVEL_CAP_MS);
  });

  test('no move, no slide', () => {
    expect(travelMs('warrior', 0)).toBe(0);
    expect(slideMs3d('warrior', 0)).toBe(0);
    expect(hexesBetween('0,0', '0,0')).toBe(0);
    expect(hexesBetween('0,0', '2,-1')).toBe(2);
  });

  test('the travel phase is null while the figure turns, then runs 0 to 1', () => {
    const total = slideMs3d('warrior', 2);
    expect(travelPhase(0, total)).toBeNull();
    expect(travelPhase(TURN_LEAD_MS - 1, total)).toBeNull();
    expect(travelPhase(TURN_LEAD_MS, total)).toBe(0);
    expect(travelPhase(TURN_LEAD_MS + 240, total)).toBeCloseTo(0.5, 10);
    expect(travelPhase(total + 50, total)).toBe(1);
  });

  test('the 3D slide holds on its tile for the turn, then eases in and out; the svg slide is as before', () => {
    const f = slideFrames('a', 'b', 620, true);
    expect(f).toHaveLength(3);
    expect(f[0]).toEqual({ transform: 'a', offset: 0 });
    expect(f[1]!.transform).toBe('a');
    expect(f[1]!.offset).toBeCloseTo(TURN_LEAD_MS / 620, 3);
    expect(f[1]!.easing).toMatch(/cubic-bezier/);
    expect(f[2]).toEqual({ transform: 'b', offset: 1 });
    expect(slideFrames('a', 'b', SLIDE_MS, false)).toEqual([{ transform: 'a' }, { transform: 'b' }]);
  });
});

describe('gaits', () => {
  test('foot units walk, scouts trot, riders gallop, the siege engines lurch', () => {
    expect(gaitKind('hoplite')).toBe('walk');
    expect(gaitKind('archer')).toBe('walk');
    expect(gaitKind('scout')).toBe('trot');
    expect(gaitKind('knight')).toBe('gallop');
    expect(gaitKind('horseArcher')).toBe('gallop');
    expect(gaitKind('catapult')).toBe('lurch');
    expect(gaitKind('camp')).toBe('lurch');
  });

  test('the gait swells in as the figure sets off and dies away as it arrives', () => {
    expect(gaitWeight(null)).toBe(0);
    expect(gaitWeight(0)).toBe(0);
    expect(gaitWeight(1)).toBe(0);
    expect(gaitWeight(0.5)).toBe(1);
    expect(gaitWeight(0.05)).toBeGreaterThan(0);
    expect(gaitWeight(0.05)).toBeLessThan(0.5);
    let prev = 0;
    for (let p = 0.01; p <= 0.2; p += 0.01) { const w = gaitWeight(p); expect(w).toBeGreaterThanOrEqual(prev); prev = w; }
    expect(gaitPose('walk', 0.3, 0)).toBe(STILL);
  });

  test('a walk steps twice a cycle: up over each foot, rolling side to side', () => {
    const bobs: number[] = [], rolls: number[] = [];
    for (let h = 0; h <= 1; h += 0.01) { const g = gaitPose('walk', h, 1); bobs.push(g.bob); rolls.push(g.roll); }
    expect(Math.max(...bobs)).toBeGreaterThan(2);
    expect(Math.min(...bobs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...rolls)).toBeGreaterThan(0.08);
    expect(Math.min(...rolls)).toBeLessThan(-0.08);
    // The steps keep pace with the distance: the same pose a whole cycle further on.
    const a = gaitPose('walk', 0.3, 1), b = gaitPose('walk', 0.3 + 1 / CYCLES_PER_HEX.walk, 1);
    expect(b.bob).toBeCloseTo(a.bob, 9);
    expect(b.roll).toBeCloseTo(a.roll, 9);
  });

  test('a gallop rocks: the front rises and dips, and the figure bounds; a lurch is slow and low', () => {
    const pitches: number[] = [];
    for (let h = 0; h <= 1; h += 0.01) pitches.push(gaitPose('gallop', h, 1).pitch);
    expect(Math.max(...pitches)).toBeGreaterThan(0.12);
    expect(Math.min(...pitches)).toBeLessThan(-0.12);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => gaitPose('lurch', i / 50, 1).bob))).toBeLessThan(1);
  });

  test('every gait stays small: a tenth of a radian or so, a few world units', () => {
    for (const k of ['walk', 'trot', 'gallop', 'lurch'] as const) for (let h = 0; h < 3; h += 0.05) {
      const g = gaitPose(k, h, 1);
      expect(Math.abs(g.roll)).toBeLessThan(0.15);
      expect(Math.abs(g.pitch)).toBeLessThan(0.2);
      expect(Math.abs(g.bob)).toBeLessThan(3.5);
      expect(Math.abs(g.sway)).toBeLessThan(1);
    }
  });
});

describe('strikes and blocks', () => {
  test('each weapon has its strike', () => {
    expect(strikeKind('warrior')).toBe('swing');
    expect(strikeKind('swordsman')).toBe('swing');
    expect(strikeKind('hoplite')).toBe('jab');
    expect(strikeKind('knight')).toBe('couch');
    expect(strikeKind('archer')).toBe('bow');
    expect(strikeKind('horseArcher')).toBe('bow');
    expect(strikeKind('catapult')).toBe('sling');
    expect(strikeKind('defender')).toBe('bash');
    expect(strikeKind('khansGuard')).toBe('rear');
    for (const t of ALL_TYPES) expect(strikeKind(t)).toBeTruthy();
  });

  test('units with a shield block; the rest flinch', () => {
    for (const t of ['warrior', 'spearman', 'defender', 'hoplite', 'kingsGuard']) expect(reactKind(t)).toBe('block');
    for (const t of ['archer', 'swordsman', 'knight', 'scout', 'catapult']) expect(reactKind(t)).toBe('flinch');
  });

  test('a sword swing winds up back, comes through as the lunge peaks, and is back at rest by the end', () => {
    expect(strikePose('swing', 0)).toBe(AT_REST);
    expect(strikePose('swing', 0.14).angle).toBeCloseTo(-0.85, 5);
    expect(strikePose('swing', MELEE_HIT).angle).toBeCloseTo(1.35, 5);
    expect(strikePose('swing', 0.4).angle).toBeCloseTo(1.35, 5);
    expect(Math.abs(strikePose('swing', 0.99).angle)).toBeLessThan(0.01);
    expect(strikePose('swing', 1)).toBe(AT_REST);
    // The blow is quick: from wind up to hit in under 80 ms of a 450 ms strike.
    expect((MELEE_HIT - 0.14) * STRIKE_MS).toBeLessThan(80);
    // No jumps: the blade is fastest as it lands, and even then moves under about 50 degrees a 60 fps frame.
    let prev = 0;
    for (let ms = 0; ms <= STRIKE_MS; ms += 1000 / 60) {
      const a = strikePose('swing', ms / STRIKE_MS).angle;
      expect(Math.abs(a - prev)).toBeLessThan(0.9);
      prev = a;
    }
  });

  test('a dagger thrust tips the blade and drives it forward at the hit', () => {
    const hit = strikePose('thrust', MELEE_HIT);
    expect(hit.angle).toBeGreaterThan(0.8);
    expect(hit.push).toBeGreaterThan(3);
    expect(strikePose('thrust', 0.14).push).toBeLessThan(0);
  });

  test('every spear jabs and every lance is couched; swords, the dagger, bows and the rest keep their strike', () => {
    for (const t of ['spearman', 'hoplite', 'kingsGuard']) expect(strikeKind(t), t).toBe('jab');
    for (const t of ['horseman', 'knight']) expect(strikeKind(t), t).toBe('couch');
    for (const t of ['warrior', 'swordsman', 'sellsword']) expect(strikeKind(t), t).toBe('swing');
    expect(strikeKind('scout')).toBe('thrust');
    // The Khan's Guard's lance is a standard planted behind the saddle, not a weapon in hand: the horse still rears.
    expect(strikeKind('khansGuard')).toBe('rear');
    expect(strikeKind('horseArcher')).toBe('bow');
  });

  test('a jab levels the spear and draws it back, drives it out along its line to the hit, holds, and comes back to rest', () => {
    for (const kind of ['jab', 'couch'] as const) {
      const wound = strikePose(kind, JAB_WIND), hit = strikePose(kind, MELEE_HIT), held = strikePose(kind, JAB_HOLD - 0.01);
      expect(wound.level, `${kind}: levelled by the end of the wind up`).toBeCloseTo(1, 9);
      expect(wound.reach, `${kind}: drawn back`).toBeLessThan(-1);
      // Straight out: from the wind up to the hold the spear stays level and does not turn, so it moves only along
      // its own line.
      for (let p = JAB_WIND; p <= JAB_HOLD - 0.01; p += 0.01) {
        const q = strikePose(kind, p);
        expect(q.level).toBe(1);
        expect(q.angle).toBe(0);
        expect(q.push).toBe(0);
        expect(q.lift).toBe(0);
      }
      expect(hit.reach - wound.reach, `${kind}: a long thrust`).toBeGreaterThan(kind === 'jab' ? 8 : 4.5);
      expect(held.reach).toBe(hit.reach);
      expect(hit.step, `${kind}: the figure steps in`).toBeGreaterThan(2);
      expect(strikePose(kind, 1)).toBe(AT_REST);
      const late = strikePose(kind, 0.995);
      for (const v of [late.level, late.reach, late.lean, late.step, late.hunch, late.rear]) expect(Math.abs(v)).toBeLessThan(0.01);
    }
    expect(strikePose('jab', MELEE_HIT).lean, 'the body leans into it').toBeGreaterThan(0.1);
    expect(strikePose('jab', JAB_WIND).lean, 'and back a little as it draws').toBeLessThan(0);
    const c = strikePose('couch', MELEE_HIT);
    expect(c.hunch, 'the rider drives the lance home').toBeGreaterThan(0.2);
    expect(c.rear, 'the horse lunges, its front down').toBeLessThan(0);
    // The thrust is fast (the wind up to the hit is about 70 ms) and smooth: no jump of more than 5 units, or more than
    // the sword turns, in a 60 fps frame, at the counter's quicker pace too.
    expect((MELEE_HIT - JAB_WIND) * STRIKE_MS).toBeLessThan(80);
    for (const ms of [STRIKE_MS, COUNTER_STRIKE_MS]) for (const kind of ['jab', 'couch'] as const) {
      let prev = AT_REST;
      for (let t = 0; t <= ms; t += 1000 / 60) {
        const q = strikePose(kind, t / ms);
        expect(Math.abs(q.reach - prev.reach)).toBeLessThan(5);
        expect(Math.abs(q.level - prev.level), "under the sword's 0.9 radians a frame for an upright spear").toBeLessThan(0.6);
        prev = q;
      }
    }
  });

  test('the levelling turn brings a spear from its rest to point just above level, whatever its rest angle', () => {
    // Upright, turned about the side axis toward +z.
    expect(levelTurn([0, 1, 0], [1, 0, 0])).toBeCloseTo(Math.PI / 2 - LEVEL_TILT, 9);
    // Already leaning forward 0.7 toward +x, turned about -z (which tips the top toward +x).
    const s: [number, number, number] = [Math.sin(0.7), Math.cos(0.7), 0];
    const a = levelTurn(s, [0, 0, -1]);
    expect(a).toBeCloseTo(Math.PI / 2 - 0.7 - LEVEL_TILT, 9);
    // Turned by that, it points LEVEL_TILT above level.
    const turned = [Math.sin(0.7 + a), Math.cos(0.7 + a)];
    expect(Math.atan2(turned[1]!, turned[0]!)).toBeCloseTo(LEVEL_TILT, 9);
  });

  test('a bow is drawn, the arrow leaves the string, and a new one is nocked', () => {
    expect(strikePose('bow', 0.2).draw).toBeLessThan(-2);
    expect(strikePose('bow', 0.2).angle, 'the drawing hand comes back').toBeGreaterThan(0.35);
    expect(strikePose('bow', 0.2).arrow).toBe(true);
    expect(strikePose('bow', 0.4).arrow).toBe(false);
    expect(strikePose('bow', 0.95).arrow).toBe(true);
  });

  test('a rider rears then comes down', () => {
    expect(strikePose('rear', 0.24).rear).toBeCloseTo(0.3, 5);
    expect(strikePose('rear', 0.34).rear).toBeLessThan(0);
  });

  test('a block raises and pushes the shield, briefly; a flinch leans away and is knocked back', () => {
    const up = reactPose('block', 0.3);
    expect(up.angle, 'up and forward about the shoulder').toBeLessThan(-0.4);
    expect(up.push).toBeGreaterThan(0);
    expect(reactPose('block', 1)).toBe(UNMOVED);
    const f = reactPose('flinch', 0.2);
    expect(f.lift).toBe(0);
    expect(f.lean).toBeGreaterThan(0.12);
    expect(f.knock).toBeGreaterThan(1);
    expect(reactPose('flinch', 0.999).lean).toBeLessThan(0.01);
  });

  test('a melee blow lands as the lunge peaks; a shot lands after its flight', () => {
    expect(impactMs('swing', STRIKE_MS, 1)).toBe(135);
    expect(impactMs('bow', STRIKE_MS, 1)).toBeGreaterThan(135);
    expect(impactMs('bow', STRIKE_MS, 3)).toBeGreaterThan(impactMs('bow', STRIKE_MS, 2));
    expect(impactMs('sling', STRIKE_MS, 3)).toBeGreaterThan(impactMs('sling', STRIKE_MS, 1));
  });

  test('an exchange: the shield is up just before the blow; a dead defender does not block', () => {
    const ex = exchange({ attacker: 'warrior', defender: 'hoplite', hexes: 1, survives: true, counter: false });
    expect(ex.react).toEqual({ at: 135 - BLOCK_LEAD_MS, kind: 'block' });
    expect(ex.counter).toBeNull();
    expect(ex.end).toBe(STRIKE_MS);
    const dead = exchange({ attacker: 'warrior', defender: 'hoplite', hexes: 1, survives: false, counter: false });
    expect(dead.react).toBeNull();
    const shot = exchange({ attacker: 'archer', defender: 'archer', hexes: 2, survives: true, counter: false });
    expect(shot.react).toEqual({ at: impactMs('bow', STRIKE_MS, 2), kind: 'flinch' });
  });

  test('a counter strike comes once the block is up, and the attacker takes it the same way', () => {
    const ex = exchange({ attacker: 'swordsman', defender: 'spearman', hexes: 1, survives: true, counter: true });
    expect(ex.counter!.at).toBe(135 + COUNTER_AFTER_MS);
    expect(ex.counter!.kind).toBe('jab');
    expect(ex.counterReact!.kind).toBe('flinch');
    expect(ex.counterReact!.at).toBe(ex.counter!.at + impactMs('jab', ex.counter!.ms, 1));
    // The whole exchange ends within about 200 ms of today's 450 ms lunge (and within the counter's number, 600 ms).
    expect(ex.end).toBeLessThanOrEqual(STRIKE_MS + 200);
    expect(ex.counterReact!.at + REACT_MS).toBe(ex.end);
  });
});
