import { MainLayout } from "@/components/layouts/MainLayout";

export default function PrivacyPolicy() {
  return (
    <MainLayout>
      <div className="space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Last updated: {new Date().toLocaleDateString()}
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cropto is a prototype platform for trading and risk-management of commodity-linked instruments. This Privacy
            Policy explains how we collect, use and protect personal data of users who access or test the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data We Collect</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Identification data (name, email address, organization).</li>
            <li>Technical data (IP address, browser type, device information, log files).</li>
            <li>
              Usage data (visited pages, interactions with trading and analytics modules). During development data may be
              stored with third-party infrastructure providers (hosting, databases, analytics).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Legal Basis and Purpose of Processing</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Providing access to demo functionality of the platform.</li>
            <li>Support, debugging, and enhancement of the service.</li>
            <li>Compliance with regulatory requirements, where applicable.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Personal data is not used for marketing communications without separate consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data Sharing and Transfers</h2>
          <p className="text-muted-foreground leading-relaxed">
            Access to data is limited to authorized Cropto personnel and partners involved in development and support of
            the platform. Data is not sold or transferred to third parties for their own marketing purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Data Security and Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            Data is protected by technical and organizational measures. Retention is limited to the period necessary for
            development and testing, after which data may be anonymized or deleted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">User Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            Users may request access, correction, or deletion of their data by contacting the Cropto team at the
            designated contact address.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Changes to This Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update this policy periodically. The current version is always available on this page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Payment Terms and Settlement</h2>
          <p className="text-muted-foreground leading-relaxed">
            Cropto instruments are quoted and settled in CROPT and are index-settled (cash-settled) against the Spike
            Spot Index (CPT Odesa). There is no physical delivery of commodities. Forward-style CROPT contracts remain
            in development (WIP); references are descriptive only.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Use of Emails and Identifiers</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use email addresses, user IDs, and wallet identifiers to operate the platform: processing option actions,
            sending notifications (e.g., margin calls, settlements), and keeping audit trails. We do not sell or share
            these identifiers for marketing.
          </p>
        </section>
      </div>
    </MainLayout>
  );
}

