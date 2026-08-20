"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openLogin } from "@/components/LoginForm";
import { fmtCents, fmtDate } from "@/lib/format";
import {
  ApiError,
  adminResponseSchema,
  marketControlResponseSchema,
  meResponseSchema,
  requestJson,
  resolutionResponseSchema,
} from "@/lib/client/api";
import {
  RESOLUTION_TTL_SECONDS,
  RESOLUTION_TYPES,
} from "@/lib/exchange/resolution";
import styles from "./AdminPageClient.module.css";

type Me = { email: string; wallet: string | null } | null;
const DEFAULT_MARKET_END = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);

function shortIdentifier(value: string, leading = 8, trailing = 6): string {
  if (value.length <= leading + trailing + 1) return value;
  return `${value.slice(0, leading)}…${value.slice(-trailing)}`;
}

/** Unix expiry for a fresh resolution signature (event-handler scope only). */
function resolutionExpiry(): number {
  return Math.floor(Date.now() / 1000) + RESOLUTION_TTL_SECONDS;
}

type PendingAdminOperation = {
  fingerprint: string;
  operationId: string;
  createdAt: number;
};

function pendingAdminOperation(key: string, fingerprint: string): PendingAdminOperation {
  const storageKey = `redline:admin-operation:${key}`;
  const stored = window.sessionStorage.getItem(storageKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as PendingAdminOperation;
      if (
        parsed.fingerprint === fingerprint &&
        typeof parsed.operationId === "string" &&
        Number.isSafeInteger(parsed.createdAt)
      ) {
        return parsed;
      }
    } catch {
      // Replace corrupt or stale browser state with a fresh operation below.
    }
  }
  const operation = {
    fingerprint,
    operationId: crypto.randomUUID(),
    createdAt: Math.floor(Date.now() / 1_000),
  };
  window.sessionStorage.setItem(storageKey, JSON.stringify(operation));
  return operation;
}

function completeAdminOperation(key: string): void {
  window.sessionStorage.removeItem(`redline:admin-operation:${key}`);
}

type AdminMarket = {
  slug: string;
  question: string;
  status: string;
  resolution: string | null;
  resolutionIntent: "yes" | "no" | null;
  endTime: number;
  price: number;
  proposal: {
    finalizableAt: number;
    windowElapsed: boolean;
    disputed: boolean;
    outcome: "yes" | "no" | null;
  } | null;
};

/**
 * Resolution console. The server holds no resolution secret — it only knows the
 * resolver wallet addresses. Each resolution is an EIP-712 message signed
 * here with the platform's Magic wallet and verified by signature recovery.
 */
