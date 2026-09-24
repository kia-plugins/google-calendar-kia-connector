import { joinOccurrences, mergeTranscripts, monthRange, overlaps, searchAll, summaryLines, transcriptIndex, weekRange, type EventDoc, type TranscriptDoc } from '../data';

const e = (id: string, key: string, cal: string, start: string, end: string): EventDoc => ({
  id, accountId: 'a', title: id,
  metadata: { calendarId: cal, calendarName: cal, calendarColor: null, occurrenceKey: key, start, end, allDay: false,
    selfResponse: null, attendees: [], conferenceUrl: null, location: null },
});

it('searchAll pages to exhaustion with limit 500', async () => {
  const docs = Array.from({ length: 1234 }, (_, i) => ({ id: String(i) }));
  const invoke = jest.fn(async (_c: string, q: any) => docs.slice(q.offset, q.offset + q.limit));
  const all = await searchAll(invoke, { type: 'calendar.event' });
  expect(all).toHaveLength(1234);
  expect(invoke.mock.calls.map((c) => (c[1] as any).offset)).toEqual([0, 500, 1000]);
  expect(invoke.mock.calls[0][0]).toBe('search:query');
});

it('weekRange starts Monday 00:00 local', () => {
  const r = weekRange(new Date(2026, 8, 24, 15)); // Thu 24 Sep 2026
  expect(r.start).toEqual(new Date(2026, 8, 21));
  expect(r.end).toEqual(new Date(2026, 8, 28));
});

it('monthRange covers 6 whole weeks from the Monday on/before the 1st', () => {
  const r = monthRange(new Date(2026, 8, 24));
  expect(r.start).toEqual(new Date(2026, 7, 31));
  expect(r.end).toEqual(new Date(2026, 9, 12));
});

it('overlap keeps a multi-day event that started before the range', () => {
  const ev = e('x', 'k', 'c', '2026-09-18T00:00:00.000Z', '2026-09-23T00:00:00.000Z');
  expect(overlaps(ev, new Date('2026-09-21T00:00:00Z'), new Date('2026-09-28T00:00:00Z'))).toBe(true);
  expect(overlaps(ev, new Date('2026-09-23T00:00:00Z'), new Date('2026-09-28T00:00:00Z'))).toBe(false);
});

it('joinOccurrences draws a shared invite once and respects hidden calendars', () => {
  const a = e('1', 'K', 'work', '2026-09-24T08:00:00.000Z', '2026-09-24T09:00:00.000Z');
  const b = e('2', 'K', 'home', '2026-09-24T08:00:00.000Z', '2026-09-24T09:00:00.000Z');
  const c = e('3', 'L', 'home', '2026-09-24T07:00:00.000Z', '2026-09-24T07:30:00.000Z');
  const all = joinOccurrences([a, b, c], new Set());
  expect(all.map((o) => o.key)).toEqual(['L', 'K']);
  expect(all[1].copies.map((x) => x.id)).toEqual(['1', '2']);
  const hidden = joinOccurrences([a, b, c], new Set(['home']));
  expect(hidden.map((o) => o.key)).toEqual(['K']);
  expect(hidden[0].primary.id).toBe('1');
  expect(hidden[0].copies.map((x) => x.id)).toEqual(['1']);
});

const t = (id: string, date: string, key?: string): TranscriptDoc => ({
  id, createdAt: date, ingestedAt: date, markdown: null, metadata: key ? { meetingId: id, calendarEvent: { occurrenceKey: key } } : {},
});

it('mergeTranscripts replaces the refreshed slice (a deleted one disappears) and keeps the rest', () => {
  const cache = [t('old', '2026-01-01T00:00:00Z'), t('in', '2026-09-22T00:00:00Z'), t('gone', '2026-09-23T00:00:00Z')];
  const fresh = [t('in', '2026-09-22T00:00:00Z'), t('new', '2026-09-24T00:00:00Z')];
  const out = mergeTranscripts(cache, fresh, new Date('2026-09-20T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  expect(out.map((x) => x.id).sort()).toEqual(['in', 'new', 'old']);
});

it('mergeTranscripts uses ingestedAt when createdAt is absent', () => {
  const noDate = { ...t('x', '2026-09-22T00:00:00Z'), createdAt: null };
  const out = mergeTranscripts([noDate], [], new Date('2026-09-20T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));
  expect(out).toEqual([]);
});

it('transcriptIndex keys by occurrenceKey', () => {
  const idx = transcriptIndex([t('m1', '2026-09-22T00:00:00Z', 'K'), t('m2', '2026-09-22T00:00:00Z')]);
  expect(idx.get('K')!.id).toBe('m1');
  expect(idx.size).toBe(1);
});

it('summaryLines returns the first lines under ## Summary', () => {
  expect(summaryLines('# T\n\n## Summary\n- a\n- b\n- c\n\n## Transcript\nx', 2)).toEqual(['- a', '- b']);
  expect(summaryLines(null, 2)).toEqual([]);
});
