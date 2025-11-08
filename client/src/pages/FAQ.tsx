import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Header } from "@/components/Header";

export default function FAQ() {
  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">Frequently Asked Questions</CardTitle>
            <CardDescription>
              Common questions about the Cropto platform and crypto options trading
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1" data-testid="faq-what-is-cropto">
                <AccordionTrigger>What is Cropto?</AccordionTrigger>
                <AccordionContent>
                  Cropto is a cryptocurrency options trading platform that enables users to create, 
                  trade, and manage crypto options contracts (calls and puts). It uses an off-chain 
                  order book system with a matching engine to facilitate efficient trading.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" data-testid="faq-how-to-create-option">
                <AccordionTrigger>How do I create an option?</AccordionTrigger>
                <AccordionContent>
                  To create an option:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Log in to your account</li>
                    <li>Click the "Create Option" button in the header</li>
                    <li>Fill in the option details (title, strike price, quantity, premium, buyer address)</li>
                    <li>Submit the form - your option will be created with OPEN status</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" data-testid="faq-what-is-matching">
                <AccordionTrigger>What is the matching process?</AccordionTrigger>
                <AccordionContent>
                  The matching engine connects buyers and sellers for options contracts. When an option 
                  is in OPEN status, a broker can match it by providing a seller's Ethereum address. 
                  Once matched, the option status changes to FILLED and becomes exercisable.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" data-testid="faq-nft-minting">
                <AccordionTrigger>How does NFT minting work?</AccordionTrigger>
                <AccordionContent>
                  After an option is FILLED or EXERCISED, the option owner (issuer or buyer) can mint 
                  it as an ERC-721 NFT on the Polygon Amoy testnet. The NFT includes metadata about the 
                  option and can be viewed on PolygonScan. Each option can only be minted once.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" data-testid="faq-margin-calls">
                <AccordionTrigger>What are margin calls?</AccordionTrigger>
                <AccordionContent>
                  Margin calls occur when the collateral value of an option position falls below the 
                  required threshold. The system automatically monitors positions and issues margin calls 
                  when needed. Users can top up their collateral to meet the margin requirement or the 
                  position may be force-settled.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" data-testid="faq-roles">
                <AccordionTrigger>What are the different user roles?</AccordionTrigger>
                <AccordionContent>
                  Cropto has three user roles:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><strong>Farmer:</strong> Can create and trade options, exercise positions</li>
                    <li><strong>Trader:</strong> Can trade options and participate in the marketplace</li>
                    <li><strong>Broker:</strong> Admin role with access to matching, reconciliation, and index management</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" data-testid="faq-blockchain">
                <AccordionTrigger>Which blockchain does Cropto use?</AccordionTrigger>
                <AccordionContent>
                  Cropto uses the Polygon Amoy testnet for on-chain features. This includes:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>CROPT ERC-20 token for platform currency</li>
                    <li>CroptOptionNFT ERC-721 contract for tokenizing options</li>
                    <li>All transactions can be viewed on PolygonScan</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-8" data-testid="faq-wallet-connection">
                <AccordionTrigger>How do I connect my wallet?</AccordionTrigger>
                <AccordionContent>
                  You can connect your wallet in two ways:
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li><strong>MetaMask:</strong> Click "Connect Web3" and approve the connection in MetaMask</li>
                    <li><strong>Manual:</strong> Enter your Ethereum address directly in the wallet input field</li>
                  </ol>
                  Make sure you're on the Polygon Amoy testnet for on-chain features.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-9" data-testid="faq-portfolio">
                <AccordionTrigger>How do I track my portfolio?</AccordionTrigger>
                <AccordionContent>
                  The Portfolio page shows your complete position overview including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Total positions and P&L across all options</li>
                    <li>Individual option performance metrics</li>
                    <li>Unrealized and realized gains/losses</li>
                    <li>Position breakdown by status</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-10" data-testid="faq-demo-accounts">
                <AccordionTrigger>Are there demo accounts available?</AccordionTrigger>
                <AccordionContent>
                  Yes! You can use these demo accounts to explore the platform:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>farmer@demo (password: pass) - Farmer role</li>
                    <li>trader@demo (password: pass) - Trader role</li>
                    <li>broker@demo (password: pass) - Broker role with admin access</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
