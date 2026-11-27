import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { UNITS } from '../../engine';
import type { UnitTypeId } from '../../engine';
import { EMBLEMS, Emblem, GOLD_PAINT, emblemPaint } from './emblems';
import { playerColour } from './palette';

const TYPES = Object.keys(UNITS) as UnitTypeId[];

test('every unit type has its own emblem, in both forms and in any paint', () => {
  expect(new Set(Object.keys(EMBLEMS))).toEqual(new Set(TYPES));
  for (const paint of [emblemPaint(playerColour('spartans')), GOLD_PAINT]) {
    const drawn = TYPES.map((t) => {
      const full = renderToStaticMarkup(<svg><Emblem type={t} paint={paint} /></svg>);
      const small = renderToStaticMarkup(<svg><Emblem type={t} paint={paint} small /></svg>);
      expect(full, t).toContain(`data-emblem="${t}"`);
      expect(full, t).toContain(paint.main);
      expect(small.length, `${t}: the small form has less in it`).toBeLessThan(full.length);
      return full.replace(`data-emblem="${t}"`, '');
    });
    expect(new Set(drawn).size, 'no two types share an emblem').toBe(TYPES.length);
  }
});
