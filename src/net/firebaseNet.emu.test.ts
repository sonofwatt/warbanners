import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/app';
import { get, ref, serverTimestamp as sdkServerTimestamp, set, type Database } from 'firebase/database';
import { afterAll, describe, expect, test } from 'vitest';
import { RULES_VERSION } from '../engine';
import { makeRoomCode } from '../online/wire';
import { contract, type ContractKit } from './contract';
import { EMU, ensureSignedIn, fb, setOnline, watchConnected } from './firebase';
import { firebaseNet } from './firebaseNet';
import type { Net } from './net';
import { serverTimestamp } from './patches';

const emu = describe.runIf(process.env.EMULATOR === '1');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let env: RulesTestEnvironment | null = null;
// The app's own namespace with its rules left in place: no `rules` here, or they would be replaced.
async function admin(): Promise<RulesTestEnvironment> {
  env ??= await initializeTestEnvironment({ projectId: EMU.projectId, database: { host: EMU.host, port: EMU.dbPort } });
  return env;
}
async function adminDo(fn: (db: Database) => Promise<void>): Promise<void> {
  await (await admin()).withSecurityRulesDisabled((ctx) => fn(ctx.database(EMU.databaseURL) as unknown as Database));
}
async function adminGet(path: string): Promise<unknown> {
  let out: unknown = null;
  await adminDo(async (db) => { out = (await get(ref(db, path))).val(); });
  return out;
}
async function until(what: string, ok: () => Promise<boolean>, ms = 5_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await ok()) return;
  throw new Error(`timed out waiting for ${what}`);
}
const connected = (name: string): Promise<void> => new Promise((res) => {
  let off: (() => void) | null = null; let done = false;
  off = watchConnected(fb(name), (ok) => { if (ok && !done) { done = true; queueMicrotask(() => off?.()); res(); } });
});

emu('firebaseNet on the emulator', () => {
  afterAll(async () => { await env?.cleanup(); });

  contract('firebaseNet', async () => {
    setLogLevel('error');   // refused writes are part of the contract; the SDK would warn on each
    const names = new Map<Net, string>();
    const make = async (name: string, timeoutMs?: number): Promise<Net> => {
      const n = firebaseNet(name, timeoutMs === undefined ? undefined : { timeoutMs });
      await ensureSignedIn(fb(name));
      names.set(n, name);
      return n;
    };
    const a = await make('a'); const b = await make('b'); const c = await make('c', 1_000);
    const kit: ContractKit = {
      a, b, c,
      async ageTurn(code, ms) {
        await adminDo(async (db) => {
          const at = (await get(ref(db, `rooms/${code}/head/turnAt`))).val() as number;
          await set(ref(db, `rooms/${code}/head/turnAt`), at - ms);
        });
      },
      async stopPresence(net, code) {
        const name = names.get(net)!;
        const uid = await net.uid();
        setOnline(fb(name), false);   // a clean close: the server runs the onDisconnect at once
        const other = fb(names.get(net === a ? b : a)!);   // another phone sees it go off
        await until('the presence to go off', async () =>
          (await get(ref(other.db, `rooms/${code}/presence/${uid}/on`))).val() === false);
        setOnline(fb(name), true);
        await connected(name);
      },
      drop: (net) => setOnline(fb(names.get(net)!), false),
      async back(net) { const name = names.get(net)!; setOnline(fb(name), true); await connected(name); },
      wait: sleep,
      forge: (code, path, value) => adminDo(async (db) => { await set(ref(db, `rooms/${code}/${path}`), value); }),
    };
    return kit;
  });

  test("the patches' server time is the SDK's own placeholder", () => {
    expect(serverTimestamp()).toEqual(sdkServerTimestamp());
  });

  test('a create on another schema is refused as schema', async () => {
    setLogLevel('error');
    const s = firebaseNet('s', { schemaOverride: 2 });
    expect(await s.create({ code: makeRoomCode(), name: 'Sy', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' }))
      .toBe('schema');
  });

  test('a real drop: the armed onDisconnect stores the time of the drop, and the credit is bounded by it', async () => {
    setLogLevel('error');
    const p = firebaseNet('p'); const q = firebaseNet('q');
    const code = makeRoomCode();
    expect(await p.create({ code, name: 'Pat', hostFaction: 'spartans', clock: 120, rulesVersion: RULES_VERSION, build: 't' })).toBe(true);
    expect(await q.join(code, 'Quin', RULES_VERSION)).toEqual({ seat: 1 });
    expect(await p.start(code, { seed: 7, factions: ['spartans', 'mongols'] }, '0123456789abcdef')).toBe(true);
    const armedAt = p.serverNow();
    expect(await p.present(code, null)).toBe(true);                   // arms presence-off with serverTimestamp()
    await sleep(1_500);
    setOnline(fb('p'), false);
    const pu = await p.uid();
    await until('the onDisconnect to run', async () => (await adminGet(`rooms/${code}/presence/${pu}/on`)) === false);
    const off = (await adminGet(`rooms/${code}/presence/${pu}`)) as { on: boolean; at: number };
    expect(off.at).toBeGreaterThanOrEqual(armedAt + 1_400);           // the drop, not the arming
    await sleep(2_000);
    setOnline(fb('p'), true);
    await connected('p');
    const live = await p.readLive(code);
    expect(typeof live === 'object' && live.presence?.on).toBe(false);
    expect(await p.present(code, 10_000)).toBe('refused');             // more than the 2 s away
    expect(await p.present(code, 1_500)).toBe(true);
    expect(await adminGet(`rooms/${code}/head/paused`)).toBe(1_500);
    expect(await adminGet(`rooms/${code}/presence/${pu}/on`)).toBe(true);
  });
});
