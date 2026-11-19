import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Effects } from './Effects';
import type { Effect } from './effects';
import { hexToBoard } from './layout';

const draw = (effects: Effect[]): string =>
  renderToStaticMarkup(
    <svg>
      <Effects effects={effects} factions={['spartans', 'mongols']} />
    </svg>,
  );

test('a number is drawn on its tile in its tone, after its delay', () => {
  const html = draw([{ kind: 'number', at: '1,0', text: '-3', tone: 'hurt', delay: 120 }]);
  const at = hexToBoard('1,0');
  expect(html).toContain(`transform="translate(${Math.round(at.x * 100) / 100} ${Math.round(at.y * 100) / 100})"`);
  expect(html).toContain('-3');
  expect(html).toContain('fx-number fx-hurt');
  expect(html).toContain('animation-delay:120ms');
});

test('heal and gold numbers have their own tones', () => {
  const html = draw([
    { kind: 'number', at: '0,0', text: '+4', tone: 'heal', delay: 0 },
    { kind: 'number', at: '0,0', text: '+2', tone: 'gold', delay: 0 },
  ]);
  expect(html).toContain('fx-heal');
  expect(html).toContain('fx-gold');
});

test('a fall draws the fallen unit in its owner\'s colour where it stood', () => {
  const html = draw([{ kind: 'fall', unitType: 'warrior', owner: 1, at: '1,0', delay: 0 }]);
  expect(html).toContain('fx-fall');
  expect(html).toContain('#2D6DB5'); // the Mongol blue
  expect(html).not.toContain('#B3261E');
});

test('a burst is a small flash on its tile; a lunge draws nothing of its own', () => {
  const html = draw([
    { kind: 'burst', at: '0,0', tone: 'capture', delay: 0 },
    { kind: 'lunge', unit: 3, toward: '1,0', delay: 0 },
  ]);
  expect(html).toContain('fx-burst fx-capture');
  expect((html.match(/class="fx-/g) ?? []).length).toBe(1);
});

test('effects never take a tap', () => {
  expect(draw([{ kind: 'number', at: '0,0', text: '-1', tone: 'hurt', delay: 0 }])).toMatch(
    /<g class="fx" pointer-events="none"/,
  );
});
