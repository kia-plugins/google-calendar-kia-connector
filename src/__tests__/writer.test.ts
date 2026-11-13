import type { EventIntent, EventPatch } from '@kiagent/connector-sdk';
import { eventIdFor, createCalendarWriter } from '../writer';
import { instantClock, jsonRes, makeHost } from '../testing/harness';
import { toDocument } from '../document';
import { ev } from '../testing/harness';

const ctx = { credentials: { accessToken: 'tok' } } as never;
const intent = (o: Partial<EventIntent> = {}): EventIntent => ({
  accountId: 'acc1' as never, idempotencyKey: 'key-1', calendarId: 'a@example.com', title: 'Dentist',
  start: '2026-10-22T10:00:00+02:00', end: '2026-10-22T11:00:00+02:00', allDay: false, timeZone: 'Europe/Berlin',
  location: null, description: null, attendees: [], conference: 'none', category: 'kids',
  kia: { draftId: 'd1', sourceDocumentId: null }, ...o,
});

type Handler = (url: string, init: { method?: string; body?: string }) => ReturnType<typeof jsonRes> | Error;
function writerWith(handler: Handler) {
  const calls: Array<{ url: string; init: { method?: string; body?: string; headers?: Record<string, string> } }> = [];
  const fetch = jest.fn(async (url: string, init?: never) => {
    calls.push({ url, init: init ?? {} });
    const r = handler(url, init ?? {});
    if (r instanceof Error) throw r;
    return r;
  });
  const writer = createCalendarWriter(makeHost(fetch as never), { sleep: instantClock.sleep });
  return { writer, calls, fetch };
}
const created = (extra = {}) => jsonRes(200, { id: 'x', iCalUID: 'u@google.com', htmlLink: 'https://cal/x', ...extra });

it('insert sends id, colorId, extendedProperties and sendUpdates=all', async () => {
  const { writer, calls } = writerWith(() => created());
  const res = await writer.createEvent(
    intent({ attendees: [{ email: 'b@x.com', name: 'Bob' }, { email: 'c@x.com' }], kia: { draftId: 'd1', sourceDocumentId: 'doc9' } }), ctx);
  expect(calls).toHaveLength(1);
  const { url, init } = calls[0];
  expect(url).toBe(`https://www.googleapis.com/calendar/v3/calendars/a%40example.com/events?sendUpdates=all&conferenceDataVersion=1`);
  expect(init.method).toBe('POST');
  expect(init.headers?.authorization).toBe('Bearer tok');
  const body = JSON.parse(init.body!);
  expect(body.id).toBe(eventIdFor('key-1'));
  expect(body.id).toMatch(/^kia[0-9a-v]{26}$/);
  expect(body.colorId).toBe('6');
  expect(body.start).toEqual({ dateTime: '2026-10-22T10:00:00+02:00', timeZone: 'Europe/Berlin' });
  expect(body.attendees).toEqual([{ email: 'b@x.com', displayName: 'Bob' }, { email: 'c@x.com' }]);
  expect(body.extendedProperties.private).toEqual({ kiaCategory: 'kids', kiaDraftId: 'd1', kiaSource: 'doc9' });
  expect(body.conferenceData).toBeUndefined();
  expect(res).toEqual({ eventId: 'x', iCalUID: 'u@google.com', htmlLink: 'https://cal/x', conferenceUrl: null, conferencePending: false, note: null });
});

it('all-day events send date, work/personal colours', async () => {
  const { writer, calls } = writerWith(() => created());
  await writer.createEvent(intent({ allDay: true, start: '2026-10-22', end: '2026-10-23', category: 'work', kia: { draftId: 'd', sourceDocumentId: null } }), ctx);
  const body = JSON.parse(calls[0].init.body!);
  expect(body.start).toEqual({ date: '2026-10-22' });
  expect(body.end).toEqual({ date: '2026-10-23' });
  expect(body.colorId).toBe('9');
  expect(body.extendedProperties.private.kiaSource).toBe('');
});

it('same idempotency key gives the same event id', () => {
  expect(eventIdFor('k')).toBe(eventIdFor('k'));
  expect(eventIdFor('k')).not.toBe(eventIdFor('k2'));
});

it('409 reads the existing event back', async () => {
  const { writer, calls } = writerWith((_u, init) =>
    init.method === 'POST' ? jsonRes(409, { error: { message: 'exists' } }) : created({ id: eventIdFor('key-1') }));
  const res = await writer.createEvent(intent(), ctx);
  expect(calls[1].init.method).toBe('GET');
  expect(calls[1].url).toBe(`https://www.googleapis.com/calendar/v3/calendars/a%40example.com/events/${eventIdFor('key-1')}`);
  expect(res.eventId).toBe(eventIdFor('key-1'));
});

it('conference auto adds createRequest and reports pending', async () => {
  const { writer, calls } = writerWith(() => created({ conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }));
  const res = await writer.createEvent(intent({ conference: 'auto' }), ctx);
  expect(JSON.parse(calls[0].init.body!).conferenceData).toEqual({
    createRequest: { requestId: 'key-1', conferenceSolutionKey: { type: 'hangoutsMeet' } },
  });
  expect(res.conferencePending).toBe(true);
  const ready = writerWith(() => created({ hangoutLink: 'https://meet/x', conferenceData: { createRequest: { status: { statusCode: 'success' } } } }));
  const r2 = await ready.writer.createEvent(intent({ conference: 'auto' }), ctx);
  expect(r2.conferenceUrl).toBe('https://meet/x');
  expect(r2.conferencePending).toBe(false);
});

