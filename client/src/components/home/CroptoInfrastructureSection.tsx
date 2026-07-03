import { BadgeCheck, FileCheck2, Layers3, Link2, ShieldCheck, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const proofs = [
  {
    title: "Document-bound verifiable records",
    description: "NFT-like document records demonstrate how contracts and evidence can be represented as document-bound verification records, not collectible assets.",
    Icon: FileCheck2,
  },
  {
    title: "Tokenized settlement experiments",
    description: "Polygon Amoy testnet flows prove settlement traceability, CROPT accounting-unit logic, and contract-state recording for demo instruments.",
    Icon: Link2,
  },
  {
    title: "Indexed spot/options architecture",
    description: "Market modules support local commodity indices, spot/forward workflows, options, margin monitoring, and index-based settlement logic.",
    Icon: Workflow,
  },
  {
    title: "Brokerage and market memory",
    description: "Monitor modules cover BID/OFFER/TRADE workflows, contracts, market history, and physical-market signals that can feed indexed risk tools.",
    Icon: Layers3,
  },
];

export function CroptoInfrastructureSection() {
  return (
    <section className="bg-background py-8">
      <div className="container mx-auto space-y-5 px-4 sm:px-6 lg:px-8">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Status</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight">Paused standalone development, functional prototype</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
            Cropto standalone development is currently paused while the AMI ecosystem expands through MN7R, 1D3X and SPIKE.
            The platform remains a functional prototype with implemented document-tokenization and tokenized-settlement experiments.
            The current codebase has been hardened around API rate limits, operational job guards and role-escalation controls.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border bg-card p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Ecosystem role</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Cropto is the indexed trading and settlement layer of the AMI ecosystem.</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              1D3X provides local benchmark infrastructure. SPIKE provides Ukrainian physical-market indices. Cropto uses these indices
              as reference prices for indexed spot, options and risk-management workflows.
            </p>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3"><strong>MN7R / Monitor:</strong> brokerage workflows, BID/OFFER/TRADE, contracts, market memory.</div>
              <div className="rounded-md border bg-muted/30 p-3"><strong>1D3X / SPIKE:</strong> local commodity and logistics benchmark indices.</div>
              <div className="rounded-md border bg-muted/30 p-3"><strong>Cropto:</strong> indexed spot/options trading, document verification and settlement traceability.</div>
              <div className="rounded-md border bg-muted/30 p-3"><strong>Regulated partners:</strong> clearing, custody, payment rails and risk instruments.</div>
            </div>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-wide">Not a crypto exchange</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground/85">
              Cropto does not use tokenization to create speculative NFTs or unrelated public crypto assets. Tokenization is an
              infrastructure mechanism for document verification, contract-state records, settlement traceability and indexed
              commodity-risk workflows. The core asset is a verified commodity-market obligation, index exposure, contract state
              or settlement record.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">Technical proofs already implemented</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {proofs.map(({ title, description, Icon }) => (
              <Card key={title}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-5 text-muted-foreground">
                  {description}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
