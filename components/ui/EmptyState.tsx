import type { ReactNode } from "react";
import { Surface } from "./Surface";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  const classes = [
    styles.emptyState,
    compact ? styles.compact : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Surface className={classes} level={1}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className={styles.title}>{title}</h3>
      {description ? (
        <div className={styles.description}>{description}</div>
      ) : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </Surface>
  );
}
