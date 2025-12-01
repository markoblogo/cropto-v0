import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Book, Users, Shield, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function Docs() {
  return (
    <MainLayout>
      <div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Learn how to use Cropto for grain market options trading
          </p>
        </div>

        {/* What is Cropto */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Book className="h-5 w-5 text-primary" />
              What is Cropto?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Cropto is a next-generation platform for trading agricultural commodity options backed by NFTs. 
              We bring transparency, accessibility, and innovation to grain markets through blockchain technology.
            </p>
            <p>
              Our platform enables farmers, traders, and brokers to create, trade, and settle commodity options 
              with unprecedented ease and security. Every option is represented as an NFT, ensuring immutable 
              proof of ownership and trade history.
            </p>
          </CardContent>
        </Card>

        {/* How it Works */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">1. Create Options</h3>
                <p className="text-muted-foreground">
                  Define your option parameters: commodity type, strike price, quantity, and premium. 
                  Options can be CALL (right to buy) or PUT (right to sell).
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">2. Match with Counterparties</h3>
                <p className="text-muted-foreground">
                  Browse the marketplace to find suitable options. When you find a match, the platform 
                  automatically pairs buyers with sellers and records the trade.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">3. Exercise & Settle</h3>
                <p className="text-muted-foreground">
                  When conditions are favorable, exercise your option by inputting the current spot price. 
                  The platform calculates your payout and profit/loss automatically.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* For Partners */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Partner Instructions
            </CardTitle>
            <CardDescription>
              Guidelines for institutional partners and service providers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Prime Brokers</h3>
              <p className="text-muted-foreground">
                Integrate with our API to provide liquidity and facilitate trades for your clients. 
                Access institutional-grade analytics and reporting tools.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Custody Providers</h3>
              <p className="text-muted-foreground">
                Secure storage of NFT-backed options with multi-signature support. 
                Integration documentation available in the API reference.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Liquidity Providers</h3>
              <p className="text-muted-foreground">
                Market-making opportunities with competitive fee structures. 
                Contact our partnerships team to discuss integration.
              </p>
            </div>

            <div className="pt-4">
              <Button variant="outline" asChild>
                <Link href="/partners-contracts">
                  View Partner Agreements
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Security & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Cropto employs industry-leading security practices to protect your assets and data:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>End-to-end encryption for all transactions</li>
              <li>Multi-signature wallet support</li>
              <li>Regular security audits by ChainGuard Security</li>
              <li>Compliance with international commodity trading regulations</li>
              <li>Transparent on-chain settlement records</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
