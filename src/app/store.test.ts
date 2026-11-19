import { expect, test } from 'vitest';
import { hashState, playerView, replay, RULES_VERSION } from '../engine';
import { adaptStep, betweenMatches, gapOf } from '../ai/adapt';
import type { AdaptState } from '../ai/adapt';
import { planTurn } from '../ai/plan';
import type { Plan } from '../ai/plan';
import { hiddenScout } from '../ai/scenarios';
import { isOffered, NONE, offered } from '../ui/interaction';
import { SupersededError } from './aiClient';
import type { AiClient } from './aiClient';
import { readDial } from './aiMemory';
import { browserDeps, createAppStore } from './store';
import type { Deps, Setup } from './store';
import type { Updater } from './update';
import { newRecord, restore } from './record';
import { listSaves, readSave, writeSave } from './saves';
import type { KeyValue } from './saves';

// Plans on the spot, as the worker would.
const thinker = (): AiClient => ({ think: async (input, opts) => planTurn(input, opts), dispose: () => {} });
// Lets every pending promise run until the AI is done or `limit` rounds pass.
async function settle(done: () => boolean, limit = 2000): Promise<void> {
  for (let i = 0; i < limit && !done(); i++) await new Promise(r => setTimeout(r, 0));
}

function deps(over: Partial<Deps> = {}) {
  const map = new Map<string, string>();
  const kv: KeyValue = { getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
  return { map, d: { kv, now: () => 1000, newSeed: () => 7, newId: () => 'm1', ai: thinker(), sleep: async () => {}, ...over } as Deps };
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

const SOLO: Setup = { names: ['Ann', ''], factions: ['spartans', 'mongols'], second: 'normal' };

test('solo: no curtain, the AI answers, the person moves again', async () => {
  const x = deps(); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO);
  expect(get()).toMatchObject({ screen: 'match', viewer: 0, aiBusy: false });
  expect(get().record!.players[1]).toMatchObject({ name: 'Normal AI', kind: 'ai', level: 'normal', adapt: { dial: 0.5, trend: 0 } });
  get().run({ type: 'endTurn' });
  expect(get().aiBusy).toBe(true);
  await settle(() => !get().aiBusy);
  const actions = get().record!.actions;
  expect(get()).toMatchObject({ screen: 'match', viewer: 0, aiBusy: false });
  expect(get().state!.current).toBe(0);
  expect(actions[actions.length - 1]).toEqual({ type: 'endTurn' });
  expect(actions.length).toBeGreaterThan(2);
  expect(hashState(replay(get().record!.settings, actions))).toBe(hashState(get().state!));
  get().tap({ unit: 0, hex: '-2,5' });
  expect(get().selection).toMatchObject({ kind: 'unit', id: 0 });
}, 30_000);

test('the AI turn is saved action by action and resumes after Home', async () => {
  // The first plan is told to expect a view that never comes, so the AI replans after its first action; that
  // second think never answers.
  let calls = 0;
  const hanging: AiClient = {
    think: (input, opts) => {
      calls += 1;
      if (calls > 1) return new Promise<Plan>(() => {});
      const plan = planTurn(input, opts);
      return Promise.resolve({ ...plan, expect: plan.expect.map(() => 'never') });
    },
    dispose: () => {},
  };
  const x = deps({ ai: hanging }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => calls > 1);
  expect(get().aiBusy).toBe(true);
  const saved = restore(readSave(x.d.kv, 'm1'));
  if (!saved.ok) throw new Error('unreadable');
  expect(saved.record.actions).toEqual(get().record!.actions);
  expect(saved.record.actions).toHaveLength(2);   // the person's endTurn and the AI's first action
  get().goHome();
  expect(get()).toMatchObject({ screen: 'home', aiBusy: false });

  const again = createAppStore({ ...x.d, ai: thinker() }); const g2 = again.getState;
  g2().resume('m1');
  expect(g2()).toMatchObject({ screen: 'match', viewer: 0, aiBusy: true });
  await settle(() => !g2().aiBusy);
  const actions = g2().record!.actions;
  expect(actions.slice(0, 2)).toEqual(saved.record.actions);
  expect(g2().state!.current).toBe(0);
  expect(actions.filter(a => a.type === 'endTurn')).toHaveLength(2);
  expect(hashState(replay(g2().record!.settings, actions))).toBe(hashState(g2().state!));
}, 30_000);

test('taps, runs and resign do nothing while the AI plays', async () => {
  let release: (p: Plan) => void = () => {};
  let pending: Parameters<AiClient['think']> | null = null;
  // Only the first think is held; any replan after it is answered at once.
  const held: AiClient = {
    think: (...args) => {
      if (pending !== null) return Promise.resolve(planTurn(...args));
      pending = args; return new Promise<Plan>(r => { release = r; });
    },
    dispose: () => {},
  };
  const x = deps({ ai: held }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => pending !== null);
  const before = get().record; get().select({ kind: 'unit', id: 0, armed: null, askLure: null });
  get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' });
  get().run({ type: 'move', unit: 0, to: '-1,4' }); get().run({ type: 'resign' }); get().run({ type: 'endTurn' });
  get().arm({ kind: 'ability', ability: 'heal' });
  expect(get().record).toBe(before);
  expect(get().selection).toEqual(NONE);
  expect(get().aiBusy).toBe(true);
  release(planTurn(pending![0], pending![1]));
  await settle(() => !get().aiBusy);
  expect(get().state!.current).toBe(0); expect(get().state!.winner).toBeNull();
}, 30_000);

test('a late answer after Home is ignored', async () => {
  let release: (p: Plan) => void = () => {};
  let pending: Parameters<AiClient['think']> | null = null;
  const held: AiClient = { think: (...args) => { pending = args; return new Promise<Plan>(r => { release = r; }); }, dispose: () => {} };
  const x = deps({ ai: held }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => pending !== null);
  get().goHome();
  release(planTurn(pending![0], pending![1]));
  await settle(() => false, 50);
  expect(get()).toMatchObject({ screen: 'home', record: null, aiBusy: false });
  const saved = restore(readSave(x.d.kv, 'm1'));
  expect(saved.ok && saved.record.actions).toEqual([{ type: 'endTurn' }]);
});

test('a superseded think stops the AI quietly and never leaves it busy', async () => {
  const superseded: AiClient = { think: () => Promise.reject(new SupersededError()), dispose: () => {} };
  const x = deps({ ai: superseded }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => !get().aiBusy);
  expect(get()).toMatchObject({ screen: 'match', aiBusy: false, notice: null });
  expect(get().record!.actions).toEqual([{ type: 'endTurn' }]);
});

test('a think that fails once is tried again and the AI plays on', async () => {
  let calls = 0;
  const flaky: AiClient = {
    think: async (input, opts) => { calls += 1; if (calls === 1) throw new Error('worker fell over'); return planTurn(input, opts); },
    dispose: () => {},
  };
  const x = deps({ ai: flaky }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => !get().aiBusy);
  const actions = get().record!.actions;
  expect(get()).toMatchObject({ screen: 'match', aiBusy: false, notice: null });
  expect(get().state!.current).toBe(0);
  expect(actions.length).toBeGreaterThan(2);   // it planned and acted, not just passed
  expect(actions[actions.length - 1]).toEqual({ type: 'endTurn' });
}, 30_000);

test('a think that always fails passes the AI turn, says so, and gives the turn back', async () => {
  let calls = 0;
  const broken: AiClient = { think: async () => { calls += 1; throw new Error('no plan'); }, dispose: () => {} };
  const x = deps({ ai: broken }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => !get().aiBusy);
  expect(calls).toBe(2);
  expect(get()).toMatchObject({ screen: 'match', viewer: 0, aiBusy: false, notice: 'aiPassed' });
  expect(get().state!.current).toBe(0);
  expect(get().record!.actions).toEqual([{ type: 'endTurn' }, { type: 'endTurn' }]);
  const saved = restore(readSave(x.d.kv, 'm1'));
  expect(saved.ok && saved.record.actions).toHaveLength(2);
  // The person plays on; the notice stays until dismissed or the next AI turn, and Home clears it.
  get().tap({ unit: 0, hex: '-2,5' }); get().tap({ unit: null, hex: '-1,4' });
  expect(get().record!.actions).toHaveLength(3);
  expect(get().notice).toBe('aiPassed');
  get().goHome(); expect(get().notice).toBeNull();
});

test('the AI gives the main thread back after every action it applies', async () => {
  const sleeps: number[] = [];
  const x = deps({ sleep: async (ms: number) => { sleeps.push(ms); } }); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch(SOLO); get().run({ type: 'endTurn' });
  await settle(() => !get().aiBusy);
  const aiActions = get().record!.actions.length - 2;   // less the person's endTurn and the AI's own
  expect(aiActions).toBeGreaterThan(0);
  expect(sleeps).toHaveLength(aiActions);
}, 30_000);

test('adaptive: the dial moves once per AI turn, with its first action, and is remembered at the end', async () => {
  const x = deps(); const store = createAppStore(x.d); const get = store.getState;
  get().startMatch({ ...SOLO, second: 'adaptive' });
  const adaptOf = (rec = get().record!): AdaptState => { const p = rec.players[1]!; if (p.kind !== 'ai') throw new Error('no AI'); return p.adapt; };
  expect(get().record!.players[1]).toMatchObject({ name: 'Adaptive AI' });
  expect(adaptOf()).toEqual({ dial: readDial(x.d.kv, 'Ann'), trend: 0 });
  // Every record the store holds, as (number of actions, adapt).
  const log: { n: number; adapt: string }[] = [];
  const unsub = store.subscribe(s => { if (s.record !== null) log.push({ n: s.record.actions.length, adapt: JSON.stringify(adaptOf(s.record)) }); });
  let moved = 0;
  for (let turn = 0; turn < 3; turn++) {
    const prev = adaptOf();
    get().run({ type: 'endTurn' });
    const startN = get().record!.actions.length;
    const expected = adaptStep(prev, gapOf(get().state!, 1));
    log.length = 0;
    await settle(() => !get().aiBusy);
    expect(get().state!.current).toBe(0);
    expect(adaptOf()).toEqual(expected);
    // The new adapt arrives with the turn's first AI action and never changes after it.
    const atFirst = log.filter(e => e.n === startN + 1).map(e => e.adapt);
    expect(atFirst.length).toBeGreaterThan(0);
    expect(new Set(log.filter(e => e.n > startN).map(e => e.adapt))).toEqual(new Set([JSON.stringify(expected)]));
    if (JSON.stringify(expected) !== JSON.stringify(prev)) moved += 1;
  }
  unsub();
  expect(moved).toBeGreaterThan(0);   // the test saw the dial's state actually change
  const dial = adaptOf().dial;
  get().run({ type: 'resign' });
  expect(get().screen).toBe('result');
  expect(readDial(x.d.kv, 'Ann')).toBeCloseTo(betweenMatches(dial, 'ai'), 10);
}, 30_000);

test('a plan 2 save still resumes', () => {
  const x = deps();
  const settings = { seed: 7, factions: ['spartans', 'mongols'] as ['spartans', 'mongols'] };
  const rec = { ...newRecord('old', settings, ['Ann', 'Ben'], 500), rulesVersion: RULES_VERSION };
  writeSave(x.d.kv, JSON.parse(JSON.stringify(rec)), replay(settings, []));
  const store = createAppStore(x.d); store.getState().resume('old');
  expect(store.getState()).toMatchObject({ screen: 'pass', viewer: null, aiBusy: false, notice: null });
  store.getState().ready();
  expect(store.getState()).toMatchObject({ screen: 'match', viewer: 0 });
});

test('a move blocked by an unseen enemy is offered, refused, and explained', () => {
  const { store, get } = started(); get().ready();
  const { state, rider } = hiddenScout();
  expect(playerView(state, 1).units.map(u => u.owner)).not.toContain(0);
  store.setState({ state, viewer: 1 });
  expect(offered(state, 1).moves[rider]).toContain('2,0');
  const before = get().record;
  get().select({ kind: 'unit', id: rider, armed: null, askLure: null });
  get().tap({ unit: null, hex: '2,0' });
  expect(get().record).toBe(before); expect(get().state).toBe(state);
  expect(get().notice).toBe('blockedUnseen');
  get().goHome(); expect(get().notice).toBeNull();
});

test('every offered action counts as offered, whatever the order of its fields', () => {
  const { get } = started(); get().ready();
  const state = get().state!;
  expect(isOffered(state, 0, { to: '-1,4', unit: 0, type: 'move' } as never)).toBe(true);
  expect(isOffered(state, 0, { type: 'move', unit: 0, to: '0,0' })).toBe(false);
  expect(isOffered(state, 1, { type: 'endTurn' })).toBe(false);   // not that player's turn
});
