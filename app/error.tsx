"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./status.module.css";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.page}>
      <section className={styles.panel} role="alert">
        <div className={`${styles.stateMark} ${styles.errorMark}`} aria-hidden="true">!</div>
        <p className={styles.eyebrow}>Connection error</p>
        <h1 className={styles.title}>We couldn’t load this view</h1>
        <p className={styles.copy}>
          Your account and orders were not changed. Retry the request, or return to market discovery.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => unstable_retry()}>
            Retry
          </button>
          <Link href="/" className={styles.secondary}>All markets</Link>
        </div>
        {error.digest && (
          <details className={styles.details}>
            <summary>Support reference</summary>
            <code>{error.digest}</code>
          </details>
        )}
      </section>
    </div>
  );
}
