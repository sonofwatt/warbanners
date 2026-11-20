import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { createAppStore } from '../../app/store';
import type { Deps } from '../../app/store';
import type { AiClient } from '../../app/aiClient';
import { planTurn } from '../../ai/plan';
import type { KeyValue } from '../../app/saves';
import { StoreContext } from '../../app/useApp';
import { T } from '../text';
import { ScreenGuard } from './ScreenGuard';

const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });

function fakeStore() {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
  const deps: Deps = { kv, now: () => 1000, newSeed: () => 7, newId: () => 'm1', ai: thinker(), sleep: async () => {} };
  return createAppStore(deps);
}

test('a screen that throws is caught and noted', () => {
  expect(ScreenGuard.getDerivedStateFromError()).toEqual({ failed: true });
});

test('until something throws, the guard shows its screen', () => {
  const guard = new ScreenGuard({ children: <p>the screen</p> });
  expect(renderToStaticMarkup(<>{guard.render()}</>)).toBe('<p>the screen</p>');
});

test('once something has thrown, the guard says so in plain words and offers Home', () => {
  const store = fakeStore();
  const guard = new ScreenGuard({ children: <p>the screen</p> });
  guard.state = ScreenGuard.getDerivedStateFromError();
  const html = renderToStaticMarkup(<StoreContext.Provider value={store}>{guard.render()}</StoreContext.Provider>);
  expect(html).not.toContain('the screen');
  expect(html).toContain(T.ui.screenFailed);
  expect(html).toContain('data-testid="guard-home"');
  expect(html).toContain(T.ui.homeButton);
});
