# Mini‑FAQ

### Do I need a wallet?

For the pilot you can either:

- connect a MetaMask wallet on Polygon Amoy testnet for testnet verification records, or
- use a demo account with an internally managed address.

### Where are CROPT tokens stored?

On testnet CROPT exists both:

- **on‑chain** as an ERC‑20 testnet unit on Polygon Amoy, and
- **internally** in Cropto’s ledger for spot trading and P&L.

### What is the difference between spot and an option?

- **Spot** gives you direct exposure to the index price — your P&L moves 1:1 with the index.
- **Option** is a right with a limited cost (premium) and asymmetric payoff around the strike.

### What happens on the expiry date?

On expiry the platform:

1. reads the relevant index price for that date;
2. calculates intrinsic value vs strike;
3. settles P&L between buyer and seller in CROPT and updates positions.

### How are index prices calculated?

For the pilot, index prices are built from:

- quotes from Ukrainian brokers and exporters,
- manual validation and overrides by the Cropto team.

In production, this would be backed by stricter data feeds and governance, but the UX for options and spot remains the same.

### Can I exit earlier than expiry?

In a full production setup you could:

- close or roll positions by trading the opposite option,
- unwind spot exposure against the index.

In the current pilot we focus on **creating, matching and exercising** a small set of demo contracts to validate flows and risk logic.

