import { expect, test } from 'vitest';
import { planTurn } from '../ai/plan';
import type { AiClient } from './aiClient';
import { createAppStore } from './store';
import type { Deps, Setup } from './store';
import { readLines, recentNames } from './stats';
import type { KeyValue } from './saves';

const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
function deps(over: Partial<Deps> = {}) {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
  return { map, kv, d: { kv, now: () => 5000, newSeed: () => 7, newId: () => 'm1', ai: thinker(), sleep: async () => {}, ...over } as Deps };
}
const PASS: Setup = { names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'] };

test('a pass-the-phone resign records a line for each player, once', () => {
  const { d, kv } = deps();
  const store = createAppStore(d);
  const get = store.getState;
  get().startMatch(PASS); get().ready();
  get().run({ type: 'resign' });
  expect(get().screen).toBe('result');
  const lines = readLines(kv, 5000);
  expect(lines.map(l => [l.name, l.kind, l.won])).toEqual(expect.arrayContaining([['Ann', 'pass', false], ['Ben', 'pass', true]]));
  expect(lines).toHaveLength(2);
  // Reopening the finished match and going home again changes nothing.
  get().resume('m1'); get().goHome();
  expect(readLines(kv, 5000)).toHaveLength(2);
});

test('against the computer only the person gets a line, with the AI level', () => {
  const { d, kv } = deps();
  const store = createAppStore(d);
  store.getState().startMatch({ ...PASS, second: 'hard' });
  store.getState().run({ type: 'resign' });
  const lines = readLines(kv, 5000);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ name: 'Ann', kind: 'computer', ai: 'hard', won: false });
});

test('a finished save from before stats existed is counted when opened', () => {
  const first = deps();
  const a = createAppStore(first.d);
  a.getState().startMatch(PASS); a.getState().ready(); a.getState().run({ type: 'resign' });
  // Wipe the stats as if this build had never run, then open the same phone again.
  first.map.delete('warbanners.stats.v1');
  const b = createAppStore(first.d);
  expect(readLines(first.kv, 5000)).toHaveLength(0);
  b.getState().resume('m1');
  expect(readLines(first.kv, 5000)).toHaveLength(2);
});

test('storage that refuses writes never stops the match reaching its result', () => {
  const { d, kv } = deps();
  const store = createAppStore(d);
  store.getState().startMatch(PASS); store.getState().ready();
  kv.setItem = () => { throw new Error('full'); };
  store.getState().run({ type: 'resign' });
  expect(store.getState().screen).toBe('result');
});

test('typed names are remembered, newest first; default names and AI names are not', () => {
  const { d, kv } = deps();
  const store = createAppStore(d);
  store.getState().startMatch({ names: ['Player 1', 'Cat'], factions: ['spartans', 'mongols'] });
  store.getState().goHome();
  store.getState().startMatch({ names: ['Dan', 'Player 2'], factions: ['spartans', 'mongols'], second: 'easy' });
  expect(recentNames(kv)).toEqual(['Dan', 'Cat']);
});

test('the Stats screen opens with the lines, and forgetting a player drops them', () => {
  const { d } = deps();
  const store = createAppStore(d);
  const get = store.getState;
  get().startMatch(PASS); get().ready(); get().run({ type: 'resign' }); get().goHome();
  get().openStats();
  expect(get().screen).toBe('stats');
  expect(get().statLines).toHaveLength(2);
  get().forgetPlayer('Ann');
  expect(get().statLines.map(l => l.name)).toEqual(['Ben']);
  get().goHome();
  expect(get().screen).toBe('home');
});
