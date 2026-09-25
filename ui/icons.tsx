/** Marks an event that has a meeting transcript. */
export function MicIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      role="img"
      aria-label="Has transcript"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, color: 'var(--accent-text)', marginLeft: 3 }}
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
