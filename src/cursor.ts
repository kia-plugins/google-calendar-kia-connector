import { CAL_API } from './client';

export interface CalEntry { syncToken?: string; fullAt: string; gone?: true }
export interface Cursor { v: 1; since: string; calendars: Record<string, CalEntry> }

export const DAY = 86_400_000;
export const SINCE_DAYS = 365;
export const HORIZON_DAYS = 400;
export const REFRESH_DAYS = 30;
export const CHUNK = 250;

export function eventsUrl(
  calendarId: string,
  p: { timeMin?: string; timeMax?: string; syncToken?: string; pageToken?: string },
): string {
  const u = new URL(`${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  u.searchParams.set('singleEvents', 'true');
  u.searchParams.set('showDeleted', 'true');
  u.searchParams.set('maxResults', '2500');
  if (p.syncToken) u.searchParams.set('syncToken', p.syncToken);
  if (p.timeMin) u.searchParams.set('timeMin', p.timeMin);
  if (p.timeMax) u.searchParams.set('timeMax', p.timeMax);
  if (p.pageToken) u.searchParams.set('pageToken', p.pageToken);
  return u.toString();
}

/** Keep only entries for calendars still tracked. */
export function prune(c: Cursor, tracked: string[]): Cursor {
  const keep = new Set(tracked);
  return { ...c, calendars: Object.fromEntries(Object.entries(c.calendars).filter(([id]) => keep.has(id))) };
}
