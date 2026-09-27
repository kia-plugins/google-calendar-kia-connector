/** Circle colours for guests: mid-dark hues that carry white initials in
 *  both themes. The host's avatar class is not part of the extension
 *  contract, so the page draws its own. */
const PALETTE = ['#7c3aed', '#0f766e', '#2563eb', '#b45309', '#be123c', '#15803d', '#4338ca', '#a21caf'];

/** "AM" for Alex Morgan; one letter for a single name or a bare address. */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return (email.trim()[0] ?? '?').toUpperCase();
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** The same address always gets the same colour. */
export function guestColor(email: string): string {
  let hash = 0;
  for (const ch of email.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Guest({ name, email, response }: { name?: string | null; email: string; response: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '3px 0' }}>
      <span
        aria-hidden="true"
        style={{
          width: 24, height: 24, flexShrink: 0, borderRadius: '50%', background: guestColor(email), color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        {initials(name, email)}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name ?? email}</span>
      <span style={{ color: 'var(--text-tertiary)' }}>{response}</span>
    </div>
  );
}
