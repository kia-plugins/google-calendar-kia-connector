// src/__tests__/document.test.ts
import { externalIdOf, isLive, occurrenceKey, toDocument, zonedMidnightToUtc } from '../document';
import type { CalMeta } from '../document';
import type { GEvent } from '../google-types';

const cal: CalMeta = { id: 'me@example.com', name: 'Work', color: '#4285f4', timeZone: 'Europe/Berlin' };
const timed: GEvent = {
  id: 'ev1', status: 'confirmed', summary: 'Standup', iCalUID: 'uid1@google.com',
  htmlLink: 'https://calendar.google.com/event?eid=1',
  start: { dateTime: '2026-09-24T10:00:00+02:00' }, end: { dateTime: '2026-09-24T10:30:00+02:00' },
  organizer: { email: 'boss@example.com' },
  attendees: [
    { email: 'me@example.com', displayName: 'Me', responseStatus: 'accepted', self: true },
    { email: 'ann@example.com', displayName: 'Ann', responseStatus: 'tentative' },
    { email: 'room-1@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
  ],
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  eventType: 'default',
};

describe('toDocument', () => {
  it('maps a timed event', () => {
    const d = toDocument({ calendar: cal, event: timed });
    expect(d.externalId).toBe('me@example.com:ev1');
    expect(d.type).toBe('calendar.event');
    expect(d.title).toBe('Standup');
    expect(d.createdAt).toBe('2026-09-24T08:00:00.000Z');
    expect(d.url).toBe(timed.htmlLink);
    expect(d.scopeRootId).toBe('me@example.com');
    expect(d.metadata).toMatchObject({
      calendarId: 'me@example.com', calendarName: 'Work', calendarColor: '#4285f4',
      eventId: 'ev1', iCalUID: 'uid1@google.com', occurrenceKey: 'uid1@google.com',
      start: '2026-09-24T08:00:00.000Z', end: '2026-09-24T08:30:00.000Z',
      allDay: false, status: 'confirmed', organizer: 'boss@example.com',
      selfResponse: 'accepted', conferenceUrl: 'https://meet.google.com/abc-defg-hij',
      eventType: 'default',
    });
    expect(d.metadata.attendees).toEqual([
      { email: 'me@example.com', name: 'Me', response: 'accepted' },
      { email: 'ann@example.com', name: 'Ann', response: 'tentative' },
    ]);
    expect(d.metadata.participants).toEqual(['me@example.com', 'ann@example.com', 'boss@example.com']);
    expect(d.markdown).toContain('# Standup');
    expect(d.markdown).toContain('ann@example.com');
  });

  it('all-day across a DST change uses local midnight in the calendar zone', () => {
    const d = toDocument({ calendar: cal, event: {
      id: 'ad', status: 'confirmed', iCalUID: 'u2', start: { date: '2026-10-24' }, end: { date: '2026-10-26' } } });
    expect(d.metadata).toMatchObject({ allDay: true, startDate: '2026-10-24', endDate: '2026-10-26' });
    expect(d.metadata.start).toBe('2026-10-23T22:00:00.000Z'); // CEST (+2)
    expect(d.metadata.end).toBe('2026-10-25T23:00:00.000Z');   // CET (+1) after the switch
    expect(d.createdAt).toBe(d.metadata.start);
  });

  it('untitled event', () => {
    expect(toDocument({ calendar: cal, event: { ...timed, summary: undefined } }).title).toBe('(no title)');
  });

  it('declined self response', () => {
    const ev = { ...timed, attendees: [{ email: 'me@example.com', self: true, responseStatus: 'declined' }] };
    expect(toDocument({ calendar: cal, event: ev }).metadata.selfResponse).toBe('declined');
  });

  it('no self attendee → selfResponse null', () => {
    const ev = { ...timed, attendees: [] };
    expect(toDocument({ calendar: cal, event: ev }).metadata.selfResponse).toBeNull();
  });
});

describe('occurrenceKey', () => {
  it('one-off = iCalUID', () => expect(occurrenceKey(timed)).toBe('uid1@google.com'));
  it('recurring instance = iCalUID|original start in UTC', () => {
    expect(occurrenceKey({ ...timed, recurringEventId: 'ser', originalStartTime: { dateTime: '2026-09-24T10:00:00+02:00' } }))
      .toBe('uid1@google.com|2026-09-24T08:00:00.000Z');
  });
  it('moved instance keeps its key (original start, not start)', () => {
    const moved = { ...timed, recurringEventId: 'ser', start: { dateTime: '2026-09-25T15:00:00+02:00' },
      originalStartTime: { dateTime: '2026-09-24T10:00:00+02:00' } };
    expect(occurrenceKey(moved)).toBe('uid1@google.com|2026-09-24T08:00:00.000Z');
  });
  it('all-day instance uses the original date', () => {
    expect(occurrenceKey({ ...timed, recurringEventId: 's', originalStartTime: { date: '2026-09-24' } }))
      .toBe('uid1@google.com|2026-09-24');
  });
  it('same invite on two accounts shares the key', () => {
    const a = toDocument({ calendar: cal, event: timed });
    const b = toDocument({ calendar: { ...cal, id: 'other@example.com' }, event: { ...timed, id: 'different-id' } });
    expect(a.metadata.occurrenceKey).toBe(b.metadata.occurrenceKey);
    expect(a.externalId).not.toBe(b.externalId);
  });
});

describe('isLive', () => {
  it('cancelled and workingLocation are not live', () => {
    expect(isLive(timed)).toBe(true);
    expect(isLive({ ...timed, status: 'cancelled' })).toBe(false);
    expect(isLive({ ...timed, eventType: 'workingLocation' })).toBe(false);
  });
});

it('externalIdOf', () => expect(externalIdOf('c', 'e')).toBe('c:e'));
it('zonedMidnightToUtc handles UTC', () => expect(zonedMidnightToUtc('2026-01-01', 'UTC')).toBe('2026-01-01T00:00:00.000Z'));
