import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  joinOccurrences, LOOKBACK_MS, mergeTranscripts, monthRange, overlaps, searchAll, transcriptIndex, weekRange,
  type EventDoc, type Invoke, type Occurrence, type TranscriptDoc,
} from './data';
import { Detail } from './detail';
import { Month } from './month';
import { Rail, type RailAccount } from './rail';
import { s } from './styles';
import { Week } from './week';

const HIDDEN_KEY = 'kia.calendar.hidden';
const PALETTE = ['#4285f4', '#0b8043', '#8e24aa', '#e67c73', '#f6bf26', '#039be5', '#616161'];
const invoke: Invoke = (c, r) => (window as any).kiagent.invoke(c, r);

interface AppState {
  accounts: Array<{
    account: { id: string; source: string; identifier: string; config?: { folderRoots?: { id: string; name: string }[] } };
  }>;
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
  const [transcripts, setTranscripts] = useState<TranscriptDoc[]>([]);
  const [accounts, setAccounts] = useState<RailAccount[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [selected, setSelected] = useState<Occurrence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcriptsLoaded = useRef(false);
  const seq = useRef(0);
  const range = view === 'week' ? weekRange(cursor) : monthRange(cursor);
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const start = new Date(startMs);
    const end = new Date(endMs);
    const from = new Date(startMs - LOOKBACK_MS);
    const q = { fromDate: from.toISOString(), toDate: end.toISOString() };
    try {
      const [evs, state] = await Promise.all([
        searchAll<EventDoc>(invoke, { type: 'calendar.event', ...q }),
        invoke('app:get-state', undefined) as Promise<AppState>,
      ]);
      // First load: every transcript once; afterwards only the visible slice.
      const fresh = await searchAll<TranscriptDoc>(invoke, transcriptsLoaded.current
        ? { type: 'meeting.transcript', ...q }
        : { type: 'meeting.transcript' });
      if (mine !== seq.current) return; // a newer range superseded this fetch
      setEvents(evs.filter((e) => overlaps(e, start, end)));
      const colorOf = (id: string, i: number) =>
        evs.find((e) => e.metadata.calendarId === id)?.metadata.calendarColor ?? PALETTE[i % PALETTE.length];
      setAccounts(state.accounts.filter((a) => a.account.source === 'google-calendar').map((a) => ({
        accountId: a.account.id,
        identifier: a.account.identifier,
        calendars: (a.account.config?.folderRoots ?? []).map((r, i) => ({ id: r.id, name: r.name, color: colorOf(r.id, i) })),
      })));
      setTranscripts((prev) => (transcriptsLoaded.current ? mergeTranscripts(prev, fresh, from, end) : fresh));
      transcriptsLoaded.current = true;
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(err instanceof Error ? err.message : String(err));
    }
  }, [startMs, endMs]);

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
  const close = useCallback(() => setSelected(null), []);
  // Keep the open panel in step with refreshed data (or close it if the event went away).
  const current = selected ? occurrences.find((o) => o.key === selected.key) ?? null : null;

  return (
    <div style={s.page}>
      <div style={s.toolbar}>
        <h1 style={s.title}>Calendar</h1>
        <span style={s.divider} />
        <button type="button" style={s.btn} onClick={() => setCursor(new Date())}>Today</button>
        <button type="button" style={s.btn} aria-label="Previous" onClick={() => step(-1)}>‹</button>
        <button type="button" style={s.btn} aria-label="Next" onClick={() => step(1)}>›</button>
        <span style={s.range}>{rangeLabel(view, range.start, cursor)}</span>
        <div style={{ flex: 1 }} />
        {error && <span role="status" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{`Couldn't refresh: ${error}`}</span>}
        <div role="group" aria-label="View" style={s.segment}>
          <button type="button" aria-pressed={view === 'week'} style={view === 'week' ? s.segOn : s.seg} onClick={() => setView('week')}>Week</button>
          <button type="button" aria-pressed={view === 'month'} style={view === 'month' ? s.segOn : s.seg} onClick={() => setView('month')}>Month</button>
        </div>
      </div>
      <div style={s.body}>
        <Rail cursor={cursor} accounts={accounts} hidden={hidden} onToggle={toggle} onPick={setCursor} onManage={() => navigate('sources')} />
        <main style={s.main}>
          {view === 'week'
            ? <Week days={days} occurrences={occurrences} transcripts={tIndex} onSelect={setSelected} />
            : <Month grid={days} month={cursor.getMonth()} occurrences={occurrences} transcripts={tIndex} onSelect={setSelected} />}
        </main>
        {current && (
          <Detail
            occ={current}
            transcript={tIndex.get(current.key)}
            onClose={close}
            onOpenTranscript={(id) => navigate('transcripts', { anchor: id })}
          />
        )}
      </div>
    </div>
  );
}
