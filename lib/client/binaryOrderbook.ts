export type OrderbookLevel = { price: number; size: number };
export type OrderbookData = { bids: OrderbookLevel[]; asks: OrderbookLevel[] };

type RealtimeOrderbookLevel = {
  price_micros: string;
  shares_micros: string;
  side: "bid" | "ask";
  outcome?: string;
};

function complementPrice(price: number): number {
  return (1_000_000 - Math.round(price * 1_000_000)) / 1_000_000;
}

/** A binary NO book is the same liquidity as YES with price and side inverted. */
export function outcomeBook(
  yesBook: OrderbookData | null,
  outcome: "yes" | "no",
): OrderbookData | null {
  if (yesBook === null || outcome === "yes") return yesBook;
  return {
    bids: yesBook.asks
      .map((level) => ({ price: complementPrice(level.price), size: level.size }))
      .sort((left, right) => right.price - left.price),
    asks: yesBook.bids
      .map((level) => ({ price: complementPrice(level.price), size: level.size }))
      .sort((left, right) => left.price - right.price),
  };
}

/** Normalize YES and NO delta levels into the one canonical YES-coordinate book. */
export function applyOrderbookDelta(
  yesBook: OrderbookData,
  updates: readonly RealtimeOrderbookLevel[],
): OrderbookData {
  const bids = new Map(yesBook.bids.map((level) => [level.price, level.size]));
  const asks = new Map(yesBook.asks.map((level) => [level.price, level.size]));

  for (const update of updates) {
    const isNo = update.outcome === "no";
    const side = isNo
      ? update.side === "bid" ? "ask" : "bid"
      : update.side;
    const rawPrice = Number(update.price_micros) / 1_000_000;
    const price = isNo ? complementPrice(rawPrice) : rawPrice;
    const size = Number(update.shares_micros) / 1_000_000;
    const levels = side === "bid" ? bids : asks;
    if (size === 0) levels.delete(price);
    else levels.set(price, size);
  }

  return {
    bids: [...bids].map(([price, size]) => ({ price, size }))
      .sort((left, right) => right.price - left.price),
    asks: [...asks].map(([price, size]) => ({ price, size }))
      .sort((left, right) => left.price - right.price),
  };
}
