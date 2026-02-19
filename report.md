# Ingest Probe Report

Generated at: 2026-02-19T13:12:24.872Z

## Source Probe Results

| source_url | status_code | content_type | has_price | has_date | has_history | date_value | price_samples | parser_confidence |
|---|---:|---|:---:|:---:|:---:|---|---|---:|
| https://teseo.clal.it/en/?section=argentina_mais | 200 | text/html; charset=UTF-8 | yes | yes | yes | 2026-02-16 | 16.6666, 251.495, 261.647, 271.922, 268.089, 280.62, 291.12, 293 | 0.9 |
| https://teseo.clal.it/en/?section=argentina_soia | 200 | text/html; charset=UTF-8 | yes | yes | yes | 2026-02-16 | 16.6666, 466, 475.3, 474.2, 481.18, 497, 503.946, 498 | 0.9 |
| https://www.clal.it/mini_index.php?locale=en_US&section=storico_prezzi_giornalieri&prodotto=soia_argentina&valuta=ARS&unita=ton&year=2025 | 200 | text/html; charset=UTF-8 | yes | no | no | - | 300.4, 7.9166, 315, 322.5, 343, 290, 321, 385 | 0.55 |
| https://teseo.clal.it/en/?section=cereals_brazil_prices | 200 | text/html; charset=UTF-8 | yes | yes | yes | 2026-02-16 | 210.5, 210, 212, 1112, 1110.5, 1111.5, 1103.7, 1097.8 | 0.9 |
| https://teseo.clal.it/en/?section=cereals_price_usa | 200 | text/html; charset=UTF-8 | yes | yes | yes | 2026-02-18 | 398.4252, 378.7639, 370.5515, 385.7241, 385.72, 38.099, 24.5476, 17.6239 | 0.98 |
| https://grainsprices.com/markets/fob | 200 | text/html; charset=utf-8 | yes | yes | no | 2025-11-19 | 229.75, 212.5, 464.75, 211.75, 1217.25, 12.5, 230.75, 11.5 | 0.75 |
| https://www.fsgrain.com/pages/usdacash.php | 200 | text/html; charset=UTF-8 | yes | no | no | - | 11.5, 10.96, 11.29, 6.79, 105, 6.99, 125, 7.44 | 0.55 |
| https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1 | 200 | text/html; charset=UTF-8 | yes | yes | no | 2026-02-13 | 10.5, 11.5, 207, 217, 203, 208, 210, 199 | 0.75 |
| https://www.commodity3.com/instrument/YC20PPF6/corn-brazil-fob-santos | 200 | text/html; charset=UTF-8 | yes | no | no | - | 2024.11 | 0.55 |
| https://www.commodity3.com/instrument/YC2BPPF7/corn-brazil-fob-basis | 200 | text/html; charset=UTF-8 | yes | no | no | - | 2024.11 | 0.55 |

## Coverage Table

| market | commodity_normalized | raw_names_seen | has_latest | has_history | primary_provider | fallback_providers | notes |
|---|---|---|:---:|:---:|---|---|---|
| AR | barley | barley | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| AR | corn | corn, mais | no | yes | TESEO_CLAL | BCR | weekly_or_irregular |
| AR | rapeseed | rapeseed, colza | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| AR | rice | rice | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| AR | sorghum | sorghum | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| AR | soybeans | soia, soybean, soybeans | no | yes | TESEO_CLAL | CLAL, BCR | weekly_or_irregular |
| AR | sunflower | sunflower, girasol | no | yes | TESEO_CLAL | BCR | weekly_or_irregular |
| AR | wheat | wheat | no | yes | TESEO_CLAL | BCR | weekly_or_irregular |
| BR | barley | barley | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| BR | corn | mais, corn, maize | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| BR | rapeseed | rapeseed, colza | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| BR | rice | rice | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| BR | rye | rye | no | no | COMMODITY3 | - | unknown |
| BR | sorghum | sorghum | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| BR | soybeans | soia, soybean, soybeans, soy | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| BR | soymeal | soymeal | no | no | COMMODITY3 | - | unknown |
| BR | sunflower | sunflower | no | yes | TESEO_CLAL | - | weekly_or_irregular |
| BR | wheat | wheat | no | yes | TESEO_CLAL | COMMODITY3 | weekly_or_irregular |
| GLOBAL | barley | barley | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | corn | corn, maize | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | rapeseed | rapeseed, canola | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | soybeans | soybeans, soybean | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | soymeal | soymeal | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | sunflower | sunflower | no | no | GRAINSPRICES | - | unknown |
| GLOBAL | wheat | wheat, wheat  12.5, wheat 11.5 | no | no | GRAINSPRICES | - | unknown |
| US | barley | barley | yes | yes | TESEO_CLAL | - | daily_likely |
| US | corn | mais, corn | yes | yes | TESEO_CLAL | FSGRAIN | daily_likely |
| US | oats | oats | no | no | FSGRAIN | - | unknown |
| US | rapeseed | rapeseed, colza | yes | yes | TESEO_CLAL | - | daily_likely |
| US | rice | rice | yes | yes | TESEO_CLAL | - | daily_likely |
| US | sorghum | sorghum | yes | yes | TESEO_CLAL | FSGRAIN | daily_likely |
| US | soybeans | soia, soybean, soybeans, soy | yes | yes | TESEO_CLAL | FSGRAIN | daily_likely |
| US | sunflower | sunflower | yes | yes | TESEO_CLAL | - | daily_likely |
| US | wheat | wheat | yes | yes | TESEO_CLAL | FSGRAIN | daily_likely |

## Recommended Provider Topology

- US: primary=TESEO_CLAL; fallback=none
- AR: primary=TESEO_CLAL; fallback=BCR
- BR: primary=TESEO_CLAL; fallback=none

## Risks

- TESEO_CLAL (https://teseo.clal.it/en/?section=argentina_mais): update cadence unclear
- TESEO_CLAL (https://teseo.clal.it/en/?section=argentina_soia): update cadence unclear
- CLAL (https://www.clal.it/mini_index.php?locale=en_US&section=storico_prezzi_giornalieri&prodotto=soia_argentina&valuta=ARS&unita=ton&year=2025): as-of date not detected; history/update signal missing
- TESEO_CLAL (https://teseo.clal.it/en/?section=cereals_brazil_prices): update cadence unclear
- GRAINSPRICES (https://grainsprices.com/markets/fob): history/update signal missing
- FSGRAIN (https://www.fsgrain.com/pages/usdacash.php): as-of date not detected; history/update signal missing
- BCR (https://www.bcr.com.ar/es/mercados/mercado-de-granos/cotizaciones/cotizaciones-locales-1): update cadence unclear
- COMMODITY3 (https://www.commodity3.com/instrument/YC20PPF6/corn-brazil-fob-santos): as-of date not detected; history/update signal missing
- COMMODITY3 (https://www.commodity3.com/instrument/YC2BPPF7/corn-brazil-fob-basis): as-of date not detected; history/update signal missing

## Notes

- Raw responses were saved to `tmp/ingest_probe/<domain>/<timestamp>-<sha>.html`.
- Daily-update heuristic: at least 4 unique dates in the last 7 days.
- If source history is sparse, internal history accumulation is required.