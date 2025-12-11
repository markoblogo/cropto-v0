### Margin & Collateral on Cropto

- Sellers lock **initial margin** (collateral) when an option is matched.
- Collateral is a % of notional and scales with time to expiry (5% / 10% / 20% tiers).
- **usePremiumAsMargin:** premium can offset initial margin; shortfall is collateral.
- **Margin call:** triggered when intrinsic value approaches collateral; top-up is required.
- **Liquidation:** if margin call is not met, the position can be force-settled to protect counterparties.
