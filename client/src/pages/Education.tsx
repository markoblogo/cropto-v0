import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Education() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {t("education.title", "Education & Learn")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t(
              "education.subtitle",
              "Understand how Cropto works: indices, spot tokens, options and risk."
            )}
          </p>
        </div>

        <Tabs defaultValue="intro" className="space-y-6">
          <TabsList className="flex flex-wrap justify-start gap-2">
            <TabsTrigger value="intro">Intro</TabsTrigger>
            <TabsTrigger value="indices">Indices</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
            <TabsTrigger value="risk">Risk &amp; Collateral</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
          </TabsList>

          {/* Intro tab */}
          <TabsContent value="intro">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">How Cropto works</h2>
                  <p className="text-sm text-muted-foreground">
                    Cropto is a pilot platform for pricing, hedging and trading grain using local
                    Ukrainian indices and tokenised contracts. Instead of relying only on global
                    futures, Cropto focuses on CPT Odesa / CPT Paritet prices and turns them into
                    spot tokens and index options settled in CROPT.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    The idea is to give producers, buyers and partners a shared language for risk:
                    clear indices, transparent P&amp;L and simple workflows around spot and options.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm">For producers (farmers)</h3>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        <li>Lock a target price for your harvest.</li>
                        <li>Reduce exposure to export and logistics risk.</li>
                        <li>Track local Ukrainian CPT prices instead of global futures.</li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm">For buyers / traders</h3>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        <li>Hedge purchase prices using local grain indices.</li>
                        <li>Trade volatility via options.</li>
                        <li>Use CROPT as a unified settlement unit.</li>
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <h3 className="font-semibold text-sm">For partners</h3>
                      <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                        <li>Integrate index data.</li>
                        <li>Provide liquidity and on/off-ramp services.</li>
                        <li>Build custom strategies on top of Cropto.</li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Indices tab */}
          <TabsContent value="indices">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Indices &amp; Spot Tokens</h2>
                  <p className="text-sm text-muted-foreground">
                    Cropto tracks grain indices that reflect real CPT Odesa export prices and CPT
                    Paritet Odesa processing prices. Export indices are quoted net of VAT, while
                    processing indices include VAT and local handling costs.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Each index has a slug, a category (export / processing) and a trading pair in
                    CROPT. Spot tokens are simply “access to the index” in CROPT units.
                  </p>
                </div>

                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>Corn Index (CROPT/CRNEX) — CPT Odesa, export.</li>
                  <li>Feed Wheat Index (CROPT/FWTEX) — CPT Odesa, export.</li>
                  <li>GMO Soybeans Index (CROPT/SOYEX) — CPT Odesa, export.</li>
                  <li>
                    Processing indices (CROPT/SOYPR, CROPT/RAPPR, CROPT/SUNPR) — domestic processing
                    costs.
                  </li>
                </ul>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Example index pairs</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Commodity</TableHead>
                        <TableHead>Index pair</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Corn</TableCell>
                        <TableCell className="font-mono">CROPT/CRNEX</TableCell>
                        <TableCell>Export</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Feed Wheat</TableCell>
                        <TableCell className="font-mono">CROPT/FWTEX</TableCell>
                        <TableCell>Export</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>GMO Soybeans</TableCell>
                        <TableCell className="font-mono">CROPT/SOYEX</TableCell>
                        <TableCell>Export</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>GMO Soybeans (processing)</TableCell>
                        <TableCell className="font-mono">CROPT/SOYPR</TableCell>
                        <TableCell>Processing</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <p className="text-xs text-muted-foreground">
                  Each spot token is a way to express and settle exposure to the underlying index in
                  CROPT, without moving physical grain.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Options tab */}
          <TabsContent value="options">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Index options</h2>
                  <p className="text-sm text-muted-foreground">
                    Options on Cropto are index-linked contracts on grain prices. Each option can be
                    represented as an NFT, has its premium denominated in CROPT, and an expiry date
                    aligned with delivery or pricing periods for the underlying grain.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Key terms</h3>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>
                      <strong>Underlying index</strong> — chosen grain index (Corn, Wheat, Soy,
                      etc.).
                    </li>
                    <li>
                      <strong>Strike price ($/t)</strong> — target level where you want to fix the
                      price.
                    </li>
                    <li>
                      <strong>Quantity (t)</strong> — size of the contract in tonnes.
                    </li>
                    <li>
                      <strong>Premium (CROPT)</strong> — option cost, paid upfront.
                    </li>
                    <li>
                      <strong>Expiry</strong> — date when the option is either exercised or expires.
                    </li>
                    <li>
                      <strong>Collateral</strong> — CROPT reserved against the risk of the short
                      side.
                    </li>
                  </ul>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 space-y-1">
                      <h3 className="font-semibold text-sm">Farmer hedge</h3>
                      <p className="text-sm text-muted-foreground">
                        A farmer buys a PUT option on the corn index to lock in a minimum price.
                        If the index falls below the strike, the payoff from the option helps
                        offset the lower spot price.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 space-y-1">
                      <h3 className="font-semibold text-sm">Buyer hedge</h3>
                      <p className="text-sm text-muted-foreground">
                        A buyer or processor purchases a CALL option to protect against rising
                        input prices. If the index rallies, option gains help cover more expensive
                        grain.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-4 space-y-1">
                      <h3 className="font-semibold text-sm">Speculative trader</h3>
                      <p className="text-sm text-muted-foreground">
                        A trader uses relatively small premiums to take views on index moves
                        without handling physical grain, profiting from volatility and direction.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Risk & Collateral tab */}
          <TabsContent value="risk">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Risk &amp; Collateral</h2>
                  <p className="text-sm text-muted-foreground">
                    When you take short option risk on Cropto, part of your CROPT balance is locked
                    as collateral. This collateral is there to cover potential payouts if the market
                    moves against your position.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    As prices move, the system monitors intrinsic value and compares it to posted
                    collateral. If it gets too close, margin calls are raised; if calls are ignored,
                    positions can be liquidated to cap losses.
                  </p>
                </div>

                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                  <li>
                    You can monitor your collateral and margin usage on the Portfolio page.
                  </li>
                  <li>
                    A health bar shows your relative risk level versus the allowed threshold.
                  </li>
                </ul>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/portfolio")}
                >
                  Go to Portfolio
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FAQ tab */}
          <TabsContent value="faq">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold">Mini-FAQ</h2>
                  <p className="text-sm text-muted-foreground">
                    Quick answers to the most common questions about the Cropto pilot.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm">Is this mainnet or testnet?</h3>
                    <p className="text-sm text-muted-foreground">
                      The current Cropto environment runs on the Polygon Amoy testnet. CROPT is a
                      test token and contracts are for demonstration and design validation only.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">
                      Do I need USDT or fiat to start?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      For now you only use test CROPT from the faucet and internal balances. In
                      future, on/off-ramp partners will let you top up using bank cards, USDT or
                      other payment rails.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">
                      What is the minimum size of an option?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Minimum contract size is defined by platform settings (for example, tens of
                      tonnes) and may change between pilots as we tune the UX for real users.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">
                      Can I withdraw CROPT to my wallet?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Yes. On-chain CROPT lives in your EVM wallet (MetaMask, etc.), while your
                      internal balance is maintained inside Cropto for spot trading and settlement.
                      You can move CROPT between internal and on-chain balances via the Wallet page.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm">
                      Where can I see all my positions?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      The Portfolio page gives you a consolidated view of your options, spot
                      positions and net exposure by commodity, including P&amp;L and locked
                      collateral.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}


