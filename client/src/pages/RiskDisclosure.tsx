import { MainLayout } from "@/components/layouts/MainLayout";

export default function RiskDisclosure() {
  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Risk Disclosure</h1>
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">General Risk Warning</h2>
          <p className="text-muted-foreground leading-relaxed">
            Transactions with derivatives on agricultural commodities, price indexes, and other derivative instruments
            carry a high level of risk. Significant price fluctuations and total loss of invested funds are possible.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Market and Liquidity Risks</h2>
          <p className="text-muted-foreground leading-relaxed">
            Prices for grains and oilseeds depend on weather, logistics, regulatory constraints, and other factors.
            Certain instruments may lack sufficient liquidity.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Counterparty and Operational Risks</h2>
          <p className="text-muted-foreground leading-relaxed">
            In real trading there may be risks of counterparty default, technical failures, and accounting or settlement
            errors. The current Cropto version models such processes in a test environment.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">No Guarantee of Performance</h2>
          <p className="text-muted-foreground leading-relaxed">
            Historical data, simulated scenarios, and charts do not guarantee similar results in the future.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Demo Environment Disclaimer</h2>
          <p className="text-muted-foreground leading-relaxed">
            The current Cropto version is intended for prototyping and testing. Any displayed trades and metrics are
            conditional and do not create legally binding obligations or rights.
          </p>
        </section>
      </div>
    </MainLayout>
  );
}

