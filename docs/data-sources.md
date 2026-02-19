# Data Sources (UA/US/AR/BR)

Last updated: 2026-02-19

## Production ingestion topology

Data is refreshed daily by the market ingestion job and may use fallback providers when the primary provider fails validation or freshness checks.

### US
- Primary: `CLAL (TESEO)` (`https://teseo.clal.it/en/?section=cereals_price_usa`)
- Fallback: `FSGRAIN` (`https://www.fsgrain.com/pages/usdacash.php`)
- Fallback: `GRAINSPRICES` (`https://grainsprices.com/markets/fob`)
- Covered commodities (minimum): `corn`, `wheat`, `soybeans`

### AR
- Primary: `CLAL (TESEO)` (`https://teseo.clal.it/en/?section=argentina_mais`, `https://teseo.clal.it/en/?section=argentina_soia`)
- Fallback: `BCR` (`https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1`)
- Fallback: `CLAL` (`https://www.clal.it/mini_index.php?...soia_argentina...`)
- Fallback: `GRAINSPRICES` (`https://grainsprices.com/markets/fob`)
- Covered commodities (minimum): `corn`, `wheat`, `soybeans`

### BR
- Primary: `CLAL (TESEO)` (`https://teseo.clal.it/en/?section=cereals_brazil_prices`)
- Fallback: `COMMODITY3` (`https://www.commodity3.com/instrument/YC20PPF6/corn-brazil-fob-santos`, `https://www.commodity3.com/instrument/YC2BPPF7/corn-brazil-fob-basis`)
- Fallback: `GRAINSPRICES` (`https://grainsprices.com/markets/fob`)
- Covered commodities (minimum): `corn`, `wheat`, `soybeans`

### UA
- Primary: internal curated feed (`spike_telegram`/`manual`) with USD/t normalization.

## Freshness rules
- `As of`: provider quote date/time mapped to the series point.
- `Fetched`: timestamp when Cropto ingestion retrieved/processed the quote.
- `Fresh`: `asOf` is today or yesterday.
- `Stale`: `asOf` older than 1 day.
- `Failed`: no successful fetch for provider/market/commodity.

## Data model
- `market_prices`: normalized price points
- `market_price_fetch_log`: fetch attempts and errors
- `market_price_source_status`: latest source status and freshness
- `fx_rates`: daily FX rates for ARS/BRL/EUR -> USD conversion

## Notes
- If source does not expose full history, Cropto accumulates internal daily history in `market_prices`.
- UI shows `As of`, `Fetched`, `Source`, and freshness badge.
- Product display currency is canonical `USD/t`; raw quote and FX are shown only in `?debugSources=1`.
- Canonical commodities are enforced across ingestion/API/UI: `corn`, `wheat`, `soybeans`, `soymeal`, `sunflower`, `rapeseed`, `barley`, `rice` (+ detected grain/oilseed extensions).
- Alias normalization examples:
  - `corn == maize`
  - `soy == soybean == soybeans == soya == soia`
  - `canola == rapeseed`
- Truth-series policy per market+commodity:
  - exactly one selected row is exposed in normal UI (`primary -> fallback -> last_known`)
  - no provider mixing on a single commodity card
  - alternative provider rows are visible only in debug mode as `alternatives[]`
- Failover simulation for verification: set `INGESTION_DISABLE_PRIMARY=1` (or `INGESTION_DISABLE_VENDOR=CLAL`) and confirm fallback source appears in UI.
- Debug mode: append `?debugSources=1` to market pages.

## Operational Notes
- Required env vars:
  - `DATABASE_URL`
  - `ENABLE_MARKET_INGESTION` (optional, defaults enabled)
  - `INGEST_HISTORY_DAYS` (optional)
  - FX layer: `OPENEXCHANGERATES_APP_ID` (optional), otherwise ER API fallback is used.
- Commands:
  - `npm run ingest:probe`
  - `npm run ingest:smoke`
  - `npm run ingest:backfill -- --market=BR --days=365`
- Failure simulation / fallback:
  - `INGESTION_DISABLE_PRIMARY=1`
  - `INGESTION_DISABLE_VENDOR=CLAL,BCR`
  - `INGESTION_DISABLE_VENDOR_<VENDOR>=1`
- Status endpoints:
  - `GET /api/market-ingestion/sources`
  - `GET /api/admin/market-ingestion/health` (broker/admin auth required)
