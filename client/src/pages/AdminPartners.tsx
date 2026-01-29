import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Building2, Users, DollarSign, Activity, AlertTriangle, Shield } from "lucide-react";
import { format } from "date-fns";

interface Partner {
  id: string;
  name: string;
  contactEmail: string;
  relationship: string;
  status: string;
  notes?: string;
  feeSharePercent: string;
  createdAt: string;
  updatedAt: string;
  contractsCount: number;
  activeContractsCount: number;
  totalContractValueUsd: string;
  totalFeesUsd: string;
  totalVolumeUsd: string;
}

interface PartnerDetail {
  partner: {
    id: string;
    name: string;
    contactEmail: string;
    relationship: string;
    status: string;
    notes?: string;
    feeSharePercent: string;
    createdAt: string;
    updatedAt: string;
    modules: string[];
    contractsCount: number;
    activeContractsCount: number;
    completedContractsCount: number;
    totalContractValueUsd: string;
  };
  contracts: Array<{
    id: string;
    contractCode: string;
    valueUsd: string;
    startDate: string;
    endDate: string;
    status: string;
    description?: string;
  }>;
  stats: {
    totalFeesUsd: string;
    totalVolumeUsd: string;
    contractCount: number;
    activeContractValue: string;
    completedContractValue: string;
  };
}

