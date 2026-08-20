"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, loginResponseSchema, meResponseSchema, requestJson } from "@/lib/client/api";
import { refreshRealtimeAuthentication } from "@/lib/client/realtime";
import { openLogin } from "./LoginForm";
import styles from "./AuthChip.module.css";

type Me = { email: string; cash: number } | null;

export default function AuthChip() {
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const refreshRequest = useRef(0);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    try {
      const d = await requestJson("/api/auth/me", meResponseSchema);
      if (request !== refreshRequest.current) return;
      setFailed(false);
      setMe(d.user);
    } catch (error) {
      if (request !== refreshRequest.current) return;
      if (error instanceof ApiError && error.status === 401) {
        setFailed(false);
        setMe(null);
      } else {
        setFailed(true);
      }
    } finally {
      if (request === refreshRequest.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("rl:refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      refreshRequest.current += 1;
      window.clearTimeout(initial);
      window.removeEventListener("rl:refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, pathname]);

  async function logout() {
    refreshRequest.current += 1;
    await requestJson("/api/auth/logout", loginResponseSchema, { method: "POST" });
    try {
      const { Magic } = await import("magic-sdk");
      await new Magic(process.env.NEXT_PUBLIC_MAGIC_KEY!).user.logout();
    } catch {
      // Magic session cleanup is best-effort; ours is already gone
    }
    setMe(null);
    refreshRealtimeAuthentication();
    window.dispatchEvent(new Event("rl:refresh"));
    router.refresh();
  }

  if (!loaded) return <span className={styles.slot} aria-hidden="true" />;
  if (failed) {
    return (
      <button type="button" className={styles.unavailable} onClick={() => void refresh()}>
        Account unavailable
      </button>
    );
  }
  if (!me) {
    return (
      <button type="button" className={styles.signIn} onClick={openLogin}>
        Sign in
      </button>
    );
  }
  return (
    <span className={styles.chip}>
      <span className={styles.cash}>${me.cash.toFixed(2)}</span>
      <span className={styles.email} title={me.email}>
        {me.email.split("@")[0]}
      </span>
      <button type="button" className={styles.signOut} onClick={logout} aria-label="Sign out">
        ⏻
      </button>
    </span>
  );
}
