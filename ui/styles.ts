import type { CSSProperties } from 'react';

type Styles = Record<string, CSSProperties>;

export const HOUR_PX = 60;

/** Event fill: the calendar colour washed into the surface, so it follows
 *  light and dark themes. */
export const tint = (color: string, pct = 16): string => `color-mix(in srgb, ${color} ${pct}%, var(--bg-surface))`;

export const s: Styles = {
  page: {
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--bg-app)',
    color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13,
  },
  toolbar: {
    height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px',
    borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
  },
  title: { margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' },
  divider: { width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 6px' },
  range: { fontSize: 14, fontWeight: 600, marginLeft: 4 },
  btn: {
    height: 30, minWidth: 30, padding: '0 10px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
  },
  segment: { display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' },
  seg: {
    height: 28, padding: '0 12px', border: 0, background: 'var(--bg-surface)', color: 'var(--text-secondary)',
    fontSize: 12, cursor: 'pointer',
  },
  segOn: {
    height: 28, padding: '0 12px', border: 0, background: 'var(--accent-subtle)', color: 'var(--accent-text)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  body: { flex: 1, display: 'flex', minHeight: 0, position: 'relative' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' },

  rail: {
    width: 236, flexShrink: 0, boxSizing: 'border-box', padding: '18px 16px', display: 'flex', flexDirection: 'column',
    gap: 22, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowY: 'auto',
  },
  railHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  railLabel: {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)',
  },
  miniGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px 0', textAlign: 'center' },
  miniDow: { fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, paddingBottom: 2 },
  miniDay: {
    fontSize: 11, lineHeight: '24px', border: 0, padding: 0, background: 'transparent', color: 'var(--text-primary)',
    cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontVariantNumeric: 'tabular-nums',
  },
  iconBtn: { border: 0, background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0 4px', fontSize: 12 },
  account: { display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 10 },
  accountHead: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', padding: '2px 0 4px' },
  ellipsis: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  calRow: { display: 'flex', alignItems: 'center', gap: 9, padding: '5px 4px', fontSize: 12, cursor: 'pointer' },
  linkBtn: {
    border: 0, borderTop: '1px dashed var(--border-subtle)', background: 'transparent', color: 'var(--accent-text)',
    fontSize: 12, fontWeight: 500, textAlign: 'left', padding: '8px 4px', cursor: 'pointer',
  },

  dayHeads: { display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 },
  gutter: { width: 52, flexShrink: 0 },
  dayHead: { flex: '1 1 0', minWidth: 0, overflow: 'hidden', padding: '10px 8px 8px', borderLeft: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 6 },
  dow: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' },
  dayNum: { fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', padding: '0 5px', borderRadius: 'var(--radius-sm)' },
  allDayRow: { display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, minHeight: 30 },
  allDayLabel: { width: 52, flexShrink: 0, fontSize: 10, color: 'var(--text-tertiary)', padding: '8px 8px 0 0', textAlign: 'right', boxSizing: 'border-box' },
  allDayCell: { flex: '1 1 0', minWidth: 0, borderLeft: '1px solid var(--border-subtle)', padding: 3, display: 'flex', flexDirection: 'column', gap: 2 },
  scroller: { flex: 1, overflowY: 'auto', position: 'relative' },
  grid: { display: 'flex', position: 'relative', height: 24 * HOUR_PX },
  hourLabel: { position: 'absolute', right: 8, fontSize: 10, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', transform: 'translateY(-50%)' },
  dayCol: { flex: '1 1 0', minWidth: 0, position: 'relative', borderLeft: '1px solid var(--border-subtle)' },
  hourLine: { position: 'absolute', left: 0, right: 0, borderTop: '1px solid var(--border-subtle)' },
  event: {
    position: 'absolute', boxSizing: 'border-box', border: 0, borderRadius: 'var(--radius-sm)', padding: '4px 6px',
    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden', cursor: 'pointer',
    color: 'var(--text-primary)', fontFamily: 'inherit',
  },
  chip: {
    border: 0, borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 500, padding: '3px 6px', textAlign: 'left',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', color: 'var(--text-primary)',
    fontFamily: 'inherit',
  },
  eventTitle: { fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  eventTime: { fontSize: 10.5, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  eventDeclined: { opacity: 0.5, textDecoration: 'line-through' },
  nowLine: { position: 'absolute', left: -4, right: 0, height: 2, background: '#e11d48', pointerEvents: 'none' },

  monthGrid: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: 'auto repeat(6, minmax(0, 1fr))', minHeight: 0 },
  monthDow: { padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' },
  monthCell: { borderLeft: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflowY: 'auto' },
  monthNum: { fontSize: 12, fontWeight: 600, padding: '2px 4px', alignSelf: 'flex-start', borderRadius: 'var(--radius-sm)', fontVariantNumeric: 'tabular-nums' },
  monthItem: { display: 'flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', padding: '1px 4px', fontSize: 11, textAlign: 'left', cursor: 'pointer', color: 'var(--text-primary)', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden' },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  dayRow: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    border: 0, borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--text-primary)',
    fontFamily: 'inherit', fontSize: 12, textAlign: 'left', cursor: 'pointer',
  },
  dayRowTime: { width: 92, flexShrink: 0, fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' },
  dayLink: { border: 0, background: 'transparent', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, whiteSpace: 'nowrap' },

  // Floats over the grid's right edge so opening it never narrows the calendar.
  panel: {
    position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 10,
    width: 372, borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
    boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  panelHead: { padding: '20px 22px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 10 },
  panelBody: { padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 18 },
  panelTitle: { margin: 0, fontSize: 19, lineHeight: '24px', fontWeight: 600, letterSpacing: '-0.01em' },
  meta: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' },
  join: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-solid)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none',
  },
  transcript: { border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', background: 'var(--accent-subtle)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' },
  list: { margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 },
};
