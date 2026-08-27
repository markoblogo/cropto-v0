# Cropto / Monitor Design Contract

## Design read

Reading this as an operational commodity and brokerage workspace for people who must scan changing market state, understand provenance, and take bounded actions quickly. The interface should feel like a trustworthy operations terminal, not a generic analytics dashboard or a marketing site.

## Scope

This contract governs operational product surfaces, especially `/monitor`, `/spike-monitor`, trading, risk, admin, and partner workflows. Public deck and marketing routes may use more editorial composition, but must preserve the same evidence and trust language.

## Reference direction

Use [Better Stack](https://betterstack.com/) as a pattern reference for telemetry sources, query controls, freshness, multiple data views, and logs. Extract information architecture and state clarity; do not copy its brand, palette, or component styling.

## Dials

- Variance: low on Monitor and transaction workflows; medium on public surfaces.
- Motion: low. State changes may animate briefly; scanning, keyboard, and repeated actions do not.
- Density: high but structured. Dense data is useful; undifferentiated chrome is not.

## Preserve

- Existing commodity, trading, risk, broker, and business-unit vocabulary.
- Current light/dark token foundation and accessible Radix/shadcn-style behavior.
- Fast bid/offer scanning, structured entry, filtering, matching, details, and exports.
- Visible status, source, time, and operational boundaries.
- Human confirmation for sending, publishing, destructive actions, and consequential changes.
- Existing route behavior and factual content unless a task explicitly changes them.

## Reconsider

- Multiple Monitor generations competing without a clearly named canonical workflow.
- Equal-weight cards that make primary work and secondary diagnostics look identical.
- Charts shown before source, timeframe, freshness, and current value are understood.
- Duplicate filters or status labels in page, pane, widget, and dialog layers.
- Decorative gradients, shadows, and microcharts that do not improve a decision.

## Information hierarchy

1. Workspace identity, business-unit scope, data freshness, and runtime health.
2. Primary queue or market tape: the records the user is here to scan or act on.
3. Query/filter controls next to the data they govern, with active filters visible.
4. Selected-record detail, provenance, matching evidence, and available actions.
5. Secondary analytics, charts, exports, diagnostics, and configuration.

Every metric or chart must answer: source, period, last update, unit, and whether the value is live, delayed, demo, calculated, or unavailable. Unknown is displayed as unknown, not as zero.

## Layout and components

- Prefer a stable workspace shell and one dominant work region over a dashboard of equal cards.
- Tables, tapes, and queues are first-class components. Use tabular numerals and stable column alignment.
- Keep source, timeframe, and freshness controls attached to their result surface.
- Use color for state and exception, never as the only carrier of meaning.
- Reserve red for destructive/error states; do not use it for ordinary negative market movement without a label.
- Detail sheets and dialogs must keep the selected record identity visible.
- Empty states explain whether there is no data, no match, an active filter, unavailable storage, or a loading failure.

## Motion

- No animation on keyboard navigation, live tape scanning, filter traversal, or repeated row actions.
- Short transitions may explain panel origin, selection, saved state, or queue progress.
- Respect `prefers-reduced-motion`; no operational meaning may depend on motion.

## Responsive behavior

- Desktop is the primary Monitor canvas.
- At narrower widths, preserve record identity, status, freshness, and primary action before secondary columns.
- Use intentional horizontal table scrolling with a visible cue; do not silently collapse essential values.
- Dialogs, sheets, and toolbars must remain operable at 320 px and at increased text zoom.

## Anti-patterns

- Generic KPI-card wall.
- Card-inside-card nesting for every grouping level.
- Sparklines without units or timeframe.
- Fake live indicators, invented proof, or silent demo data.
- Hidden active filters or ambiguous destructive buttons.
- Motion or glass effects used to make an operational screen feel premium.

## Verification gate

Before a Monitor redesign is ready, capture desktop and compact evidence; test keyboard focus, loading/empty/error/stale states, filters, row selection, detail opening, reduced motion, and at least one consequential action through its real confirmation boundary. Build success is not visual or interaction proof.

## Reference-only status

`/spike-monitor` / `SeaBrokerageMonitorPage` is currently acceptable and is not queued for redesign. Keep Better Stack only as a reference when a concrete disputed or problematic area needs clearer source, freshness, query, or view hierarchy. Any future change must start from a named usability problem rather than a general reskin.
