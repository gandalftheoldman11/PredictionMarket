"use client";

import { useEffect, useState } from "react";
import { REALTIME_STATUS_EVENT } from "@/lib/client/realtime";
import styles from "./SiteFooter.module.css";

export default function SiteFooter() {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    const update = (event: Event) => {
      setStatus((event as CustomEvent<string>).detail);
    };
    window.addEventListener(REALTIME_STATUS_EVENT, update);
    return () => window.removeEventListener(REALTIME_STATUS_EVENT, update);
  }, []);
  const label = status === "live"
    ? "Live market data"
    : status === "idle"
      ? "Market data on demand"
      : status === "recovering"
        ? "Recovering market data"
        : status === "reconnecting"
          ? "Reconnecting market data"
          : "Connecting market data";

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={`${styles.status} ${styles[status] ?? ""}`}>
          <span aria-hidden="true" />
          {label}
        </span>
        <span>event contracts · live order book · demo collateral</span>
      </div>
    </footer>
  );
}
