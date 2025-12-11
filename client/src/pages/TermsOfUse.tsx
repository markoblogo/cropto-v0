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

