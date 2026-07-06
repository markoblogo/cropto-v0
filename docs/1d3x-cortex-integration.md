# 1D3X Cortex Integration

Status: planning
Updated: 2026-07-06

1D3X Cortex is the planned ecosystem intelligence layer for Index Platform,
MN7R, Cr0pto and related agro-commodity resources. In Cropto, Cortex should work
inside future assistant surfaces as an upstream evidence, market-context and
governed-tool layer for indexed trading, document verification and settlement
pilots.

## Lifecycle In Cropto

1. `observe-learn`: Cortex reads approved Cr0pto docs, public surfaces, scenario
   data and safe workflow traces to learn how indexed trading, documents and
   settlement are modeled.
2. `assist-propose`: Cortex works with OpenAI API inside future assistant
   surfaces for explanation, analysis, draft preparation and due-diligence packs.
3. `approval-gated-act`: Cortex can prepare tool proposals only after Cr0pto has
   explicit permissions, exact confirmation, idempotency and audit for the target
   workflow.
4. `bounded-autonomy`: later autonomy can be enabled only per regulated, tested
   capability after partner, legal, risk and infrastructure decisions.

## Cropto Role

Cropto consumes Cortex context packs, learning signals and governed tool
proposals for:

- index-linked spot, forward and options-style workflows;
- market-context summaries around indexed exposure;
- document and settlement review briefs;
- source-backed explanation of index, monitor and market signals;
- assistant chat and draft preparation around scenarios, documents and pilot
  due-diligence;
- pilot due-diligence packs for partner discussions.

Cropto contributes only public or explicitly approved internal context until the
product is revived under a scoped pilot.

## Safety Contract

- Cortex does not autonomously make trading, settlement, transfer, minting,
  margin, force settlement or clearing decisions in the first phases.
- On-chain and settlement workflows require explicit Cropto tool contracts,
  permissions, exact confirmation, idempotency and audit before any Cortex-driven
  proposal can be executed.
- Any later autonomy must be limited to explicitly approved capabilities, not a
  general product-wide permission.
- External LLM calls receive only bounded Cortex context packs, not raw wallet,
  private-key, counterparty, payment or settlement records.
- Public Cr0pto pages can be indexed as `public`; prototype internals default to
  `internal`; any partner, account, wallet or settlement-sensitive material is
  `protected` or `secret`.

## First Useful Slice

1. Register Cr0pto public surfaces and docs in the Cortex source registry.
2. Map Cropto instruments to Index Platform commodities and basis labels.
3. Build one context pack that explains an indexed trading scenario with public
   index evidence.
4. Let a future assistant use that pack for explanation and draft preparation.
5. Keep transaction, settlement and on-chain execution behind explicit tool
   contracts, approvals and audit before any Cortex-driven action can execute.

## Out Of Scope

- autonomous trading or settlement;
- clearing, custody or payment automation;
- wallet/private-key handling;
- regulatory claims;
- live financial venue behavior.
