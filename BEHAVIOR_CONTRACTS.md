# Behavior contracts — do not break

These constraints are part of the product, even when the surrounding UI is redesigned.

## Discovery and prices

- “Last trade” is historical probability, never the executable price.
- Buy Yes uses the best Yes ask. Buy No uses the complement of the best Yes bid.
- Missing liquidity remains explicit (`No asks`), with outcome identity preserved.
- Discovery links retain `?outcome=yes|no&action=buy#trade-panel`.
- Only open markets accept new orders. Preserve halted, cancel-only, resolved, and settled states.

## Trade ticket and order book

- The trade form has exactly one submit control. Selectors, presets, book rows, and cancel actions remain non-submit buttons.
- Preserve Buy/Sell, Yes/No, Market/Limit, post-only, tick-size, minimum, precision, cash/share limits, self-cross prevention, estimates, and disabled explanations.
- A limit price prefills once when context changes; live quotes must not chase and overwrite user input.
- Selecting a book row sets a limit price. Cancelling owned orders is a separate explicit action.
- Preserve pending signed-request retry/discard behavior and exact request replay.
- Preserve last-good book/account data through reconnects and clearly show stale/recovering state.
- Keep `#trade-panel`, input/group accessible names, `data-order-id`, and existing test IDs.

## Portfolio and account

- Cash, available cash, marked position value, P&L, and provisional values remain distinct.
- Preserve signed-out, loading, hard-error, stale-data, empty, populated, cancelling, funding, withdrawal, and settlement states.
- Retained signed withdrawals retry the exact saved request or can be explicitly discarded.
- Keep `data-market-slug`, `data-settlement-intent`, and existing test IDs.

## Admin and authentication

- Admin authorization/locked/verifying states remain explicit.
- Resolution and other destructive lifecycle actions retain arm-then-confirm behavior.
- Passwordless login preserves safe return routing, busy, cancelled, and error states.

## Global and responsive

- Theme preference remains persistent and system-aware.
- Preserve keyboard search, focus visibility, dialog semantics, live regions, reduced motion, labels, and contrast.
- At 1080px and below, render the trade rail before chart/order-book detail/rules/facts.
- Validate 320, 390, 720, 1080, 1280, and 1440px without page-level horizontal overflow.

