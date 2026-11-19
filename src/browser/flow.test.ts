import type { Page } from 'playwright';
import { describe, expect, test } from 'vitest';
import { frames, openApp } from './harness';

// The whole game in a real browser, opened with ?seed=7. Facts about seed 7, checked against the engine:
// Player 1 (Spartans) moves first with 8 gold and one Warrior (unit 0) on the capital at -2,5, which can
// move to -1,4. Training a Warrior then costs 2. Player 2 (Mongols) starts its turn with 10 gold.

const SEED = '?seed=7';

/** Taps a tile at the centre of its data-centre marker, as a finger would. */
async function tapTile(page: Page, hex: string): Promise<void> {
  const box = await page.locator(`[data-centre="${hex}"]`).boundingBox();
  if (box === null) throw new Error(`tile ${hex} has no box`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await frames(page);
}

const count = (page: Page, selector: string): Promise<number> => page.locator(selector).count();
const text = async (page: Page, id: string): Promise<string> => (await page.getByTestId(id).textContent()) ?? '';
const bodyText = async (page: Page): Promise<string> => (await page.locator('body').textContent()) ?? '';

/** The curtain is up and nothing of the board is in the page, then the named player takes the phone. */
async function throughCurtain(page: Page, name: string): Promise<void> {
  await page.getByTestId('pass').waitFor();
  expect(await bodyText(page)).toContain(name);
  expect(await count(page, '[data-hex]')).toBe(0);
  expect(await count(page, '[data-unit]')).toBe(0);
  await page.getByTestId('ready').tap();
  await page.getByTestId('match').waitFor();
  await page.locator('[data-centre]').first().waitFor({ state: 'attached' });
  await frames(page);
}

/** End turn is locked for a moment after the match appears; wait until it can be tapped. */
async function endTurnReady(page: Page): Promise<void> {
  await expect.poll(() => page.getByTestId('end-turn').isEnabled()).toBe(true);
}

async function startMatch(page: Page): Promise<void> {
  await page.getByTestId('new-match').tap();
  await page.getByTestId('start').tap();
}

interface Problem { what: string; box: { x: number; y: number; w: number; h: number } }

/**
 * Layout problems on the current screen: sideways scroll, and any visible button smaller than 44 by 44
 * or not fully inside the viewport. A button scrolled out of sight inside a scrolling panel is not visible;
 * one that a scrolling panel cuts at its edge is reached by scrolling, so there the panel itself must be
 * fully inside the viewport instead.
 */
function layoutProblems(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const out: { what: string; box: { x: number; y: number; w: number; h: number } }[] = [];
    const vw = window.innerWidth, vh = window.innerHeight;
    const inside = (r: DOMRect): boolean => r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
    if (document.documentElement.scrollWidth > vw) {
      out.push({ what: `page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`, box: { x: 0, y: 0, w: 0, h: 0 } });
    }
    for (const b of Array.from(document.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      const st = getComputedStyle(b);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
      let hidden = false;
      let scroller: Element | null = null;
      for (let el = b.parentElement; el !== null && el !== document.body; el = el.parentElement) {
        const o = getComputedStyle(el);
        if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
        const c = el.getBoundingClientRect();
        if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) { hidden = true; break; }
        if (scroller === null && (o.overflowY === 'auto' || o.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) scroller = el;
      }
      if (hidden) continue;
      const box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      const name = b.dataset.testid ?? b.textContent ?? '?';
      if (r.width < 44 || r.height < 44) out.push({ what: `${name} is smaller than 44 by 44`, box });
      const onScreen = scroller === null ? inside(r) : inside(scroller.getBoundingClientRect());
      if (!onScreen) out.push({ what: `${name} is not fully on screen`, box });
    }
    return out;
  });
}

async function expectTidy(page: Page, screen: string): Promise<void> {
  await frames(page);
  const problems = await layoutProblems(page);
  expect(problems, screen).toEqual([]);
}

/** End turn is on screen and nothing covers its centre. */
async function expectEndTurnUncovered(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="end-turn"]');
    if (b === null) return 'missing';
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'off screen';
    const hit = document.elementFromPoint(x, y);
    return hit !== null && (hit === b || b.contains(hit)) ? 'ok' : `covered by ${hit?.className ?? 'nothing'}`;
  });
  expect(ok).toBe('ok');
}

