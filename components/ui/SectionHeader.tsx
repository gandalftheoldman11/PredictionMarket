import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

type HeadingElement = "h1" | "h2" | "h3";

export interface SectionHeaderProps {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: HeadingElement;
  className?: string;
  id?: string;
}

export function SectionHeader({
  title,
  kicker,
  description,
  actions,
  as: Heading = "h2",
  className,
  id,
}: SectionHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className={styles.copy}>
        {kicker ? <div className={styles.kicker}>{kicker}</div> : null}
        <Heading className={styles.title} id={id}>
          {title}
        </Heading>
        {description ? (
          <div className={styles.description}>{description}</div>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
