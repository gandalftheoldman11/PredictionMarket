import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PriceChart, { type ChartSeries } from "@/components/PriceChart";
import TradeRail from "@/components/TradeRail";
import { getMarket, priceHistory } from "@/lib/exchange/queries";
import {
  marketLifecycleLabel,
  marketResolutionLabel,
} from "@/lib/exchange/marketPresentation";
import { fmtCents, fmtChance, fmtDate, fmtMoneyMicros } from "@/lib/format";
import styles from "./market.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    outcome?: string | string[];
    action?: string | string[];
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const market = await getMarket(slug);
  if (!market) return { title: "Market not found — TRADEWAR" };
  return { title: `${market.question} — TRADEWAR`, description: market.blurb };
}

export default async function MarketPage({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const requestedSearch = await searchParams;
  const requestedOutcome = requestedSearch.outcome;
  const initialOutcome = requestedOutcome === "no" ? "no" : "yes";
  const initialVerb = requestedSearch.action === "sell" ? "sell" : "buy";
  const market = await getMarket(slug);
  if (!market) notFound();

  const series: ChartSeries[] = [
    { label: "Yes", tokenId: slug, color: "var(--color-probability)" },
  ];
  const initialData = { [slug]: await priceHistory(slug, "1W") };
  const tradable = market.status === "open";
  const resolutionLabel = marketResolutionLabel(market.resolution);
  const lifecycleLabel = marketLifecycleLabel(market.status);
  const spread = market.bestYesBid !== null && market.bestYesAsk !== null
    ? market.bestYesAsk - market.bestYesBid
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backlink}>
          ← All markets
        </Link>
        <div className={styles.headerGrid}>
          <div className={styles.headerCopy}>
            <div className={styles.badges}>
              <span className={styles.category}>{market.category}</span>
              <span className={tradable ? styles.live : styles.lifecycle}>
                {lifecycleLabel}{resolutionLabel ? ` · ${resolutionLabel}` : ""}
              </span>
            </div>
            <h1 className={styles.title}>{market.question}</h1>
            <p className={styles.blurb}>
              {market.blurb}
            </p>
            <div className={styles.meta}>
              <span>{fmtMoneyMicros(market.volumeMicros)} volume</span>
              <span>resolves {fmtDate(new Date(market.endTime * 1000).toISOString())}</span>
            </div>
          </div>

          <dl className={styles.marketSummary} aria-label="Current Yes market">
            <div className={styles.primaryMetric}>
              <dt>Last Yes trade</dt>
              <dd>
                {fmtChance(market.price)}
                <span className={styles.primaryQualifier}>implied probability</span>
              </dd>
            </div>
            <div>
              <dt>Yes bid</dt>
              <dd>{market.bestYesBid === null ? "—" : fmtCents(market.bestYesBid)}</dd>
            </div>
            <div>
              <dt>Yes ask</dt>
              <dd>{market.bestYesAsk === null ? "—" : fmtCents(market.bestYesAsk)}</dd>
            </div>
            <div>
              <dt>Spread</dt>
              <dd>{spread === null ? "—" : fmtCents(spread)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className={`${styles.grid} event-grid`}>
        <TradeRail
          marketSlug={slug}
          tradable={tradable}
          lastPrice={market.price}
          initialBestYesBid={market.bestYesBid}
          initialBestYesAsk={market.bestYesAsk}
          initialOutcome={initialOutcome}
          initialVerb={initialVerb}
          topContent={
            <div className={`block ${styles.chartBlock}`}>
              <PriceChart series={series} initialRange="1W" initialData={initialData} />
            </div>
          }
          bottomContent={
            <>
              <div className={`block ${styles.supportBlock}`}>
                <details>
                  <summary className={styles.summaryTitle}>
                    Rules & resolution
                  </summary>
                  <p className={styles.rules}>
                    {market.rules}
                    {"\n\n"}TRADEWAR resolves this market under the published rules. Winning
                    contracts settle at $1.00; losing contracts settle at $0.00. Open orders
                    are cancelled when the market resolves.
                  </p>
                </details>
              </div>

              <div className={`block ${styles.supportBlock}`}>
                <h2 className={styles.blockTitle}>Market facts</h2>
                <div className={styles.facts}>
                  <div>
                    <div className={styles.factLabel}>Volume</div>
                    <div className={styles.factValue}>{fmtMoneyMicros(market.volumeMicros)}</div>
                  </div>
                  <div>
                    <div className={styles.factLabel}>Resolution date</div>
                    <div className={styles.factValue}>{fmtDate(new Date(market.endTime * 1000).toISOString())}</div>
                  </div>
                  <div>
                    <div className={styles.factLabel}>Category</div>
                    <div className={styles.factValue}>{market.category}</div>
                  </div>
                  <div>
                    <div className={styles.factLabel}>Venue</div>
                    <div className={styles.factValue}>TRADEWAR</div>
                  </div>
                </div>
              </div>
            </>
          }
        />
      </div>
    </div>
  );
}
