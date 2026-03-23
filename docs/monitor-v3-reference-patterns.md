# Monitor V3: Reference Patterns (Worldmonitor-Inspired, Reimplemented)

Purpose: capture UI/UX patterns worth adopting from `worldmonitor` as a reference while implementing Cropto UI from scratch (no code/style copy).

## Legal boundary

- Reference project license: AGPL-3.0.
- Cropto target posture: closed/commercial.
- Rule: use only high-level patterns and interaction models; do not copy source, CSS, component code, or asset bundles.

## Patterns to adopt

1. Dense shell-first layout
- Sticky top shell with compact controls and global state indicators.
- Hero section ends quickly; the main information density lives in the grid.
- Minimal vertical whitespace.

2. Unified control strip
- One control zone for role/topic/country/time window/filter scope.
- Avoid duplicated filters in multiple sections.
- Single source of truth for active filters.

3. Widget-first grid engine
- Uniform base cell for all non-video widgets.
- Drag to reorder by card body.
- Resize from right and bottom edges.
- Close with top-right `X`.
- Hidden widgets are recoverable via hidden drawer/state.

4. Operational interaction model
- Cursor semantics:
  - `grab` on card body,
  - `ew-resize` on right edge,
  - `ns-resize` on bottom edge,
  - pointer on drilldown metrics.
- Keep widget actions mostly implicit (gesture-based), not icon-heavy toolbars.

5. Theme and display controls
- Theme switch in shell.
- Fullscreen mode in shell.
- Persistent preferences (role/topic/country/theme/layout/hidden widgets).

6. Widget onboarding flow
- Add-widget entry in shell.
- Modal flow:
  - choose source type (`API`, `RSS`, `manual`),
  - basic metadata,
  - topic/role tags,
  - target placement (`hero` slot or main grid).
- Add flow must write into same grid state engine.

7. Tokenized visual system
- CSS variables for:
  - backgrounds,
  - text tiers,
  - borders,
  - semantic statuses (`live`, `refresh`, `fallback`, `offline`),
  - alert severities.
- Keep component CSS thin; style via tokens and utility composition.

8. Performance constraints
- Keep monitor UI client-only light:
  - avoid unnecessary re-renders on data refresh,
  - isolate expensive panels,
  - use memoized widget mapping and layout transforms.
- Maintain `check` and `build` as gating checks per iteration.

## What not to adopt directly

- Any AGPL implementation details, class naming, or CSS blocks.
- Exact panel markup and exact animation signatures.
- Source-specific branding/asset style tied to reference project.

## Current Cropto V3 status

- New `/monitor` route now points to a clean `MonitorV3` shell.
- Legacy monitor remains available on `/monitor-legacy`.
- V3 includes:
  - unified role/topic/country filters,
  - sticky shell,
  - dark-oriented compact grid,
  - drag/reorder,
  - edge-resize,
  - hide/recover,
  - fullscreen toggle,
  - add-widget modal (manual custom widgets).

## Next implementation passes

1. Persist full V3 state (layout/order/hidden/filters/theme) to localStorage.
2. Replace temporary “video slots” with real stream tile model.
3. Add drilldown click targets for key metrics.
4. Add grouped grid views (`manual/topic/source`) from one state model.
5. Introduce formal design tokens (`monitor-v3.css`) with both dark and light themes.
6. Migrate additional data-backed sections from legacy monitor into V3 widgets.
