/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  CLOCK_CHOICES, DROP_PAUSE_MS, MAX_ACTION_CHARS, MAX_NAME, MAX_SNAP_CHARS, ROOM_IDLE_TTL_MS, SCHEMA,
} from '../online/wire';

// database.rules.json repeats these numbers as literals, because the rules language cannot import them.
// Change both or the phones and the server disagree.

const rules = readFileSync('database.rules.json', 'utf8');

test('the rules hold the schema literal the app writes', () => {
  expect(rules).toContain(`child('schema').val() === ${SCHEMA}`);
});
test('the rules hold every clock choice, and no other', () => {
  const clock = /"clock":\s*\{[^}]*"\.validate":\s*"([^"]*)"/.exec(rules)?.[1] ?? '';
  const named = [...clock.matchAll(/=== (\d+)/g)].map((m) => Number(m[1]));
  expect(named).toEqual([...CLOCK_CHOICES]);
});
test('the rules hold the pause cap, the idle sweep and the size limits', () => {
  expect(rules).toContain(`<= ${DROP_PAUSE_MS}`);
  expect(rules).toContain(`+ ${ROOM_IDLE_TTL_MS} < now`);
  expect(rules).toContain(`length <= ${MAX_ACTION_CHARS}`);
  expect(rules).toContain(`length <= ${MAX_SNAP_CHARS}`);
  expect(rules).toContain(`length <= ${MAX_NAME}`);
});
test('the timeout is reached at the deadline itself (now >=, not now >)', () => {
  expect(rules).toContain("now >= root.child('rooms').child($code).child('head/turnAt').val()");
  expect(rules).not.toMatch(/now > root/);
});
