"use client";

import { useEffect, useState } from "react";
import styles from "./Clock.module.css";

function utcNow(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

export default function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const initial = window.setTimeout(() => setTime(utcNow()), 0);
    const id = setInterval(() => setTime(utcNow()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  return (
    <span className={styles.clock} suppressHydrationWarning>
      <span className={styles.dot} aria-hidden="true" />
      {time ?? "——:——:——"} UTC
    </span>
  );
}
