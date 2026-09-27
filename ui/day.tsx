import { useEffect } from 'react';
import { onDay, type Occurrence, type TranscriptDoc } from './data';
import { FALLBACK_COLOR, time } from './format';
import { MicIcon } from './icons';
import { s } from './styles';

interface Props {
  day: Date;
  occurrences: Occurrence[];
  transcripts: Map<string, TranscriptDoc>;
  onSelect(o: Occurrence): void;
  onClose(): void;
}

export const dayLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** Every meeting of one day, all-day ones first, then by start. */
export function DayPanel({ day, occurrences, transcripts, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = occurrences
    .filter((o) => onDay(o.primary, day))
    .sort((a, b) =>
      Number(b.primary.metadata.allDay) - Number(a.primary.metadata.allDay) ||
      a.primary.metadata.start.localeCompare(b.primary.metadata.start));

  return (
    <aside aria-label="Day" style={s.panel}>
      <div style={s.panelHead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ ...s.panelTitle, flex: 1 }}>{dayLabel(day)}</h2>
          <button type="button" className="ui-btn is-ghost is-sm ui-ibtn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <span style={s.meta}>{items.length === 1 ? '1 meeting' : `${items.length} meetings`}</span>
      </div>
      <div style={{ ...s.panelBody, gap: 4 }}>
        {items.map((o) => {
          const m = o.primary.metadata;
          const color = m.calendarColor ?? FALLBACK_COLOR;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o)}
              style={{ ...s.dayRow, borderLeft: `3px solid ${color}`, ...(m.selfResponse === 'declined' ? s.eventDeclined : {}) }}
            >
              <span style={s.dayRowTime}>{m.allDay ? 'all day' : `${time(m.start)} – ${time(m.end)}`}</span>
              <span style={{ ...s.ellipsis, fontWeight: 500 }}>{o.primary.title ?? '(no title)'}</span>
              {transcripts.has(o.key) && <MicIcon />}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
