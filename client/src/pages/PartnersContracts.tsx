import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BackToDashboard } from "@/components/BackToDashboard";

const partners = [
  {
    id: 1,
    name: "BlockTrade Partners",
    contact: "contact@blocktrade.io",
    relationship: "Prime Broker",
    status: "active",
    contractCount: 3,
  },
  {
    id: 2,
    name: "CryptoVault Inc",
    contact: "partnerships@cryptovault.com",
    relationship: "Custody Provider",
    status: "active",
    contractCount: 2,
  },
  {
    id: 3,
    name: "DeFi Solutions Ltd",
    contact: "admin@defisolutions.xyz",
    relationship: "Liquidity Provider",
    status: "pending",
    contractCount: 1,
  },
  {
    id: 4,
    name: "ChainGuard Security",
    contact: "security@chainguard.io",
    relationship: "Security Auditor",
    status: "active",
    contractCount: 1,
  },
];

const contracts = [
  {
    id: "CTR-2024-001",
    partnerId: 1,
    partnerName: "BlockTrade Partners",
    value: "$2,500,000",
    startDate: "2024-01-15",
    endDate: "2025-01-14",
    status: "active",
  },
  {
    id: "CTR-2024-002",
    partnerId: 1,
    partnerName: "BlockTrade Partners",
    value: "$1,800,000",
    startDate: "2024-03-01",
    endDate: "2025-02-28",
    status: "active",
  },
  {
    id: "CTR-2024-003",
    partnerId: 1,
    partnerName: "BlockTrade Partners",
    value: "$3,200,000",
    startDate: "2024-06-01",
    endDate: "2026-05-31",
    status: "active",
  },
  {
    id: "CTR-2024-004",
    partnerId: 2,
    partnerName: "CryptoVault Inc",
    value: "$950,000",
    startDate: "2024-02-10",
    endDate: "2025-02-09",
    status: "active",
  },
  {
    id: "CTR-2024-005",
    partnerId: 2,
    partnerName: "CryptoVault Inc",
    value: "$1,100,000",
    startDate: "2024-07-15",
    endDate: "2025-07-14",
    status: "active",
  },
  {
    id: "CTR-2024-006",
    partnerId: 3,
    partnerName: "DeFi Solutions Ltd",
    value: "$750,000",
    startDate: "2024-09-01",
    endDate: "2025-08-31",
    status: "pending",
  },
  {
    id: "CTR-2024-007",
    partnerId: 4,
    partnerName: "ChainGuard Security",
    value: "$180,000",
    startDate: "2024-04-20",
    endDate: "2024-10-20",
    status: "completed",
  },
];

export default function PartnersContracts() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Partners & Contracts</h1>
            <p className="text-muted-foreground mt-1">
              Manage institutional partnerships and service agreements
            </p>
          </div>
          <BackToDashboard />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Partner Organizations</CardTitle>
            <CardDescription>
              Active and pending institutional partners
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contracts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                    <TableCell className="font-medium" data-testid={`text-partner-name-${partner.id}`}>
                      {partner.name}
                    </TableCell>
                    <TableCell data-testid={`text-partner-contact-${partner.id}`}>
                      {partner.contact}
                    </TableCell>
                    <TableCell data-testid={`text-partner-relationship-${partner.id}`}>
                      {partner.relationship}
                    </TableCell>
                    <TableCell data-testid={`badge-partner-status-${partner.id}`}>
                      <Badge
                        variant={
                          partner.status === "active"
                            ? "default"
                            : partner.status === "pending"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {partner.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-partner-contracts-${partner.id}`}>
                      {partner.contractCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Contracts</CardTitle>
            <CardDescription>
              All partnership agreements and service contracts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract ID</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="font-mono" data-testid={`text-contract-id-${contract.id}`}>
                      {contract.id}
                    </TableCell>
                    <TableCell data-testid={`text-contract-partner-${contract.id}`}>
                      {contract.partnerName}
                    </TableCell>
                    <TableCell className="font-mono" data-testid={`text-contract-value-${contract.id}`}>
                      {contract.value}
                    </TableCell>
                    <TableCell data-testid={`text-contract-start-${contract.id}`}>
                      {contract.startDate}
                    </TableCell>
                    <TableCell data-testid={`text-contract-end-${contract.id}`}>
                      {contract.endDate}
                    </TableCell>
                    <TableCell data-testid={`badge-contract-status-${contract.id}`}>
                      <Badge
                        variant={
                          contract.status === "active"
                            ? "default"
                            : contract.status === "pending"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {contract.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
