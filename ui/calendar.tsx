import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  joinOccurrences, LOOKBACK_MS, mergeTranscripts, monthRange, overlaps, searchAll, transcriptIndex, weekRange,
  type EventDoc, type Invoke, type Occurrence, type TranscriptDoc,
} from './data';
import { DayPanel, dayLabel } from './day';
import { Detail } from './detail';
import { Month } from './month';
import { Rail, type RailAccount } from './rail';
import { s } from './styles';
import { Week } from './week';

const HIDDEN_KEY = 'kia.calendar.hidden';
const PALETTE = ['#4285f4', '#0b8043', '#8e24aa', '#e67c73', '#f6bf26', '#039be5', '#616161'];
const invoke: Invoke = (c, r) => (window as any).kiagent.invoke(c, r);

/** `app:get-state` answers with an envelope; the accounts are inside `state`. */
interface AppState {
  state: {
    accounts: Array<{
      account: { id: string; source: string; identifier: string; config?: { folderRoots?: { id: string; name: string }[] } };
    }>;
  };
}

/** What the page last showed, kept at module level: the host caches this
 *  module across visits but not the component, so without it every visit
 *  paints an empty grid until the queries answer. Revisits paint at once
 *  and refresh behind it. Events are kept per visible range (a few). */
const memo = {
  events: new Map<string, EventDoc[]>(),
  accounts: [] as RailAccount[],
  transcripts: [] as TranscriptDoc[],
  transcriptsLoaded: false,
};
const MEMO_RANGES = 12;
function remember(key: string, evs: EventDoc[]) {
  memo.events.delete(key);
  memo.events.set(key, evs);
  if (memo.events.size > MEMO_RANGES) memo.events.delete(memo.events.keys().next().value!);
}
/** Test-only. */
export function __resetMemo() {
  memo.events.clear();
  memo.accounts = [];
  memo.transcripts = [];
  memo.transcriptsLoaded = false;
}

function loadHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function saveHidden(h: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...h])); } catch { /* per-viewer convenience only */ }
}

