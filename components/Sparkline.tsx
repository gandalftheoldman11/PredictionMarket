import type { PricePoint } from "@/lib/types";

type Props = {
  points: PricePoint[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
};

/**
 * Server-rendered probability sparkline. Probability always uses a fixed
 * 0–100% domain so small moves are never visually exaggerated.
 */
export default function Sparkline({
  points,
  width = 560,
  height = 150,
  color = "var(--chance)",
  className,
}: Props) {
  if (points.length < 2) return null;

  const pad = 4;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;

  const x = (t: number) =>
    pad + ((t - t0) / Math.max(t1 - t0, 1)) * (width - pad * 2);
  const y = (p: number) =>
    pad + (1 - Math.max(0, Math.min(1, p))) * (height - pad * 2);

  const line = points
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`)
    .join("");
  const last = points[points.length - 1];

  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Price history, currently ${Math.round(last.p * 100)}%`}
    >
      {[0.25, 0.5, 0.75].map((reference) => (
        <line
          key={reference}
          x1={pad}
          x2={width - pad}
          y1={y(reference)}
          y2={y(reference)}
          stroke="var(--color-border)"
          strokeDasharray={reference === 0.5 ? "3 5" : "1 7"}
        />
      ))}
      <line
        x1={pad}
        x2={width - pad}
        y1={y(last.p)}
        y2={y(last.p)}
        stroke={color}
        strokeDasharray="2 7"
        opacity="0.16"
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(last.t)} cy={y(last.p)} r="7" fill={color} opacity="0.12" />
      <circle cx={x(last.t)} cy={y(last.p)} r="3.5" fill={color} />
    </svg>
  );
}
