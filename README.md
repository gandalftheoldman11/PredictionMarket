# TradeWar UI design handoff

This archive is a frontend-only snapshot of TradeWar at commit `c6f5d862990df180099d706049cd34392e0bacd9` (2026-08-19).

It is intended for a product designer/frontend designer to redesign the visual and interaction layer without receiving backend code, credentials, databases, contracts, deployment configuration, or operational tooling.

## What is included

- Visual Next.js routes under `app/` for markets, market detail, portfolio, login, search, admin, UI kit, and global system states.
- The complete `components/` layer, including the shared `components/ui/` primitives.
- Global CSS, CSS modules, semantic design tokens, icons, and favicon.
- Presentation formatting/types and browser-side interaction support used by the UI.
- Eight current-state screenshots in `reference-screenshots/` covering light/dark, desktop/mobile, discovery, market trading, portfolio, search, login, and the component kit.
- `DESIGN_BRIEF.md` and `BEHAVIOR_CONTRACTS.md`.

## Important limitation

This is a design/source-reference package, not a standalone production application. Server data queries, API routes, authentication services, exchange logic, custody, databases, and deployment code were deliberately removed. Some route and component imports therefore resolve only when changes are integrated back into the full repository.

Do not replace or simplify missing backend behavior. Return visual/component changes against the same file paths and document any new frontend dependencies.

## File map

- `app/` — route composition, global layout, loading/error/404 states.
- `components/` — discovery, market cards, charts, navigation, trading, account, admin, authentication, and reusable primitives.
- `styles/tokens.css` — semantic colors, typography, spacing, radii, borders, shadows, focus, and theme tokens.
- `lib/format.ts`, `lib/types.ts`, `lib/exchange/marketPresentation.ts` — presentation-only helpers.
- `lib/client/`, selected `lib/chain/` files — browser-side interaction contracts; treat as behavior-locked unless coordination is explicit.
- `reference-screenshots/` — visual baseline, not a design target.

## Primary review routes

1. `/` — discovery, category rail, featured market, pulse, market cards.
2. `/market/[slug]` — numerical summary, trade ticket, open orders, order book, chart, rules, facts.
3. `/portfolio` — account summary, positions, orders, funding, withdrawals, settlements.
4. `/search?q=` — full search and global autocomplete patterns.
5. `/login` and the global sign-in modal.
6. `/admin` — market creation/lifecycle controls.
7. `/ui-kit` — current semantic tokens and primitives.
8. Global header, ticker, footer, loading, empty, error, and not-found states.

## Return package

Please return modified UI files using these same paths, both light and dark designs, responsive evidence at the widths listed in the brief, and a concise change log. Keep behavior described in `BEHAVIOR_CONTRACTS.md` intact.

