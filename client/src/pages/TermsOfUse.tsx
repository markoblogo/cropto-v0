import { MainLayout } from "@/components/layouts/MainLayout";

export default function TermsOfUse() {
  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Terms of Use</h1>
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Scope and Acceptance</h2>
          <p className="text-muted-foreground leading-relaxed">
            These Terms of Use govern access to and use of the Cropto prototype platform. By accessing the site or using
            the functionality, you confirm your agreement with these Terms.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Non-Production Environment</h2>
          <p className="text-muted-foreground leading-relaxed">
            The platform is provided “as is” solely for demonstration and testing purposes. It is not a licensed trading
            venue, broker, or financial advisor.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">No Investment Advice</h2>
          <p className="text-muted-foreground leading-relaxed">
            Any information, prices, indexes, analytics, or simulated trades are informational and educational only and
            do not constitute individual investment advice.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">User Responsibilities</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Provide accurate information during registration.</li>
            <li>Do not perform actions that compromise the security or stability of the platform.</li>
            <li>Use the platform solely within testing and demonstration purposes.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Intellectual Property</h2>
          <p className="text-muted-foreground leading-relaxed">
            All rights to code, design, logos, indexes, and related materials belong to Cropto or its licensors. Any
            unauthorized copying or use is prohibited.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Limitation of Liability</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cropto is not liable for any direct or indirect damages arising from use or inability to use the platform,
            including quote errors, delays, outages, or data loss.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Payment Terms and Settlement</h2>
          <p className="text-muted-foreground leading-relaxed">
            Platform amounts are quoted and settled in CROPT. Instruments are index-linked and cash-settled against the
            Spike Spot Index (CPT Odesa). There is no physical delivery of commodities and no post-delivery obligations.
            Forward-style CROPT contracts are non-deliverable; any references are descriptive and not a commitment to
            provide physical settlement.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Product Description</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cropto options are index-settled, cash-settled contracts on grain indices (e.g., Spike Spot CPT Odesa).
            Settlement uses index prices; there is no physical grain delivery and no after-delivery risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Spot-Forward Market</h2>
          <p className="text-muted-foreground leading-relaxed">
            Forward contracts on the platform are non-deliverable (cash-settled) forwards on grain indexes such as Corn,
            Wheat 11.5, Feed Wheat, Soy GMO, and Sunflower processing. Settlement occurs in CROPT versus the Spike Spot
            index (CPT Odesa) with the formula: PnL = (SettlementPrice – ContractPrice) × Quantity. Positions use margin
            (initial margin plus margin calls), and overdue margin can be auto-liquidated. The legal force is an
            electronic agreement inside the platform, not a GAFTA-style physical delivery contract; disputes are handled
            off-chain without built-in arbitration.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Fees</h2>
          <p className="text-muted-foreground leading-relaxed">
            Matching and settlement fees apply per side for forward trades: matching_fee = 0.125 CROPT/ton and
            settlement_fee = 0.125 CROPT/ton. With both sides paying both fees, the platform earns 0.50 CROPT/ton in
            total on a completed forward trade. Applicable fees are shown in the interface before you confirm actions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Disclaimer</h2>
          <p className="text-muted-foreground leading-relaxed">
            The platform is a demo/non-regulated environment provided “as is”. No warranties are given. Products are for
            educational/testing purposes and do not constitute investment advice or a licensed trading venue. Use at your
            own risk.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Governing Law and Dispute Resolution</h2>
          <p className="text-muted-foreground leading-relaxed">
            Relationships may be subject to the law of a jurisdiction selected by Cropto. Specific jurisdiction and
            dispute resolution procedures may be defined in individual agreements with partners.
          </p>
        </section>
      </div>
    </MainLayout>
  );
}

