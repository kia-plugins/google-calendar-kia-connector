import type { DocumentInput } from '@kiagent/connector-sdk';
import type { GDateTime, GEvent } from './google-types';

export interface CalMeta { id: string; name: string; color?: string; timeZone: string }
export interface CalItem { calendar: CalMeta; event: GEvent }

export const DOC_TYPE = 'calendar.event';
export const externalIdOf = (calendarId: string, eventId: string): string => `${calendarId}:${eventId}`;

export const isLive = (e: GEvent): boolean =>
  e.status !== 'cancelled' && e.eventType !== 'workingLocation';

/** UTC offset of `timeZone` at instant `utcMs`, in ms. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const n = (t: string): number => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - utcMs;
}

/** 'YYYY-MM-DD' at 00:00 local time in `timeZone`, as a UTC ISO string. */
export function zonedMidnightToUtc(date: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  const first = wall - tzOffsetMs(wall, timeZone);
  return new Date(wall - tzOffsetMs(first, timeZone)).toISOString();
}

function instant(t: GDateTime | undefined, timeZone: string): string | null {
  if (t?.dateTime) return new Date(t.dateTime).toISOString();
  if (t?.date) return zonedMidnightToUtc(t.date, t.timeZone ?? timeZone);
  return null;
}

export function occurrenceKey(e: GEvent): string {
  const uid = e.iCalUID ?? e.id;
  if (!e.recurringEventId) return uid;
  const o = e.originalStartTime;
  const original = o?.date ?? (o?.dateTime ? new Date(o.dateTime).toISOString() : '');
  return `${uid}|${original}`;
}

function conferenceUrl(e: GEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  return e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null;
}

const stripHtml = (s: string): string =>
  s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

export function toDocument(item: CalItem): DocumentInput {
  const { calendar: cal, event: e } = item;
  const allDay = Boolean(e.start?.date);
  const start = instant(e.start, cal.timeZone);
  const end = instant(e.end, cal.timeZone);
  const people = (e.attendees ?? []).filter((a) => !a.resource && a.email);
  const attendees = people.map((a) => ({ email: a.email!, name: a.displayName ?? null, response: a.responseStatus ?? null }));
  const self = (e.attendees ?? []).find((a) => a.self);
  const organizer = e.organizer?.email ?? null;
  const participants = [...new Set([...attendees.map((a) => a.email), ...(organizer ? [organizer] : [])])];
  const title = e.summary ?? '(no title)';
  const when = allDay ? `${e.start?.date} – ${e.end?.date} (all day)` : `${start} – ${end}`;
  const lines = [
    `# ${title}`, '',
    `**When:** ${when}`,
    ...(e.location ? [`**Where:** ${e.location}`] : []),
    `**Calendar:** ${cal.name}`,
    ...(organizer ? [`**Organizer:** ${organizer}`] : []),
    ...(attendees.length ? [`**Attendees:** ${attendees.map((a) => `${a.name ? `${a.name} ` : ''}<${a.email}> (${a.response ?? 'unknown'})`).join(', ')}`] : []),
    ...(conferenceUrl(e) ? [`**Conference:** ${conferenceUrl(e)}`] : []),
    ...(e.description ? ['', stripHtml(e.description)] : []),
  ];
  return {
    externalId: externalIdOf(cal.id, e.id),
    type: DOC_TYPE,
    title,
    markdown: lines.join('\n'),
    url: e.htmlLink,
    createdAt: start,
    scopeRootId: cal.id,
    metadata: {
      calendarId: cal.id, calendarName: cal.name, calendarColor: cal.color ?? null,
      eventId: e.id, iCalUID: e.iCalUID ?? null, occurrenceKey: occurrenceKey(e),
      start, end, allDay,
      ...(allDay ? { startDate: e.start?.date, endDate: e.end?.date } : {}),
      timeZone: e.start?.timeZone ?? cal.timeZone,
      status: e.status ?? 'confirmed',
      organizer, selfResponse: self?.responseStatus ?? null,
      attendees, participants,
      conferenceUrl: conferenceUrl(e), location: e.location ?? null,
      eventType: e.eventType ?? 'default', transparency: e.transparency ?? 'opaque',
    },
  };
}
