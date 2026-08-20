import type { Metadata } from "next";
import Link from "next/link";
import MarketCard from "@/components/MarketCard";
import {
  Button,
  EmptyState,
  SectionHeader,
  Surface,
} from "@/components/ui";
import { categories, searchMarkets } from "@/lib/exchange/queries";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search markets — TRADEWAR",
  description: "Search every market on TRADEWAR.",
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

function normalizeQuery(value: string | string[] | undefined) {
  const query = Array.isArray(value) ? value[0] : value;
  return (query ?? "").trim().slice(0, 120);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13.3 13.3 4 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = normalizeQuery((await searchParams).q);
  const canSearch = query.length >= 2;
  const [results, marketCategories] = await Promise.all([
    canSearch ? searchMarkets(query, 48) : Promise.resolve([]),
    categories(),
  ]);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="search-page-title">
        <SectionHeader
          as="h1"
          id="search-page-title"
          kicker="Market search"
          title={
            canSearch ? (
              <>
                Results for <span className={styles.query}>“{query}”</span>
              </>
            ) : (
              "Find your next market"
            )
          }
          description="Search questions, categories, descriptions, and market identifiers across the full TRADEWAR board."
        />

        <Surface level={1} className={styles.formSurface}>
          <form className={styles.form} action="/search" role="search">
            <span className={styles.formIcon}>
              <SearchIcon />
            </span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              minLength={2}
              maxLength={120}
              placeholder="Try “tariffs”, “shipping”, or “rates”"
              aria-label="Search all markets"
              autoFocus={query.length === 0}
            />
            <Button type="submit" variant="primary" size="lg">
              Search
            </Button>
          </form>
        </Surface>

        <nav className={styles.categories} aria-label="Browse market categories">
          <span>Browse categories</span>
          {marketCategories.map((category) => (
            <Link href={`/?tag=${encodeURIComponent(category)}`} key={category}>
              {category}
            </Link>
          ))}
        </nav>
      </section>

      {canSearch && results.length > 0 ? (
        <section className={styles.results} aria-labelledby="search-results-title">
          <SectionHeader
            id="search-results-title"
            kicker="Matching markets"
            title={`${results.length} ${results.length === 1 ? "result" : "results"}`}
            description="Open and resolved markets are ranked by relevance, status, and matched volume."
            actions={
              <Button href="/" variant="ghost" size="sm">
                View all markets →
              </Button>
            }
          />
          <div className={styles.grid}>
            {results.map((market) => (
              <MarketCard market={market} key={market.slug} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          className={styles.empty}
          icon={<SearchIcon />}
          title={
            canSearch
              ? `No markets match “${query}”`
              : query.length === 1
                ? "Enter at least two characters"
                : "Search the entire market board"
          }
          description={
            canSearch
              ? "Try a broader topic, a category name, or fewer keywords."
              : "Results include active and resolved markets, ordered by relevance and volume."
          }
          action={
            canSearch ? (
              <Button href="/" variant="secondary" size="sm">
                Browse all markets
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
