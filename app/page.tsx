import { Badge, Button, EmptyState, SectionHeader } from "@/components/ui";
import CategoryRail from "@/components/CategoryRail";
import FeaturedMarket from "@/components/FeaturedMarket";
import MarketCard from "@/components/MarketCard";
import MarketPulse from "@/components/MarketPulse";
import { marketAcceptsNewOrders } from "@/lib/exchange/marketPresentation";
import { categories, listMarkets } from "@/lib/exchange/queries";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const marketCategories = await categories();
  const active =
    tag && marketCategories.includes(tag) ? tag : null;
  const markets = await listMarkets(active ?? undefined);
  const orderedMarkets = [...markets].sort(
    (left, right) =>
      Number(marketAcceptsNewOrders(right.status)) -
      Number(marketAcceptsNewOrders(left.status)),
  );
  const [featuredMarket, ...remainingMarkets] = orderedMarkets;
  // Keep the pulse useful without repeating the same markets in the board.
  // Reserving at least two cards also prevents a sparse discovery section.
  const pulseCount =
    remainingMarkets.length >= 6
      ? Math.min(4, remainingMarkets.length - 2)
      : 0;
  const pulseMarkets = remainingMarkets.slice(0, pulseCount);
  const boardMarkets = remainingMarkets.slice(pulseCount);

  return (
    <div className={styles.page}>
      <CategoryRail categories={marketCategories} active={active} />

      {featuredMarket ? (
        <>
          <div
            className={`${styles.showcase} ${pulseMarkets.length === 0 ? styles.showcaseSolo : ""}`}
          >
            <FeaturedMarket market={featuredMarket} />
            {pulseMarkets.length > 0 ? (
              <MarketPulse markets={pulseMarkets} />
            ) : null}
          </div>

          <section className={styles.board} aria-labelledby="market-board-title">
            <SectionHeader
              className={styles.boardHeader}
              id="market-board-title"
              kicker="Market board"
              title={active ?? "All markets"}
              description="Last trades with executable best asks. Open markets first."
              actions={
                <Badge tone="neutral">
                  {markets.length} {markets.length === 1 ? "market" : "markets"}
                </Badge>
              }
            />

            {boardMarkets.length > 0 ? (
              <div className={styles.grid}>
                {boardMarkets.map((market) => (
                  <MarketCard key={market.slug} market={market} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="No additional markets yet"
                description="This category currently has one featured market."
                action={
                  <Button href="/" variant="secondary" size="sm">
                    View all markets
                  </Button>
                }
              />
            )}
          </section>
        </>
      ) : (
        <EmptyState
          className={styles.empty}
          title="No markets in this category"
          description="There are no listed markets in this category yet."
          action={
            <Button href="/" variant="secondary">
              View all markets
            </Button>
          }
        />
      )}
    </div>
  );
}
