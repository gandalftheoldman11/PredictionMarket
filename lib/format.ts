/** $3.7b, $60.2m, $471k, $890 */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}b`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
}

/** Exact non-negative money micros rendered without a lossy domain conversion. */
export function fmtMoneyMicros(value: string): string {
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return "—";
  const micros = BigInt(value);
  const units = [
    { threshold: 1_000_000_000_000_000n, suffix: "b" },
    { threshold: 1_000_000_000_000n, suffix: "m" },
  ] as const;
  for (const { threshold, suffix } of units) {
    if (micros >= threshold) {
      const tenths = (micros * 10n + threshold / 2n) / threshold;
      return `$${tenths / 10n}.${tenths % 10n}${suffix}`;
    }
  }
  const thousandMicros = 1_000_000_000n;
  if (micros >= thousandMicros) {
    return `$${(micros + thousandMicros / 2n) / thousandMicros}k`;
  }
  return `$${(micros + 500_000n) / 1_000_000n}`;
}

/** Probability (0..1) as a chance percentage: 64%, <1%, >99% */
export function fmtChance(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const pct = p * 100;
  if (pct > 0 && pct < 1) return "<1%";
  if (pct > 99 && pct < 100) return ">99%";
  return `${Math.round(pct)}%`;
}

/** Price (0..1) in cents: 64¢, 3.5¢, <0.1¢ */
export function fmtCents(p: number): string {
  if (!Number.isFinite(p)) return "—";
  const c = p * 100;
  if (c === 0) return "0¢";
  if (c < 0.1) return "<0.1¢";
  if (c < 10) return `${parseFloat(c.toFixed(1))}¢`;
  return `${Math.round(c)}¢`;
}

/** Order-book price with sub-cent precision: 35.4¢ */
export function fmtCentsExact(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}¢`;
}

/** Share quantity with up to two decimal places. */
export function fmtShares(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

/** Signed percentage-point delta: +3.2, −0.8 (typographic minus) */
export function fmtDelta(d: number): string {
  const pts = d * 100;
  const fixed = Math.abs(pts) < 10 ? Math.abs(pts).toFixed(1) : String(Math.round(Math.abs(pts)));
  return pts >= 0 ? `+${fixed}` : `−${fixed}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtTooltipTime(unixSeconds: number, spanDays: number): string {
  const d = new Date(unixSeconds * 1000);
  if (spanDays <= 2) {
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: spanDays > 300 ? "numeric" : undefined,
  });
}

export function fmtAxisTime(unixSeconds: number, spanDays: number): string {
  const d = new Date(unixSeconds * 1000);
  if (spanDays <= 2) {
    return d.toLocaleTimeString("en-US", { hour: "numeric" });
  }
  if (spanDays > 300) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
