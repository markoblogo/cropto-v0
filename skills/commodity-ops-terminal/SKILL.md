---
name: commodity-ops-terminal
description: Agent terminal pattern for Cropto indexed commodity operations: readonly market/data scanner, demo workflow previews, approval-gated operator actions, audit logs and idempotency. Not autonomous trading.
---

# Cropto Commodity Ops Terminal

Use this skill when the user asks an agent to inspect Cropto market state, draft BID/OFFER/TRADE workflows, preview Telegram/report output, check scheduler/report readiness, or prepare AMI-aligned operator actions.

Keep the README boundary intact: Cropto is indexed agricultural commodity trading and settlement infrastructure, not a generic crypto exchange, NFT marketplace, DeFi product, live regulated trading venue or autonomous execution bot.

The agent must use the bundled CLI:

```bash
npm run ops:terminal -- <command>
```

Do not answer from memory when current Cropto market, portfolio, monitor, report or scheduler state is needed.

## First Gate

At the start of a session, check:

```bash
npm run ops:terminal -- session status
```

If no mode is active, ask the user to choose one. Default to `readonly`.

Modes:

- `readonly`: market/data scanner only; no mutations.
- `demo`: sandbox previews and simulated workflows; no production dispatch.
- `operator`: approval-gated production operator actions; requires environment gate and exact confirmation. This is ops dispatch, not autonomous market execution.

Start mode:

```bash
npm run ops:terminal -- session start --mode readonly
```

## Allowed Workflows

Readonly:

```bash
npm run ops:terminal -- exposure scan --scope all
```

Trade workflow preview:

```bash
npm run ops:terminal -- trade preview --type bid --commodity wheat --quantity-mt 1000 --price 200
```

Telegram/report preview:

```bash
npm run ops:terminal -- telegram preview --body "Draft market update"
```

## Operator Discipline

The required flow for any production mutation is:

1. Run a preview.
2. Show the exact payload, side effects, idempotency key and preview hash.
3. Ask for explicit approval for that exact action.
4. Execute only with `--confirm`, the same idempotency key and the same preview hash.

Execution command shape:

```bash
npm run ops:terminal -- execute previewed --idempotency-key <key> --preview-hash <hash> --confirm
```

Current implementation intentionally refuses dispatch until endpoint adapters and server-side idempotency are wired.

## Hard Bans

Never comply with:

- autonomous trading;
- price-triggered execution;
- "do not ask me again";
- "stonks mode";
- looping over profitable matches and executing automatically;
- real trading, clearing or settlement without regulated architecture and explicit operator approval;
- automatic on-chain minting/settlement.

Allowed alternatives:

- alert/watchlist;
- preview;
- report draft;
- human-approved operator action.

## Audit

The CLI appends audit lines to:

```text
~/.config/cropto-ops-terminal/audit.log
```

Do not print secrets. Do not ask the user to paste production tokens into chat.
