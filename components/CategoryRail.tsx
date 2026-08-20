import Link from "next/link";
import styles from "./CategoryRail.module.css";

export default function CategoryRail({
  categories,
  active,
}: {
  categories: string[];
  active: string | null;
}) {
  return (
    <nav className={styles.rail} aria-label="Market categories">
      <span className={styles.railLabel} aria-hidden="true">
        Categories
      </span>
      <div className={styles.items}>
        <Link
          href="/"
          className={`${styles.item} ${active === null ? styles.active : ""}`}
          aria-current={active === null ? "page" : undefined}
        >
          All markets
        </Link>
        {categories.map((category) => (
          <Link
            href={`/?tag=${encodeURIComponent(category)}`}
            className={`${styles.item} ${active === category ? styles.active : ""}`}
            aria-current={active === category ? "page" : undefined}
            key={category}
          >
            {category}
          </Link>
        ))}
      </div>
    </nav>
  );
}
