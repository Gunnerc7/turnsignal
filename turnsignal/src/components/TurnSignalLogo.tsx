// The approved sunset gradient: gold → brand amber → soft coral-orange.
// Deliberately stops short of the app's alert-red so the mark never
// reads as a warning state — just a richer, warmer turn-signal arrow.
//
// Two export shapes:
//   <TurnSignalLogo />         → the full lockup: arrow + "TurnSignal" wordmark
//   <TurnSignalMark />         → the arrow alone, for tight spaces / favicons

const GRADIENT_ID_FULL = 'ts-sunset-full';
const GRADIENT_ID_MARK = 'ts-sunset-mark';

// The arrow polygon, drawn in a 100×100 viewBox, centered vertically.
// Rounded joins and a matching stroke give the soft, clean corners.
function Arrow({ gradientId, strokeWidth = 5 }: { gradientId: string; strokeWidth?: number }) {
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#FFC857" />
          <stop offset="50%" stopColor="#F5A623" />
          <stop offset="100%" stopColor="#E8573D" />
        </linearGradient>
      </defs>
      <polygon
        points="8,37 50,37 50,22 92,50 50,78 50,63 8,63"
        fill={`url(#${gradientId})`}
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Glass-highlight streak — a low-opacity white triangle in the
          upper-left third, giving the "lit from outside" depth */}
      <path d="M14,33 L40,33 L30,47 L14,47 Z" fill="white" opacity="0.25" />
    </>
  );
}

// Full lockup — arrow + "TurnSignal" wordmark.
// Default size matches the existing login-page heading.
export default function TurnSignalLogo({
  size = 'hero',
  className = '',
}: {
  size?: 'hero' | 'header';
  className?: string;
}) {
  const arrowPx = size === 'hero' ? 64 : 26;
  const fontSize = size === 'hero' ? '48px' : '20px';
  const gap = size === 'hero' ? '18px' : '10px';

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap,
      }}
    >
      <svg
        width={arrowPx}
        height={arrowPx}
        viewBox="0 0 100 100"
        style={{
          flexShrink: 0,
          filter: 'drop-shadow(0 0 16px rgba(245,166,35,0.55))',
        }}
      >
        <Arrow gradientId={GRADIENT_ID_FULL} />
      </svg>
      <span
        style={{
          fontFamily: '"Space Grotesk", sans-serif',
          fontWeight: 700,
          fontSize,
          letterSpacing: '-0.01em',
          color: 'white',
          lineHeight: 1,
        }}
      >
        TurnSignal
      </span>
    </div>
  );
}

// Symbol only — for the header bar and the favicon SVG.
export function TurnSignalMark({
  size = 24,
  className = '',
  glow = true,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={glow ? { filter: 'drop-shadow(0 0 8px rgba(245,166,35,0.55))' } : undefined}
    >
      <Arrow gradientId={GRADIENT_ID_MARK} />
    </svg>
  );
}
