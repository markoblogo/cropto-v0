### Spot vs Forward vs Options

- **Spot tokens:** track current index price in CROPT; best for immediate exposure.
- **Forwards (simulated via options structures):** lock price for future delivery windows (CROPT forward market is WIP; descriptive only).
- **Options:** Cropto options are **index-settled, cash-settled** on the **Spike Spot Index (CPT Odesa)**, with **no physical delivery**. They provide asymmetric payoff: buy protection (PUT) or upside (CALL) with limited loss (premium).
- Use spot for simple exposure, options for hedging or convexity, and forwards (or option combos) to lock prices.