it('403 maps to reconnect copy; 400 to not created; 429 to rate-limited', async () => {
  await expect(writerWith(() => jsonRes(403, { error: { message: 'forbidden' } })).writer.createEvent(intent(), ctx))
    .rejects.toThrow('reconnect Google Calendar (a@example.com) in Settings to allow adding events');
  await expect(writerWith(() => jsonRes(400, { error: { message: 'Bad time range' } })).writer.createEvent(intent(), ctx))
    .rejects.toThrow('not created: Bad time range');
  const rl = writerWith(() => jsonRes(429, {}));
  await expect(rl.writer.createEvent(intent(), ctx))
    .rejects.toThrow('rate-limited: Google Calendar is busy — try again in a minute');
  expect(rl.fetch.mock.calls.length).toBeGreaterThan(1);
});

it('5xx is retried (idempotent) within the deadline', async () => {
  let n = 0;
  const { writer, fetch } = writerWith(() => (n++ < 2 ? jsonRes(503, {}) : created()));
  await expect(writer.createEvent(intent(), ctx)).resolves.toMatchObject({ eventId: 'x' });
  expect(fetch).toHaveBeenCalledTimes(3);
  let t = 0;
  const f = jest.fn(async () => jsonRes(503, {}));
  const w = createCalendarWriter(makeHost(f as never), { sleep: async () => { t += 30_000; }, now: () => t });
  await expect(w.createEvent(intent(), ctx)).rejects.toThrow();
  expect(f.mock.calls.length).toBeLessThan(4);
});

it('listCalendars maps accessRole', async () => {
  const { writer } = writerWith(() => jsonRes(200, {
    items: [
      { id: 'me@x.com', summary: 'Me', primary: true, accessRole: 'owner', backgroundColor: '#fff', timeZone: 'Europe/Berlin' },
      { id: 'team', summary: 'Team', summaryOverride: 'My Team', accessRole: 'writer' },
      { id: 'hol', summary: 'Holidays', accessRole: 'reader' },
    ],
  }));
  expect(await writer.listCalendars(ctx)).toEqual([
    { id: 'me@x.com', name: 'Me', color: '#fff', primary: true, canWrite: true, shared: false, timeZone: 'Europe/Berlin' },
    { id: 'team', name: 'My Team', color: null, primary: false, canWrite: true, shared: true, timeZone: null },
    { id: 'hol', name: 'Holidays', color: null, primary: false, canWrite: false, shared: true, timeZone: null },
  ]);
});

it('document carries category from the Kia stamp', () => {
  const cal = { id: 'c', name: 'C', timeZone: 'UTC' };
  const cat = (p?: Record<string, string>) =>
    toDocument({ calendar: cal, event: ev('e', p ? { extendedProperties: { private: p } } : {}) }).metadata!.category;
  expect(cat({ kiaCategory: 'kids' })).toBe('kids');
  expect(cat({ kiaCategory: 'bogus' })).toBeNull();
  expect(cat()).toBeNull();
});

const patchOf = (o: Partial<EventPatch> = {}): EventPatch =>
  ({ accountId: 'acc1' as never, calendarId: 'a@example.com', eventId: 'ev1', ...o });

it('update PATCHes only the changed fields', async () => {
  const { writer, calls } = writerWith(() => created({ id: 'ev1' }));
  const res = await writer.updateEvent!(patchOf({ title: 'Dentist 2' }), ctx);
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://www.googleapis.com/calendar/v3/calendars/a%40example.com/events/ev1?sendUpdates=all');
  expect(calls[0].init.method).toBe('PATCH');
  expect(JSON.parse(calls[0].init.body!)).toEqual({ summary: 'Dentist 2' });
  expect(res).toEqual({ eventId: 'ev1', htmlLink: 'https://cal/x' });
});

it('update sends time as dateTime + timeZone, and clears location with an empty string', async () => {
  const a = writerWith(() => created());
  await a.writer.updateEvent!(patchOf({ start: '2026-10-22T10:00:00+02:00', end: '2026-10-22T11:00:00+02:00', timeZone: 'Europe/Berlin' }), ctx);
  expect(JSON.parse(a.calls[0].init.body!)).toEqual({
    start: { dateTime: '2026-10-22T10:00:00+02:00', timeZone: 'Europe/Berlin' },
    end: { dateTime: '2026-10-22T11:00:00+02:00', timeZone: 'Europe/Berlin' },
  });
  const b = writerWith(() => created());
  await b.writer.updateEvent!(patchOf({ location: null }), ctx);
  expect(JSON.parse(b.calls[0].init.body!)).toEqual({ location: '' });
  const c = writerWith(() => created());
  await c.writer.updateEvent!(patchOf({ location: 'Cafe' }), ctx);
  expect(JSON.parse(c.calls[0].init.body!)).toEqual({ location: 'Cafe' });
});

it('update maps 403, 404/410, 429 and other 4xx', async () => {
  const run = (status: number, body: unknown = {}) =>
    writerWith(() => jsonRes(status, body)).writer.updateEvent!(patchOf({ title: 'x' }), ctx);
  await expect(run(403)).rejects.toThrow(/reconnect Google Calendar .*allow changing events/);
  await expect(run(404)).rejects.toThrow('this event no longer exists');
  await expect(run(410)).rejects.toThrow('this event no longer exists');
  await expect(run(429)).rejects.toThrow(/rate-limited/);
  await expect(run(400, { error: { message: 'Invalid time' } })).rejects.toThrow('not changed: Invalid time');
});
