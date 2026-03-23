# Market Dashboard Triage 2026-02-19

## /api/version
```json
{
  "gitSha": "665be1f62d7e0d335683e42b63bcad536b5cfe73",
  "buildTime": null,
  "env": "production"
}
```

## /api/market-dashboard?debugSources=1 (summary)
```json
{
  "capturedAt": "2026-02-19T17:19:49.422592Z",
  "marketHealth": {
    "ua": {
      "status": "OK",
      "lastSuccessfulUpdate": "2026-02-19T16:36:44.000Z",
      "source": "spike_telegram(HTML_PAGE)"
    },
    "br": {
      "status": "FAIL",
      "lastSuccessfulUpdate": null,
      "source": null
    },
    "ar": {
      "status": "FAIL",
      "lastSuccessfulUpdate": null,
      "source": null
    },
    "us": {
      "status": "FAIL",
      "lastSuccessfulUpdate": null,
      "source": null
    }
  },
  "dataAlerts": {
    "br": "Ingestion enabled but no BR market data produced yet.",
    "ar": "Ingestion enabled but no AR market data produced yet.",
    "us": "Ingestion enabled but no US market data produced yet."
  },
  "counts": {
    "ua": 7,
    "br": 0,
    "ar": 0,
    "us": 0
  },
  "debugSourcesSummary": {
    "count": 3,
    "byMarket": {
      "US": 3
    }
  }
}
```

## Notes
- BR/AR/US currently have zero selected rows in dashboard payload.
- Debug source status currently exists only for US, indicating scheduler/provider attempts are not producing BR/AR rows.
