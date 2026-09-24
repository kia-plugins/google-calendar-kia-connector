import type { Session } from '@kiagent/connector-sdk';
import { CAL_API, type CalendarClient } from './client';
import type { GCalendarListEntry } from './google-types';

type Roots = Array<{ id: string; name: string }>;
export const rootsOf = (session: Session): Roots =>
  ((session.account.config as { folderRoots?: Roots } | undefined)?.folderRoots ?? []);

export async function listCalendars(client: CalendarClient): Promise<GCalendarListEntry[]> {
  const out: GCalendarListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const u = new URL(`${CAL_API}/users/me/calendarList`);
    u.searchParams.set('maxResults', '250');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const page = await client.get<{ items?: GCalendarListEntry[]; nextPageToken?: string }>(u.toString());
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}
