// A genuine speedometer-style gauge, not a generic progress bar — three
// colored zones sized to the dealership's own configured yellow/red
// thresholds, with a needle pointing at the current turn rate. Built as
// three half-circle arcs (SVG's native circle dash-offset technique)
// rather than hand-drawn arc paths, since it's the more reliable way to
// get three precisely-sized, correctly-colored zones.
export default function TurnRateGauge({
  value,
  yellowDays,
  redDays,
  maxDays = 14,
}: {
  value: number | null;
  yellowDays: number;
  redDays: number;
  maxDays?: number;
}) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const halfCirc = circumference / 2;

  const greenEnd = Math.min(yellowDays, maxDays);
  const amberEnd = Math.min(redDays, maxDays);

  const greenLen = (greenEnd / maxDays) * halfCirc;
  const amberLen = ((amberEnd - greenEnd) / maxDays) * halfCirc;
  const redLen = ((maxDays - amberEnd) / maxDays) * halfCirc;

  const clamped = Math.min(maxDays, Math.max(0, value ?? 0));
  // 180 (min, pointing left) -> 270 (mid, pointing up) -> 360 (max, right).
  // A line drawn straight up already points at 270, so the rotation
  // needed is simply this angle minus 270.
  const needleRotation = (clamped / maxDays) * 180 - 90;

  return (
    <svg viewBox="0 0 140 82" className="w-full">
      <g transform="translate(70, 70)">
        <circle
          r={r}
          fill="none"
          stroke="#1FA463"
          strokeWidth="13"
          strokeDasharray={`${greenLen} ${circumference}`}
          strokeDashoffset={-halfCirc}
        />
        <circle
          r={r}
          fill="none"
          stroke="#F5A623"
          strokeWidth="13"
          strokeDasharray={`${amberLen} ${circumference}`}
          strokeDashoffset={-(halfCirc + greenLen)}
        />
        <circle
          r={r}
          fill="none"
          stroke="#E5483D"
          strokeWidth="13"
          strokeDasharray={`${redLen} ${circumference}`}
          strokeDashoffset={-(halfCirc + greenLen + amberLen)}
        />
        {value !== null && (
          <line
            x1="0"
            y1="0"
            x2="0"
            y2={-(r - 12)}
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            transform={`rotate(${needleRotation})`}
          />
        )}
        <circle r="6" fill="white" />
      </g>
    </svg>
  );
}
