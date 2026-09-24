// Wall-clock placement must hold on DST days; pin the zone before any Date use.
process.env.TZ = 'Europe/Berlin';
import { minutesOnDay, onDay, type EventDoc } from '../data';

const ev = (start: string, end: string): EventDoc => ({
  id: 'x', accountId: 'a', title: 'x',
  metadata: { calendarId: 'c', calendarName: 'c', calendarColor: null, occurrenceKey: 'k', start, end, allDay: false,
    selfResponse: null, attendees: [], conferenceUrl: null, location: null },
});

it('spring-forward day: a 10:00 meeting sits at 10:00', () => {
  // 2026-03-29 10:00 CEST = 08:00Z
  expect(minutesOnDay(ev('2026-03-29T08:00:00.000Z', '2026-03-29T09:00:00.000Z'), new Date(2026, 2, 29))).toEqual([600, 660]);
});

it('fall-back day: a 10:00 meeting sits at 10:00', () => {
  // 2026-10-25 10:00 CET = 09:00Z
  expect(minutesOnDay(ev('2026-10-25T09:00:00.000Z', '2026-10-25T10:00:00.000Z'), new Date(2026, 9, 25))).toEqual([600, 660]);
});

it('a timed event crossing midnight shows on both days, clipped to each', () => {
  // 22:00 on the 24th → 02:00 on the 25th (CEST)
  const e = ev('2026-09-24T20:00:00.000Z', '2026-09-25T00:00:00.000Z');
  expect(onDay(e, new Date(2026, 8, 24))).toBe(true);
  expect(onDay(e, new Date(2026, 8, 25))).toBe(true);
  expect(onDay(e, new Date(2026, 8, 26))).toBe(false);
  expect(minutesOnDay(e, new Date(2026, 8, 24))).toEqual([1320, 1440]);
  expect(minutesOnDay(e, new Date(2026, 8, 25))).toEqual([0, 120]);
});

it('an event ending exactly at midnight is not on the next day', () => {
  const e = ev('2026-09-24T20:00:00.000Z', '2026-09-24T22:00:00.000Z'); // 22:00–24:00
  expect(onDay(e, new Date(2026, 8, 25))).toBe(false);
  expect(minutesOnDay(e, new Date(2026, 8, 24))).toEqual([1320, 1440]);
});
