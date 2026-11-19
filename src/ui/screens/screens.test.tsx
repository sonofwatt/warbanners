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
import { Match, turnFocus } from './Match';
import { Pass } from './Pass';
import { Result, resultSound } from './Result';

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

test('the match screen draws the viewer\'s view only', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  const html = render(store, <Match />);
  expect(html.match(/data-hex=/g)?.length).toBe(127);
  expect(html.match(/data-unit=/g)?.length).toBe(1);
  expect(html).toContain('data-testid="gold">8<');
  expect(html).toContain('Turn 1');
  expect(html).toContain('data-testid="end-turn"');
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
  expect(html).not.toContain('data-hex');
  expect(html).not.toContain('data-unit');
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

test('the match screen says when the match could not be saved, and the line can be dismissed', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  expect(render(store, <Match />)).not.toContain(T.ui.saveFailed);
  store.setState({ notice: 'saveFailed' });
  const html = render(store, <Match />);
  expect(html).toContain(T.ui.saveFailed);
  expect(html).toContain('data-testid="match-notice"');
  expect(html).toContain('data-testid="dismiss-notice"');
  // Notices about other things wait for Home.
  store.setState({ notice: 'saveUnreadable' });
  expect(render(store, <Match />)).not.toContain(T.ui.saveUnreadable);
});

test('the curtain says when a save was repaired or an old match was dropped', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  expect(render(store, <Pass />)).not.toContain('data-testid="notice"');
  store.setState({ notice: 'saveRepaired' });
  let html = render(store, <Pass />);
  expect(html).toContain(T.ui.saveRepaired); expect(html).toContain('data-testid="dismiss-notice"');
  store.setState({ notice: 'saveDropped' });
  html = render(store, <Pass />);
  expect(html).toContain(T.ui.saveDropped);
  expect(html).not.toContain('data-hex');
});

test('home says when an old unfinished match was removed', () => {
  const { store } = fakeStore();
  store.setState({ notice: 'saveDropped' });
  expect(render(store, <Home />)).toContain(T.ui.saveDropped);
});

test('the curtain button waits a moment, like End turn', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  expect(render(store, <Pass />)).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ready"|<button[^>]*data-testid="ready"[^>]*disabled=""/);
});

test('the result plays the win once, and only for a match that has just been won', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  store.getState().run({ type: 'resign' });
  expect(resultSound(store.getState().last)).toBe('win');
  expect(resultSound(null)).toBeNull();
  expect(resultSound({ seq: 1, events: [{ type: 'moved', unit: 1, from: '0,0', to: '1,0' }], before: store.getState().state! })).toBeNull();
});

test('the camera aims at the focus once a turn, so moving the focus unit keeps the pan and zoom', () => {
  const start = turnFocus(null, '1:0', '0,0');
  expect(start).toEqual({ key: '1:0', focus: '0,0' });
  // The lowest-id unit (the focus of a player with no capital) moved: same turn, same focus object.
  expect(turnFocus(start, '1:0', '1,0')).toBe(start);
  expect(turnFocus(start, '2:0', '1,0')).toEqual({ key: '2:0', focus: '1,0' });
});