export default function AdminPage() {
  const [me, setMe] = useState<Me>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [resolvers, setResolvers] = useState<string[]>([]);
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [domain, setDomain] = useState<{
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  } | null>(null);
  const [arm, setArm] = useState<string | null>(null); // "slug:outcome"
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
    detail?: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [newMarket, setNewMarket] = useState({
    slug: "",
    question: "",
    category: "Other",
    endTime: DEFAULT_MARKET_END,
  });
  const refreshRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    setRefreshing(true);
    const catalogUrl = catalogFilter
      ? `/api/admin/resolve?q=${encodeURIComponent(catalogFilter)}`
      : "/api/admin/resolve";
    const [meResult, configResult] = await Promise.allSettled([
      requestJson("/api/auth/me", meResponseSchema),
      requestJson(catalogUrl, adminResponseSchema),
    ]);
    if (request !== refreshRequest.current) return;

    setMe(meResult.status === "fulfilled" ? meResult.value.user : null);
    setMeLoaded(true);
    setResolvers(configResult.status === "fulfilled" ? configResult.value.resolvers : []);
    setMarkets(configResult.status === "fulfilled" ? configResult.value.markets : []);
    setDomain(configResult.status === "fulfilled" ? configResult.value.domain : null);
    const meFailure = meResult.status === "rejected" ? meResult.reason : null;
    const signedOut = meFailure instanceof ApiError && meFailure.status === 401;
    setLoadError(
      configResult.status === "rejected"
        ? "The resolution catalog is temporarily unavailable."
        : meFailure && !signedOut
          ? "Resolver account status could not be verified."
          : null,
    );
    setRefreshing(false);
  }, [catalogFilter]);

  useEffect(() => {
    const query = catalogQuery.trim();
    const timeout = window.setTimeout(
      () => setCatalogFilter(query.length >= 2 ? query : ""),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [catalogQuery]);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("rl:refresh", refresh);
    return () => {
      refreshRequest.current += 1;
      window.clearTimeout(initial);
      window.removeEventListener("rl:refresh", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const wallet = me?.wallet?.toLowerCase() ?? null;
  const isResolver = wallet !== null && resolvers.includes(wallet);

  async function resolve(slug: string, outcome: "yes" | "no" | "finalize") {
    const key = `${slug}:${outcome}`;
    if (arm !== key) {
      setArm(key);
      return;
    }
    setArm(null);
    setBusy(key);
    try {
      if (!domain) throw new Error("Resolution domain is unavailable");
      const expiresAt = resolutionExpiry();
      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          ...RESOLUTION_TYPES,
        },
        domain,
        primaryType: "Resolution",
        message: { market: slug, outcome, expiresAt: String(expiresAt) },
      };
      const localKey = process.env.NEXT_PUBLIC_LOCAL_RESOLVER_PRIVATE_KEY;
      let signature: unknown;
      if (domain.chainId === 31337 && localKey) {
        const { privateKeyToAccount } = await import("viem/accounts");
        const account = privateKeyToAccount(localKey as `0x${string}`);
        if (account.address.toLowerCase() !== me!.wallet?.toLowerCase()) {
          throw new Error("Local resolver key does not match the signed-in wallet");
        }
        signature = await account.signTypedData({
          domain,
          types: RESOLUTION_TYPES,
          primaryType: "Resolution",
          message: { market: slug, outcome, expiresAt: BigInt(expiresAt) },
        });
      } else {
        const { Magic } = await import("magic-sdk"); // browser-only SDK
        const magic = new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY!);
        signature = await magic.rpcProvider.request({
          method: "eth_signTypedData_v4",
          params: [me!.wallet, JSON.stringify(typedData)],
        });
      }

      const d = await requestJson("/api/admin/resolve", resolutionResponseSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ market: slug, outcome, expiresAt, signature }),
      });
      setToast({
        kind: "ok",
        text:
          outcome === "finalize"
            ? d.complete === false
              ? `Finalization batch committed for ${slug} · sign again to continue`
              : `Finalized ${slug} → ${d.outcome.toUpperCase()} · ${d.redeemed ?? 0} wallet${d.redeemed === 1 ? "" : "s"} redeemed`
            : `Proposed ${slug} → ${outcome.toUpperCase()} · finalizable after the dispute window`,
      });
      window.dispatchEvent(new Event("rl:refresh"));
    } catch (error) {
      setToast({ kind: "err", text: error instanceof Error ? error.message : "Signing failed — sign in again with the resolver account" });
    } finally {
      setBusy(null);
    }
  }

  async function controlMarket(
    slug: string,
    action: "create" | "lifecycle",
    lifecycle?: string,
  ) {
    const key = `${slug}:${action}:${lifecycle ?? ""}`;
    setBusy(key);
    try {
      const basePayload =
        action === "create"
          ? {
              action,
              ...newMarket,
              endTime: Math.floor(new Date(newMarket.endTime).getTime() / 1_000),
              blurb: "",
              rules: "Administrator-created test market.",
            }
          : { action, slug, lifecycle };
      const operation = pendingAdminOperation(key, JSON.stringify(basePayload));
      const payload = {
        ...basePayload,
        operationId: operation.operationId,
        ...(action === "create" ? { createdAt: operation.createdAt } : {}),
      };
      const result = await requestJson("/api/admin/markets", marketControlResponseSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshMarketUntil(slug, result.lifecycle);
      // Preserve the operation identity through projection convergence. A
      // delayed acknowledgement can then safely retry the committed command.
      completeAdminOperation(key);
      setToast({
        kind: "ok",
        text: `${slug} → ${result.lifecycle.replaceAll("_", " ")}`,
        detail: result.commandId,
      });
      if (action === "create") setNewMarket((value) => ({ ...value, slug: "", question: "" }));
    } catch (error) {
      setToast({ kind: "err", text: error instanceof Error ? error.message : "Market control failed" });
    } finally {
      setBusy(null);
    }
  }

  async function refreshMarketUntil(slug: string, lifecycle: string) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const config = await requestJson(
        `/api/admin/resolve?market=${encodeURIComponent(slug)}`,
        adminResponseSchema,
      );
      if (config.markets.some((market) => market.slug === slug && market.status === lifecycle)) {
        await refresh();
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error(`${slug} committed but its ${lifecycle} projection did not converge`);
  }

  const open = markets.filter((m) => m.status === "open");
  const resolving = markets.filter((m) => m.status === "resolving");
  const resolved = markets.filter((m) => m.status === "resolved");
  const managed = markets.filter((market) =>
    ["draft", "cancel_only", "halted"].includes(market.status),
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Platform operations</p>
          <h1 className={styles.title}>Resolution console</h1>
          <p className={styles.description}>
            Create markets, control trading lifecycles, and sign outcome resolutions from one
            auditable operator workspace.
          </p>
        </div>
        <div className={styles.headerStatus}>
          <span
            className={`${styles.statusDot} ${isResolver ? styles.statusDotReady : ""}`}
            aria-hidden="true"
          />
          {!meLoaded ? "Verifying access" : isResolver ? "Resolver authorized" : "Action locked"}
        </div>
      </header>

      <section className={styles.summaryStrip} aria-label="Market operations summary">
        <div><span>Open</span><strong>{open.length}</strong></div>
        <div><span>Resolving</span><strong>{resolving.length}</strong></div>
        <div><span>Managed</span><strong>{managed.length}</strong></div>
        <div><span>Resolved</span><strong>{resolved.length}</strong></div>
      </section>

      {toast && (
        <div
          className={`${styles.actionStatus} ${toast.kind === "ok" ? styles.actionSuccess : styles.actionError}`}
          role={toast.kind === "ok" ? "status" : "alert"}
          data-testid="admin-action-status"
        >
          <span className={styles.actionIcon} aria-hidden="true">
            {toast.kind === "ok" ? "✓" : "!"}
          </span>
          <div className={styles.actionMessage}>
            <strong>{toast.kind === "ok" ? "Operation accepted" : "Operation failed"}</strong>
            <span>{toast.text}</span>
            {toast.detail && (
              <details>
                <summary>Command details</summary>
                <code>{toast.detail}</code>
              </details>
            )}
          </div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss status">×</button>
        </div>
      )}

      {loadError && (
        <div className={styles.loadError} role="alert">
          <div>
            <strong>Operator data is incomplete</strong>
            <span>{loadError}</span>
          </div>
          <button type="button" onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      <div className={styles.topGrid}>
        <section className={styles.panel} aria-labelledby="access-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionKicker}>Signing authority</p>
              <h2 id="access-title">Resolver access</h2>
            </div>
            {meLoaded && (
              <span className={`${styles.accessBadge} ${isResolver ? styles.accessReady : styles.accessLocked}`}>
                {isResolver ? "Authorized" : "Locked"}
              </span>
            )}
          </div>
          {!meLoaded ? (
            <div className={styles.accessSkeleton} aria-label="Loading resolver account" aria-busy="true">
              <span /><span />
            </div>
          ) : !me ? (
            <div className={styles.signedOutState}>
              <p>Sign in with the designated resolver account before operating a market.</p>
              <button type="button" className={styles.primaryButton} onClick={openLogin}>
                Sign in <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className={styles.accessContent}>
              <div className={styles.identityRow}>
                <span>Signed in as</span>
                <strong>{me.email}</strong>
              </div>
              {!isResolver && (
                <div className={styles.authorizationError} role="alert">
                  This wallet is not an authorized resolver. Add it to RESOLVER_ADDRESSES to enable
                  signed operations.
                </div>
              )}
              <details className={styles.technicalDetails}>
                <summary>Resolver configuration</summary>
                <dl>
                  <div>
                    <dt>Your wallet</dt>
                    <dd><code title={me.wallet ?? undefined}>{me.wallet ? shortIdentifier(me.wallet) : "Not connected"}</code></dd>
                  </div>
                  <div>
                    <dt>Authorized wallets</dt>
                    <dd>{resolvers.length}</dd>
                  </div>
                </dl>
                {resolvers.length > 0 ? (
                  <ul>{resolvers.map((resolver) => <li key={resolver}><code>{resolver}</code></li>)}</ul>
                ) : (
                  <p>No resolver addresses configured.</p>
                )}
              </details>
            </div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="create-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionKicker}>New contract</p>
              <h2 id="create-title">Create market</h2>
            </div>
          </div>
          <form
            className={styles.createForm}
            onSubmit={(event) => {
              event.preventDefault();
              void controlMarket(newMarket.slug, "create");
            }}
          >
            {(["slug", "question", "category"] as const).map((field) => (
              <label className={`${styles.field} ${field === "question" ? styles.fieldWide : ""}`} key={field}>
                <span>{field[0].toUpperCase() + field.slice(1)}</span>
                <input
                  id={`market-${field}`}
                  value={newMarket[field]}
                  onChange={(event) =>
                    setNewMarket((value) => ({ ...value, [field]: event.target.value }))
                  }
                  placeholder={field === "slug" ? "local-market-slug" : field === "question" ? "Will…?" : "Other"}
                />
              </label>
            ))}
            <label className={styles.field}>
              <span>Trading ends</span>
              <input
                id="market-end"
                type="datetime-local"
                value={newMarket.endTime}
                onChange={(event) =>
                  setNewMarket((value) => ({ ...value, endTime: event.target.value }))
                }
              />
            </label>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!isResolver || busy !== null || !newMarket.slug || !newMarket.question}
            >
              {busy?.includes(":create:") ? "Creating…" : "Create draft"}
            </button>
          </form>
          <details className={styles.operatorNote}>
            <summary>Deployment requirements</summary>
            <p>
              Local Anvil creates the condition automatically. Public deployments require the same
              slug to be created through the admin multisig first.
            </p>
          </details>
        </section>
      </div>

      <section className={`${styles.panel} ${styles.catalogPanel}`} aria-labelledby="catalog-title">
        <div className={styles.catalogHeader}>
          <div>
            <p className={styles.sectionKicker}>Indexed catalog</p>
            <h2 id="catalog-title">Market lookup</h2>
          </div>
          <span className={styles.resultCount} aria-live="polite">
            {refreshing ? "Updating…" : `${markets.length} result${markets.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className={styles.searchField} role="search">
          <span className={styles.searchIcon} aria-hidden="true" />
          <input
            aria-label="Search resolution catalog"
            type="search"
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder="Search slug, question, category, or description"
          />
          {catalogQuery && (
            <button type="button" onClick={() => setCatalogQuery("")} aria-label="Clear catalog search">×</button>
          )}
        </div>
        <p className={styles.catalogHint}>
          Showing the 200 newest markets by default. Enter at least two characters to search older markets.
        </p>
      </section>

      {managed.length > 0 && (
        <section className={styles.panel} aria-labelledby="lifecycle-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionKicker}>Trading state</p>
              <h2 id="lifecycle-title">Lifecycle controls</h2>
            </div>
            <span className={styles.countBadge}>{managed.length}</span>
          </div>
          <div className={styles.marketList}>
            {managed.map((market) => (
              <div key={market.slug} className={styles.controlRow} data-market-slug={market.slug}>
                <div className={styles.marketIdentity}>
                  <strong>{market.question}</strong>
                  <span><code>{market.slug}</code> · {market.status.replaceAll("_", " ")}</span>
                </div>
                <div className={styles.rowActions}>
                  {(
                    market.status === "draft"
                      ? ["open"]
                      : market.status === "cancel_only"
                        ? ["open", "halted", "closed"]
                        : ["open", "cancel_only", "closed"]
                  ).map((lifecycle) => (
                    <button
                      type="button"
                      key={lifecycle}
                      className={`${styles.controlButton} ${lifecycle === "closed" ? styles.dangerButton : ""}`}
                      disabled={!isResolver || busy !== null}
                      onClick={() => void controlMarket(market.slug, "lifecycle", lifecycle)}
                    >
                      {lifecycle.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.panel} aria-labelledby="open-title">
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.sectionKicker}>Active contracts</p>
            <h2 id="open-title">Open markets</h2>
          </div>
          <span className={styles.countBadge}>{open.length}</span>
        </div>
        {open.length === 0 ? (
          <div className={styles.emptyState}>
            <strong>No open markets</strong>
            <span>Draft markets must be opened before trading can begin.</span>
          </div>
        ) : (
          <div className={styles.marketList}>
            {open.map((market) => (
              <div key={market.slug} className={styles.marketRow} data-market-slug={market.slug}>
                <div className={styles.marketIdentity}>
                  <strong>{market.question}</strong>
                  <span><code>{market.slug}</code></span>
                </div>
                <dl className={styles.marketFacts}>
                  <div><dt>Last</dt><dd>{fmtCents(market.price)}</dd></div>
                  <div><dt>Ends</dt><dd>{fmtDate(new Date(market.endTime * 1000).toISOString())}</dd></div>
                </dl>
                <div className={styles.rowActions}>
                  {(["cancel_only", "halted"] as const).map((lifecycle) => (
                    <button
                      type="button"
                      key={lifecycle}
                      className={styles.controlButton}
                      disabled={!isResolver || busy !== null}
                      onClick={() => void controlMarket(market.slug, "lifecycle", lifecycle)}
                    >
                      {lifecycle.replaceAll("_", " ")}
                    </button>
                  ))}
                  {(["yes", "no"] as const).map((outcome) => {
                    const key = `${market.slug}:${outcome}`;
                    const armed = arm === key;
                    return (
                      <button
                        type="button"
                        key={outcome}
                        className={`${styles.outcomeButton} ${outcome === "yes" ? styles.yesButton : styles.noButton} ${armed ? styles.armedButton : ""}`}
                        disabled={!isResolver || busy !== null}
                        aria-pressed={armed}
                        onClick={() => void resolve(market.slug, outcome)}
                      >
                        {busy === key
                          ? "Signing…"
                          : armed
                            ? `Confirm ${outcome.toUpperCase()} — proposes on-chain`
                            : `Propose ${outcome.toUpperCase()}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {resolving.length > 0 && (
        <section className={styles.panel} aria-labelledby="finalization-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionKicker}>Settlement queue</p>
              <h2 id="finalization-title">Awaiting finalization</h2>
            </div>
            <span className={styles.countBadge}>{resolving.length}</span>
          </div>
          <div className={styles.marketList}>
          {resolving.map((market) => {
            const resumeOutcome = market.proposal === null ? market.resolutionIntent : null;
            const resumeKey = resumeOutcome ? `${market.slug}:${resumeOutcome}` : null;
            const key = `${market.slug}:finalize`;
            const readyAt = market.proposal?.finalizableAt ?? 0;
            const ready = market.proposal?.windowElapsed ?? false;
            return (
              <div key={market.slug} className={styles.marketRow} data-market-slug={market.slug}>
                <div className={styles.marketIdentity}>
                  <strong>{market.question}</strong>
                  <span>
                    {resumeOutcome
                      ? `${resumeOutcome.toUpperCase()} intent prepared · proposal submission interrupted`
                      : `proposed ${market.proposal?.outcome?.toUpperCase() ?? "—"}`}
                    {market.proposal?.disputed
                      ? " · DISPUTED — settle via admin"
                      : readyAt > 0
                        ? ` · finalizable ${ready ? "now" : `after ${new Date(readyAt * 1000).toLocaleTimeString()}`}`
                        : ""}
                  </span>
                </div>
                {resumeOutcome && resumeKey ? (
                  <button
                    type="button"
                    className={`${styles.outcomeButton} ${resumeOutcome === "yes" ? styles.yesButton : styles.noButton} ${arm === resumeKey ? styles.armedButton : ""}`}
                    disabled={!isResolver || busy !== null}
                    aria-pressed={arm === resumeKey}
                    onClick={() => void resolve(market.slug, resumeOutcome)}
                  >
                    {busy === resumeKey
                      ? "Signing…"
                      : arm === resumeKey
                        ? `Confirm ${resumeOutcome.toUpperCase()} — resumes on-chain proposal`
                        : `Resume proposal ${resumeOutcome.toUpperCase()}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.finalizeButton} ${arm === key ? styles.armedButton : ""}`}
                    disabled={!isResolver || busy !== null || !ready || market.proposal?.disputed}
                    aria-pressed={arm === key}
                    onClick={() => void resolve(market.slug, "finalize")}
                  >
                    {busy === key
                      ? "Finalizing…"
                      : arm === key
                        ? "Confirm — pays winners $1/share"
                        : "Finalize & redeem"}
                  </button>
                )}
              </div>
            );
          })}
          </div>
        </section>
      )}

      {resolved.length > 0 && (
        <section className={`${styles.panel} ${styles.resolvedPanel}`} aria-labelledby="resolved-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionKicker}>Completed</p>
              <h2 id="resolved-title">Resolved</h2>
            </div>
            <span className={styles.countBadge}>{resolved.length}</span>
          </div>
          <div className={styles.resolvedList}>
            {resolved.map((market) => (
              <div key={market.slug} className={styles.resolvedRow} data-market-slug={market.slug}>
                <span>{market.question}</span>
                <strong className={market.resolution === "yes" ? styles.yesResult : styles.noResult}>
                  {market.resolution?.toUpperCase()}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
