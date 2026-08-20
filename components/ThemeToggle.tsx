"use client";

import styles from "./ThemeToggle.module.css";

const STORAGE_KEY = "tradewar-color-theme";

function currentTheme(): "light" | "dark" {
  const rootTheme = document.documentElement.dataset.theme;
  if (rootTheme === "dark" || rootTheme === "light") return rootTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function ThemeToggle() {
  function toggleTheme() {
    const nextTheme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The theme still applies for this session when storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      title="Toggle color theme"
    >
      <svg
        className={styles.moon}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M15.75 12.4A6.15 6.15 0 0 1 7.6 4.25a6.3 6.3 0 1 0 8.15 8.15Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        className={styles.sun}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="3.25" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M10 1.75v1.5M10 16.75v1.5M18.25 10h-1.5M3.25 10h-1.5M15.84 4.16l-1.06 1.06M5.22 14.78l-1.06 1.06M15.84 15.84l-1.06-1.06M5.22 5.22 4.16 4.16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span className={`sr-only ${styles.darkLabel}`}>Use dark theme</span>
      <span className={`sr-only ${styles.lightLabel}`}>Use light theme</span>
    </button>
  );
}
