import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import { createAppStore } from '../../app/store';
import type { Deps } from '../../app/store';
import type { KeyValue } from '../../app/saves';
import { StoreContext } from '../../app/useApp';
import { T } from '../text';
import { Result } from './Result';
import { Setup } from './Setup';
import { OnlineSetup } from './OnlineSetup';
import { Stats } from './Stats';
import { Home } from './Home';

function fakeStore() {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
  const deps = { kv, now: () => 1000, newSeed: () => 7, newId: () => 'm1', ai: { think: async () => { throw new Error('no'); }, dispose: () => {} }, sleep: async () => {} } as unknown as Deps;
  return { map, store: createAppStore(deps) };
}
const render = (store: ReturnType<typeof fakeStore>['store'], el: ReactElement): string =>
  renderToStaticMarkup(<StoreContext.Provider value={store}>{el}</StoreContext.Provider>);
const SETUP = { names: ['Ann', 'Ben'] as [string, string], factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
const finishOne = (store: ReturnType<typeof fakeStore>['store']) => {
  store.getState().startMatch(SETUP); store.getState().ready(); store.getState().run({ type: 'resign' });
};

test('Home has a way to the stats', () => {
  const { store } = fakeStore();
  expect(render(store, <Home />)).toContain('data-testid="open-stats"');
});

test('Stats with nothing recorded says so', () => {
  const { store } = fakeStore();
  store.getState().openStats();
  const html = render(store, <Stats />);
  expect(html).toContain('data-testid="stats-empty"');
  expect(html).toContain('data-testid="stats-home"');
});

test('Stats shows the most recent player first, with their numbers and the recent match', () => {
  const { store } = fakeStore();
  finishOne(store); store.getState().goHome(); store.getState().openStats();
  const html = render(store, <Stats />);
  expect(html).toMatch(/data-testid="stat-played"><dt>Played<\/dt><dd>1<\/dd>/);
  expect(html).toContain('data-testid="stats-player-Ann"');
  expect(html).toContain('data-testid="stats-player-Ben"');
  expect(html).toContain('data-testid="stats-recent-row"');
  expect(html).toContain('data-testid="stats-forget"');
});

test('Setup offers the names used before, and fills the first', () => {
  const { store } = fakeStore();
  finishOne(store); store.getState().goHome();
  store.getState().openSetup();
  const html = render(store, <Setup />);
  expect(html).toMatch(/data-testid="name-0"[^>]*value="Ann"/);
  // Ann is already in field 1, so only Ben is offered.
  expect(html).toContain(`aria-label="Use the name Ben"`);
  expect(html).not.toContain(`aria-label="Use the name Ann"`);
});

test('online setup is filled with the last name too', () => {
  const { store } = fakeStore();
  finishOne(store); store.getState().goHome();
  store.getState().openOnline();
  expect(render(store, <OnlineSetup />)).toMatch(/data-testid="online-name"[^>]*value="Ann"/);
});

test('the result shows both sides for the match', () => {
  const { store } = fakeStore();
  finishOne(store);
  const html = render(store, <Result />);
  expect(html).toContain('data-testid="result-tally"');
  expect(html).toContain(T.stats.tallyDealt);
  expect(html).toContain('<th scope="col">Ann</th><th scope="col">Ben</th>');
});
