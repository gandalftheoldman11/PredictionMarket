import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonSharedProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export type ButtonAsButtonProps = ButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonSharedProps> & {
    href?: never;
  };

export type ButtonAsLinkProps = ButtonSharedProps &
  Omit<
    ComponentPropsWithoutRef<typeof Link>,
    keyof ButtonSharedProps | "href"
  > & {
    href: ComponentPropsWithoutRef<typeof Link>["href"];
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

function buttonClasses({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "className">) {
  return [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button(props: ButtonProps) {
  if ("href" in props && props.href !== undefined) {
    const {
      href,
      variant,
      size,
      fullWidth,
      className,
      children,
      ...linkProps
    } = props;

    return (
      <Link
        href={href}
        className={buttonClasses({ variant, size, fullWidth, className })}
        {...linkProps}
      >
        {children}
      </Link>
    );
  }

  const {
    variant,
    size,
    fullWidth,
    className,
    children,
    type = "button",
    ...buttonProps
  } = props;

  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
