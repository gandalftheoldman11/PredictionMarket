"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fmtCents, fmtCentsExact, fmtShares } from "@/lib/format";
import { buildOrder, signOrderWithMagic } from "@/lib/chain/signOrder";
import {
  ApiError,
  cancelOrderResponseSchema,
  faucetResponseSchema,
  meResponseSchema,
  orderPageResponseSchema,
  orderParamsSchema,
  placeOrderResponseSchema,
  portfolioResponseSchema,
  requestJson,
} from "@/lib/client/api";
import {
  bookSnapshotCoversObservedSequence,
  isCurrentBookSequence,
  observeBookSequence,
} from "@/lib/client/bookSequence";
import {
  applyOrderbookDelta,
  outcomeBook,
  type OrderbookData,
} from "@/lib/client/binaryOrderbook";
import { openLogin } from "./LoginForm";
import {
  marketLifecycleEventSchema,
  marketSnapshotSchema,
  orderbookDeltaSchema,
  orderbookSnapshotSchema,
  marketRoom,
  privateOrderEventSchema,
  useRealtimeRoom,
} from "@/lib/client/realtime";
import {
  clearPendingSignedRequest,
  isDefinitiveSignedRequestFailure,
  readPendingSignedRequest,
  retainPendingSignedRequest,
  type PendingSignedRequest,
} from "@/lib/client/pendingSignedRequest";
import {
  exceedsAvailableCash,
  ownOrdersAtOutcomeBookLevel,
  outcomePositionQuantityMicros,
  shouldOfferLocalFaucet,
  wouldCrossOwnOutcomeOrder,
} from "@/lib/client/tradeRisk";
import {
  browserFenceStorage,
  loadBookSequenceFence,
  loadTerminalOrderFences,
  persistTerminalOrderFences,
  reconcileTerminalOrders,
  recordBookSequenceFence,
  recordTerminalOrder,
  retireBookSequenceFence,
} from "@/lib/client/terminalOrderFence";
import tradeStyles from "./TradeRail.module.css";

type Me = { email: string; cash: number; wallet: string | null } | null;
type Position = { yesShares: number; noShares: number };
type OpenOrder = {
  id: string;
  side: string;
  verb: string;
  priceDecicents: string;
  remainingQuantityContractMicros: string;
};
type DisplayOpenOrder = OpenOrder & { price: number; remaining: number };
type RetainedOrderTerms = {
  outcome: "yes" | "no";
  verb: "buy" | "sell";
  tif: "gtc" | "ioc";
  priceMicros: string;
  sharesMicros: string;
  cashBudgetMicros?: string;
  postOnly: boolean;
};

function retainedOrderTerms(pending: PendingSignedRequest | null): RetainedOrderTerms | null {
  if (!pending) return null;
  try {
    const value: unknown = JSON.parse(pending.body);
    if (typeof value !== "object" || value === null) return null;
    const body = value as Record<string, unknown>;
    if (
      !["yes", "no"].includes(String(body.outcome)) ||
      !["buy", "sell"].includes(String(body.verb)) ||
      !["gtc", "ioc"].includes(String(body.tif)) ||
      !/^[1-9][0-9]*$/.test(String(body.price)) ||
      !/^[1-9][0-9]*$/.test(String(body.shares)) ||
      (body.cashBudget !== undefined && !/^[1-9][0-9]*$/.test(String(body.cashBudget)))
    ) {
      return null;
    }
    return {
      outcome: body.outcome as "yes" | "no",
      verb: body.verb as "buy" | "sell",
      tif: body.tif as "gtc" | "ioc",
      priceMicros: String(body.price),
      sharesMicros: String(body.shares),
      postOnly: body.postOnly === true,
      ...(body.cashBudget === undefined ? {} : { cashBudgetMicros: String(body.cashBudget) }),
    };
  } catch {
    return null;
  }
}

function tickAlignedPriceMicros(cents: string): number | null {
  const match = /^(\d{1,2})(?:\.(\d))?$/.exec(cents);
  if (!match) return null;
  return Number(match[1]) * 10_000 + Number(match[2] ?? 0) * 1_000;
}

