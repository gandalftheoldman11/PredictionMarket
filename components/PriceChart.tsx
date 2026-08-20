"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PricePoint, RangeKey } from "@/lib/types";
import { fmtAxisTime, fmtChance, fmtDelta, fmtTooltipTime } from "@/lib/format";
import { candlePageResponseSchema, requestJson } from "@/lib/client/api";
import { marketRoom, subscribeRealtime, tradeEventSchema } from "@/lib/client/realtime";

export type ChartSeries = {
  label: string;
  tokenId: string;
  color: string;
};

type Props = {
  series: ChartSeries[]; // ≤ 4, fixed categorical order
  initialRange: RangeKey;
  initialData: Record<string, PricePoint[]>;
};

const RANGES: RangeKey[] = ["1D", "1W", "1M", "ALL"];
const H = 300;
const PAD = { top: 16, right: 54, bottom: 26, left: 10 };

function candleQuery(market: string, range: RangeKey): string {
  const now = Math.floor(Date.now() / 1_000);
  const settings = {
    "1D": { interval: "5m", seconds: 86_400 },
    "1W": { interval: "15m", seconds: 7 * 86_400 },
    "1M": { interval: "1h", seconds: 31 * 86_400 },
    ALL: { interval: "1d", seconds: null },
  } as const;
  const selected = settings[range];
  const params = new URLSearchParams({
    market,
    bracket: market,
    interval: selected.interval,
  });
  if (selected.seconds !== null) {
    params.set("from", String(now - selected.seconds));
    params.set("to", String(now));
  }
  return `/api/v1/candles?${params}`;
}

function tickStep(spanPts: number): number {
  for (const s of [1, 2, 5, 10, 20, 25, 50]) {
    if (spanPts / s <= 5) return s;
  }
  return 50;
}

