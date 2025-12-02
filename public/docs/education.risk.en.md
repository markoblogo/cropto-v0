# Risk, collateral and margin

Because options can pay out large amounts when markets move, Cropto uses collateral to manage risk.

When you **sell (write)** an option:

- part of the notional value is set aside as **locked collateral**;
- this collateral is linked to the option until it expires, is exercised or force‑settled;
- in the portfolio you see a summary of total locked collateral across all short positions.

As markets move, the platform tracks the **intrinsic value** of each option:

- if intrinsic value starts to approach collateral, your **risk level** increases;
- above a threshold the system may raise a **margin call** — a request to top up collateral;
- if margin is not topped up, the option can be force‑settled or liquidated in favour of the buyer.

In the pilot we intentionally keep the model simple and transparent so that farmers, traders and processors can clearly see:

- how much collateral is locked,
- how sensitive it is to price moves,
- і what happens if they ignore margin calls.


