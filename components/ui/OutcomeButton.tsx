import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";
import styles from "./OutcomeButton.module.css";

export type Outcome = "yes" | "no";
export type OutcomeButtonSize = "sm" | "md";

interface OutcomeButtonSharedProps {
  outcome: Outcome;
  label?: ReactNode;
  price: ReactNode;
  size?: OutcomeButtonSize;
  className?: string;
}

export type OutcomeButtonAsButtonProps = OutcomeButtonSharedProps &
  Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof OutcomeButtonSharedProps
  > & {
    href?: never;
  };

export type OutcomeButtonAsLinkProps = OutcomeButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<typeof Link>,
    keyof OutcomeButtonSharedProps | "href"
  > & {
    href: ComponentPropsWithoutRef<typeof Link>["href"];
  };

export type OutcomeButtonProps =
  | OutcomeButtonAsButtonProps
  | OutcomeButtonAsLinkProps;

function outcomeClasses({
  outcome,
  size = "md",
  className,
}: Pick<OutcomeButtonProps, "outcome" | "size" | "className">) {
  return [styles.button, styles[outcome], styles[size], className]
    .filter(Boolean)
    .join(" ");
}

function defaultAccessibleLabel(label: ReactNode, price: ReactNode) {
  const readableLabel =
    typeof label === "string" || typeof label === "number" ? String(label) : "";
  const readablePrice =
    typeof price === "string" || typeof price === "number" ? String(price) : "";

  return [readableLabel, readablePrice].filter(Boolean).join(" ");
}

export function OutcomeButton(props: OutcomeButtonProps) {
  if ("href" in props && props.href !== undefined) {
    const {
      href,
      outcome,
      label,
      price,
      size,
      className,
      "aria-label": ariaLabel,
      ...linkProps
    } = props;
    const renderedLabel = label ?? (outcome === "yes" ? "Yes" : "No");
    const fallbackLabel = defaultAccessibleLabel(renderedLabel, price);

    return (
      <Link
        href={href}
        className={outcomeClasses({ outcome, size, className })}
        aria-label={ariaLabel ?? fallbackLabel}
        {...linkProps}
      >
        <span className={styles.label}>{renderedLabel}</span>
        <strong className={styles.price}>{price}</strong>
      </Link>
    );
  }

  const {
    outcome,
    label,
    price,
    size,
    className,
    type = "button",
    "aria-label": ariaLabel,
    ...buttonProps
  } = props;
  const renderedLabel = label ?? (outcome === "yes" ? "Yes" : "No");
  const fallbackLabel = defaultAccessibleLabel(renderedLabel, price);

  return (
    <button
      type={type}
      className={outcomeClasses({ outcome, size, className })}
      aria-label={ariaLabel ?? fallbackLabel}
      {...buttonProps}
    >
      <span className={styles.label}>{renderedLabel}</span>
      <strong className={styles.price}>{price}</strong>
    </button>
  );
}
