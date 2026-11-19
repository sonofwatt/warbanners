import { expect, test } from 'vitest';
import { hashState } from '../engine';
import { NONE } from '../ui/interaction';
import { browserDeps, createAppStore } from './store';
import type { Deps, Setup } from './store';
import type { Updater } from './update';
import { restore } from './record';
import { listSaves, readSave } from './saves';
import type { KeyValue } from './saves';

function deps(over: Partial<Deps> = {}) {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
  return { map, d: { kv, now: () => 1000, newSeed: () => 7, newId: () => 'm1', ...over } as Deps };
}
const SETUP: Setup = { names: ['Ann', 'Ben'], factions: ['spartans', 'mongols'] };
const started = (over: Partial<Deps> = {}) => { const x = deps(over); const store = createAppStore(x.d); store.getState().startMatch(SETUP); return { ...x, store, get: store.getState }; };

test('a new match starts behind the curtain and is saved at once', () => {
  const { get, d } = started();
  expect(get()).toMatchObject({ screen: 'pass', viewer: null, notice: null });
  expect(get().state!.current).toBe(0);
  expect(listSaves(d.kv).map(s => s.id)).toEqual(['m1']);
  get().ready();
  expect(get()).toMatchObject({ screen: 'match', viewer: 0 });
});
test('tap to select, tap to move, and the move is on the phone', () => {
  const { get, d } = started(); get().ready();
  get().tap({ unit: 0, hex: '-2,5' });
  expect(get().selection).toMatchObject({ kind: 'unit', id: 0 });
  get().tap({ unit: null, hex: '-1,4' });
  expect(get().state!.units.find(u => u.id === 0)!.pos).toBe('-1,4');
  expect(get().record!.actions).toEqual([{ type: 'move', unit: 0, to: '-1,4' }]);
  expect(get().last).toMatchObject({ seq: 1 }); expect(get().last!.events[0]!.type).toBe('moved');
  const saved = restore(readSave(d.kv, 'm1')); expect(saved.ok && saved.record.actions.length).toBe(1);
});
test('End turn raises the curtain, and a second End turn does nothing', () => {
  const { get } = started(); get().ready();
  get().run({ type: 'endTurn' });
  expect(get()).toMatchObject({ screen: 'pass', viewer: null, selection: NONE });
  expect(get().state!.current).toBe(1);
  get().run({ type: 'endTurn' });
  expect(get().state!.current).toBe(1); expect(get().record!.actions).toHaveLength(1);
});
test('nothing can be done while the curtain is up', () => {
  const { get } = started(); const before = get().state;
  get().tap({ unit: 0, hex: '-2,5' }); get().run({ type: 'move', unit: 0, to: '-1,4' }); get().arm({ kind: 'ability', ability: 'heal' });
  expect(get().state).toBe(before); expect(get().selection).toEqual(NONE); expect(get().record!.actions).toEqual([]);
});
test('a refused action changes nothing', () => {
  const { get } = started(); get().ready(); const before = get().state;
  get().run({ type: 'move', unit: 99, to: '0,0' });
  expect(get().state).toBe(before); expect(get().record!.actions).toEqual([]); expect(get().last).toBeNull();
});
test('resigning ends the match and going home clears its save', () => {
  const { get, d } = started(); get().ready();
  get().run({ type: 'resign' });
  expect(get()).toMatchObject({ screen: 'result', viewer: null }); expect(get().state!.winner).toBe(1);
  get().goHome();
  expect(get()).toMatchObject({ screen: 'home', record: null, state: null, saves: [] }); expect(listSaves(d.kv)).toEqual([]);
});
test('a reopened game starts at home and resumes through the curtain', () => {
  const first = started(); first.get().ready(); first.get().tap({ unit: 0, hex: '-2,5' }); first.get().tap({ unit: null, hex: '-1,4' });
  const again = createAppStore(first.d);
  expect(again.getState()).toMatchObject({ screen: 'home', viewer: null, state: null });
  expect(again.getState().saves).toHaveLength(1);
  again.getState().resume('m1');
  expect(again.getState()).toMatchObject({ screen: 'pass', viewer: null });
  expect(hashState(again.getState().state!)).toBe(hashState(first.get().state!));
});
test('damaged, unreadable and old saves are handled in plain terms', () => {
  const a = started(); const body = JSON.parse(a.map.get('banners.save.m1')!);
  body.snapshot = { count: 0, hash: 'wrong', state: body.snapshot?.state ?? {} };
  a.map.set('banners.save.m1', JSON.stringify(body));
  const s1 = createAppStore(a.d); s1.getState().resume('m1');
  expect(s1.getState()).toMatchObject({ screen: 'pass', notice: 'saveRepaired' });
  a.map.set('banners.save.m1', '{');
  const s2 = createAppStore(a.d); s2.getState().resume('m1');
  expect(s2.getState()).toMatchObject({ screen: 'home', notice: 'saveUnreadable', state: null });
  const b = started(); const old = JSON.parse(b.map.get('banners.save.m1')!); old.rulesVersion = 999;
  b.map.set('banners.save.m1', JSON.stringify(old));
  const s3 = createAppStore(b.d); s3.getState().resume('m1');
  expect(s3.getState()).toMatchObject({ screen: 'home', notice: 'saveOldVersion' });
  s3.getState().resume('no-such-id'); expect(s3.getState().notice).toBe('saveUnreadable');
});
test('when the phone refuses to save, play carries on and says so', () => {
  const kv: KeyValue = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  const { get } = started({ kv });
  expect(get()).toMatchObject({ screen: 'pass', notice: 'saveFailed' });
  get().ready(); get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' });
  expect(get().record!.actions).toHaveLength(1);
});
test('a passing failure to save is cleared by the next save that works', () => {
  const x = deps(); let refuse = true;
  const kv: KeyValue = { ...x.d.kv, setItem: (k, v) => { if (refuse) throw new Error('QuotaExceededError'); x.d.kv.setItem(k, v); } };
  const store = createAppStore({ ...x.d, kv }); const get = store.getState;
  get().startMatch(SETUP); expect(get().notice).toBe('saveFailed');
  get().ready(); get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' });
  expect(get().notice).toBe('saveFailed');
  refuse = false; get().run({ type: 'endTurn' });
  expect(get().notice).toBeNull();
  expect(listSaves(kv).map(s => s.id)).toEqual(['m1']);
});
test('a working save leaves other notices alone', () => {
  const { get } = started(); get().ready();
  get().dismissNotice(); expect(get().notice).toBeNull();
  const store = started(); store.store.setState({ notice: 'saveRepaired' }); store.get().ready();
  store.get().tap({ unit: 0, hex: '-2,5' }); store.get().tap({ unit: null, hex: '-1,4' });
  expect(store.get().notice).toBe('saveRepaired');
});
test('starting a match when twenty unfinished ones are kept drops the oldest other one and says so', () => {
  let id = 0; let at = 100;
  const x = deps({ newId: () => `m${id++}`, now: () => at++ });
  const store = createAppStore(x.d);
  for (let i = 0; i < 20; i++) { store.getState().startMatch(SETUP); expect(store.getState().notice).toBeNull(); store.getState().goHome(); }
  store.getState().startMatch(SETUP);
  expect(store.getState().notice).toBe('saveDropped');
  const ids = listSaves(x.d.kv).map(s => s.id);
  expect(ids).toHaveLength(20); expect(ids).toContain('m20'); expect(ids).not.toContain('m0');
});
test('ready does nothing off the curtain, and a resumed game cannot act until ready', () => {
  const first = started(); first.get().ready(); first.get().run({ type: 'endTurn' });
  const again = createAppStore(first.d);
  again.getState().ready(); expect(again.getState().screen).toBe('home');
  again.getState().resume('m1');
  again.getState().run({ type: 'endTurn' }); again.getState().tap({ unit: null, hex: '0,0' });
  expect(again.getState().record!.actions).toHaveLength(1); expect(again.getState().viewer).toBeNull();
  again.getState().ready(); again.getState().ready();
  expect(again.getState()).toMatchObject({ screen: 'match', viewer: 1 });
});
test('browserDeps works without a DOM and keeps nothing', () => {
  const d = browserDeps();
  d.kv.setItem('a', 'b'); expect(d.kv.getItem('a')).toBeNull(); d.kv.removeItem('a');
  expect(Number.isInteger(d.newSeed())).toBe(true); expect(d.newId()).not.toBe(d.newId());
  expect(createAppStore(d).getState().screen).toBe('home');
});
test('a new build is applied from home and never during a match', () => {
  let applied = 0; let home = 0;
  const updater: Updater = { apply: async () => { applied++; }, check: () => {}, homeReached: () => { home++; } };
  const { get } = started({ updater });
  get().setUpdate({ offlineReady: true, updateReady: true });
  get().applyUpdate(); expect(applied).toBe(0);            // behind the curtain
  get().ready(); get().applyUpdate(); expect(applied).toBe(0);   // in the match
  get().run({ type: 'resign' }); get().applyUpdate(); expect(applied).toBe(0);   // on the result
  expect(home).toBe(0);
  get().goHome(); expect(home).toBe(1); get().applyUpdate(); expect(applied).toBe(1);
  get().recover(); expect(home).toBe(2);
});
test('a save whose snapshot this build cannot play resumes by replaying its moves', () => {
  const first = started(); first.get().ready(); first.get().tap({ unit: 0, hex: '-2,5' }); first.get().tap({ unit: null, hex: '-1,4' });
  const body = JSON.parse(first.map.get('banners.save.m1')!);
  delete body.snapshot.state.players[0].explored; body.snapshot.hash = hashState(body.snapshot.state);
  first.map.set('banners.save.m1', JSON.stringify(body));
  const again = createAppStore(first.d); again.getState().resume('m1');
  expect(again.getState()).toMatchObject({ screen: 'pass', notice: 'saveRepaired' });
  expect(hashState(again.getState().state!)).toBe(hashState(first.get().state!));
  body.actions[0] = { type: 'move', unit: 999, to: '0,0' };
  first.map.set('banners.save.m1', JSON.stringify(body));
  const third = createAppStore(first.d); third.getState().resume('m1');
  expect(third.getState()).toMatchObject({ screen: 'home', notice: 'saveUnreadable', state: null });
  expect(third.getState().saves.map(s => s.id)).toEqual(['m1']);
});
test('recovering from a broken screen goes home and keeps every save, a finished one too', () => {
  const { get, map } = started(); get().ready(); get().run({ type: 'resign' });
  expect(get().screen).toBe('result');
  get().recover();
  expect(get()).toMatchObject({ screen: 'home', record: null, state: null, viewer: null });
  expect(map.has('banners.save.m1')).toBe(true);
  expect(get().saves.map(s => s.id)).toEqual(['m1']);
});
test('an accepted action keeps the save list without reading any saved match back', () => {
  const x = deps(); let bodyReads = 0;
  const kv: KeyValue = { ...x.d.kv, getItem: k => { if (k.startsWith('banners.save.')) bodyReads++; return x.d.kv.getItem(k); } };
  let at = 1000; const store = createAppStore({ ...x.d, kv, now: () => at++ }); const get = store.getState;
  get().startMatch(SETUP); get().ready();
  bodyReads = 0;
  get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' }); get().run({ type: 'endTurn' });
  expect(bodyReads).toBe(0);
  expect(get().saves).toEqual(listSaves(kv));
  expect(get().saves[0]).toMatchObject({ id: 'm1', current: 1 });
});
