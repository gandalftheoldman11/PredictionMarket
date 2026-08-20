import Link from "next/link";
import {
  Badge,
  Button,
  OutcomeButton,
  Surface,
} from "@/components/ui";
import {
  priceHistory,
  type MarketSummary,
} from "@/lib/exchange/queries";
import {
  marketAcceptsNewOrders,
  marketLifecycleLabel,
} from "@/lib/exchange/marketPresentation";
import {
  fmtCents,
  fmtChance,
  fmtDate,
  fmtDelta,
  fmtMoneyMicros,
} from "@/lib/format";
import Sparkline from "./Sparkline";
import styles from "./FeaturedMarket.module.css";

export default async function FeaturedMarket({
  market,
}: {
  market: MarketSummary;
}) {
  const marketHref = `/market/${market.slug}`;
  const yesHref = `${marketHref}?outcome=yes&action=buy#trade-panel`;
  const noHref = `${marketHref}?outcome=no&action=buy#trade-panel`;
  const history = await priceHistory(market.slug, "1W");
  const positiveDelta = market.delta1w >= 0;
  const acceptsOrders = marketAcceptsNewOrders(market.status);
  const lifecycle = marketLifecycleLabel(market.status);
  const yesAsk = market.bestYesAsk;
  const noAsk = market.bestYesBid === null ? null : 1 - market.bestYesBid;
  const terminal =
    market.status === "resolved" || market.status === "settled";

  return (
    <Surface as="section" level={1} className={styles.feature}>
      <div className={styles.copy}>
        <div className={styles.badges}>
          <Badge tone={terminal ? "resolved" : acceptsOrders ? "live" : "neutral"}>
            Featured · {lifecycle}
          </Badge>
          <Badge tone="accent">{market.category}</Badge>
        </div>

        <div>
          <Link href={marketHref} className={styles.titleLink}>
            <h1 className={styles.title}>{market.question}</h1>
          </Link>
          <p className={styles.blurb}>{market.blurb}</p>
        </div>

        <dl className={styles.stats}>
          <div>
            <dt>Last trade</dt>
            <dd>{fmtChance(market.price)}</dd>
          </div>
          <div>
            <dt>One week</dt>
            <dd className={positiveDelta ? styles.positive : styles.negative}>
              {fmtDelta(market.delta1w)}
              <span className={styles.pointsUnit}> pts</span>
            </dd>
          </div>
          <div>
            <dt>Volume</dt>
            <dd>{fmtMoneyMicros(market.volumeMicros)}</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          {acceptsOrders && (
            <>
              <OutcomeButton
                outcome="yes"
                label={
                  <>
                    <span className={styles.actionLabelLong}>Buy Yes</span>
                    <span className={styles.actionLabelShort}>Yes</span>
                  </>
                }
                price={yesAsk === null ? "No asks" : fmtCents(yesAsk)}
                size="md"
                href={yesHref}
                aria-label={
                  yesAsk === null
                    ? "Buy Yes; no asks currently available"
                    : `Buy Yes at best ask ${fmtCents(yesAsk)}`
                }
              />
              <OutcomeButton
                outcome="no"
                label={
                  <>
                    <span className={styles.actionLabelLong}>Buy No</span>
                    <span className={styles.actionLabelShort}>No</span>
                  </>
                }
                price={noAsk === null ? "No asks" : fmtCents(noAsk)}
                size="md"
                href={noHref}
                aria-label={
                  noAsk === null
                    ? "Buy No; no asks currently available"
                    : `Buy No at best ask ${fmtCents(noAsk)}`
                }
              />
            </>
          )}
          <Button href={marketHref} variant="ghost" size="md">
            Open market
          </Button>
        </div>
      </div>

      <Surface level={2} className={styles.chartPanel}>
        <div className={styles.chartHead}>
          <div>
            <span>Yes probability</span>
            <strong>Last 7 days</strong>
          </div>
          <div className={styles.chartValue}>
            <strong>{fmtChance(market.price)}</strong>
            <span>Last trade</span>
          </div>
        </div>

        {history.length >= 2 ? (
          <Sparkline points={history} className={styles.chart} />
        ) : (
          <div className={styles.chartEmpty}>
            Price history will appear after the next matched trades.
          </div>
        )}

        <div className={styles.chartFoot}>
          <span>0%</span>
          <span className={styles.chartResolution}>
            {acceptsOrders ? <span className={styles.liveDot} aria-hidden="true" /> : null}
            {acceptsOrders ? "Live" : lifecycle} · Resolves{" "}
            {fmtDate(new Date(market.endTime * 1000).toISOString())}
          </span>
          <span>100%</span>
        </div>
      </Surface>
    </Surface>
  );
}
