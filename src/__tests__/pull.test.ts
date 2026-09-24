// src/__tests__/pull.test.ts
import type { Batch } from '@kiagent/connector-sdk';
import { createCalendarSource } from '../source';
import type { Cursor } from '../cursor';
import type { CalItem } from '../document';
import { calWorld, ev, fakeQuery, fakeSession, instantClock, makeHost, type CalWorld } from '../testing/harness';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const A = 'a@example.com';
const B = 'team@group.calendar.google.com';
const cals = [{ id: A, summary: A, primary: true }, { id: B, summary: 'Team', backgroundColor: '#0b8043' }];
const roots = [{ id: A, name: A }, { id: B, name: 'Team' }];
const fresh = new Date(NOW - 86_400_000).toISOString();

async function run(world: CalWorld, cursor: Cursor | null, docs: any[] = [], r = roots) {
  const { fetchFn, calls } = calWorld({ calendarList: cals, ...world });
  const source = createCalendarSource(makeHost(fetchFn, fakeQuery(docs)), { ...instantClock, now: () => NOW });
  const session = fakeSession({ credentials: { accessToken: 't' } as any, account: { id: 'acc1', config: { folderRoots: r } } as any });
  const batches: Batch<Cursor, CalItem>[] = [];
  let error: unknown;
  try { for await (const b of source.pull(session, cursor)) batches.push(b); } catch (e) { error = e; }
  return { batches, calls, error, last: batches.at(-1) };
}
const doc = (cal: string, id: string) => ({ type: 'calendar.event', accountId: 'acc1', externalId: `${cal}:${id}`, metadata: { calendarId: cal } });

it('first pull: full lists every calendar; tokens commit only in the final batch; phase backfill', async () => {
  const { batches, calls } = await run({ calendars: { [A]: { full: [ev('e1'), ev('x', { status: 'cancelled' })], fullToken: 'TA' }, [B]: { full: [ev('e2')], fullToken: 'TB' } } }, null);
  expect(batches.map((b) => b.phase)).toEqual(['backfill', 'backfill', 'backfill']);
  expect(batches[0].items.map((i) => i.event.id)).toEqual(['e1']);
  expect(batches[0].cursor.calendars).toEqual({});
  expect(batches[1].cursor.calendars).toEqual({});
  const fin = batches[2];
  expect(fin.items).toEqual([]);
  expect(fin.cursor).toEqual({ v: 1, since: new Date(NOW - 365 * 86_400_000).toISOString(), calendars: {
    [A]: { syncToken: 'TA', fullAt: new Date(NOW).toISOString() }, [B]: { syncToken: 'TB', fullAt: new Date(NOW).toISOString() } } });
  const full = new URL(calls.find((c) => c.includes('/events'))!);
  expect(full.searchParams.get('timeMax')).toBe(new Date(NOW + 400 * 86_400_000).toISOString());
});

it('incremental: live → items, cancelled instance → deletion, token stored; second calendar keeps the first token; phase live', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: fresh }, [B]: { syncToken: 'b1', fullAt: fresh } } };
  const { batches } = await run({ calendars: {
    [A]: { inc: { a1: { items: [ev('e1'), ev('i1', { status: 'cancelled', recurringEventId: 'ser' })], next: 'a2' } } },
    [B]: { inc: { b1: { items: [ev('e2')], next: 'b2' } } },
  } }, cur);
  expect(batches).toHaveLength(2);
  expect(batches[0].phase).toBe('live');
  expect(batches[0].deletions).toEqual([{ externalId: `${A}:i1`, type: 'calendar.event' }]);
  expect(batches[0].cursor.calendars[A].syncToken).toBe('a2');
  expect(batches[1].cursor.calendars[A].syncToken).toBe('a2'); // accumulated, not replaced
  expect(batches[1].cursor.calendars[B].syncToken).toBe('b2');
});

it('sparse cancelled item without recurringEventId drops the cursor entry (token NOT stored)', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: fresh } } };
  const { last } = await run({ calendars: { [A]: { inc: { a1: { items: [{ id: 'gone', status: 'cancelled' }], next: 'a2' } } } } }, cur, [], [roots[0]]);
  expect(last!.deletions).toEqual([{ externalId: `${A}:gone`, type: 'calendar.event' }]);
  expect(last!.cursor.calendars[A]).toBeUndefined();
});

it('410 → full list in the same pull, with stale cleanup', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'expired', fullAt: fresh } } };
  const { last } = await run({ calendars: { [A]: { inc: {}, full: [ev('keep')], fullToken: 'T2' } } }, cur,
    [doc(A, 'keep'), doc(A, 'stale')], [roots[0]]);
  expect(last!.deletions).toEqual([{ externalId: `${A}:stale`, type: 'calendar.event' }]);
  expect(last!.cursor.calendars[A].syncToken).toBe('T2');
});

