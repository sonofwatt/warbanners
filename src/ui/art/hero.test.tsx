import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { CONFIG, UNITS } from '../../engine';
import { HeroMark, ItemBadge, itemBadgeX } from './hero';
import { ACCENT } from './palette';
import { MARK_R, MARK_STEP, PIP_H, PIP_Y, StatusOverlay } from './units';

const html = (el: ReactElement) => renderToStaticMarkup(<svg>{el}</svg>);

/** Every point a shape reaches, read from its attributes. Paths may use only absolute M, L, Q, C and Z. */
function extents(markup: string): { x: number; y: number; where: string }[] {
  const out: { x: number; y: number; where: string }[] = [];
  for (const m of markup.matchAll(/<(\w+)((?:\s[\w-]+="[^"]*")*)\s*\/?>/g)) {
    const tag = m[1]!;
    const where = m[0];
    const a: Record<string, string> = {};
    for (const q of (m[2] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) a[q[1]!] = q[2]!;
    const n = (k: string): number => Number(a[k] ?? 0);
    const pairs = (s: string): void => {
      const v = (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(v.length % 2, where).toBe(0);
      for (let i = 0; i < v.length; i += 2) out.push({ x: v[i]!, y: v[i + 1]!, where });
    };
    expect(a.transform, where).toBeUndefined();
    if (tag === 'polygon') pairs(a.points ?? '');
    if (tag === 'path') {
      expect(a.d ?? '', where).toMatch(/^[MLQCZ\d\s.,-]+$/);
      pairs(a.d ?? '');
    }
    if (tag === 'line') pairs(`${n('x1')} ${n('y1')} ${n('x2')} ${n('y2')}`);
    if (tag === 'rect') pairs(`${n('x')} ${n('y')} ${n('x') + n('width')} ${n('y') + n('height')}`);
    if (tag === 'circle') pairs(`${n('cx') - n('r')} ${n('cy') - n('r')} ${n('cx') + n('r')} ${n('cy') + n('r')}`);
    if (tag === 'ellipse') pairs(`${n('cx') - n('rx')} ${n('cy') - n('ry')} ${n('cx') + n('rx')} ${n('cy') + n('ry')}`);
  }
  return out;
}

// The largest health any unit can have: the biggest type plus Fierce.
const MOST_HP = Math.max(...Object.values(UNITS).map((u) => u.hp)) + CONFIG.heroes.fierceHp;

test('the hero mark and the draught badge stay inside the unit box and use only absolute paths', () => {
  // The mark rises behind the figure, inside x -20..20, and its top stays below the taunted and blinded badges,
  // which hang beside the plate down to PIP_Y + PIP_H / 2 + MARK_R.
  const belowMarks = PIP_Y + PIP_H / 2 + MARK_R;
  for (const accent of Object.values(ACCENT)) {
    const mark = html(<HeroMark accent={accent} />);
    expect(mark).toContain('data-hero-mark');
    expect(mark).toContain(accent);
    expect(mark).not.toMatch(/Gradient|filter/);
    const pts = extents(mark);
    expect(pts.length).toBeGreaterThan(4);
    for (const p of pts) {
      expect(p.x, p.where).toBeGreaterThanOrEqual(-20);
      expect(p.x, p.where).toBeLessThanOrEqual(20);
      expect(p.y, p.where).toBeGreaterThan(belowMarks);
      expect(p.y, p.where).toBeLessThanOrEqual(8);
    }
  }
  // The badge sits on the plate's row, never wider than the overlay's own reach: taunted and blinded beside
  // a 5-pip plate reach x -28.2, so the badge, fresh or not, stays within 28.2 on the right.
  const badge = html(<ItemBadge item="draught" />);
  expect(badge).toContain('data-item="draught"');
  for (const hp of [5, 10, 15, 20, MOST_HP]) {
    for (const fresh of [false, true]) {
      for (const p of extents(badge)) {
        const x = p.x + itemBadgeX(hp, fresh);
        expect(x, `${hp} ${fresh} ${p.where}`).toBeLessThanOrEqual(28.2);
        expect(x, `${hp} ${fresh} ${p.where}`).toBeGreaterThan(0);
        expect(p.y, p.where).toBeGreaterThanOrEqual(-46);
        expect(p.y, p.where).toBeLessThan(-36);
      }
    }
  }
  for (const p of extents(html(<StatusOverlay hp={MOST_HP} maxHp={MOST_HP} spent={false} fresh={false} taunted blinded />))) {
    expect(p.x, p.where).toBeGreaterThanOrEqual(-28.2);
  }
});

test('the draught badge takes the glint\'s slot, and moves one slot right when the unit is also fresh', () => {
  expect(itemBadgeX(10, true) - itemBadgeX(10, false)).toBeCloseTo(MARK_STEP);
  // The glint and the badge never overlap: the badge's leftmost point is right of the glint's rightmost.
  const glint = extents(html(<StatusOverlay hp={10} maxHp={10} spent={false} fresh taunted={false} blinded={false} />));
  const glintRight = Math.max(...glint.map((p) => p.x));
  const badgeLeft = Math.min(...extents(html(<ItemBadge item="draught" />)).map((p) => p.x)) + itemBadgeX(10, true);
  expect(badgeLeft).toBeGreaterThan(glintRight);
  // Not fresh, it sits where the glint would, clear of the plate.
  const plateRight = Math.max(...extents(html(<StatusOverlay hp={10} maxHp={10} spent={false} fresh={false} taunted={false} blinded={false} />)).map((p) => p.x));
  expect(Math.min(...extents(html(<ItemBadge item="draught" />)).map((p) => p.x)) + itemBadgeX(10, false)).toBeGreaterThan(plateRight);
});

test('the hero mark is unlike the taunted, blinded and fresh marks', () => {
  const mark = html(<HeroMark accent={ACCENT.spartans} />);
  for (const colour of ['#E0563F', '#6F6A80', '#FFC93C']) expect(mark).not.toContain(colour);
});
