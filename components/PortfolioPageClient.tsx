"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openLogin } from "@/components/LoginForm";
import styles from "./PortfolioPageClient.module.css";
import { fmtCents, fmtCentsExact, fmtShares } from "@/lib/format";
import {
  ApiError,
  faucetResponseSchema,
  cancelOrderResponseSchema,
  portfolioResponseSchema,
  requestJson,
  type PortfolioResponse,
  type WithdrawalParams,
  type WalletResponse,
  walletResponseSchema,
  withdrawalParamsSchema,
  withdrawalResponseSchema,
} from "@/lib/client/api";
import { privateOrderEventSchema, useRealtimeRoom } from "@/lib/client/realtime";
import { signWithdrawalWithMagic } from "@/lib/chain/signWithdrawal";
import {
  clearPendingSignedRequest,
  isDefinitiveSignedRequestFailure,
  readPendingSignedRequest,
  retainPendingSignedRequest,
  type PendingSignedRequest,
} from "@/lib/client/pendingSignedRequest";
import {
  browserFenceStorage,
  loadTerminalOrderFences,
  persistTerminalOrderFences,
  reconcileTerminalOrders,
  recordTerminalOrder,
} from "@/lib/client/terminalOrderFence";

function displayMoneyMicros(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function displayContractMicros(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function displayDecicents(value: string): number {
  return Number(BigInt(value)) / 1_000;
}

function displayRational(value: { numerator: string; denominator: string } | null): number {
  return value === null ? 0 : Number(BigInt(value.numerator)) / Number(BigInt(value.denominator));
}

function displayMoneyMicrosRational(value: { numerator: string; denominator: string }): number {
  return displayRational(value) / 1_000_000;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatUsd(value: number): string {
  return usdFormatter.format(value).replace("-", "−");
}

function parseUsdcMicros(value: string): string | null {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  const micros = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
  if (micros <= 0n || micros.toString().length > 22) return null;
  return micros.toString();
}

function formatUsdcMicros(value: string): string {
  const micros = BigInt(value);
  const whole = micros / 1_000_000n;
  const fraction = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

function shortIdentifier(value: string, leading = 8, trailing = 6): string {
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}…${value.slice(-trailing)}`;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function retainedWithdrawalTerms(
  pending: PendingSignedRequest | null,
): { amountMicros: string; destination: string } | null {
  if (!pending) return null;
  try {
    const value: unknown = JSON.parse(pending.body);
    if (typeof value !== "object" || value === null) return null;
    const body = value as Record<string, unknown>;
    const amountMicros = String(body.amountMicros ?? "");
    const destination = String(body.destination ?? "").toLowerCase();
    if (!/^[1-9][0-9]{0,21}$/.test(amountMicros) || !/^0x[0-9a-f]{40}$/.test(destination)) {
      return null;
    }
    return { amountMicros, destination };
  } catch {
    return null;
  }
}

function portfolioFenceScope(
  portfolio: PortfolioResponse | null,
  wallet: WalletResponse | null,
) {
  return wallet?.wallet.toLowerCase() ?? portfolio?.wallet?.toLowerCase() ?? "authenticated:no-wallet";
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

export default function PortfolioPage() {
  const [pf, setPf] = useState<PortfolioResponse | null>(null);
  const [wallet, setWallet] = useState<WalletResponse | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [fundingStatus, setFundingStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  const [withdrawal, setWithdrawal] = useState({ amount: "", destination: "" });
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalStatus, setWithdrawalStatus] = useState<string | null>(null);
  const [pendingWithdrawal, setPendingWithdrawal] = useState<PendingSignedRequest | null>(null);
  const [cancellingOrderIds, setCancellingOrderIds] = useState<Set<string>>(new Set());
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const cancellationsInFlight = useRef<Set<string>>(new Set());
  const refreshRequest = useRef(0);
  const realtimeRefresh = useRef<number | undefined>(undefined);
  const terminalOrderFences = useRef({
    scope: "",
    fences: new Map<string, bigint>(),
  });
  const retainedWithdrawal = useMemo(
    () => retainedWithdrawalTerms(pendingWithdrawal),
    [pendingWithdrawal],
  );

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setIsRefreshing(true);
    try {
      const [portfolioResult, walletResult] = await Promise.allSettled([
        requestJson("/api/portfolio", portfolioResponseSchema),
        requestJson("/api/wallet", walletResponseSchema),
      ]);
      if (request !== refreshRequest.current) return;
      if (portfolioResult.status === "rejected") throw portfolioResult.reason;
      const nextWallet = walletResult.status === "fulfilled" ? walletResult.value : null;
      const fences = terminalFencesForScope(
        terminalOrderFences.current,
        portfolioFenceScope(portfolioResult.value, nextWallet),
      );
      const reconciled = reconcileTerminalOrders(
        portfolioResult.value.orders,
        (order) => order.id,
        portfolioResult.value.eventSequence,
        fences,
      );
      terminalOrderFences.current.fences = reconciled.fences;
      persistTerminalOrderFences(
        browserFenceStorage(),
        portfolioFenceScope(portfolioResult.value, nextWallet),
        reconciled.fences,
      );
      setNeedsAuth(false);
      setPortfolioError(null);
      setPf({ ...portfolioResult.value, orders: reconciled.orders });
      if (walletResult.status === "fulfilled") {
        setWallet(walletResult.value);
        setWalletError(null);
      } else {
        setWallet(null);
        setWalletError(
          walletResult.reason instanceof Error ? walletResult.reason.message : "Wallet unavailable",
        );
      }
    } catch (error) {
      if (request !== refreshRequest.current) return;
      if (error instanceof ApiError && error.status === 401) {
        terminalFencesForScope(terminalOrderFences.current, "unauthenticated");
        setNeedsAuth(true);
        setPortfolioError(null);
        setPf(null);
        setWallet(null);
        setWalletError(null);
      } else {
        setPortfolioError(
          error instanceof Error ? error.message : "Portfolio data is temporarily unavailable",
        );
      }
    } finally {
      if (request === refreshRequest.current) setIsRefreshing(false);
    }
  }, []);

  const copyProxy = useCallback(async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet.proxy);
      setCopied(true);
      setFundingStatus("Funding address copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFundingStatus("Could not copy the address. Select and copy it manually.");
    }
  }, [wallet]);

  const pourFaucet = useCallback(async () => {
    setFauceting(true);
    setFundingStatus(null);
    try {
      await requestJson("/api/faucet", faucetResponseSchema, { method: "POST" });
      setFundingStatus("Test USDC requested. Your balance will update after confirmation.");
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (error) {
      setFundingStatus(error instanceof Error ? error.message : "Test funding failed");
    } finally {
      setFauceting(false);
    }
  }, []);

  const withdraw = useCallback(async () => {
    if (!wallet) return;
    const pendingKey = `redline.pending.withdrawal:${wallet.wallet.toLowerCase()}`;
    setWithdrawing(true);
    let pending = readPendingSignedRequest(pendingKey);
    try {
      if (!pending) {
        const amountMicros = parseUsdcMicros(withdrawal.amount);
        if (amountMicros === null) {
          setWithdrawalStatus("Enter a positive USDC amount with at most 6 decimal places");
          return;
        }
        setWithdrawalStatus("Awaiting wallet signature…");
        const params = await requestJson<WithdrawalParams>("/api/withdrawals", withdrawalParamsSchema);
        const destination = (withdrawal.destination || wallet.wallet) as `0x${string}`;
        const signed = await signWithdrawalWithMagic({ params, destination, amountMicros });
        const operationId = crypto.randomUUID();
        pending = retainPendingSignedRequest(pendingKey, {
          operationId,
          body: JSON.stringify({
            operationId,
            amountMicros,
            destination,
            ...signed,
          }),
        });
        setPendingWithdrawal(pending);
      } else {
        setWithdrawalStatus("Retrying the previously signed withdrawal…");
      }
      const result = await requestJson("/api/withdrawals", withdrawalResponseSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: pending.body,
      });
      clearPendingSignedRequest(pendingKey, pending);
      setPendingWithdrawal(null);
      setWithdrawalStatus(
        `Accepted · ${result.settlementStatus.replaceAll("_", " ")} · ${result.settlementIntentId}`,
      );
      setWithdrawal({ amount: "", destination: "" });
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (error) {
      if (
        pending &&
        error instanceof ApiError &&
        isDefinitiveSignedRequestFailure(error.status)
      ) {
        clearPendingSignedRequest(pendingKey, pending);
        setPendingWithdrawal(null);
      }
      setWithdrawalStatus(error instanceof Error ? error.message : "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }, [wallet, withdrawal]);

  const discardPendingWithdrawal = useCallback(() => {
    if (!wallet || !pendingWithdrawal || withdrawing) return;
    const pendingKey = `redline.pending.withdrawal:${wallet.wallet.toLowerCase()}`;
    clearPendingSignedRequest(pendingKey, pendingWithdrawal);
    setPendingWithdrawal(null);
    setWithdrawalStatus("Retained signed withdrawal discarded");
  }, [wallet, pendingWithdrawal, withdrawing]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const pending = wallet
        ? readPendingSignedRequest(
            `redline.pending.withdrawal:${wallet.wallet.toLowerCase()}`,
          )
        : null;
      setPendingWithdrawal(pending);
      if (pending) {
        setWithdrawalStatus(
          "A signed withdrawal is pending acknowledgement. Retry to recover it.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [wallet]);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    // Refresh account-derived views after authentication or mutations.
    const refreshUser = () => void refresh();
    window.addEventListener("rl:refresh", refreshUser);
    return () => {
      refreshRequest.current += 1;
      window.clearTimeout(initial);
      window.clearTimeout(realtimeRefresh.current);
      window.removeEventListener("rl:refresh", refreshUser);
    };
  }, [refresh]);

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
            portfolioFenceScope(pf, wallet),
          );
          terminalOrderFences.current.fences = recordTerminalOrder(
            fences,
            parsed.data.order_id,
            message.sequence,
          );
          persistTerminalOrderFences(
            browserFenceStorage(),
            portfolioFenceScope(pf, wallet),
            terminalOrderFences.current.fences,
          );
          setPf((current) => current === null
            ? current
            : {
                ...current,
                orders: current.orders.filter((order) => order.id !== parsed.data.order_id),
              });
        }
      }
      window.clearTimeout(realtimeRefresh.current);
      realtimeRefresh.current = window.setTimeout(() => void refresh(), 100);
    },
    !needsAuth && pf !== null,
  );

  async function cancel(id: string, market: string, bracket: string) {
    if (cancellationsInFlight.current.has(id)) return;
    cancellationsInFlight.current.add(id);
    setCancellingOrderIds(new Set(cancellationsInFlight.current));
    setOrderStatus(null);
    const query = new URLSearchParams({ market, bracket });
    try {
      const result = await requestJson(
        `/api/v1/orders/${encodeURIComponent(id)}?${query}`,
        cancelOrderResponseSchema,
        { method: "DELETE" },
      );
      const scope = portfolioFenceScope(pf, wallet);
      const fences = terminalFencesForScope(terminalOrderFences.current, scope);
      terminalOrderFences.current.fences = recordTerminalOrder(
        fences,
        id,
        result.accountSequence,
      );
      persistTerminalOrderFences(
        browserFenceStorage(),
        scope,
        terminalOrderFences.current.fences,
      );
      setPf((current) => current === null
        ? current
        : { ...current, orders: current.orders.filter((order) => order.id !== id) });
      setOrderStatus("Order cancelled.");
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (error) {
      setOrderStatus(
        error instanceof ApiError ? error.message : "Order cancellation failed. Please retry.",
      );
    } finally {
      cancellationsInFlight.current.delete(id);
      setCancellingOrderIds(new Set(cancellationsInFlight.current));
    }
  }

  if (needsAuth) {
    return (
      <main className={styles.page}>
        <section className={styles.centeredState} aria-labelledby="portfolio-sign-in-title">
          <div className={styles.stateIcon} aria-hidden="true">$</div>
          <p className={styles.eyebrow}>Your account</p>
          <h1 id="portfolio-sign-in-title" className={styles.stateTitle}>
            Sign in to see your portfolio
          </h1>
          <p className={styles.stateCopy}>
            Track positions, manage open orders, and move funds from one secure account view.
          </p>
          <button type="button" className={styles.primaryButton} onClick={openLogin}>
            Sign in <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>
    );
  }

  if (!pf) {
    if (portfolioError) {
      return (
        <main className={styles.page}>
          <section className={styles.centeredState} aria-labelledby="portfolio-error-title">
            <div className={`${styles.stateIcon} ${styles.stateIconError}`} aria-hidden="true">!</div>
            <p className={styles.eyebrow}>Account unavailable</p>
            <h1 id="portfolio-error-title" className={styles.stateTitle}>
              We couldn&apos;t load your portfolio
            </h1>
            <p className={styles.stateCopy}>{portfolioError}</p>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void refresh()}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Retrying…" : "Try again"}
            </button>
          </section>
        </main>
      );
    }

    return (
      <main className={styles.page} aria-busy="true" aria-label="Loading portfolio">
        <div className={styles.loadingHeader}>
          <span className={styles.skeletonShort} />
          <span className={styles.skeletonTitle} />
          <span className={styles.loadingCaption} aria-hidden="true">Loading secure account data…</span>
        </div>
        <div className={styles.loadingSummary}>
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className={styles.skeletonCard} />
          ))}
        </div>
        <span className={styles.srOnly} role="status">Loading portfolio…</span>
      </main>
    );
  }

  const cash = displayMoneyMicros(pf.cashMoneyMicros);
  const availableCash = displayMoneyMicros(pf.availableCashMoneyMicros);
  const equity = displayMoneyMicrosRational(pf.equityMoneyMicrosRational);
  const positionValue = pf.positions.reduce(
    (sum, position) =>
      sum + displayMoneyMicrosRational(position.valueMoneyMicrosRational),
    0,
  );
  const totalPnl = displayMoneyMicrosRational(pf.totalPnlMoneyMicrosRational);
  const withdrawalReceipt = withdrawalStatus?.startsWith("Accepted · ")
    ? withdrawalStatus.split(" · ")
    : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Account</p>
          <h1 className={styles.title}>Portfolio</h1>
          <p className={styles.headerCopy}>Your exposure, orders, and cash in one view.</p>
        </div>
        <div className={styles.dataStatus} aria-live="polite">
          <span
            className={`${styles.dataStatusDot} ${portfolioError ? styles.dataStatusDotStale : ""}`}
            aria-hidden="true"
          />
          {isRefreshing ? "Refreshing" : portfolioError ? "Using last update" : "Account updated"}
        </div>
      </header>

      {portfolioError && (
        <div className={styles.errorBanner} role="alert">
          <div>
            <strong>Live account refresh failed.</strong>
            <span>{portfolioError} Showing your most recent values.</span>
          </div>
          <button
            type="button"
            className={styles.bannerButton}
            onClick={() => void refresh()}
            disabled={isRefreshing}
          >
            Retry
          </button>
        </div>
      )}

      {pf.provisional && (
        <div className={styles.provisionalBanner} role="status" data-portfolio-provisional="true">
          <span className={styles.provisionalIcon} aria-hidden="true">~</span>
          <span>
            <strong>Values are provisional.</strong> Settlement or reconciliation is still in
            progress.
          </span>
        </div>
      )}

      <section className={styles.summaryGrid} aria-label="Account summary">
        <article className={`${styles.summaryCard} ${styles.primarySummary}`}>
          <span className={styles.metricLabel}>Account value</span>
          <strong className={styles.accountValue}>{formatUsd(equity)}</strong>
          <span className={styles.metricContext}>
            {formatUsd(cash)} cash · {formatUsd(positionValue)} marked positions
          </span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>Available to trade</span>
          <strong className={styles.metricValue}>{formatUsd(availableCash)}</strong>
          <span className={styles.metricContext}>Unreserved cash</span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>Position value</span>
          <strong className={styles.metricValue}>{formatUsd(positionValue)}</strong>
          <span className={styles.metricContext}>{pf.positions.length} open position{pf.positions.length === 1 ? "" : "s"}</span>
        </article>
        <article className={styles.summaryCard}>
          <span className={styles.metricLabel}>Total P&amp;L</span>
          <strong className={`${styles.metricValue} ${totalPnl >= 0 ? styles.positive : styles.negative}`}>
            {totalPnl >= 0 ? "+" : "−"}{formatUsd(Math.abs(totalPnl))}
          </strong>
          <span className={styles.metricContext}>Realized and unrealized</span>
        </article>
      </section>

      <section className={styles.section} aria-labelledby="positions-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Exposure</p>
            <h2 id="positions-title" className={styles.sectionTitle}>Positions</h2>
          </div>
          <span className={styles.countBadge}>{pf.positions.length}</span>
        </div>
        {pf.positions.length === 0 ? (
          <div className={styles.emptyState}>
            <div>
              <strong>No positions yet</strong>
              <span>Choose a market to start building your portfolio.</span>
            </div>
            <Link href="/" className={styles.secondaryButton}>Browse markets</Link>
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.tableHeader} ${styles.positionGrid}`} aria-hidden="true">
              <span>Market</span>
              <span>Contracts / avg</span>
              <span>Mark</span>
              <span>Value</span>
              <span>P&amp;L</span>
            </div>
            {pf.positions.map((position) => {
              const unrealizedPnl = displayMoneyMicrosRational(
                position.unrealizedPnlMoneyMicrosRational,
              );
              const outcomeLabel = position.outcome === "other"
                ? "Other"
                : position.outcome === "yes" ? "Yes" : "No";
              const outcomeClass = position.outcome === "yes"
                ? styles.yesBadge
                : position.outcome === "no" ? styles.noBadge : styles.neutralBadge;
              return (
                <div
                  key={`${position.marketSlug}:${position.bracket}:${position.outcome}`}
                  className={`${styles.tableRow} ${styles.positionGrid}`}
                >
                  <div className={styles.marketCell}>
                    <Link href={`/market/${position.marketSlug}`} className={styles.marketLink}>
                      {position.question}
                    </Link>
                    <span className={styles.marketMeta}>
                      <span className={`${styles.outcomeBadge} ${outcomeClass}`}>{outcomeLabel}</span>
                      {position.bracket !== position.marketSlug && (
                        <span className={styles.bracket}>{position.bracket}</span>
                      )}
                    </span>
                  </div>
                  <div className={styles.dataCell} data-label="Contracts / avg">
                    <strong>{fmtShares(displayContractMicros(position.quantityContractMicros))}</strong>
                    <span>@ {fmtCents(displayRational(position.averagePrice))}</span>
                  </div>
                  <div className={styles.dataCell} data-label="Mark">
                    <strong>{fmtCents(displayDecicents(position.markPriceDecicents))}</strong>
                    <span>{outcomeLabel}</span>
                  </div>
                  <div className={styles.valueCell} data-label="Value">
                    {formatUsd(displayMoneyMicrosRational(position.valueMoneyMicrosRational))}
                  </div>
                  <div
                    className={`${styles.pnlCell} ${unrealizedPnl >= 0 ? styles.positive : styles.negative}`}
                    data-label="P&amp;L"
                  >
                    {unrealizedPnl >= 0 ? "+" : "−"}{formatUsd(Math.abs(unrealizedPnl))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="orders-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Working capital</p>
            <h2 id="orders-title" className={styles.sectionTitle}>Open orders</h2>
          </div>
          <span className={styles.countBadge}>{pf.orders.length}</span>
        </div>
        {orderStatus && (
          <p className={styles.inlineStatus} role="status" data-testid="portfolio-order-status">
            {orderStatus}
          </p>
        )}
        {pf.orders.length === 0 ? (
          <div className={styles.emptyState}>
            <div>
              <strong>No resting orders</strong>
              <span>Limit orders will appear here until they fill or are cancelled.</span>
            </div>
          </div>
        ) : (
          <div className={styles.table}>
            <div className={`${styles.tableHeader} ${styles.orderGrid}`} aria-hidden="true">
              <span>Market</span>
              <span>Order</span>
              <span>Limit</span>
              <span />
            </div>
            {pf.orders.map((order) => (
              <div
                key={order.id}
                className={`${styles.tableRow} ${styles.orderGrid}`}
                data-order-id={order.id}
              >
                <div className={styles.marketCell}>
                  <Link href={`/market/${order.marketSlug}`} className={styles.marketLink}>
                    {order.question}
                  </Link>
                  {order.bracket !== order.marketSlug && (
                    <span className={styles.bracket}>{order.bracket}</span>
                  )}
                </div>
                <div className={styles.orderTerms} data-label="Order">
                  <span className={`${styles.outcomeBadge} ${order.side === "Yes" ? styles.yesBadge : styles.noBadge}`}>
                    {order.verb} {order.side}
                  </span>
                  <strong>{fmtShares(displayContractMicros(order.remainingQuantityContractMicros))} sh</strong>
                </div>
                <div className={styles.orderPrice} data-label="Limit">
                  {fmtCentsExact(displayDecicents(order.priceDecicents))}
                </div>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => void cancel(order.id, order.marketSlug, order.bracket)}
                  disabled={cancellingOrderIds.has(order.id)}
                  aria-label={`Cancel order ${order.id}`}
                >
                  {cancellingOrderIds.has(order.id) ? "Cancelling…" : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section} aria-labelledby="funding-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>Cash management</p>
            <h2 id="funding-title" className={styles.sectionTitle}>Funding &amp; transfers</h2>
          </div>
        </div>
        <div className={styles.fundingGrid}>
          <article className={styles.fundingPanel} id="deposit">
            <div className={styles.panelHeader}>
              <div>
                <h3>Deposit</h3>
                <p>Send USDC to your dedicated funding address.</p>
              </div>
              {wallet && (
                <span className={styles.networkBadge}>
                  {wallet.local ? "Local testnet" : `Chain ${wallet.chainId}`}
                </span>
              )}
            </div>
            {walletError ? (
              <div className={styles.panelError} role="alert">
                <span>{walletError}</span>
                <button type="button" onClick={() => void refresh()}>Retry</button>
              </div>
            ) : !wallet ? (
              <div className={styles.inlineLoading} role="status">Loading wallet…</div>
            ) : (
              <>
                <div className={styles.addressField}>
                  <span className={styles.fieldLabel}>Funding address</span>
                  <div className={styles.addressControl}>
                    <code title={wallet.proxy}>{shortIdentifier(wallet.proxy, 12, 10)}</code>
                    <button
                      type="button"
                      className={styles.copyButton}
                      onClick={copyProxy}
                      aria-label="Copy funding address"
                    >
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <p className={styles.securityNote}>
                  This address belongs to your account and can receive USDC before deployment.
                </p>
                {wallet.local && (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={pourFaucet}
                    disabled={fauceting}
                  >
                    {fauceting ? "Minting…" : "Get $1,000 test USDC (local faucet)"}
                  </button>
                )}
                {fundingStatus && (
                  <p className={`${styles.inlineStatus} ${styles.panelStatus}`} role="status">
                    {fundingStatus}
                  </p>
                )}
                <details className={styles.technicalDetails}>
                  <summary>Wallet details</summary>
                  <dl>
                    <div><dt>Funding address</dt><dd><code>{wallet.proxy}</code></dd></div>
                    <div><dt>USDC token</dt><dd><code>{wallet.usdc}</code></dd></div>
                    <div><dt>Signing wallet</dt><dd><code>{wallet.wallet}</code></dd></div>
                  </dl>
                </details>
              </>
            )}
          </article>

          <article className={styles.fundingPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Withdraw</h3>
                <p>Sign a gasless USDC transfer to another wallet.</p>
              </div>
            </div>
            {pendingWithdrawal && (
              <div className={styles.pendingNotice} role="status">
                {retainedWithdrawal ? (
                  <p>
                    A signed withdrawal for <strong>${formatUsdcMicros(retainedWithdrawal.amountMicros)} USDC</strong> to{" "}
                    <code title={retainedWithdrawal.destination}>
                      {shortIdentifier(retainedWithdrawal.destination)}
                    </code> is awaiting acknowledgement.
                  </p>
                ) : (
                  <p>The retained signed withdrawal is unreadable. Discard it before creating another.</p>
                )}
                <button
                  type="button"
                  className={styles.tertiaryButton}
                  onClick={discardPendingWithdrawal}
                  disabled={withdrawing}
                >
                  Discard retained withdrawal
                </button>
              </div>
            )}
            <div className={styles.formFields}>
              <label className={styles.inputField} htmlFor="withdraw-amount">
                <span>Amount (USDC)</span>
                <input
                  id="withdraw-amount"
                  inputMode="decimal"
                  value={withdrawal.amount}
                  onChange={(event) => setWithdrawal((value) => ({ ...value, amount: event.target.value }))}
                  placeholder="25.00"
                  disabled={pendingWithdrawal !== null}
                />
              </label>
              <label className={styles.inputField} htmlFor="withdraw-destination">
                <span>Destination</span>
                <input
                  id="withdraw-destination"
                  value={withdrawal.destination}
                  onChange={(event) => setWithdrawal((value) => ({ ...value, destination: event.target.value }))}
                  placeholder={wallet?.wallet ?? "0x…"}
                  disabled={pendingWithdrawal !== null}
                />
              </label>
            </div>
            <p className={styles.securityNote}>
              Leave destination blank to withdraw to your signing wallet. Reserved funds are
              restored if settlement fails.
            </p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={withdraw}
              disabled={
                withdrawing ||
                !wallet ||
                (pendingWithdrawal ? retainedWithdrawal === null : !withdrawal.amount)
              }
            >
              {withdrawing
                ? "Submitting…"
                : pendingWithdrawal
                  ? retainedWithdrawal
                    ? "Retry retained signed withdrawal"
                    : "Discard unreadable retained withdrawal"
                  : "Sign and withdraw"}
            </button>
            {withdrawalStatus && (
              <div
                className={`${styles.inlineStatus} ${styles.panelStatus}`}
                role="status"
                data-testid="withdrawal-status"
              >
                {withdrawalReceipt && withdrawalReceipt.length >= 3 ? (
                  <>
                    <span>{withdrawalReceipt[0]} · {humanize(withdrawalReceipt[1])}</span>
                    <details className={styles.actionDetails}>
                      <summary>Transfer details</summary>
                      <code>{withdrawalReceipt.slice(2).join(" · ")}</code>
                    </details>
                  </>
                ) : withdrawalStatus}
              </div>
            )}
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="settlements-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>History</p>
            <h2 id="settlements-title" className={styles.sectionTitle}>Settlement activity</h2>
          </div>
          <span className={styles.countBadge}>{pf.settlements?.length ?? 0}</span>
        </div>
        {!pf.settlements?.length ? (
          <div className={styles.emptyState}>
            <div>
              <strong>No settlement activity</strong>
              <span>Completed transfers and market settlement workflows will appear here.</span>
            </div>
          </div>
        ) : (
          <div className={styles.activityList}>
            {pf.settlements.map((settlement) => (
              <div
                key={settlement.settlementIntentId}
                className={styles.activityRow}
                data-settlement-intent={settlement.settlementIntentId}
              >
                <div className={styles.activityMain}>
                  <span className={styles.activityKind}>{humanize(settlement.kind)}</span>
                  <span className={styles.activityStatus}>{humanize(settlement.status)}</span>
                </div>
                <time className={styles.activityTime} dateTime={settlement.updatedAt}>
                  {formatActivityTime(settlement.updatedAt)}
                </time>
                <details className={styles.rowDetails}>
                  <summary>Details</summary>
                  <dl
                    aria-label={`authority: ${humanize(settlement.status)}; worker: ${humanize(settlement.workerState)}`}
                  >
                    <div><dt>Settlement ID</dt><dd><code>{settlement.settlementIntentId}</code></dd></div>
                    <div><dt>Worker</dt><dd>{humanize(settlement.workerState)}</dd></div>
                    {settlement.chainReference && (
                      <div><dt>Chain reference</dt><dd><code>{settlement.chainReference}</code></dd></div>
                    )}
                  </dl>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
