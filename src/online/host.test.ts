import { expect, test } from 'vitest';
import { applyAction, createMatch } from '../engine';
import { must } from '../engine/testkit';
import type { Room, RoomSeat } from './wire';
import { aiSeatToPlay, hostMove } from './host';

const room = (over: Partial<Room> = {}): Room => ({
  code: 'ABC234',
  meta: { createdAt: 1, creatorId: 'u0', hostId: 'u0', schema: 1, rulesVersion: 2, build: 't', clock: 120, hostFaction: 'spartans', phase: 'playing' },
  seats: [{ uid: 'u0', name: 'Ann', kind: 'human', rules: 2 }, { uid: 'u1', name: 'Ben', kind: 'human', rules: 2 }],
  members: { u0: 0, u1: 1 }, presence: { u0: { on: true, at: 100 }, u1: { on: true, at: 200 } }, head: null, desync: {}, ...over,
});
const BOT: RoomSeat = { uid: 'ai_1', name: 'Bot', kind: 'ai', level: 'normal', salt: 7, adapt: { dial: 0.5, trend: 0 } };

test('the creator takes the host role back when present', () => {
  expect(hostMove(room({ meta: { ...room().meta, hostId: 'u1' } }), 'u0', 10_000)).toBe('reclaim');
  expect(hostMove(room(), 'u0', 10_000)).toBeNull();
});
test('a stand-in only after the host has been gone 30 seconds', () => {
  const gone = room({ presence: { u0: { on: false, at: 1_000 }, u1: { on: true, at: 200 } } });
  expect(hostMove(gone, 'u1', 30_999)).toBeNull();
  expect(hostMove(gone, 'u1', 31_000)).toBe('standIn');
  expect(hostMove(gone, 'u0', 31_000)).toBeNull();
});
test('the AI seat is played by the host alone', () => {
  const r = room({ seats: [room().seats[0]!, BOT], members: { u0: 0 } });
  const s = createMatch({ seed: 42, factions: ['spartans', 'mongols'] }); const t = must(applyAction(s, { type: 'endTurn' }));
  expect(aiSeatToPlay(r, s, 'u0')).toBeNull();
  expect(aiSeatToPlay(r, t, 'u0')).toBe(1);
  expect(aiSeatToPlay(r, t, 'u1')).toBeNull();
  expect(aiSeatToPlay(room({ ...r, meta: { ...r.meta, phase: 'over' } }), t, 'u0')).toBeNull();
});
