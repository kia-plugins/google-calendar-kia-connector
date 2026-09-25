import { useEffect, useRef, useState } from 'react';
import { layoutLanes, minutesOnDay, onDay, type Occurrence, type TranscriptDoc } from './data';
import { FALLBACK_COLOR, sameDay, time } from './format';
import { dayLabel } from './day';
import { MicIcon } from './icons';
import { HOUR_PX, s, tint } from './styles';

interface Props {
  days: Date[];
  occurrences: Occurrence[];
  transcripts: Map<string, TranscriptDoc>;
  onSelect(o: Occurrence): void;
  onPickDay(d: Date): void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** Text for an event box of this height: short meetings get really small
 *  type on one line, so back-to-back ones stay readable and apart. */
function sizing(height: number) {
  if (height < 16) return { font: 8, pad: '0 3px', mic: 7, time: false };
  if (height < 34) return { font: 9.5, pad: '1px 4px', mic: 9, time: false };
  return { font: 11.5, pad: '3px 6px', mic: 11, time: true };
}

function colorOf(o: Occurrence): string {
  return o.primary.metadata.calendarColor ?? FALLBACK_COLOR;
}

export function Week({ days, occurrences, transcripts, onSelect, onPickDay }: Props) {
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
              <button type="button" style={s.dayLink} aria-label={`All meetings on ${dayLabel(d)}`} onClick={() => onPickDay(d)}>
                <span style={{ ...s.dow, color: today ? 'var(--accent-text)' : undefined }}>
                  {d.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span style={{ ...s.dayNum, ...(today ? { background: 'var(--accent-solid)', color: '#fff' } : {}) }}>
                  {d.getDate()}
                </span>
              </button>
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
            return (
              <div key={d.getTime()} style={s.dayCol}>
                {HOURS.map((h) => <div key={h} style={{ ...s.hourLine, top: h * HOUR_PX }} />)}
                {placed.map(({ occ, lane, lanes }) => {
                  const m = occ.primary.metadata;
                  const [startMin, endMin] = minutesOnDay(occ.primary, d);
                  // True length minus a 1px gap: a minimum height would draw
                  // a 10-minute meeting over the one after it.
                  const height = Math.max(6, ((endMin - startMin) * HOUR_PX) / 60 - 1);
                  const size = sizing(height);
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
                        padding: size.pad,
                        background: tint(color),
                        borderWidth: '1px 1px 1px 3px',
                        borderStyle: 'solid',
                        borderColor: `${tint(color, 60)} ${tint(color, 60)} ${tint(color, 60)} ${color}`,
                        ...(declined ? s.eventDeclined : {}),
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span
                          style={{
                            ...s.eventTitle,
                            flex: 1,
                            minWidth: 0,
                            fontSize: size.font,
                            lineHeight: `${Math.min(height - 2, size.font + 4)}px`,
                          }}
                        >
                          {occ.primary.title ?? '(no title)'}
                        </span>
                        {transcripts.has(occ.key) && <MicIcon size={size.mic} />}
                      </span>
                      {size.time && <span style={s.eventTime}>{`${time(m.start)} – ${time(m.end)}`}</span>}
                    </button>
                  );
                })}
                {sameDay(d, now) && (
                  <div style={{ ...s.nowLine, top: (now.getHours() * 60 + now.getMinutes()) * (HOUR_PX / 60) }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
