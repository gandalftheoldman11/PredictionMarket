import styles from "./status.module.css";

export default function Loading() {
  return (
    <div className={styles.page} aria-live="polite" aria-busy="true">
      <div className={styles.loadingShell} aria-hidden="true">
        <div className={styles.loadingHead}>
          <span className={styles.skeletonEyebrow} />
          <span className={styles.skeletonTitle} />
        </div>
        <div className={styles.skeletonMetrics}>
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
        <div className={styles.skeletonTable}>
          <span className={styles.skeletonTableHead} />
          {Array.from({ length: 3 }, (_, index) => <span key={index} className={styles.skeletonRow} />)}
        </div>
      </div>
      <span className={styles.srOnly}>Loading the latest market and account data…</span>
    </div>
  );
}