export default function PriceChart({ series, initialRange, initialData }: Props) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [cache, setCache] = useState<
    Partial<Record<RangeKey, Record<string, PricePoint[]>>>
  >({ [initialRange]: initialData });
  const [errors, setErrors] = useState<Partial<Record<RangeKey, string>>>({});
  const [retryNonce, setRetryNonce] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const chartHeight = width < 520 ? 244 : H;
  const seriesKey = series.map((item) => item.tokenId).sort().join(",");

  useEffect(() => {
    const stops = seriesKey.split(",").filter(Boolean).map((market) =>
      subscribeRealtime(marketRoom(market, market), ["trade"], (message) => {
        if (message.type === "trade_reversed") {
          setCache({});
          return;
        }
        if (message.type !== "trade") return;
        const parsed = tradeEventSchema.safeParse(message.data);
        if (!parsed.success) return;
        const point = {
          t: parsed.data.timestamp,
          p: Number(parsed.data.yes_price_micros) / 1_000_000,
        };
        setCache((previous) => {
          const next = { ...previous };
          for (const key of RANGES) {
            const rangeData = next[key];
            if (!rangeData || !(parsed.data.market in rangeData)) continue;
            const points = [...rangeData[parsed.data.market]];
            const last = points.at(-1);
            if (last?.t === point.t) points[points.length - 1] = point;
            else if (!last || last.t < point.t) points.push(point);
            next[key] = { ...rangeData, [parsed.data.market]: points };
          }
          return next;
        });
      }),
    );
    return () => stops.forEach((stop) => stop());
  }, [seriesKey]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (cache[range]) return;
    let cancelled = false;
    Promise.all(
      series.map(async (s) => {
        const data = await requestJson(
          candleQuery(s.tokenId, range),
          candlePageResponseSchema,
        );
        return [
          s.tokenId,
          data.candles.map((candle) => ({
            t: Number(candle.closeTime),
            p: Number(BigInt(candle.closeYesPriceMicros)) / 1_000_000,
          })) as PricePoint[],
        ] as const;
      }),
    )
      .then((pairs) => {
        if (cancelled) return;
        setCache((prev) => ({ ...prev, [range]: Object.fromEntries(pairs) }));
        setErrors((previous) => {
          const next = { ...previous };
          delete next[range];
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setErrors((previous) => ({
          ...previous,
          [range]: "Price history is temporarily unavailable.",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [range, series, cache, retryNonce]);

  const data = cache[range];

  const model = useMemo(() => {
    if (!data) return null;
    const active = series
      .map((s) => ({ ...s, points: data[s.tokenId] ?? [] }))
      .filter((s) => s.points.length >= 2);
    if (active.length === 0) return null;

    let t0 = Infinity;
    let t1 = -Infinity;
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const s of active) {
      t0 = Math.min(t0, s.points[0].t);
      t1 = Math.max(t1, s.points[s.points.length - 1].t);
      for (const d of s.points) {
        pMin = Math.min(pMin, d.p);
        pMax = Math.max(pMax, d.p);
      }
    }
    const span = Math.max(pMax - pMin, 0.04);
    pMin = Math.max(0, pMin - span * 0.12);
    pMax = Math.min(1, pMax + span * 0.12);

    const plotW = Math.max(width - PAD.left - PAD.right, 40);
    const plotH = chartHeight - PAD.top - PAD.bottom;
    const x = (t: number) =>
      PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * plotW;
    const y = (p: number) => PAD.top + (1 - (p - pMin) / (pMax - pMin)) * plotH;

    const step = tickStep((pMax - pMin) * 100);
    const yTicks: number[] = [];
    for (
      let v = Math.ceil((pMin * 100) / step) * step;
      v <= pMax * 100 + 1e-9;
      v += step
    ) {
      yTicks.push(v / 100);
    }

    const spanDays = (t1 - t0) / 86400;
    const xTicks = (width < 520 ? [0.1, 0.5, 0.9] : [0.08, 0.36, 0.64, 0.92]).map(
      (f) => t0 + f * (t1 - t0),
    );

    // direct end-labels, nudged apart when lines converge
    const ends = active
      .map((s) => {
        const last = s.points[s.points.length - 1];
        return { color: s.color, p: last.p, y: y(last.p), x: x(last.t) };
      })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    }

    return { active, t0, t1, pMin, pMax, x, y, yTicks, xTicks, spanDays, ends, plotW };
  }, [chartHeight, data, series, width]);

  const hover = useMemo(() => {
    if (!model || hoverX === null) return null;
    const t =
      model.t0 +
      ((hoverX - PAD.left) / Math.max(model.plotW, 1)) * (model.t1 - model.t0);
    const rows = model.active.map((s) => {
      let best = s.points[0];
      let bestDist = Infinity;
      for (const d of s.points) {
        const dist = Math.abs(d.t - t);
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      return { label: s.label, color: s.color, point: best };
    });
    rows.sort((a, b) => b.point.p - a.point.p);
    const anchor = rows[0]?.point;
    return { t: anchor ? anchor.t : t, rows, px: model.x(anchor ? anchor.t : t) };
  }, [model, hoverX]);

  const onMove = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverX(e.clientX - rect.left + PAD.left);
  }, []);

  const single = series.length === 1;
  const latest = model?.active.map((s) => ({
    label: s.label,
    color: s.color,
    p: s.points[s.points.length - 1].p,
    delta: s.points[s.points.length - 1].p - s.points[0].p,
  }));
  const first = latest?.[0];

  return (
    <div>
      <div className="chart-head">
        {single && first ? (
          <div>
            <div className="chart-now">
              <span className="chart-now-pct">{fmtChance(first.p)}</span>
              <span
                className={`chart-now-delta ${first.delta >= 0 ? "t-up" : "t-down"}`}
              >
                {first.delta >= 0 ? "▲" : "▼"} {fmtDelta(first.delta)} pts ·{" "}
                {range}
              </span>
            </div>
            <div className="chart-now-lbl">
              Last Yes trade · implied probability
            </div>
          </div>
        ) : (
          <div className="legend">
            {latest?.map((s) => (
              <span key={s.label} className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ background: s.color }}
                />
                {s.label}
                <span className="legend-pct">{fmtChance(s.p)}</span>
              </span>
            ))}
          </div>
        )}
        <div className="range-tabs" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              className={`range-tab ${range === r ? "range-tab-active" : ""}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-box" ref={boxRef}>
        <svg
          className="chart-svg"
          width={width}
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
          role="img"
          aria-label={
            latest
              ? `Probability over time: ${latest.map((s) => `${s.label} ${fmtChance(s.p)}`).join(", ")}`
              : "Probability chart"
          }
        >
          {model && (
            <g>
              {model.yTicks.map((v) => (
                <g key={v}>
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={model.y(v)}
                    y2={model.y(v)}
                    stroke="var(--color-border)"
                    strokeWidth="1"
                  />
                  {/* end labels share the right gutter — yield to them */}
                  {model.ends.every((e) => Math.abs(e.y - model.y(v)) > 16) && (
                    <text
                      x={width - PAD.right + 8}
                      y={model.y(v) + 3.5}
                      fill="var(--color-text-muted)"
                      fontSize="10.5"
                      fontFamily="var(--font-mono)"
                    >
                      {Math.round(v * 100)}%
                    </text>
                  )}
                </g>
              ))}
              {model.xTicks.map((t) => (
                <text
                  key={t}
                  x={model.x(t)}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  fill="var(--color-text-muted)"
                  fontSize="10.5"
                  fontFamily="var(--font-mono)"
                >
                  {fmtAxisTime(t, model.spanDays)}
                </text>
              ))}

              {hover && (
                <line
                  x1={hover.px}
                  x2={hover.px}
                  y1={PAD.top}
                  y2={chartHeight - PAD.bottom}
                  stroke="var(--color-border-strong)"
                  strokeWidth="1"
                />
              )}

              {model.active.map((s) => {
                const line = s.points
                  .map(
                    (d, i) =>
                      `${i === 0 ? "M" : "L"}${model.x(d.t).toFixed(1)},${model.y(d.p).toFixed(1)}`,
                  )
                  .join("");
                const firstPoint = s.points[0];
                const lastPoint = s.points[s.points.length - 1];
                return (
                  <g key={s.tokenId}>
                    {single && (
                      <path
                        d={`${line} L${model.x(lastPoint.t).toFixed(1)},${chartHeight - PAD.bottom} L${model.x(firstPoint.t).toFixed(1)},${chartHeight - PAD.bottom} Z`}
                        fill={s.color}
                        fillOpacity="0.055"
                      />
                    )}
                    <path
                      d={line}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })}

              {model.ends.map((e, i) => (
                <g key={i}>
                  <circle cx={e.x} cy={model.y(e.p)} r="3.5" fill={e.color} stroke="var(--surface-1)" strokeWidth="2" />
                  <text
                    x={e.x + 9}
                    y={e.y + 4}
                    fill="var(--color-text)"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                  >
                    {fmtChance(e.p)}
                  </text>
                </g>
              ))}

              {hover &&
                hover.rows.map((r) => (
                  <circle
                    key={r.label}
                    cx={model.x(r.point.t)}
                    cy={model.y(r.point.p)}
                    r="4"
                    fill={r.color}
                    stroke="var(--surface-1)"
                    strokeWidth="2"
                  />
                ))}

              <rect
                x={PAD.left}
                y={PAD.top}
                width={model.plotW}
                height={chartHeight - PAD.top - PAD.bottom}
                fill="transparent"
                onPointerMove={onMove}
                onPointerLeave={() => setHoverX(null)}
              />
            </g>
          )}
        </svg>

        {hover && model && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(hover.px + 16, width - 200),
              top: 12,
            }}
          >
            <div className="chart-tip-time">
              {fmtTooltipTime(hover.t, model.spanDays)}
            </div>
            {hover.rows.map((r) => (
              <div key={r.label} className="chart-tip-row">
                <span
                  className="legend-swatch"
                  style={{ background: r.color }}
                />
                <span className="chart-tip-name">{r.label}</span>
                <span className="chart-tip-val">{fmtChance(r.point.p)}</span>
              </div>
            ))}
          </div>
        )}

        {!model && (
          <div style={{ height: chartHeight }} className="chart-status">
            {errors[range] ? (
              <div className="chart-error" role="alert">
                <span>{errors[range]}</span>
                <button
                  type="button"
                  className="chart-retry"
                  onClick={() => {
                    setErrors((previous) => {
                      const next = { ...previous };
                      delete next[range];
                      return next;
                    });
                    setRetryNonce((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : !data ? (
              "Loading price history…"
            ) : (
              "No trades in this range yet"
            )}
          </div>
        )}
      </div>

      {model && (
        <details className="chart-data">
          <summary
            className="sec-note"
          >
            View as data table
          </summary>
          <table
            style={{ width: "100%", marginTop: 8, borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th className="fact-lbl" style={{ textAlign: "left", padding: "4px 0" }}>
                  Time
                </th>
                {model.active.map((s) => (
                  <th
                    key={s.tokenId}
                    className="fact-lbl"
                    style={{ textAlign: "right", padding: "4px 0" }}
                  >
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                const t = model.t0 + f * (model.t1 - model.t0);
                return (
                  <tr key={f} style={{ borderTop: "1px solid var(--line)" }}>
                    <td
                      className="receipt-val"
                      style={{ padding: "5px 0", color: "var(--ink-2)" }}
                    >
                      {fmtTooltipTime(t, model.spanDays)}
                    </td>
                    {model.active.map((s) => {
                      let best = s.points[0];
                      for (const d of s.points) {
                        if (Math.abs(d.t - t) < Math.abs(best.t - t)) best = d;
                      }
                      return (
                        <td
                          key={s.tokenId}
                          className="receipt-val"
                          style={{ textAlign: "right", padding: "5px 0" }}
                        >
                          {fmtChance(best.p)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