export default function AdminPartners() {
  const [selectedPartner, setSelectedPartner] = useState<PartnerDetail | null>(null);
  const { toast } = useToast();

  const { data: partnersData, isLoading, error } = useQuery({
    queryKey: ["/api/admin/partners"],
    queryFn: async () => {
      const resp = await apiRequest("GET", "/api/admin/partners");
      return resp.json();
    },
  });

  const { data: partnerDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["/api/admin/partners", selectedPartner?.partner.id],
    queryFn: async () => {
      if (!selectedPartner?.partner.id) return null;
      const resp = await apiRequest("GET", `/api/admin/partners/${selectedPartner.partner.id}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load partner details");
      }
      return resp.json();
    },
    enabled: !!selectedPartner?.partner.id,
  });

  const partners = partnersData?.partners || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      active: "default",
      pending: "secondary",
      inactive: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  const getRelationshipIcon = (relationship: string) => {
    switch (relationship) {
      case "prime_broker":
        return <Building2 className="h-4 w-4" />;
      case "custody":
        return <Shield className="h-4 w-4" />;
      case "liquidity_provider":
        return <Activity className="h-4 w-4" />;
      case "security_auditor":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getModulesList = (relationship: string) => {
    switch (relationship) {
      case "prime_broker":
        return ["Options Trading", "Forward Trading", "Portfolio Management"];
      case "custody":
        return ["Asset Custody", "Wallet Management"];
      case "liquidity_provider":
        return ["Market Making", "Liquidity Provision"];
      case "security_auditor":
        return ["Security Auditing", "Compliance Monitoring"];
      default:
        return ["General Services"];
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Partner Organizations</h1>
            <Skeleton className="h-4 w-96" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load partners data. Please try again.
          </AlertDescription>
        </Alert>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Partner Organizations</h1>
            <p className="text-muted-foreground">
              Manage partner relationships and service contracts
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Partners</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{partners.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {partners.filter((p: any) => p.status === 'active').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contracts</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {partners.reduce((sum: number, p: any) => sum + p.contractsCount, 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${partners.reduce((sum: number, p: any) => sum + parseFloat(p.totalContractValueUsd), 0).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Partners Table */}
        <Card>
          <CardHeader>
            <CardTitle>Partner Organizations</CardTitle>
            <CardDescription>
              Click on a partner to view detailed information and contracts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contracts</TableHead>
                  <TableHead className="text-right">Fee Share</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                  <TableHead>Modules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner: any) => (
                  <TableRow
                    key={partner.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedPartner({ partner: {
                      id: partner.id,
                      name: partner.name,
                      contactEmail: partner.contactEmail,
                      relationship: partner.relationship,
                      status: partner.status,
                      notes: partner.notes,
                      feeSharePercent: partner.feeSharePercent,
                      createdAt: partner.createdAt,
                      updatedAt: partner.updatedAt,
                      modules: getModulesList(partner.relationship),
                      contractsCount: partner.contractsCount,
                      activeContractsCount: partner.activeContractsCount,
                      completedContractsCount: 0, // Will be filled from detail query
                      totalContractValueUsd: partner.totalContractValueUsd,
                    }, contracts: [], stats: {
                      totalFeesUsd: partner.totalFeesUsd,
                      totalVolumeUsd: partner.totalVolumeUsd,
                      contractCount: 0,
                      activeContractValue: "0",
                      completedContractValue: "0",
                    }})}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getRelationshipIcon(partner.relationship)}
                        {partner.name}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {partner.relationship.replace('_', ' ')}
                    </TableCell>
                    <TableCell>{getStatusBadge(partner.status)}</TableCell>
                    <TableCell className="text-right">
                      {partner.activeContractsCount}/{partner.contractsCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {partner.feeSharePercent}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${parseFloat(partner.totalContractValueUsd).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {getModulesList(partner.relationship).slice(0, 2).map((module, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {module}
                          </Badge>
                        ))}
                        {getModulesList(partner.relationship).length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{getModulesList(partner.relationship).length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Partner Detail Dialog */}
        <Dialog open={!!selectedPartner} onOpenChange={() => setSelectedPartner(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPartner && getRelationshipIcon(selectedPartner.partner.relationship)}
                {selectedPartner?.partner.name}
              </DialogTitle>
              <DialogDescription>
                Partner details and service contracts
              </DialogDescription>
            </DialogHeader>

            {selectedPartner && (
              <div className="space-y-6">
                {/* Partner Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Partner Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Email:</span>
                        <p>{selectedPartner.partner.contactEmail}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Relationship:</span>
                        <p className="capitalize">{selectedPartner.partner.relationship.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Status:</span>
                        <div className="mt-1">{getStatusBadge(selectedPartner.partner.status)}</div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Fee Share:</span>
                        <p>{selectedPartner.partner.feeSharePercent}%</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Enabled Modules</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {selectedPartner.partner.modules.map((module, idx) => (
                          <Badge key={idx} variant="outline">
                            {module}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total Contracts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPartner.partner.contractsCount}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Active Contracts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{selectedPartner.partner.activeContractsCount}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total Fees</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${parseFloat(selectedPartner.stats.totalFeesUsd).toLocaleString()}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Contract Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">${parseFloat(selectedPartner.partner.totalContractValueUsd).toLocaleString()}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Service Contracts */}
                <Card>
                  <CardHeader>
                    <CardTitle>Service Contracts</CardTitle>
                    <CardDescription>Active and completed contracts with this partner</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {partnerDetail?.contracts && partnerDetail.contracts.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Contract Code</TableHead>
                            <TableHead className="text-right">Value (USD)</TableHead>
                            <TableHead>Start Date</TableHead>
                            <TableHead>End Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Description</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {partnerDetail.contracts.map((contract: any) => (
                            <TableRow key={contract.id}>
                              <TableCell className="font-mono text-sm">{contract.contractCode}</TableCell>
                              <TableCell className="text-right font-mono">
                                ${parseFloat(contract.valueUsd).toLocaleString()}
                              </TableCell>
                              <TableCell>{format(new Date(contract.startDate), "MMM dd, yyyy")}</TableCell>
                              <TableCell>{format(new Date(contract.endDate), "MMM dd, yyyy")}</TableCell>
                              <TableCell>{getStatusBadge(contract.status)}</TableCell>
                              <TableCell className="max-w-xs truncate">{contract.description || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-muted-foreground">No service contracts found.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}