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

export const overlaps = (e: EventDoc, start: Date, end: Date): boolean =>
  Date.parse(e.metadata.start) < end.getTime() && Date.parse(e.metadata.end) > start.getTime();

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

export function summaryLines(markdown: string | null, n: number): string[] {
  if (!markdown) return [];
  const after = markdown.split(/^## Summary\s*$/m)[1];
  if (!after) return [];
  return after.split(/^## /m)[0].split('\n').map((l) => l.trim()).filter(Boolean).slice(0, n);
}
