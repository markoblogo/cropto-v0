# Cropto Monitor MVP Deploy Note

## Purpose
This note covers minimal deployment setup for the `/monitor` demo route.

## Required ENV (minimum)
- `DATABASE_URL` (already required by Cropto backend startup)
- `JWT_SECRET` (already required by Cropto auth init)

No paid API keys are required for `/monitor` MVP.

## Optional ENV (tuning)
- `MONITOR_RELEVANCE_THRESHOLD` (default `3`)
- `MONITOR_RELEVANCE_THRESHOLD_MIN` (default `2`)
- `MONITOR_RELEVANCE_THRESHOLD_MAX` (default `8`)
- `MONITOR_FETCH_TIMEOUT_MS` (default `7000`)
- `MONITOR_CACHE_TTL_MS` (default `600000`)

## Feature flags for demo
Recommended values:
- `ENABLE_CROPTO_INDICES=true`
- `ENABLE_MACRO_WIDGETS=true`
- `ENABLE_LOGISTICS_PANEL=true`
- `ENABLE_WEATHER_PLACEHOLDER=true`
- `ENABLE_DEBUG_DASHBOARD=true`
- `ENABLE_GEO_WIDGETS=false`
- `ENABLE_AI_SUMMARIZATION=false`

## Graceful fallback behavior
- If FX snapshot is unavailable, `Macro / FX Snapshot` shows a non-blocking "Coming soon" state.
- If a feed source fails, the source is skipped and the dashboard still renders.
- If Cropto indices are disabled by flag, the top block shows a non-blocking disabled/empty state.

## Known limitations (MVP)
- RSS source quality and uptime vary by provider.
- Tagging/scoring is rule-based (no ML classification).
- Dedup is exact + lightweight near-duplicate (title similarity), not semantic clustering.
- Weather panel is placeholder only.

## Domain smoke-check (/monitor)
1. Open `/monitor` and confirm page renders without auth prompt.
2. Verify top widgets render:
   - Cropto Indices block has rows or a graceful empty state.
   - Macro/FX block shows rates or "Coming soon".
3. Verify feed quality:
   - cards include crop/topic/region tags,
   - no obvious duplicate spam in first screen.
4. Verify filters change results:
   - crop/topic/region/time, optional search.
5. Open `/monitor?debug=1` and confirm debug panel shows:
   - sources total/enabled,
   - items fetched,
   - items after filtering,
   - duplicates removed,
   - top/noisy sources.
