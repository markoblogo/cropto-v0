# Options & hedging on Cropto

On Cropto, options are simple index‑settled contracts built for grain.

Each option has:

- a **buyer** (LONG) and a **seller** (SHORT);
- a **premium** — price the buyer pays per ton to receive protection or upside;
- a **strike price** in USD per ton;
- an **expiry date**;
- a **linked index** (e.g. Corn, Wheat 11.5%).

At expiry the platform looks at the index price and compares it to the strike:

- for a **CALL** option the buyer is protected if the index goes **above** the strike;
- for a **PUT** option the buyer is protected if the index goes **below** the strike.

Typical use cases:

- **Farmer** buys a PUT on Wheat 11.5% to guarantee a minimum price for harvest.
- **Processor** buys a CALL on Corn or Feed Wheat to protect against rising input costs.
- **Trader** takes SHORT or LONG option exposure around expected volatility in export prices.

All payouts and premiums are denominated in CROPT (1 CROPT ≈ 1 USD in the pilot), but economically they reflect USD‑per‑ton differences between index and strike.


