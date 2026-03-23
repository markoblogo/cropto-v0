# Ingestion Triage 2026-02-19 (USD/t outliers)

This note captures the observed BR/AR/US outlier issue and how to verify/fix it with the new admin sample endpoint.

## Symptoms observed in production
- BR soybeans displayed around `40.29 USD/t` (implausible for soybeans in USD/t).
- AR soybeans displayed around `0.03 USD/t` (implausible; likely currency/unit parsing mismatch).

## Likely cause
- Raw quotes were parsed without strict unit/currency detection and were treated as if already `USD/t`.
- This allowed rows with ambiguous units (or wrong scale) to pass into dashboard selection.

## New diagnostics endpoint
- `GET /api/admin/market-ingestion/sample?market=BR&commodity=SOYBEANS`
- `GET /api/admin/market-ingestion/sample?market=AR&commodity=SOYBEANS`
- `GET /api/admin/market-ingestion/sample?market=US&commodity=CORN`

Returns:
- `asOf`, `fetchedAt`, `vendor`, `channel`
- `rawPrice`, `rawCurrency`, `rawUnit`, `rawTextSnippet`
- `priceUsdPerTon`, `conversionNotes`, `needsReview`, `invalidReason`

## Expected verification examples after patch
- Example A (BR soybeans outlier):
  - `rawPrice`: numeric
  - `rawCurrency/rawUnit`: ambiguous or non-ton unit
  - `priceUsdPerTon`: computed outlier
  - `invalidReason`: `OUT_OF_RANGE`
  - `needsReview`: `true`
- Example B (AR soybeans outlier):
  - `rawCurrency`: `ARS` or `UNKNOWN`
  - `rawUnit`: non-ton/unknown
  - `priceUsdPerTon`: very low outlier
  - `invalidReason`: `OUT_OF_RANGE`
  - `needsReview`: `true`

## Resulting behavior
- Truth-series selection excludes rows where `needsReview=true` or `invalidReason` is set.
- Dashboard shows:
  - validated rows only, or
  - `No validated quotes yet (waiting for unit/currency parsing).`
