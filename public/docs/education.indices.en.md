# Indices & spot tokens

Cropto tracks a small set of commodity indices that reflect real export and processing prices at Ukrainian ports.

Today the indices include for example:

- **Corn**
- **Wheat 11.5%**
- **Feed Wheat**
- **GMO Soybeans (export / processing)**
- **Rapeseed, Sunflower Seed** and a few others

Each index has:

- a human‑readable name (e.g. *Wheat 11.5%*);
- a **slug** (e.g. `wheat-115`);
- a category that shows whether it is an **export** index (CPT ODESA) or a **processing** index (CPT PARITET / processing).

Prices come from:

- curated Telegram sources (e.g. Ukrainian brokers publishing CPT quotes);
- manual admin overrides for demos and pilots.

These indices feed into:

1. **Spot view** — index charts and “spot tokens” that show current price per ton.
2. **Options** — all options settle to a specific index value on the expiry date.

In other words, indexes are the pricing backbone: if you trust the index, you can trust the P&L on both spot and options.


