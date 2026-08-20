import Link from "next/link";
import type { MarketSummary } from "@/lib/exchange/queries";
import {
  marketAcceptsNewOrders,
  marketLifecycleLabel,
} from "@/lib/exchange/marketPresentation";
import {
  fmtCents,
  fmtDate,
  fmtDelta,
  fmtMoneyMicros,
} from "@/lib/format";
import styles from "./MarketTable.module.css";

export default function MarketTable({ markets }: { markets: MarketSummary[] }) {
  return (
    <div className={styles.frame}>
      <div
        className={styles.scroller}
        role="region"
        aria-label="Market board table"
        tabIndex={0}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Market</th>
              <th scope="col">Yes</th>
              <th scope="col">No</th>
              <th scope="col">1W</th>
              <th scope="col">Volume</th>
              <th scope="col">Resolves</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => {
              const lifecycle = marketLifecycleLabel(market.status);
              const isLive = marketAcceptsNewOrders(market.status);
              const positiveDelta = market.delta1w >= 0;

              return (
                <tr key={market.slug}>
                  <th scope="row">
                    <Link
                      href={`/market/${market.slug}`}
                      className={styles.marketLink}
                      title={market.question}
                    >
                      <span
                        className={`${styles.statusDot} ${isLive ? styles.live : ""}`}
                        aria-hidden="true"
                      />
                      <span className={styles.category}>{market.category}</span>
                      <span className={styles.question}>{market.question}</span>
                      <span className={styles.lifecycle}>{lifecycle}</span>
                    </Link>
                  </th>
                  <td className={styles.yes}>{fmtCents(market.price)}</td>
                  <td className={styles.no}>{fmtCents(1 - market.price)}</td>
                  <td className={positiveDelta ? styles.positive : styles.negative}>
                    {fmtDelta(market.delta1w)}
                  </td>
                  <td>{fmtMoneyMicros(market.volumeMicros)}</td>
                  <td>{fmtDate(new Date(market.endTime * 1000).toISOString())}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
