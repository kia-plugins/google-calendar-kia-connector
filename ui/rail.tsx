import { monthRange } from './data';
import { sameDay } from './format';
import { s } from './styles';

export interface RailAccount {
  accountId: string;
  identifier: string;
  calendars: { id: string; name: string; color: string }[];
}

interface Props {
  cursor: Date;
  accounts: RailAccount[];
  hidden: ReadonlySet<string>;
  onToggle(calendarId: string): void;
  onPick(d: Date): void;
  onManage(): void;
}

export function Rail({ cursor, accounts, hidden, onToggle, onPick, onManage }: Props) {
  const { start } = monthRange(cursor);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const today = new Date();
  const shift = (n: number) => onPick(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <aside style={s.rail}>
      <section aria-label="Mini calendar" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={s.railHead}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <span>
            <button type="button" className="ui-btn is-ghost is-sm ui-ibtn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
            <button type="button" className="ui-btn is-ghost is-sm ui-ibtn" aria-label="Next month" onClick={() => shift(1)}>›</button>
          </span>
        </div>
        <div style={s.miniGrid}>
          {cells.slice(0, 7).map((d) => (
            <span key={`h${d.getDay()}`} style={s.miniDow}>{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
          ))}
          {cells.map((d) => {
            const isToday = sameDay(d, today);
            const isCursor = sameDay(d, cursor);
            return (
              <button
                key={d.getTime()}
                type="button"
                aria-label={d.toDateString()}
                onClick={() => onPick(d)}
                style={{
                  ...s.miniDay,
                  color: isToday ? '#fff' : d.getMonth() === cursor.getMonth() ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  background: isToday ? 'var(--accent-solid)' : isCursor ? 'var(--accent-subtle)' : 'transparent',
                  fontWeight: isToday || isCursor ? 600 : 400,
                }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Calendars" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ ...s.railHead, paddingBottom: 4 }}>
          <span className="ui-card-lbl">Calendars</span>
        </div>
        {accounts.map((a) => (
          <div key={a.accountId} style={s.account}>
            <div style={s.accountHead}>
              <span style={s.ellipsis}>{a.identifier}</span>
              <button type="button" className="ui-btn is-ghost is-sm ui-ibtn" aria-label={`Choose calendars for ${a.identifier}`} onClick={onManage}>⚙</button>
            </div>
            {a.calendars.map((c) => (
              <label key={c.id} style={s.calRow}>
                <input
                  type="checkbox"
                  aria-label={c.name}
                  checked={!hidden.has(c.id)}
                  onChange={() => onToggle(c.id)}
                  style={{ accentColor: c.color, margin: 0 }}
                />
                <span style={{ ...s.ellipsis, color: 'var(--text-primary)' }}>{c.name}</span>
              </label>
            ))}
          </div>
        ))}
        <button type="button" className="ui-link" style={{ marginTop: 8 }} onClick={onManage}>+ Connect another Google account</button>
      </section>
    </aside>
  );
}
