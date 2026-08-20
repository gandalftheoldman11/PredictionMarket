"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmtChance } from "@/lib/format";
import { marketPageResponseSchema, requestJson } from "@/lib/client/api";
import styles from "./SearchBox.module.css";

type SearchHit = {
  title: string;
  slug: string;
  icon: string | null;
  price: number | null;
  outcome: string | null;
};

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;

    const ctrl = new AbortController();

    const id = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await requestJson(
          `/api/v1/markets?q=${encodeURIComponent(query)}&limit=8`,
          marketPageResponseSchema,
          { signal: ctrl.signal },
        );
        setHits(data.markets.map((market) => ({
          title: market.question,
          slug: market.market,
          icon: null,
          price: Number(BigInt(market.lastYesPriceMicros)) / 1_000_000,
          outcome: null,
        })));
        setSearchFailed(false);
        setActive(-1);
        if (boxRef.current?.contains(document.activeElement)) setOpen(true);
      } catch {
        if (!ctrl.signal.aborted) {
          setHits([]);
          setSearchFailed(true);
          if (boxRef.current?.contains(document.activeElement)) setOpen(true);
        }
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open || active < 0) return;
    const hit = hits[active];
    if (!hit) return;
    document
      .getElementById(`search-result-${hit.slug}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, hits, open]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // ⌘K / ctrl+K / bare "/" focuses the search from anywhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (typeof e.key !== "string") return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const typing =
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA" ||
        el?.tagName === "SELECT" ||
        el?.isContentEditable;
      if (
        (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) ||
        (e.key === "/" && !typing)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(hit: SearchHit) {
    setOpen(false);
    setQ("");
    setActive(-1);
    inputRef.current?.blur();
    router.push(`/market/${hit.slug}`);
  }

  function goToResults() {
    const query = q.trim();
    if (query.length < 2) {
      inputRef.current?.focus();
      return;
    }

    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.nativeEvent.isComposing || composingRef.current) return;

    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }

    if (e.key === "ArrowDown") {
      if (hits.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      if (hits.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  }

  const showKbdHint = !focused && q.length === 0;

  return (
    <form
      className={styles.root}
      ref={boxRef}
      role="search"
      action="/search"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        if (composingRef.current) return;
        goToResults();
      }}
    >
      <button className={styles.submit} type="submit" aria-label="Search all markets">
        {searching ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          <svg
            className={styles.glyph}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m10.8 10.8 3.7 3.7" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        name="q"
        placeholder="Search markets…"
        aria-label="Search markets"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        role="combobox"
        aria-controls="search-results"
        aria-activedescendant={
          open && active >= 0 && hits[active]
            ? `search-result-${hits[active].slug}`
            : undefined
        }
        value={q}
        onChange={(e) => {
          const value = e.target.value;
          const queryLength = value.trim().length;
          setQ(value);
          setHits([]);
          setActive(-1);
          setSearchFailed(false);
          if (queryLength < 2) {
            setOpen(false);
            setSearching(false);
          } else {
            setOpen(true);
            setSearching(true);
          }
        }}
        onKeyDown={onInputKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onFocus={() => {
          setFocused(true);
          if (hits.length > 0) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          requestAnimationFrame(() => {
            if (!boxRef.current?.contains(document.activeElement)) {
              setOpen(false);
              setActive(-1);
            }
          });
        }}
      />
      <span className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
        {searching
          ? "Searching markets"
          : searchFailed
            ? "Search is temporarily unavailable"
            : q.trim().length >= 2
              ? `${hits.length} ${hits.length === 1 ? "result" : "results"} available`
              : ""}
      </span>
      {showKbdHint && (
        <span className={styles.shortcut} aria-hidden="true">
          ⌘K
        </span>
      )}
      {open && (
        <div className={styles.popover}>
          {hits.length === 0 ? (
            <div
              className={styles.list}
              id="search-results"
              role="listbox"
              aria-label="Search results"
            >
              <div
                className={styles.empty}
                role="option"
                aria-disabled="true"
                aria-selected="false"
              >
                {searching
                  ? "Searching…"
                  : searchFailed
                    ? "Search is temporarily unavailable."
                    : `No markets match “${q.trim()}”`}
              </div>
            </div>
          ) : (
            <>
              <div className={styles.header}>
                <span>
                  Results · <span className={styles.resultCount}>{hits.length}</span>
                </span>
                <span>last trade</span>
              </div>
              <div
                className={styles.list}
                id="search-results"
                role="listbox"
                aria-label="Search results"
              >
                {hits.map((h, i) => (
                  <Link
                    key={h.slug}
                    id={`search-result-${h.slug}`}
                    href={`/market/${h.slug}`}
                    role="option"
                    aria-selected={i === active}
                    tabIndex={-1}
                    className={`${styles.hit} ${i === active ? styles.hitActive : ""}`}
                    onPointerEnter={() => setActive(i)}
                    onClick={() => {
                      setOpen(false);
                      setQ("");
                      setActive(-1);
                    }}
                  >
                    {h.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.icon} alt="" className={styles.hitIcon} />
                    ) : (
                      <span
                        className={`${styles.hitIcon} ${styles.hitIconFallback}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className={styles.hitMain}>
                      <span className={styles.hitTitle}>{h.title}</span>
                      {h.price !== null && (
                        <span className={styles.meter}>
                          <span
                            className={styles.meterFill}
                            style={{
                              width: `${Math.max(h.price * 100, 1)}%`,
                            }}
                          />
                        </span>
                      )}
                    </span>
                    <span className={styles.hitPrice}>
                      {h.price !== null ? fmtChance(h.price) : ""}
                      <span className={styles.hitOutcome}>
                        {h.outcome ?? "last trade"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <Link
                href={`/search?q=${encodeURIComponent(q.trim())}`}
                className={styles.viewAll}
                onClick={() => {
                  setOpen(false);
                  setActive(-1);
                  inputRef.current?.blur();
                }}
              >
                <span>See all results for “{q.trim()}”</span>
                <span aria-hidden="true">→</span>
              </Link>
              <div className={styles.footer}>
                <span>
                  <kbd className={styles.keycap}>↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className={styles.keycap}>↵</kbd> open
                </span>
                <span>
                  <kbd className={styles.keycap}>esc</kbd> close
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
}
