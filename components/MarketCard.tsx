import Link from "next/link";
import { Badge, OutcomeButton, ProbabilityBar, Surface } from "@/components/ui";
import type { MarketSummary } from "@/lib/exchange/queries";
import {
  marketAcceptsNewOrders,
  marketLifecycleLabel,
  marketResolutionLabel,
} from "@/lib/exchange/marketPresentation";
import { fmtCents, fmtChance, fmtDate, fmtMoneyMicros } from "@/lib/format";
import styles from "./MarketCard.module.css";

export default function MarketCard({ market }: { market: MarketSummary }) {
  const marketHref = `/market/${market.slug}`;
  const yesHref = `${marketHref}?outcome=yes&action=buy#trade-panel`;
  const noHref = `${marketHref}?outcome=no&action=buy#trade-panel`;
  const terminal =
    market.status === "resolved" || market.status === "settled";
  const acceptsOrders = marketAcceptsNewOrders(market.status);
  const lifecycle = marketLifecycleLabel(market.status);
  const resolution = marketResolutionLabel(market.resolution);
  const yesAsk = market.bestYesAsk;
  const noAsk = market.bestYesBid === null ? null : 1 - market.bestYesBid;

  return (
    <Surface as="article" level={1} className={styles.card}>
      <div className={styles.topline}>
        <Badge tone="accent">{market.category}</Badge>
        <Badge tone={terminal ? "resolved" : acceptsOrders ? "live" : "neutral"}>
          {lifecycle}
        </Badge>
      </div>

      <div className={styles.heading}>
        <Link href={marketHref} className={styles.questionLink}>
          <h3 className={styles.question}>{market.question}</h3>
        </Link>
        <div className={styles.probability}>
          <strong>{fmtChance(market.price)}</strong>
          <span>last trade</span>
        </div>
      </div>

      <ProbabilityBar
        value={market.price}
        label={`Last traded Yes probability ${fmtChance(market.price)}`}
      />

      {terminal && resolution ? (
        <div className={styles.resolved}>
          <span>
            {lifecycle} {resolution}
          </span>
        </div>
      ) : acceptsOrders ? (
        <div className={styles.outcomes}>
          <OutcomeButton
            outcome="yes"
            label="Yes"
            price={yesAsk === null ? "No asks" : fmtCents(yesAsk)}
            href={yesHref}
            aria-label={
              yesAsk === null
                ? "Buy Yes; no asks currently available"
                : `Buy Yes at best ask ${fmtCents(yesAsk)}`
            }
          />
          <OutcomeButton
            outcome="no"
            label="No"
            price={noAsk === null ? "No asks" : fmtCents(noAsk)}
            href={noHref}
            aria-label={
              noAsk === null
                ? "Buy No; no asks currently available"
                : `Buy No at best ask ${fmtCents(noAsk)}`
            }
          />
        </div>
      ) : (
        <div className={styles.resolved}>
          <span>{lifecycle}</span>
        </div>
      )}

      <div className={styles.meta}>
        <span>
          <span className={styles.metaLabel}>Volume</span>
          <span className={styles.metaValue}>{fmtMoneyMicros(market.volumeMicros)}</span>
        </span>
        <span>
          <span className={styles.metaLabel}>Resolves</span>
          <span className={styles.metaValue}>
            {fmtDate(new Date(market.endTime * 1000).toISOString())}
          </span>
        </span>
      </div>
    </Surface>
  );
}
