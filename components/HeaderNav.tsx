"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./HeaderNav.module.css";

const items = [
  {
    href: "/",
    label: "Markets",
    matches: (path: string) =>
      path === "/" || path.startsWith("/market/") || path.startsWith("/search"),
  },
  { href: "/portfolio", label: "Portfolio", matches: (path: string) => path.startsWith("/portfolio") },
];

export default function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Sections">
      {items.map((item) => {
        const active = item.matches(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.link} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
