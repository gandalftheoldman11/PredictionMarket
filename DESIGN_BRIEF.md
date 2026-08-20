# UI redesign brief

## Objective

Make TradeWar feel like a premium, credible financial product: extremely clean, information-dense without clutter, fast to scan, and trustworthy enough for users to trade real money.

The underlying product architecture and working behavior are out of scope. Improve visual hierarchy, typography, spacing, layout, color, contrast, component consistency, interaction feedback, responsive behavior, and state quality.

## Product references

Use the requested qualities—not direct copies—from:

- Polymarket for market presentation and information density.
- Kalshi for prediction-market workflows and contract clarity.
- Robinhood for accessible trading interactions.
- Coinbase for financial-product polish and trust.
- Linear for typography, spacing, and component consistency.

## Design principles

- Strong numerical hierarchy: probability, executable price, position value, available cash, P&L, and order totals must scan instantly.
- Restrained color: neutral surfaces do most of the work. Reserve green/red for Yes/No or gain/loss semantics and blue for action/probability/focus.
- Color must never be the only state signal. Pair it with labels, icons, borders, or patterns.
- High density through alignment and typography, not tiny text or stacked containers.
- Obvious primary actions and explicit disabled reasons.
- Subtle borders and elevation; avoid giant rounded cards, excessive gradients, glow, and generic SaaS decoration.
- Consistent 4px-based spacing, compact radii, visible focus, and predictable interaction states.
- Light and dark themes are equal products, not inversions of one another.
- Motion is functional, brief, and removed under reduced-motion preferences.

## Coloring direction

- Build from semantic roles in `styles/tokens.css`; do not introduce route-specific hex colors.
- Reduce simultaneous blue, green, red, and status color competition in dense views.
- Probability/data visualization should use a calm dedicated probability color; executable Yes/No controls retain semantic outcome colors.
- Primary action buttons need stable high-contrast foreground/background pairs in both themes.
- Dark mode should use graphite/ink layers with clear surface separation, not pure-black panels or neon accents.
- Light mode should use quiet cool neutrals with stronger text/border contrast than a typical SaaS dashboard.
- Muted text, focus rings, disabled controls, charts, and status badges must remain legible at financial-data sizes.

## Highest-priority surfaces

1. Market page and trade ticket: action hierarchy, quote comprehension, order controls, validation, receipt, order book, chart, and mobile trade-first order.
2. Discovery: featured market, executable outcome pricing, card hierarchy, filtering, market state, and above-the-fold density.
3. Portfolio: cash/value distinctions, positions, orders, funding, withdrawals, settlement activity, and empty/error/loading states.
4. Header/search/navigation: compact responsive behavior, keyboard interaction, theme/auth/realtime states.
5. Admin and authentication: credible controls, destructive confirmation, form density, and clear system feedback.
6. Global/loading/error/empty states and the shared UI kit.

## Required responsive review

Validate at 320, 390, 720, 1080, 1280, and 1440px. There must be no horizontal page overflow. At 1080px and below, the trade ticket appears before chart, book detail, rules, and facts.

## Deliverables

- Updated production TSX/CSS using existing behavior and paths.
- Complete light and dark themes.
- Desktop and mobile designs for every primary route.
- Loading, empty, error, stale/reconnecting, disabled, signed-out, and non-tradable states.
- A revised `styles/tokens.css` and `/ui-kit` that document the final system.
- Before/after screenshots and a concise rationale/change log.

## Avoid

- Excessive gradients, glass, glow, or animation.
- Giant rounded cards and decorative whitespace.
- Generic AI-generated SaaS styling.
- Ambiguous prices or unlabeled financial numbers.
- Reworking functioning product architecture for aesthetics.

