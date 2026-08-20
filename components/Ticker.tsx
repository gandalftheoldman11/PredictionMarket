"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmtChance, fmtDelta } from "@/lib/format";
import { marketPageResponseSchema, requestJson } from "@/lib/client/api";
import {
  marketRoom,
  subscribeRealtime,
  tradeEventSchema,
} from "@/lib/client/realtime";
import styles from "./Ticker.module.css";

export type TickerItem = {
  slug: string;
  title: string;
  price: number;
  delta: number | null;
};

function Item({ item, duplicate = false }: { item: TickerItem; duplicate?: boolean }) {
  const delta = item.delta ?? 0;
  const dir =
    delta > 0.0005
      ? styles.positive
      : delta < -0.0005
        ? styles.negative
        : styles.flat;
  const arrow = delta > 0.0005 ? "▲" : delta < -0.0005 ? "▼" : "—";
  return (
    <Link
      href={`/market/${item.slug}`}
      className={styles.item}
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate ? true : undefined}
    >
      <span className={styles.name}>{item.title}</span>
      <span className={styles.price}>{fmtChance(item.price)}</span>
      <span className={dir}>
        {arrow} {fmtDelta(delta)} 1W
      </span>
    </Link>
  );
}

export default function Ticker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const pull = useCallback(async () => {
    try {
      const d = await requestJson(
        "/api/v1/markets?status=open&limit=14",
        marketPageResponseSchema,
      );
      setItems(d.markets.map((market) => ({
        slug: market.market,
        title: market.question,
        price: Number(BigInt(market.lastYesPriceMicros)) / 1_000_000,
        delta: Number(BigInt(market.change1wMicros)) / 1_000_000,
      })));
    } catch {
      // keep last
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void pull(), 0);
    const id = setInterval(() => void pull(), 60_000);
    return () => {
      window.clearTimeout(initial);
      clearInterval(id);
    };
  }, [pull]);

  useEffect(
    () => subscribeRealtime("markets", ["market_lifecycle"], (message) => {
      if (message.type === "market_lifecycle") void pull();
    }),
    [pull],
  );

  const marketKey = items.map((item) => item.slug).sort().join(",");
  useEffect(() => {
    const stops = marketKey.split(",").filter(Boolean).map((slug) =>
      subscribeRealtime(marketRoom(slug, slug), ["trade"], (message) => {
        if (message.type === "trade_reversed") {
          void pull();
          return;
        }
        if (message.type !== "trade") return;
        const parsed = tradeEventSchema.safeParse(message.data);
        if (!parsed.success) return;
        const price = Number(parsed.data.yes_price_micros) / 1_000_000;
        setItems((current) => current.map((item) =>
          item.slug === parsed.data.market ? { ...item, price } : item,
        ));
      }),
    );
    return () => stops.forEach((stop) => stop());
  }, [marketKey, pull]);

  if (items.length === 0) {
    return null;
  }
  return (
    <div className={styles.ticker} aria-label="Live markets">
      <div className={styles.track}>
        {items.map((item) => (
          <Item key={item.slug} item={item} />
        ))}
        <div aria-hidden="true" style={{ display: "contents" }}>
          {items.map((item) => (
            <Item key={`dup-${item.slug}`} item={item} duplicate />
          ))}
        </div>
      </div>
    </div>
  );
}