it('emptied calendar: cleanup deletes all of its docs and none of another calendar', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [B]: { syncToken: 'b1', fullAt: fresh } } };
  const { last } = await run({ calendars: { [A]: { full: [] }, [B]: { inc: { b1: { items: [], next: 'b2' } } } } }, cur,
    [doc(A, 'x'), doc(A, 'y'), doc(B, 'z')]);
  expect(last!.deletions).toEqual([{ externalId: `${A}:x`, type: 'calendar.event' }, { externalId: `${A}:y`, type: 'calendar.event' }]);
});

it('cleanup lists the account once per pull however many calendars were fully listed', async () => {
  const q = fakeQuery([]);
  const { fetchFn } = calWorld({ calendarList: cals, calendars: { [A]: { full: [] }, [B]: { full: [] } } });
  const source = createCalendarSource(makeHost(fetchFn, q), { ...instantClock, now: () => NOW });
  const session = fakeSession({ credentials: { accessToken: 't' } as any, account: { id: 'acc1', config: { folderRoots: roots } } as any });
  for await (const _ of source.pull(session, null)) { /* drain */ }
  expect((q.search as jest.Mock).mock.calls).toHaveLength(1);
});

it('404: calendar cleaned once, stored gone, skipped next pull; others still sync', async () => {
  const { last } = await run({ calendars: { [B]: { full: [ev('e2')] } } }, null, [doc(A, 'old')]);
  expect(last!.deletions).toEqual([{ externalId: `${A}:old`, type: 'calendar.event' }]);
  expect(last!.cursor.calendars[A]).toEqual({ gone: true, fullAt: new Date(NOW).toISOString() });
  const again = await run({ calendars: { [B]: { inc: { [`full-${B}`]: { items: [], next: 'n' } } } } }, last!.cursor);
  expect(again.calls.some((c) => c.includes(encodeURIComponent(A) + '/events'))).toBe(false);
  expect(again.error).toBeUndefined();
});

it('403/429/5xx on one calendar changes nothing for it; the other still syncs', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: fresh }, [B]: { syncToken: 'b1', fullAt: fresh } } };
  const { batches, error } = await run({ calendars: { [A]: { inc: { a1: 403 } }, [B]: { inc: { b1: { items: [ev('e2')], next: 'b2' } } } } }, cur);
  expect(error).toBeUndefined();
  expect(batches).toHaveLength(1);
  expect(batches[0].cursor.calendars[A]).toEqual({ syncToken: 'a1', fullAt: fresh });
  expect(batches[0].deletions ?? []).toEqual([]);
});

it('every tracked calendar failing → the pull throws (no auth code) after yielding nothing', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: fresh }, [B]: { syncToken: 'b1', fullAt: fresh } } };
  const { batches, error } = await run({ calendars: { [A]: { inc: { a1: 500 } }, [B]: { inc: { b1: 403 } } } }, cur);
  expect(batches).toEqual([]);
  expect(error).toBeInstanceOf(Error);
  expect((error as any).code).toBeUndefined();
});

it('401 throws an auth-coded error straight out of pull', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: fresh } } };
  const { error } = await run({ calendars: { [A]: { inc: { a1: 401 } } } }, cur, [], [roots[0]]);
  expect((error as any).code).toBe('auth');
});

it('stale fullAt (> 30 days) forces a full list', async () => {
  const cur: Cursor = { v: 1, since: 'S', calendars: { [A]: { syncToken: 'a1', fullAt: new Date(NOW - 31 * 86_400_000).toISOString() } } };
  const { calls } = await run({ calendars: { [A]: { full: [] } } }, cur, [], [roots[0]]);
  expect(calls.some((c) => c.includes('syncToken'))).toBe(false);
});

it('workingLocation is never ingested', async () => {
  const { batches } = await run({ calendars: { [A]: { full: [ev('w', { eventType: 'workingLocation' })] } } }, null, [], [roots[0]]);
  expect(batches.flatMap((b) => b.items)).toEqual([]);
});

it('items are chunked at 250 per batch', async () => {
  const many = Array.from({ length: 600 }, (_, i) => ev(`e${i}`));
  const { batches } = await run({ calendars: { [A]: { full: many } } }, null, [], [roots[0]]);
  expect(batches.map((b) => b.items.length)).toEqual([250, 250, 100, 0]);
});

it('multi-page full list reads every page before yielding', async () => {
  const { batches } = await run({ calendars: { [A]: { full: [[ev('p1')], [ev('p2')]] } } }, null, [], [roots[0]]);
  expect(batches[0].items.map((i) => i.event.id)).toEqual(['p1', 'p2']);
});
