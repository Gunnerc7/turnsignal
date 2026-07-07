// A small turn-signal-arrow shaped trend indicator, echoing the brand
// mark rather than a generic ▲▼ character — the one deliberate signature
// touch carried through every tile that has a trend to show.
function TrendArrow({ direction, color }: { direction: 'up' | 'down'; color: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      style={{ transform: direction === 'down' ? 'rotate(180deg)' : undefined }}
    >
      <path d="M5 0 L10 6 L6.5 6 L6.5 10 L3.5 10 L3.5 6 L0 6 Z" fill={color} />
    </svg>
  );
}

export default function OverviewTile({
  icon,
  label,
  value,
  sublabel,
  trend,
  accent,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  sublabel?: string;
  trend?: { direction: 'up' | 'down'; label: string; good: boolean };
  accent: 'blue' | 'amber' | 'red' | 'green';
  onClick?: () => void;
}) {
  const accentClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-signal-blue/10', text: 'text-signal-blue' },
    amber: { bg: 'bg-signal-amber/10', text: 'text-signal-amber' },
    red: { bg: 'bg-signal-red/10', text: 'text-signal-red' },
    green: { bg: 'bg-signal-green/10', text: 'text-signal-green' },
  };
  const { bg, text } = accentClasses[accent];
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`text-left rounded-2xl p-4 ${bg} ${onClick ? 'active:scale-[0.98] transition' : ''}`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center text-lg mb-3">
        <span>{icon}</span>
      </div>
      <p className="font-display text-2xl font-bold text-ink tabular leading-none">{value}</p>
      <p className="text-xs text-steel mt-1.5">{label}</p>
      {sublabel && <p className={`text-[11px] mt-1 font-medium ${text}`}>{sublabel}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-1.5">
          <TrendArrow direction={trend.direction} color={trend.good ? '#1FA463' : '#E5483D'} />
          <span className={`text-[11px] font-medium ${trend.good ? 'text-signal-green' : 'text-signal-red'}`}>
            {trend.label}
          </span>
        </div>
      )}
    </Wrapper>
  );
}
