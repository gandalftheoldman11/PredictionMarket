import Link from "next/link";
import AuthChip from "./AuthChip";
import Clock from "./Clock";
import HeaderNav from "./HeaderNav";
import RealtimeStatus from "./RealtimeStatus";
import SearchBox from "./SearchBox";
import ThemeToggle from "./ThemeToggle";
import { Button } from "./ui";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="TRADEWAR home">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
          </span>
          <span className={styles.brandCopy}>
            <strong>TRADEWAR</strong>
            <span>Prediction market</span>
          </span>
        </Link>

        <HeaderNav />

        <div className={styles.utility}>
          <SearchBox />
          <Link
            href="/search"
            className={styles.mobileSearch}
            aria-label="Search markets"
          >
            <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="m12 12 4 4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </Link>
          <ThemeToggle />
          <span className={styles.clock}>
            <Clock />
          </span>
          <span className={styles.realtime}>
            <RealtimeStatus />
          </span>
          <Button
            href="/portfolio#deposit"
            className={styles.deposit}
            variant="primary"
            size="sm"
          >
            Deposit
          </Button>
          <AuthChip />
        </div>
      </div>
    </header>
  );
}
