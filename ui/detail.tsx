import { useEffect } from 'react';
import { summarySection, withAuthUser, type Occurrence, type TranscriptDoc } from './data';
import { Markdown } from './markdown';
import { FALLBACK_COLOR } from './format';
import { s } from './styles';

interface Props {
  occ: Occurrence;
  transcript?: TranscriptDoc;
  onClose(): void;
  onOpenTranscript(meetingId: string): void;
  /** The Google account (email) the event came from. */
  account?: string;
  /** Set when opened from a day's list: returns to that list. */
  back?: { label: string; onBack(): void };
}

const RESPONSE: Record<string, string> = {
  accepted: 'Accepted', declined: 'Declined', tentative: 'Maybe', needsAction: 'No reply',
};

function when(m: Occurrence['primary']['metadata']): string {
  if (m.allDay && m.startDate && m.endDate) {
    const [y, mo, d] = m.endDate.split('-').map(Number);
    const last = new Date(y, mo - 1, d - 1);
    const [sy, smo, sd] = m.startDate.split('-').map(Number);
    const first = new Date(sy, smo - 1, sd);
    const fmt = (x: Date) => x.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    return first.getTime() === last.getTime() ? `${fmt(first)} · all day` : `${fmt(first)} – ${fmt(last)} · all day`;
  }
  const a = new Date(m.start);
  const b = new Date(m.end);
  const day = a.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (x: Date) => x.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${t(a)} – ${t(b)}`;
}

export function Detail({ occ, transcript, onClose, onOpenTranscript, back, account }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const m = occ.primary.metadata;
  const upcoming = Date.parse(m.end) > Date.now();
  const summary = transcript ? summarySection(transcript.markdown) : '';

  return (
    <aside aria-label="Event details" style={s.panel}>
      <div style={s.panelHead}>
        {back && (
          <button type="button" aria-label={`Back to ${back.label}`} style={{ ...s.iconBtn, alignSelf: 'flex-start', padding: 0, color: 'var(--accent-text)' }} onClick={back.onBack}>
            {`‹ ${back.label}`}
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...s.dot, width: 10, height: 10, background: m.calendarColor ?? FALLBACK_COLOR }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
            {occ.copies.map((c) => c.metadata.calendarName).join(' · ')}
          </span>
          {occ.primary.url && (
            <a href={withAuthUser(occ.primary.url, account)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent-text)', textDecoration: 'none' }}>Open in Google</a>
          )}
          <button type="button" style={s.iconBtn} aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <h2 style={s.panelTitle}>{occ.primary.title ?? '(no title)'}</h2>
        {occ.copies.length > 1 && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Shown once — the same invite is on {occ.copies.length} calendars</div>
        )}
        <div style={s.meta}>
          <span>{when(m)}</span>
          {m.location && <span>{m.location}</span>}
        </div>
        {m.conferenceUrl && upcoming && (
          <a href={m.conferenceUrl} target="_blank" rel="noreferrer" style={s.join}>Join</a>
        )}
      </div>
      <div style={s.panelBody}>
        {transcript && (
          <section aria-label="Linked transcript" style={s.transcript}>
            <span style={s.sectionLabel}>Transcript</span>
            {summary && <Markdown source={summary} />}
            <button
              type="button"
              style={{ ...s.btn, alignSelf: 'flex-start' }}
              onClick={() => transcript.metadata.meetingId && onOpenTranscript(transcript.metadata.meetingId)}
            >
              Open transcript
            </button>
          </section>
        )}
        {m.attendees.length > 0 && (
          <section aria-label="Guests" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={s.sectionLabel}>{`Guests · ${m.attendees.length}`}</span>
            {m.attendees.map((a) => (
              <div key={a.email} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name ?? a.email}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{a.response ? RESPONSE[a.response] ?? a.response : ''}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
