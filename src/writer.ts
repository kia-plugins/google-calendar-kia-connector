import { createHash } from 'node:crypto';
import type {
  CalendarWriter, CreatedEvent, EventCategory, EventIntent, HostFor, SenderContext, WritableCalendar,
} from '@kiagent/connector-sdk';
import { CalendarApiError, CalendarAuthError, CalendarClient, CAL_API } from './client';
import type { GCalendarListEntry, GEvent } from './google-types';

export interface WriterSeams { now?(): number; sleep?(ms: number): Promise<void> }

/** Google event colorId per category (§8): work Blueberry, personal Sage, kids Flamingo. */
const COLOR_ID: Record<EventCategory, string> = { work: '9', personal: '2', kids: '6' };
const DEADLINE_MS = 40_000;
const ALPHABET = '0123456789abcdefghijklmnopqrstuv';

/** Lower-case base32hex (RFC 4648 §7, no padding) — the alphabet Google allows for event ids. */
function base32hex(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export const eventIdFor = (idempotencyKey: string): string =>
  'kia' + base32hex(createHash('sha256').update(idempotencyKey).digest()).slice(0, 26);

function googleMessage(e: CalendarApiError): string {
  try {
    const m = (JSON.parse(e.body) as { error?: { message?: string } }).error?.message;
    if (m) return m;
  } catch { /* not JSON */ }
  return e.body.slice(0, 200) || `HTTP ${e.status}`;
}

const conferenceUrlOf = (e: GEvent): string | null =>
  e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ?? null;

export function createCalendarWriter(host: HostFor<'net'>, seams: WriterSeams = {}): CalendarWriter {
  const now = seams.now ?? Date.now;
  const clientFor = (ctx: SenderContext): CalendarClient => {
    const token = ctx.credentials?.accessToken;
    if (!token) throw new CalendarAuthError('google-calendar: no credentials available — reconnect the account');
    return new CalendarClient({ fetch: host.net.fetch, getToken: async () => token, sleep: seams.sleep, now });
  };

  return {
    async listCalendars(ctx) {
      const client = clientFor(ctx);
      const out: WritableCalendar[] = [];
      let pageToken: string | undefined;
      do {
        const url = `${CAL_API}/users/me/calendarList?maxResults=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const page = await client.get<{ items?: GCalendarListEntry[]; nextPageToken?: string }>(url);
        for (const c of page.items ?? []) {
          out.push({
            id: c.id,
            name: c.summaryOverride ?? c.summary ?? c.id,
            color: c.backgroundColor ?? null,
            primary: Boolean(c.primary),
            canWrite: c.accessRole === 'owner' || c.accessRole === 'writer',
            shared: c.accessRole !== 'owner',
            timeZone: c.timeZone ?? null,
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    },

    async createEvent(intent: EventIntent, ctx): Promise<CreatedEvent> {
      const client = clientFor(ctx);
      const id = eventIdFor(intent.idempotencyKey);
      const base = `${CAL_API}/calendars/${encodeURIComponent(intent.calendarId)}/events`;
      const body: Record<string, unknown> = {
        id,
        summary: intent.title,
        ...(intent.location ? { location: intent.location } : {}),
        ...(intent.description ? { description: intent.description } : {}),
        start: intent.allDay ? { date: intent.start } : { dateTime: intent.start, timeZone: intent.timeZone },
        end: intent.allDay ? { date: intent.end } : { dateTime: intent.end, timeZone: intent.timeZone },
        ...(intent.attendees.length
          ? { attendees: intent.attendees.map((a) => ({ email: a.email, ...(a.name ? { displayName: a.name } : {}) })) }
          : {}),
        colorId: COLOR_ID[intent.category],
        extendedProperties: {
          private: {
            kiaCategory: intent.category,
            kiaDraftId: intent.kia.draftId,
            kiaSource: intent.kia.sourceDocumentId ?? '',
          },
        },
        ...(intent.conference === 'auto'
          ? {
              conferenceData: {
                createRequest: { requestId: intent.idempotencyKey, conferenceSolutionKey: { type: 'hangoutsMeet' } },
              },
            }
          : {}),
      };
      const deadline = now() + DEADLINE_MS;
      let event: GEvent;
      try {
        event = (await client.write<GEvent>('POST', `${base}?sendUpdates=all&conferenceDataVersion=1`, body, {
          deadline, idempotent: true,
        })).json;
      } catch (e) {
        if (!(e instanceof CalendarApiError)) throw e;
        if (e.status === 409) {
          // Same key, already created: read it back instead of duplicating.
          event = (await client.write<GEvent>('GET', `${base}/${id}`, undefined, { deadline, idempotent: true })).json;
        } else if (e.status === 403) {
          throw new Error(`reconnect Google Calendar (${intent.calendarId}) in Settings to allow adding events`);
        } else if (e.status === 429) {
          throw new Error('rate-limited: Google Calendar is busy — try again in a minute');
        } else if (e.status >= 400 && e.status < 500) {
          throw new Error(`not created: ${googleMessage(e)}`);
        } else {
          throw e;
        }
      }
      return {
        eventId: event.id,
        iCalUID: event.iCalUID ?? null,
        htmlLink: event.htmlLink ?? null,
        conferenceUrl: conferenceUrlOf(event),
        conferencePending: event.conferenceData?.createRequest?.status?.statusCode === 'pending',
        note: null,
      };
    },
  };
}
