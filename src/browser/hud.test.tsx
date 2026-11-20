import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Hud } from '../ui/panels/Hud';
import { T, fill } from '../ui/text';
import { frames, openApp } from './harness';

// The online Hud with the longest names a player can give (MAX_NAME is 16; 15 letters with a space, as a person
// would type them), drawn with the built stylesheet at every phone size: the turn sentence is never cut, the
// name in it is never split inside a word, the viewer's own name keeps a few letters, and the Hud keeps its
// rows (two at most in portrait, one in a short landscape) with no control over another.

const LONG = 'Bartholomew Oxl';
const SIZES: [number, number][] = [[360, 640], [412, 915], [915, 412], [568, 320]];

// `waits`: the player's own turn while the connection is down, "Your turn, once online", which names nobody.
function hudPage(css: string, clock: string, paused: boolean, waits = false): string {
  const noop = (): void => {};
  const hud = renderToStaticMarkup(
    <Hud
      name={LONG} colour="#2D6DB5" faction="mongols" gold={10} income={2} round={12} unitsToAct={0} techReady={false}
      endDisabled nextDisabled status={waits ? T.ui.yourTurnWaits : fill(T.ui.theirTurn, { name: LONG })} statusName={waits ? undefined : LONG}
      statusShort={waits ? T.ui.yourTurnWaitsShort : undefined} clock={clock} clockPaused={paused}
      onOpenTech={noop} onOpenMenu={noop} onEndTurn={noop} onNextUnit={noop}
    />,
  );
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>`
    + `<body><main class="app"><div class="screen match">${hud}<div class="board-slot"></div></div></main></body></html>`;
}

interface Measure {
  sentenceCut: boolean; statusLines: number; nameLines: number; nameEllipsis: boolean; restVisible: boolean;
  whoWidth: number; turnShown: boolean; rows: number; hudHeight: number; overlaps: string[]; small: string[];
}

describe.runIf(process.env.BROWSER === '1')('the online Hud with long names', () => {
  const dir = 'dist/assets';
  const cssFile = readdirSync(dir).find((f) => f.endsWith('.css'));
  const css = cssFile === undefined ? '' : readFileSync(`${dir}/${cssFile}`, 'utf8');

  test.each(SIZES)('the turn sentence and both names stay readable at %i by %i', async (width, height) => {
    expect(css.length).toBeGreaterThan(0);
    const { page, close } = await openApp('', { width, height });
    try {
      for (const [clock, paused, waits] of [['1:59', false, false], [T.ui.clockPaused, true, false], ['1:59', false, true]] as const) {
        await page.setContent(hudPage(css, clock, paused, waits));
        await frames(page);
        const m: Measure = await page.evaluate(() => {
          const box = (el: Element) => el.getBoundingClientRect();
          const status = document.querySelector('[data-testid="hud-status"]') as HTMLElement;
          // "Your turn, once online" has no name in it: the whole sentence stands in for both parts.
          const name = (status.querySelector('.status-name') ?? status) as HTMLElement;
          const rest = (status.querySelector('.status-rest') ?? status) as HTMLElement;
          const sr = box(status), rr = box(rest), nr = box(name);
          const lh = parseFloat(getComputedStyle(name).lineHeight) || nr.height;
          const statusLh = parseFloat(getComputedStyle(status).lineHeight) || sr.height;
          const who = document.querySelector('.hud-name strong') as HTMLElement;
          const hud = document.querySelector('.hud') as HTMLElement;
          const parts = Array.from(hud.querySelectorAll('button, .pill, .hud-who, [data-testid="hud-status"]')) as HTMLElement[];
          const shown = parts.filter((e) => { const r = box(e); return r.width > 0 && r.height > 0; });
          const rows = new Set<number>();
          for (const e of shown) if (e.matches('button')) rows.add(Math.round(box(e).top / 24));
          const overlaps: string[] = [];
          for (let i = 0; i < shown.length; i++) {
            for (let j = i + 1; j < shown.length; j++) {
              const a = box(shown[i]!), b = box(shown[j]!);
              if (shown[i]!.contains(shown[j]!) || shown[j]!.contains(shown[i]!)) continue;
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 1 && y > 1) overlaps.push(`${shown[i]!.className || shown[i]!.tagName} over ${shown[j]!.className || shown[j]!.tagName}`);
            }
          }
          const small = shown.filter((e) => e.matches('button') && (box(e).width < 44 || box(e).height < 44)).map((e) => e.dataset.testid ?? '?');
          return {
            sentenceCut: status.scrollHeight > status.clientHeight + 1 || rr.right > sr.right + 1 || rr.left < sr.left - 1 || rr.bottom > sr.bottom + 1,
            statusLines: Math.round(sr.height / statusLh),
            nameLines: Math.round(nr.height / lh),
            nameEllipsis: name.scrollWidth <= name.clientWidth || getComputedStyle(name).textOverflow === 'ellipsis',
            restVisible: rr.width > 0 && rr.height > 0 && rr.right <= window.innerWidth,
            whoWidth: who.getBoundingClientRect().width,
            turnShown: Array.from(document.querySelectorAll('.turn-full, .turn-short')).some((e) => { const r = box(e); return r.width > 4 && r.height > 4 && getComputedStyle(e).clipPath === 'none'; }),
            rows: rows.size, hudHeight: box(hud).height, overlaps, small,
          };
        });
        const when = `${width}x${height}${paused ? ' paused' : ''}${waits ? ' waiting for the connection' : ''}`;
        expect(m.sentenceCut, `${when}: the turn sentence is cut`).toBe(false);
        expect(m.restVisible, `${when}: "'s turn" is not shown`).toBe(true);
        expect(m.statusLines, `${when}: the turn sentence takes more than two lines`).toBeLessThanOrEqual(2);
        if (!waits) {
          expect(m.nameLines, `${when}: the name breaks over lines`).toBe(1);
          expect(m.nameEllipsis, `${when}: a cut name has no ellipsis`).toBe(true);
        }
        expect(m.whoWidth, `${when}: the viewer's own name is squeezed`).toBeGreaterThanOrEqual(36);
        expect(m.overlaps, when).toEqual([]);
        expect(m.small, when).toEqual([]);
        expect(m.turnShown, `${when}: the round number is not on screen`).toBe(true);
        const landscape = width > height;
        expect(m.rows, `${when}: Hud rows`).toBeLessThanOrEqual(landscape ? 1 : 2);
        // The full sentence is there for the reader and for tests, however it is drawn.
        expect(await page.getByTestId('hud-status').textContent()).toBe(waits ? T.ui.yourTurnWaits : fill(T.ui.theirTurn, { name: LONG }));
      }
    } finally {
      await close();
    }
  });
});
