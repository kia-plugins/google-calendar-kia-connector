import type { Batch, ExternalRef, HostFor, Session } from '@kiagent/connector-sdk';
import { CalendarClient, isAuthError, isStatus } from './client';
import { staleDeletions } from './cleanup';
import { CHUNK, DAY, eventsUrl, HORIZON_DAYS, prune, REFRESH_DAYS, SINCE_DAYS, type CalEntry, type Cursor } from './cursor';
import { DOC_TYPE, externalIdOf, isLive, type CalItem, type CalMeta } from './document';
import type { GEvent, GEventsPage } from './google-types';
import { listCalendars, rootsOf } from './calendars';

const iso = (ms: number) => new Date(ms).toISOString();

async function listAll(client: CalendarClient, calendarId: string, p: { timeMin?: string; timeMax?: string; syncToken?: string }) {
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  let timeZone = 'UTC';
  let nextSyncToken: string | undefined;
  do {
    const page = await client.get<GEventsPage>(eventsUrl(calendarId, { ...p, pageToken }));
    events.push(...(page.items ?? []));
    timeZone = page.timeZone ?? timeZone;
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken;
  } while (pageToken);
  return { events, timeZone, nextSyncToken };
}

export async function* pullCalendars(args: {
  host: HostFor<'net' | 'query'>;
  session: Session;
  cursor: Cursor | null;
  client: CalendarClient;
  now(): number;
}): AsyncGenerator<Batch<Cursor, CalItem>> {
  const { host, session, client } = args;
  const now = args.now();
  const phase = args.cursor === null ? 'backfill' : 'live';
  const roots = rootsOf(session);
  let cur: Cursor = prune(args.cursor ?? { v: 1, since: iso(now - SINCE_DAYS * DAY), calendars: {} }, roots.map((r) => r.id));

  // Names/colours/zones for the documents; failures fall back to the root name.
  const listing = await listCalendars(client).catch((e) => { if (isAuthError(e)) throw e; return []; });
  const meta = (id: string, name: string, zone: string): CalMeta => {
    const c = listing.find((x) => x.id === id);
    return { id, name: c?.summaryOverride ?? c?.summary ?? name, color: c?.backgroundColor, timeZone: c?.timeZone ?? zone };
  };

  const fully = new Map<string, { live: Set<string>; entry: CalEntry }>();
  let attempted = 0;
  let failed = 0;
  let lastError: unknown;
  const age = (e: CalEntry) => now - Date.parse(e.fullAt);

  function* chunks(items: CalItem[], tail: Omit<Batch<Cursor, CalItem>, 'items' | 'phase'>): Generator<Batch<Cursor, CalItem>> {
    for (let i = 0; i + CHUNK < items.length; i += CHUNK) yield { phase, items: items.slice(i, i + CHUNK), cursor: cur };
    const rest = items.length === 0 ? [] : items.slice(Math.floor((items.length - 1) / CHUNK) * CHUNK);
    yield { phase, items: rest, ...tail };
  }

  for (const root of roots) {
    const entry = cur.calendars[root.id];
    if (entry?.gone && age(entry) < REFRESH_DAYS * DAY) continue;
    attempted++;
    try {
      if (entry?.syncToken && !entry.gone && age(entry) < REFRESH_DAYS * DAY) {
        try {
          const r = await listAll(client, root.id, { syncToken: entry.syncToken });
          const cal = meta(root.id, root.name, r.timeZone);
          const items = r.events.filter(isLive).map((event) => ({ calendar: cal, event }));
          const deletions: ExternalRef[] = r.events.filter((e) => !isLive(e)).map((e) => ({ externalId: externalIdOf(root.id, e.id), type: DOC_TYPE }));
          const dropEntry = r.events.some((e) => e.status === 'cancelled' && !e.recurringEventId);
          const calendars = { ...cur.calendars };
          if (dropEntry || !r.nextSyncToken) delete calendars[root.id];
          else calendars[root.id] = { ...entry, syncToken: r.nextSyncToken };
          const next: Cursor = { ...cur, calendars };
          yield* chunks(items, { deletions, cursor: next });
          cur = next;
          continue;
        } catch (e) {
          if (!isStatus(e, 410)) throw e; // 410 → fall through to a full list
        }
      }
      const r = await listAll(client, root.id, { timeMin: cur.since, timeMax: iso(now + HORIZON_DAYS * DAY) });
      const cal = meta(root.id, root.name, r.timeZone);
      const live = r.events.filter(isLive);
      fully.set(root.id, {
        live: new Set(live.map((e) => externalIdOf(root.id, e.id))),
        entry: r.nextSyncToken ? { syncToken: r.nextSyncToken, fullAt: iso(now) } : { fullAt: iso(now) },
      });
      yield* chunks(live.map((event) => ({ calendar: cal, event })), { cursor: cur });
    } catch (e) {
      if (isAuthError(e)) throw e;
      if (isStatus(e, 404)) {
        fully.set(root.id, { live: new Set(), entry: { gone: true, fullAt: iso(now) } });
        continue;
      }
      failed++;
      lastError = e;
      session.log('warn', `google-calendar: skipped ${root.id} this pull — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fully.size > 0) {
    const deletions = await staleDeletions(host.query, session.account.id, new Map([...fully].map(([id, f]) => [id, f.live])));
    const calendars = { ...cur.calendars };
    for (const [id, f] of fully) calendars[id] = f.entry;
    cur = { ...cur, calendars };
    yield { phase, items: [], deletions, cursor: cur };
  }

  if (attempted > 0 && failed === attempted) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`google-calendar: every calendar failed this pull — ${msg}`);
  }
}
