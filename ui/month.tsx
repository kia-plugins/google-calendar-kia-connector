import { onDay, type Occurrence, type TranscriptDoc } from './data';
import { FALLBACK_COLOR, sameDay, time } from './format';
import { dayLabel } from './day';
import { MicIcon } from './icons';
import { s } from './styles';

interface Props {
  grid: Date[];
  month: number;
  occurrences: Occurrence[];
  transcripts: Map<string, TranscriptDoc>;
  onSelect(o: Occurrence): void;
  onPickDay(d: Date): void;
}

export function Month({ grid, month, occurrences, transcripts, onSelect, onPickDay }: Props) {
  const today = new Date();
  return (
    <div style={s.monthGrid}>
      {grid.slice(0, 7).map((d) => (
        <div key={`h${d.getDay()}`} style={s.monthDow}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
      ))}
      {grid.map((d) => {
        const isToday = sameDay(d, today);
        return (
          // The cell's empty space opens the day too; meetings stop the click.
          <div key={d.getTime()} style={{ ...s.monthCell, cursor: 'pointer' }} onClick={() => onPickDay(d)}>
            <button
              type="button"
              aria-label={`All meetings on ${dayLabel(d)}`}
              onClick={(e) => { e.stopPropagation(); onPickDay(d); }}
              style={{
                ...s.monthNum,
                border: 0,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: 'transparent',
                color: d.getMonth() === month ? 'var(--text-primary)' : 'var(--text-tertiary)',
                ...(isToday ? { background: 'var(--accent-solid)', color: '#fff' } : {}),
              }}
            >
              {d.getDate()}
            </button>
            {occurrences.filter((o) => onDay(o.primary, d)).map((o) => {
              const m = o.primary.metadata;
              return (
                <button key={o.key} type="button" style={{ ...s.monthItem, ...(m.selfResponse === 'declined' ? s.eventDeclined : {}) }} onClick={(e) => { e.stopPropagation(); onSelect(o); }}>
                  <span style={{ ...s.dot, background: m.calendarColor ?? FALLBACK_COLOR }} />
                  {!m.allDay && <span style={s.eventTime}>{time(m.start)}</span>}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.primary.title ?? '(no title)'}</span>
                  {transcripts.has(o.key) && <MicIcon size={10} />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
