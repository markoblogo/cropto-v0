# Commodity Ops Terminal Pattern for Cropto

## Purpose

Cropto should adapt the `t-invest-skill` pattern as an agent terminal for indexed commodity-market operations, not as an autonomous trading bot.

The target is a **commodity ops assistant / market cockpit assistant** for:

- AMI-aligned indexed commodity workflows across Cropto, MN7R/Monitor, 1D3X and SPIKE reference data;
- indexed spot-market and exposure scanning;
- document, contract-state and settlement-traceability checks;
- BID/OFFER/TRADE workflow drafting;
- Telegram relay and report previews;
- scheduler/job status checks;
- auditability and reproducible operator actions.

It must not become a "stonks mode", autonomous trading system or live regulated venue. Blockchain and tokenization remain optional trust/verification mechanics for documents, contract states and settlement traceability, not speculative assets.

## Reference Pattern

Useful transferable ideas from `nyxandro/t-invest-skill`:

- agent-facing skill delegates current data/actions to a bundled CLI;
- CLI owns access modes, not the agent memory;
- `session start/status/end` is a persistent gate;
- readonly/sandbox/full-style modes are separate capabilities;
- mutation flow is `preview -> explicit confirm -> execute`;
- every mutation has an idempotency key before dispatch;
- audit log is append-only and best-effort;
- evals cover dangerous prompts and refusal boundaries.

## Cropto Safe-Mode Model

### `readonly`

Default mode. No mutations.

Allowed:

- market dashboard scan;
- portfolio/exposure scan;
- open BID/OFFER/TRADE scan;
- report readiness scan;
- scheduler/status checks;
- Telegram/report preview from existing data.

Denied:

- creating entries;
- editing/cancelling entries;
- sending Telegram messages;
- running settlement/margin jobs;
- any on-chain mint/settlement action.

### `demo`

Sandbox/demo mode. Safe for mock workflows only.

Allowed:

- draft BID/OFFER/TRADE payloads;
- simulate matching/exposure effects;
- generate Telegram/report previews;
- append audit entries for simulated actions.

Denied:

- real Telegram send;
- production DB mutation;
- settlement/margin job execution;
- on-chain minting or settlement.

### `operator`

Approval-gated production operator mode.

Allowed only with:

- active `operator` session;
- environment gate, e.g. `CROPTO_OPS_ALLOW_OPERATOR_ACTIONS=true`;
- explicit `--confirm`;
- an idempotency key;
- audit log append before/after dispatch;
- endpoint-specific server auth such as `JOB_RUNNER_SECRET`, JWT, broker auth or Telegram identity;
- adapter-specific proof that the action is an ops workflow, not financial auto-execution.

Candidate actions:

- create/update/cancel BID/OFFER/TRADE entries;
- send Telegram relay/report;
- run controlled scheduler/job endpoints;
- mark operational status transitions.

Denied even in operator mode:

- autonomous trading;
- price-triggered self-execution;
- looping execution;
- "do not ask me again" confirmation bypass;
- live financial trading, clearing or real-money settlement without separate regulated architecture;
- public-chain mint/settlement without a dedicated on-chain approval path.

## Mandatory Mutation Flow

1. `preview`
   - Validate payload.
   - Resolve derived fields.
   - Show target endpoint/channel, side effects and risk notes.
   - Generate or display an idempotency key.
   - Write no production data.

2. User confirmation
   - Must be specific to the exact action and current preview.
   - Generic "always approve" or "continue automatically" is invalid.

3. `execute --confirm --idempotency-key <key>`
   - Revalidate session and gates.
   - Recompute or load preview hash.
   - Refuse if preview hash and execution payload differ.
   - Dispatch the approved Cropto ops action once.
   - Append audit entry.

`execute` is a CLI verb for approved operator dispatch. It is not permission to trade automatically, clear regulated instruments or move real funds.

## Audit Log

Default local path:

```text
~/.config/cropto-ops-terminal/audit.log
```

Each line should include:

- timestamp;
- mode;
- action;
- target;
- status;
- idempotency key;
- preview hash;
- actor/session id;
- endpoint/channel if known;
- error code if refused.

## Idempotency

All operator actions need a caller-supplied or CLI-generated idempotency key.

Recommended format:

```text
cropto_<action>_<uuid>
```

For server-side execution, Cropto should persist idempotency keys per action class to prevent duplicate entry creation, duplicate Telegram sends or duplicate job execution.

## Autonomous Trading Ban

Cropto must explicitly reject prompts like:

- "watch the market and trade when price hits X";
- "send/execute all good offers automatically";
- "run every profitable match";
- "do not ask for confirmation again";
- "enable stonks mode";
- "trade with real funds";
- "clear/settle real money";
- "mint or settle on-chain automatically".

Allowed replacement:

- create a watchlist;
- produce alerts;
- draft a report;
- prepare a preview for human approval.

For Cropto, these alternatives preserve the product boundary from the README: indexed commodity workflows, document verification, settlement traceability and chain-optional infrastructure.

## First Implementation Slice

This repository starts with a safe skeleton:

- `scripts/commodity-ops-terminal.ts`
- `npm run ops:terminal -- ...`
- session gate: `status/start/end`;
- modes: `readonly`, `demo`, `operator`;
- preview commands:
  - `exposure scan`
  - `trade preview`
  - `telegram preview`
- audit log append;
- idempotency key generation;
- operator `execute` gate that currently refuses because dispatch adapters are not wired.

The skeleton is intentionally conservative. Real execution adapters should be added only after endpoint-level auth, idempotency persistence and regression evals are in place.
