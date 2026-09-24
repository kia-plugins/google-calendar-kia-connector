import type { Document, HostFor, Query } from '@kiagent/connector-sdk';
import type { HostResponse } from '@kiagent/connector-sdk/http';
import {
  fakeAuthChannel, fakeFolderSelectionChannel, fakeSession, instantClock, jsonRes, scriptedFetch,
} from '@kiagent/connector-sdk/testing';
import type { GCalendarListEntry, GEvent } from '../google-types';

export { fakeAuthChannel, fakeFolderSelectionChannel, fakeSession, instantClock, jsonRes };

/** One fake calendar. `full` answers timeMin/timeMax listings; `inc` answers
 *  syncToken listings keyed by token. A page array = explicit pages. A
 *  number = that HTTP status for every request to this calendar. */
export interface CalFx {
  full?: GEvent[] | GEvent[][] | number;
  fullToken?: string;
  inc?: Record<string, { items: GEvent[]; next: string } | number>;
  timeZone?: string;
}
export interface CalWorld {
  calendarList?: GCalendarListEntry[] | number;
  calendars?: Record<string, CalFx>;
}

export function calWorld(world: CalWorld) {
  return scriptedFetch({
    custom: (url: URL): HostResponse | undefined => {
      if (url.pathname.endsWith('/users/me/calendarList')) {
        const l = world.calendarList ?? [];
        return typeof l === 'number' ? jsonRes(l, {}) : jsonRes(200, { items: l });
      }
      const m = /\/calendars\/([^/]+)\/events$/.exec(url.pathname);
      if (!m) return undefined;
      const id = decodeURIComponent(m[1]);
      const fx = world.calendars?.[id];
      if (!fx) return jsonRes(404, { error: 'notFound' });
      const sync = url.searchParams.get('syncToken');
      if (sync) {
        const r = fx.inc?.[sync];
        if (r === undefined) return jsonRes(410, { error: 'fullSyncRequired' });
        if (typeof r === 'number') return jsonRes(r, {});
        return jsonRes(200, { items: r.items, nextSyncToken: r.next, timeZone: fx.timeZone ?? 'UTC' });
      }
      if (typeof fx.full === 'number') return jsonRes(fx.full, {});
      const pages: GEvent[][] = Array.isArray(fx.full?.[0]) ? (fx.full as GEvent[][]) : [(fx.full as GEvent[]) ?? []];
      const idx = Number(url.searchParams.get('pageToken') ?? '0');
      const last = idx === pages.length - 1;
      return jsonRes(200, {
        items: pages[idx],
        timeZone: fx.timeZone ?? 'UTC',
        ...(last ? { nextSyncToken: fx.fullToken ?? `full-${id}` } : { nextPageToken: String(idx + 1) }),
      });
    },
  });
}

/** Query fake: `search` pages over the given documents filtered by type/account. */
export function fakeQuery(docs: Array<Partial<Document>>): Query {
  return {
    search: jest.fn(async (q: { type?: string; account?: string; limit?: number; offset?: number }) => {
      const hit = docs.filter((d) => (!q.type || d.type === q.type) && (!q.account || d.accountId === q.account));
      const off = q.offset ?? 0;
      return hit.slice(off, off + (q.limit ?? 50)) as Document[];
    }),
  } as unknown as Query;
}

export function makeHost(fetchFn: HostFor<'net'>['net']['fetch'], query: Query = fakeQuery([])): HostFor<'net' | 'query'> {
  return {
    self: { id: 'kia.google-calendar', dataDir: '/tmp' },
    log: () => {},
    net: { fetch: fetchFn },
    query,
  } as unknown as HostFor<'net' | 'query'>;
}

/** A timed event fixture. */
export const ev = (id: string, extra: Partial<GEvent> = {}): GEvent => ({
  id, status: 'confirmed', summary: id, iCalUID: `${id}@google.com`,
  start: { dateTime: '2026-09-24T10:00:00Z' }, end: { dateTime: '2026-09-24T11:00:00Z' }, ...extra,
});
