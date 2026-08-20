import Link from "next/link";
import { Surface } from "@/components/ui";
import type { MarketSummary } from "@/lib/exchange/queries";
import { fmtChance, fmtDelta, fmtMoneyMicros } from "@/lib/format";
import styles from "./MarketPulse.module.css";

export default function MarketPulse({
  markets,
}: {
  markets: MarketSummary[];
}) {
  return (
    <Surface
      as="section"
      level={1}
      className={styles.panel}
      aria-label="Market pulse"
    >
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>Next by volume</span>
          <h2 id="market-pulse-title">Market pulse</h2>
        </div>
        <span className={styles.columnLabels} aria-hidden="true">
          <span>Last</span>
          <span>1W</span>
        </span>
      </div>

      <div className={styles.list} aria-labelledby="market-pulse-title">
        {markets.map((market, index) => {
          const positive = market.delta1w >= 0;
          return (
            <Link
              href={`/market/${market.slug}`}
              className={styles.row}
              key={market.slug}
            >
              <span className={styles.rank}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.copy}>
                <strong>{market.question}</strong>
                <span>
                  {market.category} ·{" "}
                  <span className={styles.metaData}>
                    {fmtMoneyMicros(market.volumeMicros)} vol
                  </span>
                </span>
              </span>
              <span className={styles.numbers}>
                <strong aria-label={`Last traded probability ${fmtChance(market.price)}`}>
                  {fmtChance(market.price)}
                </strong>
                <span className={positive ? styles.positive : styles.negative}>
                  {fmtDelta(market.delta1w)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <Link href="/portfolio" className={styles.footer}>
        <span>Review your positions</span>
        <span aria-hidden="true">→</span>
      </Link>
    </Surface>
  );
}
