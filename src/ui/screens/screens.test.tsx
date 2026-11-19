import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import { RULES_VERSION } from '../../engine';
import { createAppStore } from '../../app/store';
import type { Deps } from '../../app/store';
import type { KeyValue } from '../../app/saves';
import { StoreContext } from '../../app/useApp';
import { App } from '../App';
import { T } from '../text';
import { Home } from './Home';
import { Match } from './Match';
import { Pass } from './Pass';
import { Result } from './Result';

function fakeStore(id = 'm1') {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
  const deps: Deps = { kv, now: () => 1000, newSeed: () => 7, newId: () => id };
  return { map, deps, store: createAppStore(deps) };
}
const SETUP = { names: ['Ann', 'Ben'] as [string, string], factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
const render = (store: ReturnType<typeof fakeStore>['store'], el: ReactElement): string =>
  renderToStaticMarkup(<StoreContext.Provider value={store}>{el}</StoreContext.Provider>);

test('the curtain shows who is next and draws no board', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  const html = render(store, <Pass />);
  expect(html).toContain('Ann');
  expect(html).toContain(T.faction.spartans);
  expect(html).toContain("I&#x27;m Ann");
  expect(html).toContain('<button');
  expect(html).not.toContain('data-hex');
  expect(html).not.toContain('data-unit');
});

test('the match screen draws the chrome for the viewer and no board', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  const html = render(store, <Match />);
  expect(html).toContain('data-testid="gold">8<');
  expect(html).toContain('Turn 1');
  expect(html).toContain('data-testid="end-turn"');
  expect(html).toContain('data-testid="board-slot"');
  expect(html).not.toContain('data-unit');
  expect(html).not.toContain('data-hex');
});

test('while the curtain is up the app draws no Hud, no digest and no board slot', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  store.getState().run({ type: 'endTurn' });
  store.setState({ digest: [{ kind: 'cityLost' }] }); // the store keeps these set during the curtain
  const s = store.getState();
  expect(s.screen).toBe('pass');
  expect(s.last).not.toBeNull();
  const html = render(store, <App />);
  expect(html).toContain('Ben');
  expect(html).not.toContain('data-testid="end-turn"');
  expect(html).not.toContain('data-testid="gold"');
  expect(html).not.toContain('data-testid="board-slot"');
  expect(html).not.toContain(T.ui.digestCity);
});

test('home lists saves and explains notices', () => {
  const { store, deps, map } = fakeStore();
  store.getState().startMatch(SETUP);
  const fresh = createAppStore(deps);
  const html = render(fresh, <Home />);
  expect(html).toContain('Ann'); expect(html).toContain('Ben');
  expect(html).toContain('data-testid="continue"');
  expect(html).toContain('data-testid="new-match"');
  expect(html).not.toContain(T.ui.saveUnreadable);
  fresh.setState({ notice: 'saveUnreadable' });
  expect(render(fresh, <Home />)).toContain(T.ui.saveUnreadable);

  map.set('banners.save.m1', JSON.stringify({ ...JSON.parse(map.get('banners.save.m1')!) as object, rulesVersion: RULES_VERSION + 1 }));
  const old = render(createAppStore(deps), <Home />);
  expect(old).toContain(T.ui.fromOlder);
  expect(old).not.toContain('data-testid="continue"');
});

test('home offers the update, the offline note and the install hint', () => {
  const { store } = fakeStore();
  expect(render(store, <Home />)).not.toContain('data-testid="update"');
  store.setState({ update: { offlineReady: true, updateReady: true } });
  const html = render(store, <Home install={{ ua: '', standalone: false, canPrompt: true, prompt: () => {} }} />);
  expect(html).toContain(T.ui.offlineReady); expect(html).toContain(T.ui.updateReady);
  expect(html).toContain('data-testid="update"'); expect(html).toContain(T.ui.installButton);
  const ios = render(store, <Home install={{ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', standalone: false, canPrompt: false, prompt: () => {} }} />);
  expect(ios).toContain(T.ui.installIphone); expect(ios).not.toContain(T.ui.installButton);
  const done = render(store, <Home install={{ ua: 'iPhone', standalone: true, canPrompt: false, prompt: () => {} }} />);
  expect(done).not.toContain(T.ui.installIphone); expect(done).not.toContain(T.ui.installButton);
});

test('the result names the winner', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  store.getState().run({ type: 'resign' });
  expect(store.getState().screen).toBe('result');
  const html = render(store, <Result />);
  expect(html).toContain('Ben wins');
  expect(html).toContain(T.ui.byResignation);
  expect(html).toContain(T.ui.homeButton);
});
