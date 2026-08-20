import Link from "next/link";
import styles from "./status.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.stateMark} aria-hidden="true">404</div>
        <p className={styles.eyebrow}>Market not found</p>
        <h1 className={styles.title}>This market doesn’t exist</h1>
        <p className={styles.copy}>
          The link may be incomplete, or this market is no longer available.
        </p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary}>Back to all markets</Link>
        </div>
      </section>
    </div>
  );
}
