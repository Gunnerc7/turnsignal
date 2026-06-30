type TitleStatus = 'has_title' | 'poa' | 'waiting' | null;

// Three real, deliberately simple shapes, each playing on something
// drivers already recognize — including, for "has title," a literal
// turn-signal arrow as a small nod to the product name.
export default function TitleStatusIcon({ status, size = 18 }: { status: TitleStatus; size?: number }) {
  if (status === 'has_title') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <polygon points="2,7 10,7 10,3 18,10 10,17 10,13 2,13" fill="#1FA463" />
      </svg>
    );
  }

  if (status === 'poa') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <polygon points="2,4 18,4 10,17" fill="#F5A623" />
        <rect x="9.2" y="7" width="1.6" height="4" rx="0.8" fill="white" />
        <circle cx="10" cy="13" r="0.95" fill="white" />
      </svg>
    );
  }

  if (status === 'waiting') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="#E5483D" />
        <rect x="4.5" y="9.1" width="11" height="1.8" rx="0.9" fill="white" />
      </svg>
    );
  }

  // Not yet set — visually distinct from all three real states so it
  // never gets mistaken for a real answer.
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="#D1D5DB" strokeWidth="1.6" strokeDasharray="2.6 2.6" />
    </svg>
  );
}

export function titleStatusLabel(status: TitleStatus): string {
  if (status === 'has_title') return 'Have title';
  if (status === 'poa') return 'POA';
  if (status === 'waiting') return 'Waiting on title';
  return 'Not set';
}
