export type RestingOrderRiskView = {
  outcome: string;
  verb: string;
  outcomePrice: number;
};

export type PositionRiskView = {
  marketSlug: string;
  bracket: string;
  outcome: "yes" | "no" | "other";
  quantityContractMicros: string;
};

/** Keep the authority's independent outcome positions independent in the UI. */
export function outcomePositionQuantityMicros(
  marketSlug: string,
  bracket: string,
  positions: readonly PositionRiskView[],
): { yes: bigint; no: bigint } {
  return positions.reduce(
    (quantity, position) => {
      if (
        position.marketSlug !== marketSlug ||
        position.bracket !== bracket
      ) {
        return quantity;
      }
      if (position.outcome === "no") {
        quantity.no += BigInt(position.quantityContractMicros);
      } else {
        quantity.yes += BigInt(position.quantityContractMicros);
      }
      return quantity;
    },
    { yes: 0n, no: 0n },
  );
}

/** Match direct transfer and complementary mint/merge self-trade prevention. */
export function wouldCrossOwnOutcomeOrder(
  outcome: "yes" | "no",
  verb: "buy" | "sell",
  outcomePrice: number,
  orders: readonly RestingOrderRiskView[],
): boolean {
  return orders.some((order) => {
    const restingOutcome = order.outcome.toLowerCase();
    const restingVerb = order.verb.toLowerCase();
    if (restingOutcome === outcome) {
      if (restingVerb === verb) return false;
      return verb === "buy"
        ? outcomePrice >= order.outcomePrice - 1e-9
        : outcomePrice <= order.outcomePrice + 1e-9;
    }
    if (restingVerb !== verb) return false;
    return verb === "buy"
      ? outcomePrice + order.outcomePrice >= 1 - 1e-9
      : outcomePrice + order.outcomePrice <= 1 + 1e-9;
  });
}

type OutcomeBookOrder = {
  side: string;
  verb: string;
  price: number;
};

/**
 * Return direct and complementary orders contributing to a displayed level.
 */
export function ownOrdersAtOutcomeBookLevel<T extends OutcomeBookOrder>(
  orders: readonly T[],
  outcome: "yes" | "no",
  kind: "bid" | "ask",
  price: number,
): T[] {
  return orders.filter(
    (order) => {
      const direct = order.side.toLowerCase() === outcome;
      const expectedVerb = direct
        ? kind === "bid" ? "buy" : "sell"
        : kind === "bid" ? "sell" : "buy";
      const displayedPrice = direct ? order.price : 1 - order.price;
      return order.verb.toLowerCase() === expectedVerb &&
        Math.abs(displayedPrice - price) < 1e-9;
    },
  );
}

export function exceedsAvailableCash(
  requiredMoneyMicros: bigint,
  availableMoneyMicros: bigint | null,
): boolean {
  return (
    availableMoneyMicros !== null &&
    requiredMoneyMicros > availableMoneyMicros
  );
}

export function shouldOfferLocalFaucet(
  availableMoneyMicros: bigint | null,
  thresholdMoneyMicros = 25_000_000n,
): boolean {
  return (
    availableMoneyMicros !== null &&
    availableMoneyMicros < thresholdMoneyMicros
  );
}