describe.runIf(process.env.BROWSER === '1')('the whole game in a browser', () => {
  test('a whole hot-seat exchange, a reload, and a resignation', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await startMatch(page);
      await throughCurtain(page, 'Player 1');

      expect(await text(page, 'gold')).toBe('8');
      expect(await text(page, 'turn')).toBe('Turn 1');
      expect(await text(page, 'who')).toBe('Player 1');

      await tapTile(page, '-2,5'); // the warrior
      expect(await count(page, '[data-mark="move"]')).toBeGreaterThan(0);
      await tapTile(page, '-1,4');
      await expect.poll(() => page.locator('[data-unit="0"]').getAttribute('data-at')).toBe('-1,4');

      await tapTile(page, '-2,5'); // the city, now free
      await page.locator('[data-testid="cmd-train-warrior"]').tap();
      await expect.poll(() => text(page, 'gold')).toBe('6');
      expect(await count(page, '[data-unit]')).toBe(2);

      await endTurnReady(page);
      await page.getByTestId('end-turn').tap();
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'who')).toBe('Player 2');
      expect(await text(page, 'gold')).toBe('10');
      expect(await text(page, 'turn')).toBe('Turn 1');

      await page.reload();
      await page.getByTestId('new-match').waitFor();
      expect(await count(page, '[data-testid="save"]')).toBe(1);
      expect(await count(page, '[data-hex]')).toBe(0);
      await page.getByTestId('continue').tap();
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'gold')).toBe('10');

      await page.getByTestId('open-menu').tap();
      await page.getByTestId('resign').tap();
      await page.getByTestId('resign-yes').tap();
      await page.getByTestId('winner').waitFor();
      expect(await bodyText(page)).toContain('Player 1 wins');
      expect(await count(page, '[data-hex]')).toBe(0);
      await page.getByTestId('result-home').tap();
      await page.getByTestId('new-match').waitFor();
      expect(await count(page, '[data-testid="save"]')).toBe(0);
    } finally {
      await close();
    }
  });

  test.each([[360, 640], [412, 915], [915, 412]])('nothing is clipped at %i by %i', async (width, height) => {
    const { page, close } = await openApp(SEED, { width, height });
    try {
      await page.getByTestId('new-match').waitFor();
      await expectTidy(page, 'home');
      await page.getByTestId('new-match').tap();
      await page.getByTestId('start').waitFor();
      await expectTidy(page, 'setup');
      await page.getByTestId('start').tap();
      await page.getByTestId('pass').waitFor();
      await expectTidy(page, 'curtain');
      await throughCurtain(page, 'Player 1');
      await endTurnReady(page);

      await tapTile(page, '-2,5');
      await page.locator('.selection').waitFor();
      await expectTidy(page, 'match with a unit selected');
      await expectEndTurnUncovered(page);

      await page.getByTestId('open-tech').tap();
      await page.locator('.tech-sheet').waitFor();
      await expectTidy(page, 'tech sheet');
      await expectEndTurnUncovered(page);
      await page.getByTestId('close-sheet').tap();

      await page.getByTestId('open-menu').tap();
      await page.locator('.menu').waitFor();
      await expectTidy(page, 'menu');
      await expectEndTurnUncovered(page);
      await page.getByTestId('resign').tap();
      await expectTidy(page, 'menu asking to resign');
      await page.getByTestId('resign-yes').tap();

      await page.getByTestId('winner').waitFor();
      await expectTidy(page, 'result');
      await page.getByTestId('result-home').tap();
      await page.getByTestId('new-match').waitFor();
      await expectTidy(page, 'home again');
    } finally {
      await close();
    }
  });

  test('a double tap on End turn ends one turn', async () => {
    const { page, close } = await openApp(SEED);
    try {
      await startMatch(page);
      await throughCurtain(page, 'Player 1');
      await endTurnReady(page);
      const box = await page.getByTestId('end-turn').boundingBox();
      if (box === null) throw new Error('End turn has no box');
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const t0 = Date.now();
      await page.touchscreen.tap(x, y);
      await page.touchscreen.tap(x, y);
      expect(Date.now() - t0).toBeLessThan(100);
      await throughCurtain(page, 'Player 2');
      expect(await text(page, 'who')).toBe('Player 2');
      expect(await text(page, 'turn')).toBe('Turn 1');
    } finally {
      await close();
    }
  });
}, 120_000);
