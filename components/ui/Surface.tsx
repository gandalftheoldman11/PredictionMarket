import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Surface.module.css";

type SurfaceElement = "div" | "section" | "article";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: SurfaceElement;
  level?: 0 | 1 | 2;
  interactive?: boolean;
  children: ReactNode;
}

export function Surface({
  as: Component = "div",
  level = 1,
  interactive = false,
  className,
  children,
  ...props
}: SurfaceProps) {
  const classes = [
    styles.surface,
    styles[`level${level}`],
    interactive ? styles.interactive : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
