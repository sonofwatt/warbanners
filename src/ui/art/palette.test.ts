import { expect, test } from 'vitest';
import { ACCENT, MIRROR_ACCENT, MIRROR_COLOUR, PLAYER_COLOURS, seatAccent, seatColour, seatLook } from './palette';

test('a mirror match draws its second seat in the mirror colours, so the two sides never look alike', () => {
  const both = ['woodland', 'woodland'] as const;
  expect(seatColour(both, 0)).toEqual(PLAYER_COLOURS.woodland);
  expect(seatColour(both, 1)).toEqual(MIRROR_COLOUR);
  expect(seatColour(both, 0).main).not.toBe(seatColour(both, 1).main);
  expect(seatAccent(both, 1)).toBe(MIRROR_ACCENT);
  for (const f of ['spartans', 'mongols'] as const) expect(seatColour([f, f], 1)).toEqual(MIRROR_COLOUR);
});

test('two peoples keep their own colours, as before rules 11', () => {
  expect(seatColour(['spartans', 'mongols'], 0)).toEqual({ main: '#B3261E', dark: '#8E1D17' });
  expect(seatColour(['spartans', 'mongols'], 1)).toEqual({ main: '#2D6DB5', dark: '#1F4F87' });
  expect(seatColour(['mongols', 'spartans'], 1)).toEqual(PLAYER_COLOURS.spartans);
  expect(seatLook(['woodland', 'mongols'], 0)).toEqual({ colour: PLAYER_COLOURS.woodland, accent: ACCENT.woodland });
});

test('the mirror colour is distinct from every faction colour', () => {
  for (const c of Object.values(PLAYER_COLOURS)) expect(c.main).not.toBe(MIRROR_COLOUR.main);
});
