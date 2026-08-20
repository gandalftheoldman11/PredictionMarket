"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import LoginForm from "./LoginForm";
import styles from "./LoginModal.module.css";

/**
 * Site-wide sign-in modal, mounted once in the layout. Opens on the
 * `rl:login-open` event so any button can summon it; signing in never
 * navigates away from what the user was doing.
 */
export default function LoginModal() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setOpen(true);
    };
    window.addEventListener("rl:login-open", show);
    return () => window.removeEventListener("rl:login-open", show);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      returnFocusRef.current?.focus();
    };
  }, [open]);

  const done = useCallback(() => {
    setOpen(false);
    router.refresh(); // re-render server components with the new session
  }, [router]);

  if (!open) return null;
  return (
    <div
      className={styles.backdrop}
      onPointerDown={(e) => {
        // backdrop click closes; clicks inside the panel don't
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }}
    >
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
      >
        <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
        <LoginForm onSuccess={done} />
      </div>
    </div>
  );
}
