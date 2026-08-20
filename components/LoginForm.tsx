"use client";

import { useState } from "react";
import { loginResponseSchema, requestJson } from "@/lib/client/api";
import { refreshRealtimeAuthentication } from "@/lib/client/realtime";
import styles from "./LoginForm.module.css";

/**
 * Passwordless email form: Magic sends a 6-digit code (its modal handles
 * entry), returns a DID token, and our server swaps it for a session.
 * Used by the login modal (primary) and the /login deep-link page.
 */
export default function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { Magic } = await import("magic-sdk"); // browser-only SDK
      const magic = new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY!);
      const didToken = await magic.auth.loginWithEmailOTP({ email });
      if (!didToken) throw new Error("no token");

      await requestJson("/api/auth/magic", loginResponseSchema, {
        method: "POST",
        headers: { authorization: `Bearer ${didToken}` },
      });
      refreshRealtimeAuthentication();
      window.dispatchEvent(new Event("rl:refresh"));
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error && /closed|cancel/i.test(err.message)
          ? "Login cancelled"
          : "Login failed — try again";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.securityMark} aria-hidden="true">
        <span />
      </div>
      <p className={styles.eyebrow}>Secure account access</p>
      <h1 className={styles.title}>Sign in to TradeWar</h1>
      <p className={styles.copy}>
        Use a one-time email code to access your markets, portfolio, and signing wallet.
      </p>

      <form onSubmit={submit} className={styles.form} aria-busy={busy}>
        <label className={styles.label} htmlFor="login-email">Email address</label>
        <input
          className={styles.input}
          id="login-email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          disabled={busy}
          aria-describedby="login-security-note"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        {error && <div className={styles.error} role="alert">{error}</div>}

        <button
          className={styles.submit}
          type="submit"
          disabled={busy || !email}
          aria-busy={busy}
        >
          {busy ? "Check your email for the code…" : "Continue with email"}
        </button>
      </form>

      <p className={styles.note} id="login-security-note">
        <span>No password</span>
        <span>Account-linked wallet</span>
        <span>$1,000 demo balance</span>
      </p>
    </div>
  );
}

/** Any component can summon the login modal. */
export function openLogin() {
  window.dispatchEvent(new Event("rl:login-open"));
}
