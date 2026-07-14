# 1D3X Cortex Integration

Status: active ecosystem product, Cropto source-consumer rollout
Updated: 2026-07-14

1D3X Cortex is the active internal intelligence product for Index Platform,
MN7R, Cr0pto and related agro-commodity resources. In Cropto, its current
rollout is source-manifest and consumer-contract based: it supplies approved
evidence, market context and governed-tool context for future indexed trading,
document verification and settlement assistant surfaces.

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
- public site/deck content, product docs, scenario docs, technical proof
  descriptions and archived partner-facing materials.
- repository code, tests, contracts, route contracts, plans, runbooks and
  development notes when the standalone product is revived or reviewed.
- future approved action/event history from trading, settlement or document
  workflows only after explicit redaction, permissions and audit contracts.

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
- Cortex can analyze Cropto code, docs, plans, archives and action history for
  recommendations, but must separate implemented behavior from planned,
  prototype, stale or partner-dependent work.
- Public Cr0pto pages can be indexed as `public`; prototype internals default to
  `internal`; any partner, account, wallet or settlement-sensitive material is
  `protected` or `secret`.

## First Useful Slice

The first Cr0pto slice is documented and source-manifest enabled rather than
runtime-enabled because standalone development is currently paused. Cr0pto can
export an approved local inventory for Index-hosted Cortex:

```bash
npm run cortex:source-manifest -- --out=.cortex/cropto-source-manifest.json
```

The manifest covers approved docs, public surfaces, code, runbooks and plans;
it excludes `.env`, secrets, `node_modules`, build outputs and local Cortex
artifacts. Public Markdown docs are marked `public`; implementation and
prototype internals default to `internal`.

When revived, Cr0pto should consume the Index-hosted Cortex ledger and on-demand
builder through the same internal contracts used by MN7R:

```txt
GET /api/internal/cortex/context-packs
Authorization: Bearer <CROPT_CORTEX_INTERNAL_API_SECRET>
```

```txt
POST /api/internal/cortex/context-pack
Authorization: Bearer <CROPT_CORTEX_INTERNAL_API_SECRET>
Content-Type: application/json
```

Recommended environment variables:

- `CROPT_CORTEX_CONTEXT_PACKS_URL`
- `CROPT_CORTEX_CONTEXT_PACK_URL`
- `CROPT_CORTEX_INTERNAL_API_SECRET`

The default Cr0pto client should read bounded metadata first: target, source
IDs, visibility, metrics, query and pack hash. Full pack JSON should be
requested only by an explicitly reviewed assistant workflow.
When an assistant needs fresh context, it should call the builder with a
bounded query, purpose, filters, `maxEvidence` and `maxTokens`. `allowProtected`
must stay false unless the revived Cr0pto workflow has explicit partner/legal
approval and redaction for that data class.

Next implementation slices:

1. Feed `.cortex/cropto-source-manifest.json` into the Index-hosted Cortex
   runtime artifact build:

   ```bash
   npm run cortex:artifact-build -- \
     --cropto-manifest=.cortex/cropto-source-manifest.json \
     --require-project=index \
     --require-project=mn7r \
     --require-project=cropto \
     --min-chunks=100
   ```

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
