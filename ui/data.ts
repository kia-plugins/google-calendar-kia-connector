export interface EventDoc {
  id: string; accountId: string; title: string | null; url?: string;
  metadata: {
    calendarId: string; calendarName: string; calendarColor: string | null; occurrenceKey: string;
    start: string; end: string; allDay: boolean; startDate?: string; endDate?: string;
    selfResponse: string | null; attendees: { email: string; name: string | null; response: string | null }[];
    conferenceUrl: string | null; location: string | null;
  };
}
export interface TranscriptDoc {
  id: string; createdAt: string | null; ingestedAt: string; markdown: string | null;
  metadata: { meetingId?: string; calendarEvent?: { occurrenceKey: string } };
}
export type Invoke = (channel: string, req: unknown) => Promise<unknown>;

export const LOOKBACK_MS = 35 * 86_400_000;
const PAGE = 500;

export async function searchAll<T>(invoke: Invoke, q: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = (await invoke('search:query', { ...q, limit: PAGE, offset })) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOnOrBefore = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

export function weekRange(d: Date) {
  const start = mondayOnOrBefore(d);
  return { start, end: addDays(start, 7) };
}
export function monthRange(d: Date) {
  const start = mondayOnOrBefore(new Date(d.getFullYear(), d.getMonth(), 1));
  return { start, end: addDays(start, 42) };
}

/** Local calendar date as YYYY-MM-DD. */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localMidnight = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** An all-day event is placed by its dates (end exclusive), never by the
 *  instants, which are midnight in the calendar's own time zone. */
function span(e: EventDoc): [number, number] {
  const m = e.metadata;
  if (m.allDay && m.startDate && m.endDate) return [localMidnight(m.startDate), localMidnight(m.endDate)];
  return [Date.parse(m.start), Date.parse(m.end)];
}

export const overlaps = (e: EventDoc, start: Date, end: Date): boolean => {
  const [s, en] = span(e);
  return s < end.getTime() && en > start.getTime();
};

const dayBounds = (day: Date): [number, number] => [
  new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime(),
  new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(),
];

/** Timed: any part of it falls on that local day (end exclusive; a
 *  zero-length event counts on its start day). All-day: covers that date. */
export function onDay(e: EventDoc, day: Date): boolean {
  const m = e.metadata;
  if (m.allDay && m.startDate && m.endDate) {
    const k = dayKey(day);
    return m.startDate <= k && k < m.endDate;
  }
  const [mid, next] = dayBounds(day);
  const s = Date.parse(m.start);
  const en = Date.parse(m.end);
  return s < next && (en > mid || s >= mid);
}

/** Wall-clock minutes of a timed event on one day, clipped to [0, 1440].
 *  Wall clock (not ms since midnight) keeps DST days right. */
export function minutesOnDay(e: EventDoc, day: Date): [number, number] {
  const [mid, next] = dayBounds(day);
  const s = Date.parse(e.metadata.start);
  const en = Date.parse(e.metadata.end);
  const wall = (t: number) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
  return [s <= mid ? 0 : wall(s), en >= next ? 1440 : wall(en)];
}

export interface Occurrence { key: string; primary: EventDoc; copies: EventDoc[] }

export function joinOccurrences(events: EventDoc[], hidden: ReadonlySet<string>): Occurrence[] {
  const by = new Map<string, EventDoc[]>();
  for (const e of events) {
    if (hidden.has(e.metadata.calendarId)) continue;
    const k = e.metadata.occurrenceKey;
    by.set(k, [...(by.get(k) ?? []), e]);
  }
  return [...by.entries()]
    .map(([key, copies]) => ({ key, primary: copies[0], copies }))
    .sort((a, b) => a.primary.metadata.start.localeCompare(b.primary.metadata.start));
}

const dated = (t: TranscriptDoc) => Date.parse(t.createdAt ?? t.ingestedAt);

export function mergeTranscripts(cache: TranscriptDoc[], fresh: TranscriptDoc[], from: Date, to: Date): TranscriptDoc[] {
  const inside = (t: TranscriptDoc) => dated(t) >= from.getTime() && dated(t) <= to.getTime();
  return [...cache.filter((t) => !inside(t)), ...fresh];
}

export function transcriptIndex(ts: TranscriptDoc[]): Map<string, TranscriptDoc> {
  const m = new Map<string, TranscriptDoc>();
  for (const t of ts) {
    const k = t.metadata.calendarEvent?.occurrenceKey;
    if (k) m.set(k, t);
  }
  return m;
}

/** The transcript's summary: everything between `## Summary` and
 *  `## Transcript`. A summary may carry its own `##` headings. */
export function summarySection(markdown: string | null): string {
  if (!markdown) return '';
  const after = markdown.split(/^## Summary\s*$/m)[1];
  if (after === undefined) return '';
  return after.split(/^## Transcript\s*$/m)[0].trim();
}

export interface Placed { occ: Occurrence; lane: number; lanes: number }

/** Side-by-side lanes for one day's timed occurrences: each takes the first
 *  lane that is free at its start; a cluster of overlapping ones shares the
 *  column width evenly. */
export function layoutLanes(occs: Occurrence[]): Placed[] {
  const sorted = [...occs].sort((a, b) => Date.parse(a.primary.metadata.start) - Date.parse(b.primary.metadata.start));
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => { for (const p of cluster) p.lanes = laneEnds.length; cluster = []; laneEnds = []; };
  for (const occ of sorted) {
    const start = Date.parse(occ.primary.metadata.start);
    const end = Math.max(Date.parse(occ.primary.metadata.end), start + 1);
    if (start >= clusterEnd) close();
    let lane = laneEnds.findIndex((e) => e <= start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = end;
    clusterEnd = cluster.length === 0 ? end : Math.max(clusterEnd, end);
    const p = { occ, lane, lanes: 1 };
    cluster.push(p);
    out.push(p);
  }
  close();
  return out;
}

/** A Google link opened as a given account (`authuser` takes an email), so
 *  a browser signed into several Google accounts shows the right one. */
export function withAuthUser(url: string, email: string | undefined): string {
  if (!email) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('authuser', email);
    return u.toString();
  } catch {
    return url;
  }
}
