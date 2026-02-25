type SparkPoint = {
  value: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function MiniSparkline({
  points,
  height = 32,
  className,
}: {
  points: SparkPoint[];
  height?: number;
  className?: string;
}) {
  if (points.length < 2) return null;

  const width = 120;
  const pad = 2;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i * (width - pad * 2)) / Math.max(1, points.length - 1);
    const yNorm = (p.value - min) / span;
    const y = pad + (height - pad * 2) * (1 - yNorm);
    return `${x.toFixed(2)},${clamp(y, pad, height - pad).toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className || "h-full w-full"}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.85"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(" ")}
      />
    </svg>
  );
}
