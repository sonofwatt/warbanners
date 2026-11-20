import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { expect, test } from 'vitest';
import { RULES_VERSION } from '../../engine';
import { addCity, addUnit, blankMatch } from '../../engine/testkit';
import { createAppStore } from '../../app/store';
import type { Deps } from '../../app/store';
import type { AiClient } from '../../app/aiClient';
import { planTurn } from '../../ai/plan';
import type { KeyValue } from '../../app/saves';
import { StoreContext } from '../../app/useApp';
import { App } from '../App';
import { T, fill } from '../text';
import { Home } from './Home';
import { Match, nextUnitDisabled, turnFocus } from './Match';
import { Pass } from './Pass';
import { Result, resultSound } from './Result';
import { Setup, setupLine } from './Setup';
import { Hud } from '../panels/Hud';

const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });

function fakeStore(id = 'm1') {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
  const deps: Deps = { kv, now: () => 1000, newSeed: () => 7, newId: () => id, ai: thinker(), sleep: async () => {} };
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
  expect(html).toContain('data-testid="gold">10<');
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

  map.set('warbanners.save.m1', JSON.stringify({ ...JSON.parse(map.get('warbanners.save.m1')!) as object, rulesVersion: RULES_VERSION + 1 }));
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

test('setup offers a person or the AI at four levels for the second seat', () => {
  const { store } = fakeStore();
  const html = render(store, <Setup />);
  expect(html).toContain(T.ui.secondPlayer);
  for (const label of [T.ui.person, T.ai.name.easy, T.ai.name.normal, T.ai.name.hard, T.ai.name.adaptive]) expect(html).toContain(`>${label}<`);
  const chosen = (h: string): string[] => [...h.matchAll(/<button[^>]*aria-checked="true"[^>]*data-testid="second-(\w+)"/g)].map((m) => m[1]!);
  expect(chosen(html)).toEqual(['human']);
  expect(html).toContain('data-testid="name-1"');
  // Choosing an AI hides the second name: src/browser/flow.test.ts taps it in a real browser.
});

test('with equal start gold, setup says only who moves first; a gold difference is still told', () => {
  const { store } = fakeStore();
  const html = render(store, <Setup />);
  expect(html).not.toContain('more gold');
  expect(html).toContain(`>${fill(T.ui.firstMoves, { first: T.ui.playerOne })}<`);
  expect(setupLine('Ann', 'Ben', 0)).toBe('Ann moves first.');
  expect(setupLine('Ann', 'Ben', 2)).toBe('Ann moves first and Ben starts with 2 more gold.');
});

test('the Home tagline fits play against a friend or the AI', () => {
  expect(T.ui.tagline).not.toMatch(/two rival peoples/i);
  expect(T.ui.tagline.length).toBeLessThanOrEqual(45);   // one line on Home at 412 wide
});

test('Next unit is greyed when no unit can act, while the AI plays, during the End turn lock, and under a sheet', () => {
  const free = { canAct: 2, aiBusy: false, locked: false, covered: false };
  expect(nextUnitDisabled(free)).toBe(false);
  expect(nextUnitDisabled({ ...free, canAct: 0 })).toBe(true);
  expect(nextUnitDisabled({ ...free, aiBusy: true })).toBe(true);
  expect(nextUnitDisabled({ ...free, locked: true })).toBe(true);
  expect(nextUnitDisabled({ ...free, covered: true })).toBe(true);
});

test('the match screen draws Next unit, greyed while End turn is locked', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  const html = render(store, <Match />);
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="next-unit"|<button[^>]*data-testid="next-unit"[^>]*disabled=""/);   // the lock is on when the screen first draws
});

test('an enemy city opened from under my unit shows only what the board shows', () => {
  const { store } = fakeStore();
  store.getState().startMatch(SETUP);
  store.getState().ready();
  const s = blankMatch();
  for (const p of s.players) p.explored = Object.keys(s.tiles).sort();
  addCity(s, 0, 0, 3); const foe = addCity(s, 1, 0, -3, { growth: 1 });
  const w = addUnit(s, 'warrior', 0, 0, -3);
  store.setState({ state: s });
  store.getState().tap({ unit: w.id, hex: '0,-3' });
  store.getState().tap({ unit: null, hex: '0,-3' });
  expect(store.getState().selection).toEqual({ kind: 'city', id: foe.id });
  const html = render(store, <Match />);
  expect(html).toContain('city-panel');
  expect(html).toContain(`>${T.ui.level}<`);
  expect(html).toContain(`>${T.ui.walls}<`);
  for (const hidden of [T.ui.growth, T.ui.unitsHeld, T.ui.incomeWord]) expect(html).not.toContain(`>${hidden}<`);
  expect(html).not.toContain('data-testid="cmd-');
});

test('the Hud says the AI is thinking', () => {
  const props = {
    name: 'Ann', colour: '#f00', faction: 'spartans' as const, gold: 8, income: 2, round: 1, unitsToAct: 1, techReady: false,
    onOpenTech: () => {}, onOpenMenu: () => {}, onEndTurn: () => {}, onNextUnit: () => {},
  };
  expect(renderToStaticMarkup(<Hud {...props} />)).not.toContain(T.ai.thinking);
  const html = renderToStaticMarkup(<Hud {...props} thinking endDisabled />);
  expect(html).toContain(T.ai.thinking);
  expect(html).toMatch(/disabled=""[^>]*data-testid="end-turn"|data-testid="end-turn"[^>]*disabled=""/);
});

test('the match screen shows Thinking while the AI plays, and a blocked move\'s reason', () => {
  const { store } = fakeStore();
  store.getState().startMatch({ ...SETUP, second: 'easy' });
  expect(store.getState()).toMatchObject({ screen: 'match', viewer: 0 });
  expect(render(store, <Match />)).not.toContain(T.ai.thinking);
  store.setState({ aiBusy: true });
  expect(render(store, <Match />)).toContain(T.ai.thinking);
  store.setState({ aiBusy: false, notice: 'blockedUnseen' });
  expect(render(store, <Match />)).toContain(T.ui.blockedUnseen);
  store.setState({ notice: 'aiPassed' });
  expect(render(store, <Match />)).toContain(T.ui.aiPassed);
});

test('the result of an adaptive match says where the AI settled', () => {
  const { store } = fakeStore();
  store.getState().startMatch({ ...SETUP, second: 'adaptive' });
  const rec = store.getState().record!;
  const seat = rec.players[1]!;
  if (seat.kind !== 'ai') throw new Error('no AI');
  store.getState().run({ type: 'resign' });
  store.setState({ record: { ...store.getState().record!, players: [rec.players[0]!, { ...seat, adapt: { dial: 0.62, trend: 0 } }] } });
  const html = render(store, <Result />);
  expect(html).toContain('The AI finished at level 6 of 10.');
  const plain = fakeStore(); plain.store.getState().startMatch({ ...SETUP, second: 'hard' }); plain.store.getState().run({ type: 'resign' });
  expect(render(plain.store, <Result />)).not.toContain('The AI finished');
});
