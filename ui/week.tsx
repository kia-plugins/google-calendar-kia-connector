import { useEffect, useRef, useState } from 'react';
import { layoutLanes, onDay, type Occurrence, type TranscriptDoc } from './data';
import { FALLBACK_COLOR, sameDay, time } from './format';
import { HOUR_PX, s, tint } from './styles';

interface Props {
  days: Date[];
  occurrences: Occurrence[];
  transcripts: Map<string, TranscriptDoc>;
  onSelect(o: Occurrence): void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function colorOf(o: Occurrence): string {
  return o.primary.metadata.calendarColor ?? FALLBACK_COLOR;
}

export function Week({ days, occurrences, transcripts, onSelect }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * HOUR_PX;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const allDay = occurrences.filter((o) => o.primary.metadata.allDay);
  const timed = occurrences.filter((o) => !o.primary.metadata.allDay);

  return (
    <>
      <div style={s.dayHeads}>
        <div style={s.gutter} />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={d.getTime()} style={s.dayHead}>
              <span style={{ ...s.dow, color: today ? 'var(--accent-text)' : undefined }}>
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
              <span style={{ ...s.dayNum, ...(today ? { background: 'var(--accent-solid)', color: '#fff' } : {}) }}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>
      <div style={s.allDayRow}>
        <div style={s.allDayLabel}>all-day</div>
        {days.map((d) => (
          <div key={d.getTime()} style={s.allDayCell}>
            {allDay.filter((o) => onDay(o.primary, d)).map((o) => (
              <button
                key={o.key}
                type="button"
                style={{ ...s.chip, background: tint(colorOf(o)), borderLeft: `3px solid ${colorOf(o)}` }}
                onClick={() => onSelect(o)}
              >
                {o.primary.title ?? '(no title)'}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div ref={scroller} style={s.scroller}>
        <div style={s.grid}>
          <div style={{ ...s.gutter, position: 'relative' }}>
            {HOURS.slice(1).map((h) => (
              <span key={h} style={{ ...s.hourLabel, top: h * HOUR_PX }}>{`${String(h).padStart(2, '0')}:00`}</span>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutLanes(timed.filter((o) => onDay(o.primary, d)));
            const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            return (
              <div key={d.getTime()} style={s.dayCol}>
                {HOURS.map((h) => <div key={h} style={{ ...s.hourLine, top: h * HOUR_PX }} />)}
                {placed.map(({ occ, lane, lanes }) => {
                  const m = occ.primary.metadata;
                  const startMin = (Date.parse(m.start) - midnight) / 60_000;
                  const endMin = Math.min((Date.parse(m.end) - midnight) / 60_000, 24 * 60);
                  const height = Math.max(20, ((endMin - startMin) * HOUR_PX) / 60);
                  const color = colorOf(occ);
                  const declined = m.selfResponse === 'declined';
                  return (
                    <button
                      key={occ.key}
                      type="button"
                      onClick={() => onSelect(occ)}
                      style={{
                        ...s.event,
                        top: (startMin * HOUR_PX) / 60,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 5px)`,
                        background: tint(color),
                        borderLeft: `3px solid ${color}`,
                        ...(declined ? s.eventDeclined : {}),
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span style={{ ...s.eventTitle, flex: 1, minWidth: 0 }}>{occ.primary.title ?? '(no title)'}</span>
                        {transcripts.has(occ.key) && <span style={s.badge} aria-label="Has transcript">●</span>}
                      </span>
                      {height >= 34 && <span style={s.eventTime}>{`${time(m.start)} – ${time(m.end)}`}</span>}
                    </button>
                  );
                })}
                {sameDay(d, now) && (
                  <div style={{ ...s.nowLine, top: ((now.getTime() - midnight) / 60_000) * (HOUR_PX / 60) }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
