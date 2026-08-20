import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "live" | "resolved";

export interface BadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: BadgeProps) {
  const classes = [styles.badge, styles[tone], className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}