function displayContractMicros(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function displayDecicents(value: string): number {
  return Number(BigInt(value)) / 1_000;
}

function displayOpenOrder(order: OpenOrder): DisplayOpenOrder {
  return {
    ...order,
    price: displayDecicents(order.priceDecicents),
    remaining: displayContractMicros(order.remainingQuantityContractMicros),
  };
}

function formatTouch(
  canonicalBook: OrderbookData | null,
  outcome: "yes" | "no",
  verb: "buy" | "sell",
  initialBestYesBid: number | null,
  initialBestYesAsk: number | null,
): string {
  const selectedBook = outcomeBook(canonicalBook, outcome);
  const livePrice = verb === "buy"
    ? selectedBook?.asks[0]?.price
    : selectedBook?.bids[0]?.price;
  const initialPrice = outcome === "yes"
    ? verb === "buy" ? initialBestYesAsk : initialBestYesBid
    : verb === "buy"
      ? initialBestYesBid === null ? null : 1 - initialBestYesBid
      : initialBestYesAsk === null ? null : 1 - initialBestYesAsk;
  const price = livePrice ?? initialPrice ?? undefined;
  return price === undefined ? "—" : fmtCents(price);
}

function terminalFencesForScope(
  state: { scope: string; fences: Map<string, bigint> },
  scope: string,
) {
  if (state.scope !== scope) {
    state.scope = scope;
    state.fences = loadTerminalOrderFences(browserFenceStorage(), scope);
  }
  return state.fences;
}

export default function TradeRail({
  marketSlug,
  bracket = marketSlug,
  tradable,
  lastPrice,
  initialBestYesBid = null,
  initialBestYesAsk = null,
  initialOutcome = "yes",
  initialVerb = "buy",
  topContent,
  bottomContent,
}: {
  marketSlug: string;
  bracket?: string;
  tradable: boolean;
  lastPrice: number;
  initialBestYesBid?: number | null;
  initialBestYesAsk?: number | null;
  initialOutcome?: "yes" | "no";
  initialVerb?: "buy" | "sell";
  topContent: ReactNode;
  bottomContent: ReactNode;
}) {
  const [me, setMe] = useState<Me>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const authenticatedUserKey = me?.wallet ?? me?.email ?? null;
  const terminalOrderScope = authenticatedUserKey ?? "anonymous";
  const bookFenceScope = `${marketSlug}\u0000${bracket}`;
  const [outcome, setOutcome] = useState<"yes" | "no">(initialOutcome);
  const [verb, setVerb] = useState<"buy" | "sell">(initialVerb);
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [marketAmount, setMarketAmount] = useState("25");
  const [shareAmount, setShareAmount] = useState("5");
  const usesShareAmount = orderType === "limit" || verb === "sell";
  const amount = usesShareAmount ? shareAmount : marketAmount;
  const setAmount = usesShareAmount ? setShareAmount : setMarketAmount;
  const [limitCents, setLimitCents] = useState("");
  const [postOnly, setPostOnly] = useState(false);
  const [canonicalYesBook, setCanonicalYesBook] = useState<OrderbookData | null>(null);
  const [timedOutBookScope, setTimedOutBookScope] = useState<string | null>(null);
  const bookLoadTimedOut =
    canonicalYesBook === null && timedOutBookScope === bookFenceScope;
  const book = useMemo(
    () => outcomeBook(canonicalYesBook, outcome),
    [canonicalYesBook, outcome],
  );
  const [position, setPosition] = useState<Position>({ yesShares: 0, noShares: 0 });
  const [availableCashMicros, setAvailableCashMicros] = useState<bigint | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const ordersLoadKey = `${marketSlug}\u0000${bracket}\u0000${authenticatedUserKey ?? ""}`;
  const [ordersLoadedKey, setOrdersLoadedKey] = useState<string | null>(null);
  const ordersLoaded = ordersLoadedKey === ordersLoadKey;
  const [accountError, setAccountError] = useState(false);
  const [riskDataError, setRiskDataError] = useState(false);
  const minePrices = useMemo(
    () => openOrders
      .map((order) => order.side.toLowerCase() === outcome
        ? displayDecicents(order.priceDecicents)
        : 1 - displayDecicents(order.priceDecicents)),
    [openOrders, outcome],
  );
  const [cancellingOrderIds, setCancellingOrderIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
    details?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveTradability, setLiveTradability] = useState<{
    marketSlug: string;
    value: boolean;
  } | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingSignedRequest | null>(null);
  const limitTouched = useRef(false);
  const shouldPrefillLimit = useRef(false);
  const placeSubmitRef = useRef<HTMLButtonElement>(null);
  const meRequest = useRef(0);
  const mineRequest = useRef(0);
  const canonicalBook = useRef<OrderbookData | null>(null);
  const canonicalBookSequence = useRef<bigint | null>(null);
  const observedBookSequence = useRef<bigint | null>(
    loadBookSequenceFence(browserFenceStorage(), bookFenceScope),
  );
  const observedBookScope = useRef(`${marketSlug}\u0000${bracket}`);
  const privateRefresh = useRef<number | undefined>(undefined);
  const cancellationsInFlight = useRef<Set<string>>(new Set());
  const terminalOrderFences = useRef({
    scope: "",
    fences: new Map<string, bigint>(),
  });

  const displayCanonicalBook = useCallback((next: OrderbookData, sequence?: string) => {
    if (sequence !== undefined) {
      if (!isCurrentBookSequence(canonicalBookSequence.current, sequence)) return false;
      canonicalBookSequence.current = BigInt(sequence);
    }
    canonicalBook.current = next;
    if (
      sequence !== undefined &&
      !bookSnapshotCoversObservedSequence(observedBookSequence.current, sequence)
    ) {
      return true;
    }
    if (sequence !== undefined) {
      retireBookSequenceFence(
        browserFenceStorage(),
        bookFenceScope,
        sequence,
      );
    }
    setCanonicalYesBook(next);
    return true;
  }, [bookFenceScope]);

  const isTradable =
    liveTradability?.marketSlug === marketSlug ? liveTradability.value : tradable;

  useRealtimeRoom(
    marketRoom(marketSlug, bracket),
    ["market_lifecycle", "orderbook"],
    (message) => {
      const scope = `${marketSlug}\u0000${bracket}`;
      if (observedBookScope.current !== scope) {
        observedBookScope.current = scope;
        canonicalBook.current = null;
        canonicalBookSequence.current = null;
        observedBookSequence.current = loadBookSequenceFence(
          browserFenceStorage(),
          scope,
        );
        // Only clear the displayed book on market/bracket scope change —
        // keep the last good book across reconnects.
        setCanonicalYesBook(null);
      }
      if (message.sequence !== undefined) {
        if (!bookSnapshotCoversObservedSequence(
          observedBookSequence.current,
          message.sequence,
        ) && message.type !== "orderbook_snapshot") {
          return;
        }
        observedBookSequence.current = observeBookSequence(
          observedBookSequence.current,
          message.sequence,
        );
      }
      if (message.type === "market_lifecycle") {
        const parsed = marketLifecycleEventSchema.safeParse(message.data);
        if (parsed.success) {
          setLiveTradability({
            marketSlug,
            value: parsed.data.lifecycle === "open",
          });
        }
      } else if (message.type === "market_snapshot") {
        const parsed = marketSnapshotSchema.safeParse(message.data);
        if (parsed.success) {
          setLiveTradability({
            marketSlug,
            value: parsed.data.status === "open",
          });
        }
      } else if (message.type === "orderbook_snapshot") {
        const parsed = orderbookSnapshotSchema.safeParse(message.data);
        if (!parsed.success) return;
        const selected = parsed.data.books?.yes ?? {
          bids: parsed.data.bids,
          asks: parsed.data.asks,
        };
        displayCanonicalBook({
          bids: selected.bids.map((level) => ({
            price: Number(level.price_micros) / 1_000_000,
            size: Number(level.shares_micros) / 1_000_000,
          })),
          asks: selected.asks.map((level) => ({
            price: Number(level.price_micros) / 1_000_000,
            size: Number(level.shares_micros) / 1_000_000,
          })),
        }, message.sequence);
      } else if (message.type === "orderbook_delta") {
        const parsed = orderbookDeltaSchema.safeParse(message.data);
        if (!parsed.success) return;
        const current = canonicalBook.current;
        // A delta is not a snapshot. Wait for the socket's full subscription
        // snapshot before applying incremental levels.
        if (!current) return;
        displayCanonicalBook(
          applyOrderbookDelta(current, parsed.data.levels),
          message.sequence,
        );
      }
    },
  );

  const refreshMe = useCallback(async () => {
    const request = ++meRequest.current;
    try {
      const d = await requestJson("/api/auth/me", meResponseSchema);
      if (request !== meRequest.current) return;
      setAccountError(false);
      setMe(d.user);
      if (d.user === null) {
        setPosition({ yesShares: 0, noShares: 0 });
        setOpenOrders([]);
        setOrdersLoadedKey(null);
      }
    } catch (error) {
      if (request !== meRequest.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setAccountError(false);
        setMe(null);
        setPosition({ yesShares: 0, noShares: 0 });
        setOpenOrders([]);
        setOrdersLoadedKey(null);
      } else {
        setAccountError(true);
      }
    } finally {
      if (request === meRequest.current) setMeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (canonicalYesBook) return;
    const timer = window.setTimeout(
      () => setTimedOutBookScope(bookFenceScope),
      8_000,
    );
    return () => window.clearTimeout(timer);
  }, [canonicalYesBook, bookFenceScope]);

  const refreshMine = useCallback(async () => {
    const fences = terminalFencesForScope(
      terminalOrderFences.current,
      terminalOrderScope,
    );
    if (!meLoaded || authenticatedUserKey === null) {
      if (meLoaded) {
        setRiskDataError(false);
        setAvailableCashMicros(null);
        setPosition({ yesShares: 0, noShares: 0 });
        setOpenOrders([]);
        setOrdersLoadedKey(null);
      }
      return;
    }
    const request = ++mineRequest.current;
    const [portfolio, orders] = await Promise.allSettled([
      requestJson("/api/portfolio", portfolioResponseSchema),
      requestJson(
        `/api/v1/orders?${new URLSearchParams({
          market: marketSlug,
          status: "resting,partially_filled",
          limit: "128",
        })}`,
        orderPageResponseSchema,
      ),
    ]);
    if (request !== mineRequest.current) return;
    setRiskDataError(
      portfolio.status === "rejected" || orders.status === "rejected",
    );

    if (portfolio.status === "fulfilled") {
      setAvailableCashMicros(BigInt(portfolio.value.availableCashMoneyMicros));
      const positionQuantity = outcomePositionQuantityMicros(
        marketSlug,
        bracket,
        portfolio.value.positions,
      );
      setPosition({
        yesShares: displayContractMicros(positionQuantity.yes.toString()),
        noShares: displayContractMicros(positionQuantity.no.toString()),
      });
    } else {
      setAvailableCashMicros(null);
    }
    if (orders.status === "fulfilled") {
      const reconciled = reconcileTerminalOrders(
        orders.value.orders,
        (order) => order.orderId,
        orders.value.accountSequence,
        fences,
      );
      terminalOrderFences.current.fences = reconciled.fences;
      persistTerminalOrderFences(
        browserFenceStorage(),
        terminalOrderScope,
        reconciled.fences,
      );
      setOpenOrders(reconciled.orders
        .filter((order) => order.bracket === bracket)
        .map((order) => ({
          id: order.orderId,
          side: order.outcome === "yes" ? "Yes" : "No",
          verb: order.side === "buy" ? "Buy" : "Sell",
          priceDecicents: (BigInt(order.outcomePriceMicros) / 1_000n).toString(),
          remainingQuantityContractMicros: order.remainingSharesMicros,
        })));
      setOrdersLoadedKey(ordersLoadKey);
    }
  }, [marketSlug, bracket, meLoaded, authenticatedUserKey, terminalOrderScope, ordersLoadKey]);

  useRealtimeRoom(
    "user",
    ["balance", "fill", "order", "position", "redemption", "settlement"],
    (message) => {
      if (!["balance", "deposit_reversed", "deposit_restored", "custody_restriction", "fill", "order", "position", "redemption", "settlement", "user_balance_snapshot", "user_orders_snapshot", "user_positions_snapshot"].includes(message.type)) {
        return;
      }
      if (message.type === "order" && message.sequence !== undefined) {
        const parsed = privateOrderEventSchema.safeParse(message.data);
        if (
          parsed.success &&
          ["filled", "cancelled", "expired", "rejected"].includes(parsed.data.status)
        ) {
          const fences = terminalFencesForScope(
            terminalOrderFences.current,
            terminalOrderScope,
          );
          terminalOrderFences.current.fences = recordTerminalOrder(
            fences,
            parsed.data.order_id,
            message.sequence,
          );
          persistTerminalOrderFences(
            browserFenceStorage(),
            terminalOrderScope,
            terminalOrderFences.current.fences,
          );
          setOpenOrders((orders) =>
            orders.filter((order) => order.id !== parsed.data.order_id));
        }
      }
      window.clearTimeout(privateRefresh.current);
      privateRefresh.current = window.setTimeout(() => {
        void Promise.all([refreshMe(), refreshMine()]);
      }, 100);
    },
    authenticatedUserKey !== null,
  );

  useEffect(() => {
    const refreshUser = () => void Promise.all([refreshMe(), refreshMine()]);
    const refreshAll = () => void Promise.all([refreshMe(), refreshMine()]);
    const initial = window.setTimeout(refreshUser, 0);
    window.addEventListener("rl:refresh", refreshAll);
    return () => {
      meRequest.current += 1;
      mineRequest.current += 1;
      window.clearTimeout(initial);
      window.clearTimeout(privateRefresh.current);
      window.removeEventListener("rl:refresh", refreshAll);
    };
  }, [refreshMe, refreshMine]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPendingOrder(
        me
          ? readPendingSignedRequest(
              `redline.pending.order:${me.wallet ?? me.email}:${marketSlug}:${bracket}`,
            )
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [me, marketSlug, bracket]);

  const bestBid = book?.bids[0]?.price ?? null;
  const bestAsk = book?.asks[0]?.price ?? null;
  const marketPrice = verb === "buy" ? bestAsk : bestBid;

  // Prefill limit only when switching into limit / changing outcome or verb,
  // and only until the user edits the field. Do not chase marketPrice updates.
  useEffect(() => {
    limitTouched.current = false;
    shouldPrefillLimit.current = true;
  }, [outcome, verb]);
  useEffect(() => {
    if (orderType === "limit") {
      shouldPrefillLimit.current = true;
    }
  }, [orderType]);
  useEffect(() => {
    if (orderType !== "limit") return;
    if (!shouldPrefillLimit.current || limitTouched.current) return;
    if (marketPrice === null) return;
    const nextLimitCents = (marketPrice * 100).toFixed(1);
    const timer = window.setTimeout(() => {
      if (orderType !== "limit") return;
      if (!shouldPrefillLimit.current || limitTouched.current) return;
      setLimitCents(nextLimitCents);
      shouldPrefillLimit.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [orderType, outcome, verb, marketPrice]);

  const pickPrice = useCallback((p: number) => {
    setOrderType("limit");
    limitTouched.current = true;
    setLimitCents((p * 100).toFixed(1));
  }, []);

  const changeOutcome = useCallback((next: "yes" | "no") => {
    if (next === outcome) return;
    setOutcome(next);
  }, [outcome]);

  const retainedTerms = useMemo(() => retainedOrderTerms(pendingOrder), [pendingOrder]);
  const discardPendingOrder = useCallback(() => {
    if (!me || !pendingOrder || busy) return;
    const pendingKey =
      `redline.pending.order:${me.wallet ?? me.email}:${marketSlug}:${bracket}`;
    clearPendingSignedRequest(pendingKey, pendingOrder);
    setPendingOrder(null);
    setToast({ kind: "ok", text: "Retained signed order discarded" });
  }, [me, pendingOrder, busy, marketSlug, bracket]);

  const amt = parseFloat(amount) || 0;
  const isLimit = orderType === "limit";
  const limitPriceMicros = isLimit ? tickAlignedPriceMicros(limitCents) : null;
  const limitPrice = (limitPriceMicros ?? 0) / 1_000_000;
  const amountIsShares = usesShareAmount;
  const amountDecimals = amount.split(".")[1]?.length ?? 0;
  const amountPrecisionValid = !amountIsShares || amountDecimals <= 2;
  const minimumValid = isLimit ? amt >= 5 : verb === "buy" ? amt >= 1 : amt >= 0.01;
  const limitValid =
    !isLimit ||
    (limitPriceMicros !== null && limitPriceMicros >= 1_000 && limitPriceMicros <= 999_000);
  const held = outcome === "yes" ? position.yesShares : position.noShares;
  const displayOpenOrders = useMemo(() => openOrders.map(displayOpenOrder), [openOrders]);
  const openSell = displayOpenOrders
    .filter((o) => o.verb === "Sell" && o.side.toLowerCase() === outcome)
    .reduce((s, o) => s + o.remaining, 0);
  const sellable = Math.max(0, held - openSell);

  // walk the displayed book to preview the fill
  const preview = useMemo(() => {
    if (!book || amt <= 0) return null;
    const levels = verb === "buy" ? book.asks : book.bids;
    const cap = isLimit ? limitPrice : null;
    let cash = 0;
    let shares = 0;

    if (verb === "buy" && !isLimit) {
      let budget = amt;
      for (const l of levels) {
        const canBuy = Math.floor(Math.min(l.size, budget / l.price) * 100) / 100;
        if (canBuy < 0.01) break;
        shares += canBuy;
        cash += canBuy * l.price;
        budget -= canBuy * l.price;
        if (budget < 0.01) break;
      }
      return { fillShares: shares, fillCash: cash, restShares: 0, avg: shares > 0 ? cash / shares : null };
    }

    let remaining = amt;
    for (const l of levels) {
      if (cap !== null && verb === "buy" && l.price > cap + 1e-9) break;
      if (cap !== null && verb === "sell" && l.price < cap - 1e-9) break;
      const fill = Math.min(l.size, remaining);
      shares += fill;
      cash += fill * l.price;
      remaining -= fill;
      if (remaining < 0.01) break;
    }
    return {
      fillShares: shares,
      fillCash: cash,
      restShares: isLimit ? remaining : 0,
      avg: shares > 0 ? cash / shares : null,
    };
  }, [book, amt, verb, isLimit, limitPrice]);

  const maxLimitCost = isLimit && verb === "buy" && limitValid ? amt * limitPrice : 0;
  const requestedSharesMicros =
    amountPrecisionValid && Number.isSafeInteger(Math.round(amt * 1_000_000))
      ? BigInt(Math.round(amt * 1_000_000))
      : 0n;
  const maxLimitCostMicros =
    limitPriceMicros === null
      ? 0n
      : (requestedSharesMicros * BigInt(limitPriceMicros)) / 1_000_000n;
  const marketBuyBudgetMicros =
    Number.isSafeInteger(Math.round(amt * 1_000_000))
      ? BigInt(Math.round(amt * 1_000_000))
      : 0n;
  const insufficientCash =
    verb === "buy" &&
    exceedsAvailableCash(
      isLimit ? maxLimitCostMicros : marketBuyBudgetMicros,
      availableCashMicros,
    );

  // Self-trade prevention preview (the server enforces the same rule): a
  // limit that would cross or touch your own opposite-side quote is rejected.
  const selfCross = useMemo(() => {
    if (!isLimit || !limitValid) return false;
    return wouldCrossOwnOutcomeOrder(
      outcome,
      verb,
      limitPrice,
      displayOpenOrders.map((order) => ({
        outcome: order.side,
        verb: order.verb,
        outcomePrice: order.price,
      })),
    );
  }, [isLimit, limitValid, limitPrice, outcome, verb, displayOpenOrders]);
  const place = useCallback(async () => {
    if (busy || !me) return;
    const pendingKey =
      `redline.pending.order:${me.wallet ?? me.email}:${marketSlug}:${bracket}`;
    setBusy(true);
    let pending = readPendingSignedRequest(pendingKey);
    try {
      if (!pending) {
        // 1) fetch signing params (tokenId, proxy, nonce, exchange domain)
        const params = await requestJson(
          `/api/v1/orders/params?${new URLSearchParams({ market: marketSlug, bracket, outcome })}`,
          orderParamsSchema,
        );

        // 2) exact integer terms: price on 0.1¢ ticks, shares on 0.01 lots
        const tif = isLimit ? "gtc" : "ioc";
        let priceMicros: number;
        let sharesMicros: number;
        if (isLimit) {
          if (limitPriceMicros === null) throw new Error("Limit price must be on a 0.1¢ tick");
          priceMicros = limitPriceMicros;
          sharesMicros = Math.round(amt * 100) * 10_000;
        } else if (verb === "buy") {
          // dollars in → aggressive marketable limit with a 5¢ slippage cap
          const cap = Math.min(0.999, (bestAsk ?? 0.5) + 0.05);
          priceMicros = Math.round(cap * 1000) * 1000;
          sharesMicros = Math.floor((amt * 100_000_000) / priceMicros) * 10_000;
        } else {
          const floor = Math.max(0.001, (bestBid ?? 0.5) - 0.05);
          priceMicros = Math.round(floor * 1000) * 1000;
          sharesMicros = Math.round(amt * 100) * 10_000;
        }
        if (sharesMicros < 10_000) {
          setToast({ kind: "err", text: "Order is below 0.01 shares" });
          return;
        }
        // 3) build + sign the EIP-712 order with the Magic wallet
        const order = buildOrder({ params, verb, priceMicros, sharesMicros, expiresAt: 0 });
        const signature = await signOrderWithMagic(params, order);
        const operationId = crypto.randomUUID();
        pending = retainPendingSignedRequest(pendingKey, {
          operationId,
          body: JSON.stringify({
            operationId,
            market: marketSlug,
            bracket,
            outcome,
            verb,
            tif,
            price: String(priceMicros),
            shares: String(sharesMicros),
            postOnly: isLimit && postOnly,
            ...(!isLimit && verb === "buy"
              ? { cashBudget: String(Math.round(amt * 1_000_000)) }
              : {}),
            order,
            signature,
          }),
        });
        setPendingOrder(pending);
      }

      // 4) submit the byte-for-byte retained request. It is removed only once
      // the authority's durable acknowledgement reaches this browser.
      const d = await requestJson("/api/v1/orders", placeOrderResponseSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: pending.body,
      });
      clearPendingSignedRequest(pendingKey, pending);
      setPendingOrder(null);
      const submitted = JSON.parse(pending.body) as { outcome: "yes" | "no" };
      const bits: string[] = [];
      const filledShares = Number(BigInt(d.filledSharesMicros)) / 1_000_000;
      if (filledShares > 0 && d.averageYesPrice !== null) {
        const yesPrice =
          Number(BigInt(d.averageYesPrice.numerator)) /
          Number(BigInt(d.averageYesPrice.denominator));
        const px = submitted.outcome === "yes" ? yesPrice : 1 - yesPrice;
        bits.push(`Filled ${fmtShares(filledShares)} ${submitted.outcome === "yes" ? "Yes" : "No"} @ ${fmtCents(px)} exchange-final`);
      }
      if (d.restingId) bits.push("rest of the order is live in the book");
      bits.push(`Settlement ${d.settlementStatus.replaceAll("_", " ")}`);
      setToast({
        kind: "ok",
        text: bits.length ? bits.join(" — ") : "Order placed",
        details: `Command ${d.commandId} · result ${d.resultId}`,
      });
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (err) {
      if (
        pending &&
        err instanceof ApiError &&
        isDefinitiveSignedRequestFailure(err.status)
      ) {
        clearPendingSignedRequest(pendingKey, pending);
        setPendingOrder(null);
      }
      const msg = err instanceof Error
        ? /denied|reject/i.test(err.message) ? "Signature declined" : err.message
        : "Signing failed — sign in again and retry";
      setToast({ kind: "err", text: msg });
    } finally {
      setBusy(false);
    }
  }, [busy, me, marketSlug, bracket, outcome, verb, amt, isLimit, postOnly, limitPriceMicros, bestAsk, bestBid]);

  const submitPlace = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if ((event.nativeEvent as SubmitEvent).submitter !== placeSubmitRef.current) return;
    void place();
  }, [place]);

  const pourFaucet = useCallback(async () => {
    try {
      const d = await requestJson("/api/faucet", faucetResponseSchema, { method: "POST" });
      setToast({
        kind: "ok",
        text: `Test USDC transaction ${d.transactionHash.slice(0, 10)}… is confirming`,
      });
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (error) {
      setToast({ kind: "err", text: error instanceof Error ? error.message : "Faucet failed" });
    }
  }, []);

  const cancelOrders = useCallback(async (ids: string[]) => {
    const pending = [...new Set(ids)].filter((id) => !cancellationsInFlight.current.has(id));
    if (pending.length === 0) return;

    pending.forEach((id) => cancellationsInFlight.current.add(id));
    setCancellingOrderIds(new Set(cancellationsInFlight.current));
    const results = await Promise.allSettled(
      pending.map((id) => {
        const params = new URLSearchParams({ market: marketSlug, bracket });
        return requestJson(
          `/api/v1/orders/${encodeURIComponent(id)}?${params}`,
          cancelOrderResponseSchema,
          { method: "DELETE" },
        );
      }),
    );
    const cancelled = pending.filter((_, index) => results[index].status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");

    if (cancelled.length > 0) {
      let fences = terminalFencesForScope(
        terminalOrderFences.current,
        terminalOrderScope,
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          fences = recordTerminalOrder(
            fences,
            pending[index],
            result.value.accountSequence,
          );
          observedBookSequence.current = observeBookSequence(
            observedBookSequence.current,
            result.value.marketSequence,
          );
          recordBookSequenceFence(
            browserFenceStorage(),
            bookFenceScope,
            result.value.marketSequence,
          );
        }
      });
      terminalOrderFences.current.fences = fences;
      persistTerminalOrderFences(
        browserFenceStorage(),
        terminalOrderScope,
        fences,
      );
      const cancelledSet = new Set(cancelled);
      setOpenOrders((orders) => orders.filter((order) => !cancelledSet.has(order.id)));
      window.dispatchEvent(new Event("rl:refresh"));
    }
    if (failures.length === 0) {
      const commandIds = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.commandId] : [],
      );
      setToast({
        kind: "ok",
        text: `${
          cancelled.length === 1 ? "Order cancelled" : `${cancelled.length} orders cancelled`
        }`,
        details: `Command ${commandIds.join(", ")}`,
      });
    } else {
      const first = failures[0];
      const message = first.status === "rejected" && first.reason instanceof Error
        ? first.reason.message
        : "Cancel failed";
      setToast({
        kind: "err",
        text: cancelled.length > 0 ? `${cancelled.length} cancelled; ${failures.length} failed — ${message}` : message,
      });
    }

    pending.forEach((id) => cancellationsInFlight.current.delete(id));
    setCancellingOrderIds(new Set(cancellationsInFlight.current));
  }, [marketSlug, bracket, terminalOrderScope, bookFenceScope]);

  const noMarketLiquidity = orderType === "market" && marketPrice === null;
  const touchLabel = verb === "buy" ? "Best ask" : "Best bid";
  const yesTouch = formatTouch(
    canonicalYesBook,
    "yes",
    verb,
    initialBestYesBid,
    initialBestYesAsk,
  );
  const noTouch = formatTouch(
    canonicalYesBook,
    "no",
    verb,
    initialBestYesBid,
    initialBestYesAsk,
  );
  const disabled =
    busy ||
    (pendingOrder !== null && retainedTerms === null) ||
    (!pendingOrder &&
      (!isTradable ||
        amt <= 0 ||
        !minimumValid ||
        !amountPrecisionValid ||
        !limitValid ||
        noMarketLiquidity ||
        riskDataError ||
        insufficientCash ||
        selfCross ||
        (verb === "sell" && amt > sellable + 1e-9)));

  return (
    <div className={tradeStyles.contents}>
      <div className="event-main">
        {topContent}

        <div className="block">
          <div className="block-title-row">
            <div className="block-title">Open orders</div>
            {me && (
              <span className="block-count" aria-label={`${displayOpenOrders.length} open orders`}>
                {displayOpenOrders.length}
              </span>
            )}
          </div>
          {displayOpenOrders.length > 0 ? (
            <div className="open-orders-list">
              {displayOpenOrders.map((o) => (
                <div
                  key={o.id}
                  className={`pos-row open-order-row open-order-${o.verb.toLowerCase()}`}
                  data-order-id={o.id}
                >
                  <span className="open-order-description">
                    <span
                      className={`open-order-chip open-order-chip-${o.verb.toLowerCase()}`}
                    >
                      {o.verb}
                    </span>{" "}
                    <span className={o.side === "Yes" ? "pos-side-yes" : "pos-side-no"}>
                      {o.side}
                    </span>{" "}
                    <span className="open-order-terms">
                      {fmtShares(o.remaining)} sh @ {fmtCentsExact(o.price)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => void cancelOrders([o.id])}
                    disabled={cancellingOrderIds.has(o.id)}
                    aria-label={`Cancel order ${o.id}`}
                  >
                    {cancellingOrderIds.has(o.id) ? "Cancelling…" : "Cancel"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="open-orders-empty">
              {!meLoaded || (me !== null && !ordersLoaded)
                ? "Loading open orders…"
                : accountError
                  ? "Account data is temporarily unavailable."
                : me
                  ? "You have no open orders in this market."
                  : "Sign in to view your open orders."}
            </div>
          )}
        </div>

        <OrderBookPanel
          book={book}
          outcome={outcome}
          lastPrice={outcome === "yes" ? lastPrice : 1 - lastPrice}
          minePrices={minePrices}
          openOrders={displayOpenOrders}
          cancellingOrderIds={cancellingOrderIds}
          loadingTimedOut={bookLoadTimedOut}
          onOutcomeChange={changeOutcome}
          onPickPrice={pickPrice}
          onCancelOrders={cancelOrders}
          controlsLocked={pendingOrder !== null}
        />

        {bottomContent}
      </div>

      <div className="rail">
        <div className="block trade-panel" id="trade-panel">
        <div className="panel-head">
          <span className="panel-title">Trade</span>
          <span className="panel-cash">
            {me ? (
              <a href="/portfolio#deposit" style={{ color: "inherit" }} title="Deposit funds">
                <span>available cash</span>{" "}
                <span className="mono">
                  {availableCashMicros === null
                    ? "syncing"
                    : `$${(Number(availableCashMicros) / 1_000_000).toFixed(2)}`}
                </span>{" "}
                <span>· deposit</span>
              </a>
            ) : accountError ? (
              "Account unavailable"
            ) : meLoaded ? (
              "Sign in required"
            ) : (
              "Checking account…"
            )}
          </span>
        </div>

        {riskDataError && (
          <div className="trade-warning" role="alert">
            <span>Trading balances or open orders could not be refreshed. New orders are paused.</span>
            <button type="button" onClick={() => void refreshMine()}>Retry</button>
          </div>
        )}

        {pendingOrder && (
          <div className="retained-order" role="status">
            <div className="amt-lbl">Retained signed order</div>
            {retainedTerms ? (
              <div className="limit-note">
                {retainedTerms.verb === "buy" ? "Buy" : "Sell"}{" "}
                {retainedTerms.outcome === "yes" ? "Yes" : "No"} ·{" "}
                {fmtShares(Number(BigInt(retainedTerms.sharesMicros)) / 1_000_000)} shares @{" "}
                {fmtCentsExact(Number(BigInt(retainedTerms.priceMicros)) / 1_000_000)} ·{" "}
                {retainedTerms.tif.toUpperCase()}
                {retainedTerms.cashBudgetMicros
                  ? ` · $${(Number(BigInt(retainedTerms.cashBudgetMicros)) / 1_000_000).toFixed(2)} budget`
                  : ""}
              </div>
            ) : (
              <div className="limit-note">
                These retained terms are unreadable. Discard this request before creating another.
              </div>
            )}
            <button
              type="button"
              className="preset"
              style={{ width: "100%", marginBottom: 14 }}
              onClick={discardPendingOrder}
              disabled={busy}
            >
              Discard retained order
            </button>
          </div>
        )}

        <div className="ticket-section-head">
          <span>Outcome</span>
          <span>{touchLabel} · per contract</span>
        </div>
        <div className="side-row">
          <button
            type="button"
            className={`side-btn side-btn-yes ${outcome === "yes" ? "side-btn-yes-on" : ""}`}
            aria-label="Yes"
            aria-describedby="yes-touch-quote"
            aria-pressed={outcome === "yes"}
            onClick={() => changeOutcome("yes")}
            disabled={pendingOrder !== null}
            title={`${verb === "buy" ? "Buy" : "Sell"} Yes at ${yesTouch}`}
          >
            <span className="side-name">Yes</span>
            <span className="side-quote" id="yes-touch-quote">
              <span>{verb === "buy" ? "Buy" : "Sell"}</span>
              <strong>{yesTouch}</strong>
            </span>
          </button>
          <button
            type="button"
            className={`side-btn side-btn-no ${outcome === "no" ? "side-btn-no-on" : ""}`}
            aria-label="No"
            aria-describedby="no-touch-quote"
            aria-pressed={outcome === "no"}
            onClick={() => changeOutcome("no")}
            disabled={pendingOrder !== null}
            title={`${verb === "buy" ? "Buy" : "Sell"} No at ${noTouch}`}
          >
            <span className="side-name">No</span>
            <span className="side-quote" id="no-touch-quote">
              <span>{verb === "buy" ? "Buy" : "Sell"}</span>
              <strong>{noTouch}</strong>
            </span>
          </button>
        </div>

        <div className="ticket-control-grid">
          <div className="ticket-control">
            <div className="ticket-control-label">Action</div>
            <div className="range-tabs otype" role="group" aria-label="Buy or sell">
              <button
                type="button"
                aria-pressed={verb === "buy"}
                className={`range-tab ${verb === "buy" ? "range-tab-active" : ""}`}
                onClick={() => setVerb("buy")}
                disabled={pendingOrder !== null}
              >
                Buy
              </button>
              <button
                type="button"
                aria-pressed={verb === "sell"}
                className={`range-tab ${verb === "sell" ? "range-tab-active" : ""}`}
                onClick={() => setVerb("sell")}
                disabled={pendingOrder !== null}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="ticket-control">
            <div className="ticket-control-label">Order type</div>
            <div className="range-tabs otype" role="group" aria-label="Order type">
              <button
                type="button"
                aria-pressed={orderType === "market"}
                className={`range-tab ${orderType === "market" ? "range-tab-active" : ""}`}
                onClick={() => setOrderType("market")}
                disabled={pendingOrder !== null}
              >
                Market
              </button>
              <button
                type="button"
                aria-pressed={orderType === "limit"}
                className={`range-tab ${orderType === "limit" ? "range-tab-active" : ""}`}
                onClick={() => setOrderType("limit")}
                disabled={pendingOrder !== null}
              >
                Limit
              </button>
            </div>
          </div>
        </div>

        {isLimit && (
          <>
            <div className="amt-lbl ticket-input-label">
              <span>Limit price</span>
              <span>{outcome === "yes" ? "Yes" : "No"} contract</span>
            </div>
            <div className="amt">
              <input
                className="amt-input"
                inputMode="decimal"
                aria-label="Limit price in cents"
                value={limitCents}
                disabled={pendingOrder !== null}
                onChange={(e) => {
                  limitTouched.current = true;
                  setLimitCents(e.target.value.replace(/[^0-9.]/g, ""));
                }}
              />
              <span className="amt-sym">¢</span>
            </div>
            <div className="limit-note">
              {!limitValid
                ? "Enter 0.1¢–99.9¢ on a 0.1¢ tick"
                : "Crosses the book if marketable; the rest rests as your quote"}
            </div>
            <label className="limit-note post-only">
              <input
                type="checkbox"
                checked={postOnly}
                disabled={pendingOrder !== null}
                onChange={(event) => setPostOnly(event.target.checked)}
              />
              Post only — reject instead of taking liquidity
            </label>
          </>
        )}

        <div className="amt-lbl ticket-input-label">
          <span>{verb === "buy" && !isLimit ? "Amount" : "Shares"}</span>
          <span>
            {verb === "buy" && !isLimit
              ? "USD"
              : verb === "sell"
                ? `${fmtShares(sellable)} available`
                : "Contracts"}
          </span>
        </div>
        <div className="amt">
          {verb === "buy" && !isLimit && <span className="amt-sym">$</span>}
          <input
            className="amt-input"
            inputMode="decimal"
            step="0.01"
            min={isLimit ? "5" : verb === "buy" ? "1" : "0.01"}
            aria-label={verb === "buy" && !isLimit ? "Amount in dollars" : "Number of shares"}
            value={amount}
            disabled={pendingOrder !== null}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div className="limit-note">
          {isLimit
            ? "Minimum 5 shares · up to 2 decimals"
            : verb === "buy"
              ? "Minimum $1 · maximum execution price is 5¢ above the current ask"
              : "Shares settle in 0.01 increments · minimum execution price is 5¢ below the current bid"}
        </div>
        <div className="presets">
          {verb === "buy" ? (
            [10, 25, 50, 100].map((v) => (
              <button
                key={v}
                type="button"
                className="preset"
                onClick={() => setAmount(String(v))}
                disabled={pendingOrder !== null}
              >
                {isLimit ? `${v} sh` : `$${v}`}
              </button>
            ))
          ) : (
            <>
              {[0.25, 0.5, 1].map((f) => (
                <button
                  key={f}
                  type="button"
                  className="preset"
                  onClick={() => setAmount((Math.floor(sellable * f * 100) / 100).toFixed(2))}
                  disabled={pendingOrder !== null}
                >
                  {f === 1 ? "All" : `${f * 100}%`}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="receipt">
          <div className="receipt-title">Order estimate</div>
          <div className="receipt-row">
            <span className="receipt-lbl">Est. fill</span>
            <span className="receipt-val">
              {preview && preview.fillShares >= 0.01
                ? `${fmtShares(preview.fillShares)} sh @ ${preview.avg !== null ? fmtCents(preview.avg) : "—"}`
                : isLimit ? "rests in book" : "No immediate fill"}
            </span>
          </div>
          <div className="receipt-row">
            <span className="receipt-lbl">
              {verb === "buy" ? (isLimit ? "Max cost" : "Cost now") : "Proceeds now"}
            </span>
            <span className="receipt-val">
              ${verb === "buy" && isLimit
                ? maxLimitCost.toFixed(2)
                : preview
                  ? preview.fillCash.toFixed(2)
                  : "0.00"}
            </span>
          </div>
          {verb === "buy" && preview && (
            <div className="receipt-row">
              <span className="receipt-lbl">
                {isLimit ? "Max payout if fully filled" : `Payout if ${outcome} resolves`}
              </span>
              <span className="receipt-val receipt-val-win">
                ${(isLimit ? amt : preview.fillShares).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {me ? (
          <form onSubmit={submitPlace}>
            <button ref={placeSubmitRef} className="place" type="submit" disabled={disabled}>
              {busy
                ? "Working…"
                : pendingOrder
                  ? retainedTerms
                    ? "Retry retained signed order"
                    : "Discard unreadable retained order"
                  : !isTradable
                    ? "Market closed"
                    : noMarketLiquidity
                    ? "No liquidity — use a limit order"
                    : riskDataError
                      ? "Trading data unavailable — retry"
                    : selfCross
                      ? "Crosses your own order — cancel it first"
                      : insufficientCash
                      ? "Not enough cash"
                      : !amountPrecisionValid
                        ? "Use at most 2 decimals"
                        : !minimumValid
                          ? isLimit
                            ? "Minimum 5 shares"
                            : verb === "buy"
                              ? "Minimum $1"
                              : "Minimum 0.01 shares"
                          : verb === "sell" && amt > sellable + 1e-9
                            ? "Not enough shares"
                            : `${verb === "buy" ? "Buy" : "Sell"} ${outcome === "yes" ? "Yes" : "No"} · ${verb === "buy" && !isLimit ? `$${amt || 0}` : `${fmtShares(amt)} sh`} `}
            </button>
          </form>
        ) : !meLoaded ? (
          <button className="place" type="button" disabled>
            Checking account…
          </button>
        ) : accountError ? (
          <button className="place" type="button" onClick={() => void refreshMe()}>
            Retry account connection
          </button>
        ) : (
          <button className="place" type="button" onClick={openLogin}>
            Sign in to trade
          </button>
        )}
        {me && shouldOfferLocalFaucet(availableCashMicros) && (
          <button
            type="button"
            className="preset"
            style={{ width: "100%", marginTop: 8 }}
            onClick={pourFaucet}
          >
            Get $1,000 test USDC
          </button>
        )}
        <div className="paper-note">live order book · signed orders · on-chain settlement</div>
        {toast && (
          <div
            className={toast.kind === "ok" ? "toast" : "toast toast-err"}
            role={toast.kind === "ok" ? "status" : "alert"}
            data-testid="trade-action-status"
          >
            {toast.text}
            {toast.details && (
              <details className="toast-details">
                <summary>Technical details</summary>
                <span>{toast.details}</span>
              </details>
            )}
          </div>
        )}

        {(position.yesShares > 0.01 || position.noShares > 0.01) && (
          <div className="positions">
            <div className="amt-lbl">Your position</div>
            {position.yesShares > 0.01 && (
              <div className="pos-row">
                <span className="pos-side-yes">Yes</span>
                <span>{fmtShares(position.yesShares)} shares</span>
              </div>
            )}
            {position.noShares > 0.01 && (
              <div className="pos-row">
                <span className="pos-side-no">No</span>
                <span>{fmtShares(position.noShares)} shares</span>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

const LEVELS = 5;

function OrderBookPanel({
  book,
  outcome,
  lastPrice,
  minePrices,
  openOrders,
  cancellingOrderIds,
  loadingTimedOut,
  onOutcomeChange,
  onPickPrice,
  onCancelOrders,
  controlsLocked,
}: {
  book: OrderbookData | null;
  outcome: "yes" | "no";
  lastPrice: number;
  minePrices: number[];
  openOrders: DisplayOpenOrder[];
  cancellingOrderIds: Set<string>;
  loadingTimedOut: boolean;
  onOutcomeChange: (o: "yes" | "no") => void;
  onPickPrice: (price: number) => void;
  onCancelOrders: (ids: string[]) => Promise<void>;
  controlsLocked: boolean;
}) {
  const ladderRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);
  const centeredBookRef = useRef<string | null>(null);
  const view = useMemo(() => {
    if (!book) return null;
    let run = 0;
    const askRows = book.asks.slice(0, LEVELS).map((l) => {
      run += l.size * l.price;
      return { ...l, total: run };
    });
    run = 0;
    const bidRows = book.bids.slice(0, LEVELS).map((l) => {
      run += l.size * l.price;
      return { ...l, total: run };
    });
    return {
      askRows: [...askRows].reverse(),
      bidRows,
      bestAsk: book.asks[0]?.price,
      bestBid: book.bids[0]?.price,
      maxLevelSize: Math.max(
        1,
        ...askRows.map((level) => level.size),
        ...bidRows.map((level) => level.size),
      ),
    };
  }, [book]);

  useEffect(() => {
    if (!view || !ladderRef.current || !spreadRef.current) return;
    const bookKey = `${outcome}:${view.askRows.length}:${view.bidRows.length}`;
    if (centeredBookRef.current === bookKey) return;

    const ladder = ladderRef.current;
    const spread = spreadRef.current;
    ladder.scrollTop = spread.offsetTop - (ladder.clientHeight - spread.offsetHeight) / 2;
    centeredBookRef.current = bookKey;
  }, [outcome, view]);

  const isMine = (p: number) => minePrices.some((m) => Math.abs(m - p) < 1e-9);

  const depthPercent = (value: number, maximum: number) =>
    Math.min(100, (Math.log1p(value) / Math.log1p(maximum)) * 100);

  const row = (
    l: { price: number; size: number; total: number },
    kind: "ask" | "bid",
    i: number,
  ) => {
    const levelDepth = depthPercent(l.size, view!.maxLevelSize);
    const ownedOrders = ownOrdersAtOutcomeBookLevel(
      openOrders,
      outcome,
      kind,
      l.price,
    );
    const ownedIds = ownedOrders.map((order) => order.id);
    const ownedShares = ownedOrders.reduce((sum, order) => sum + order.remaining, 0);
    const ownsLevel = ownedIds.length > 0;
    const cancelling = ownedIds.some((id) => cancellingOrderIds.has(id));
    const actionLabel = `Set limit price to ${fmtCentsExact(l.price)}`;

    return (
      <div
        key={`${kind}${i}`}
        className={`book-row book-${kind} ${ownsLevel ? "book-row-owned" : ""}`}
      >
        <button
          type="button"
          className="book-row-select"
          onClick={() => onPickPrice(l.price)}
          disabled={controlsLocked}
          aria-label={actionLabel}
          title={actionLabel}
        />
        <span className="book-depth-cell" aria-hidden="true">
          <span className="book-depth" style={{ width: `${levelDepth}%` }} />
        </span>
        {ownsLevel ? (
          <button
            type="button"
            className="book-owned-badge"
            onClick={() => void onCancelOrders(ownedIds)}
            disabled={cancelling}
            aria-label={`Cancel ${fmtShares(ownedShares)} of your ${kind} orders at ${fmtCentsExact(l.price)}`}
          >
            {cancelling ? "Cancelling…" : `Cancel mine · ${fmtShares(ownedShares)}`}
          </button>
        ) : null}
        <span className="bp">
          {ownsLevel || isMine(l.price) ? (
            <span className="book-mine" title="Includes your order" aria-hidden="true" />
          ) : null}
          {fmtCentsExact(l.price)}
        </span>
        <span className="bs">{fmtShares(l.size)}</span>
        <span className="bt">
          ${l.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>
    );
  };

  return (
    <div className="block">
      <div className="book-head">
        <div className="book-title-group">
          <span className="block-title">Order book</span>
          <span className="book-helper">Select a level to set a limit price</span>
        </div>
        <div className="book-tabs" role="group" aria-label="Book side">
          <button
            type="button"
            aria-pressed={outcome === "yes"}
            className={`book-tab ${outcome === "yes" ? "book-tab-yes-on" : ""}`}
            onClick={() => onOutcomeChange("yes")}
            disabled={controlsLocked}
          >
            Yes
          </button>
          <button
            type="button"
            aria-pressed={outcome === "no"}
            className={`book-tab ${outcome === "no" ? "book-tab-no-on" : ""}`}
            onClick={() => onOutcomeChange("no")}
            disabled={controlsLocked}
          >
            No
          </button>
        </div>
      </div>
      {!view ? (
        <div className="book-empty" role="status" aria-live="polite">
          {loadingTimedOut
            ? "Order book is temporarily unavailable. The live connection will retry automatically."
            : "Loading order book…"}
        </div>
      ) : (
        <div
          className="book-ladder"
          ref={ladderRef}
          aria-label={`${outcome === "yes" ? "Yes" : "No"} order book. Select a row to set its limit price.`}
        >
          <div className="book-cols">
            <span>Price</span>
            <span>Size</span>
            <span>Total</span>
          </div>
          {view.askRows.map((l, i) => row(l, "ask", i))}
          {view.askRows.length === 0 && (
            <div className="book-empty-side book-empty-ask">
              <span>No asks</span><span>—</span><span>—</span>
            </div>
          )}
          <div
            className={`book-spread ${
              view.bestAsk !== undefined && view.bestBid !== undefined && view.bestAsk - view.bestBid >= 0.1
                ? "book-spread-wide"
                : ""
            }`}
            ref={spreadRef}
          >
            <span>Last <b>{fmtCentsExact(lastPrice)}</b></span>
            <span>
              Spread{" "}
              <b>
                {view.bestAsk !== undefined && view.bestBid !== undefined
                  ? fmtCentsExact(view.bestAsk - view.bestBid)
                  : "—"}
              </b>
            </span>
          </div>
          {view.bidRows.map((l, i) => row(l, "bid", i))}
          {view.bidRows.length === 0 && (
            <div className="book-empty-side book-empty-bid">
              <span>No bids</span><span>—</span><span>—</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
