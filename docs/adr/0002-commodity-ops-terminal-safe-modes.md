# Commodity Ops Terminal Safe Modes

The agent terminal pattern for Cropto uses `readonly`, `demo` and `operator` modes instead of any autonomous trading mode. This keeps agents useful for market scanning, indexed exposure review, BID/OFFER/TRADE drafting, Telegram/report previews and scheduler checks while requiring preview, explicit confirmation, idempotency and audit logging before any operator dispatch. Operator dispatch is a Cropto ops workflow, not physical trade execution, clearing or real-money settlement.