function rangeLabel(view: 'week' | 'month', start: Date, cursor: Date): string {
  if (view === 'month') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const tail = last.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const head = start.getMonth() === last.getMonth()
    ? String(start.getDate())
    : start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${head} – ${tail}`;
}

export default function CalendarPage({ params, navigate }: {
  params: Record<string, string | undefined>;
  navigate(view: string, p?: Record<string, string>): void;
}) {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState(() => (params.date ? new Date(`${params.date}T12:00:00`) : new Date()));
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptDoc[]>(() => memo.transcripts);
  const [accounts, setAccounts] = useState<RailAccount[]>(() => memo.accounts);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const range = view === 'week' ? weekRange(cursor) : monthRange(cursor);
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  const rangeKey = `${startMs}/${endMs}`;
  // A range seen before shows its last events while the refresh runs.
  useLayoutEffect(() => { setEvents(memo.events.get(rangeKey) ?? []); }, [rangeKey]);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const current = () => mine === seq.current; // a newer range supersedes this fetch
    const start = new Date(startMs);
    const end = new Date(endMs);
    const from = new Date(startMs - LOOKBACK_MS);
    const q = { fromDate: from.toISOString(), toDate: end.toISOString() };
    // Every query names its account: the documents index leads with the
    // account, so a by-type query without one walks the whole corpus.
    let state: AppState;
    try {
      state = (await invoke('app:get-state', undefined)) as AppState;
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : String(err));
      return;
    }
    const perAccount = <T,>(source: string, query: Record<string, unknown>) => Promise.all(
      state.state.accounts.filter((a) => a.account.source === source)
        .map((a) => searchAll<T>(invoke, { ...query, account: a.account.id })),
    ).then((pages) => pages.flat());
    // Both go out together; the grid paints as soon as the events are in and
    // never waits on transcripts, which only add badges.
    // First load: every transcript once; afterwards only the visible slice.
    const whole = !memo.transcriptsLoaded;
    // Settled up front, so a failure here can't go unhandled while the
    // events are still being awaited.
    const tFetch = perAccount<TranscriptDoc>('meetings', whole ? { type: 'meeting.transcript' } : { type: 'meeting.transcript', ...q })
      .then((docs) => ({ docs }), (err: unknown) => ({ err }));
    try {
      const evs = await perAccount<EventDoc>('google-calendar', { type: 'calendar.event', ...q });
      // Still right for its own range even when superseded: keep it.
      const visible = evs.filter((e) => overlaps(e, start, end));
      remember(rangeKey, visible);
      if (current()) {
        setEvents(visible);
        const colorOf = (id: string, i: number) =>
          evs.find((e) => e.metadata.calendarId === id)?.metadata.calendarColor ?? PALETTE[i % PALETTE.length];
        memo.accounts = state.state.accounts.filter((a) => a.account.source === 'google-calendar').map((a) => ({
          accountId: a.account.id,
          identifier: a.account.identifier,
          calendars: (a.account.config?.folderRoots ?? []).map((r, i) => ({ id: r.id, name: r.name, color: colorOf(r.id, i) })),
        }));
        setAccounts(memo.accounts);
        setError(null);
      }
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : String(err));
    }
    const t = await tFetch;
    if ('err' in t) {
      if (current()) setError(t.err instanceof Error ? t.err.message : String(t.err));
      return;
    }
    memo.transcripts = whole ? t.docs : mergeTranscripts(memo.transcripts, t.docs, from, end);
    memo.transcriptsLoaded = true;
    if (current()) setTranscripts(memo.transcripts);
  }, [startMs, endMs, rangeKey]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t); };
  }, [refresh]);

  const occurrences = useMemo(() => joinOccurrences(events, hidden), [events, hidden]);
  const tIndex = useMemo(() => transcriptIndex(transcripts), [transcripts]);
  const toggle = (id: string) => setHidden((h) => {
    const n = new Set(h);
    if (n.has(id)) n.delete(id); else n.add(id);
    saveHidden(n);
    return n;
  });
  const step = (dir: -1 | 1) => setCursor((c) => (view === 'week'
    ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * dir)
    : new Date(c.getFullYear(), c.getMonth() + dir, 1)));
  const days = Array.from({ length: view === 'week' ? 7 : 42 }, (_, i) =>
    new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i));
  const close = useCallback(() => { setSelected(null); setDay(null); }, []);
  const pickDay = useCallback((d: Date) => { setSelected(null); setDay(d); }, []);
  // An event picked on the grid (not from the day list) drops the day.
  const pickEvent = useCallback((o: Occurrence) => { setDay(null); setSelected(o); }, []);
  // Keep the open panel in step with refreshed data (or close it if the event went away).
  const current = selected ? occurrences.find((o) => o.key === selected.key) ?? null : null;

  return (
    <div style={s.page}>
      {/* The host paints the page title in its top bar; the toolbar leads the page. */}
      <div style={s.toolbar}>
        <button type="button" className="ui-btn" onClick={() => setCursor(new Date())}>Today</button>
        <button type="button" className="ui-btn is-ghost ui-ibtn" aria-label="Previous" onClick={() => step(-1)}>‹</button>
        <button type="button" className="ui-btn is-ghost ui-ibtn" aria-label="Next" onClick={() => step(1)}>›</button>
        <h2 style={s.range}>{rangeLabel(view, range.start, cursor)}</h2>
        <div style={{ flex: 1 }} />
        {error && <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{`Couldn't refresh: ${error}`}</span>}
        <div role="group" aria-label="View" className="ui-seg">
          {(['week', 'month'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} className={view === v ? 'ui-seg-i is-on' : 'ui-seg-i'} onClick={() => setView(v)}>
              {v === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>
      <div style={s.body}>
        <Rail cursor={cursor} accounts={accounts} hidden={hidden} onToggle={toggle} onPick={setCursor} onManage={() => navigate('sources')} />
        <main style={s.main}>
          {view === 'week'
            ? <Week days={days} occurrences={occurrences} transcripts={tIndex} onSelect={pickEvent} onPickDay={pickDay} />
            : <Month grid={days} month={cursor.getMonth()} occurrences={occurrences} transcripts={tIndex} onSelect={pickEvent} onPickDay={pickDay} />}
        </main>
        {current ? (
          <Detail
            occ={current}
            transcript={tIndex.get(current.key)}
            account={accounts.find((a) => a.accountId === current.primary.accountId)?.identifier}
            onClose={close}
            onOpenTranscript={(id) => navigate('transcripts', { anchor: id })}
            back={day ? { label: dayLabel(day), onBack: () => setSelected(null) } : undefined}
          />
        ) : day && (
          <DayPanel day={day} occurrences={occurrences} transcripts={tIndex} onSelect={setSelected} onClose={close} />
        )}
      </div>
    </div>
  );
}
