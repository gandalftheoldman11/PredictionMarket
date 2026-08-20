"use client";

import { useEffect, useState } from "react";
import { REALTIME_STATUS_EVENT } from "@/lib/client/realtime";
import styles from "./RealtimeStatus.module.css";

export default function RealtimeStatus() {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    const update = (event: Event) => {
      setStatus((event as CustomEvent<string>).detail);
    };
    window.addEventListener(REALTIME_STATUS_EVENT, update);
    return () => window.removeEventListener(REALTIME_STATUS_EVENT, update);
  }, []);
  const description = status === "live"
    ? "Realtime market data is live"
    : status === "recovering"
      ? "Recovering missed market updates"
      : status === "reconnecting"
        ? "Reconnecting to realtime market data"
        : status === "connecting"
          ? "Connecting to realtime market data"
          : "Realtime data starts when needed";
  return (
    <span
      data-testid="realtime-status"
      className={`${styles.status} ${styles[status] ?? ""}`}
      title={description}
      aria-label={description}
      aria-live="polite"
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{status}</span>
    </span>
  );
}
