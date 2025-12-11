import { useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useIsAdminLevelUser } from "@/hooks/useIsAdminLevelUser";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

// Types
interface PartnerOrganization {
  id: string;
  name: string;
  contactEmail: string;
  relationship: "prime_broker" | "custody" | "liquidity_provider" | "security_auditor" | "other";
  status: "active" | "pending" | "inactive";
  notes?: string | null;
  feeSharePercent?: number | string | null;
  contractsCount?: number;
  activeContractsCount?: number;
  totalContractValueUsd?: string;
  totalFeesUsd?: string;
  totalVolumeUsd?: string;
}

interface ServiceContract {
  id: string;
  partnerId: string;
  contractCode: string;
  valueUsd: string;
  startDate: string | Date;
  endDate: string | Date;
  status: "active" | "pending" | "completed" | "terminated";
  description?: string | null;
  partnerName?: string;
}

// Form schemas
const partnerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contactEmail: z.string().email("Invalid email address"),
  relationship: z.enum(["prime_broker", "custody", "liquidity_provider", "security_auditor", "other"]),
  status: z.enum(["active", "pending", "inactive"]),
  notes: z.string().optional(),
  feeSharePercent: z.coerce.number().min(0).max(100).optional(),
});

const contractFormSchema = z.object({
  partnerId: z.string().min(1, "Partner is required"),
  contractCode: z.string().min(1, "Contract code is required"),
  valueUsd: z.coerce.number().positive("Value must be positive"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(["active", "pending", "completed", "terminated"]),
  description: z.string().optional(),
});

type PartnerFormData = z.infer<typeof partnerFormSchema>;
type ContractFormData = z.infer<typeof contractFormSchema>;

// Helper to format relationship
function formatRelationship(rel: string): string {
  const map: Record<string, string> = {
    prime_broker: "Prime Broker",
    custody: "Custody Provider",
    liquidity_provider: "Liquidity Provider",
    security_auditor: "Security Auditor",
    other: "Other",
  };
  return map[rel] || rel;
}

// Helper to format currency
function formatCurrency(value: string | number | undefined): string {
  if (!value) return "$0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export default function PartnersContracts() {
  const isAdmin = useIsAdminLevelUser();
  const { toast } = useToast();
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false);
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);

  // Fetch partners
  const { data: partnersData, isLoading: isLoadingPartners } = useQuery<{ partners: PartnerOrganization[] }>({
    queryKey: ["/api/admin/partners"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!localStorage.getItem('cropto_token'),
  });

  // Fetch contracts
  const { data: contractsData, isLoading: isLoadingContracts } = useQuery<{ contracts: ServiceContract[] }>({
    queryKey: ["/api/admin/service-contracts"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const partners = partnersData?.partners || [];
  const contracts = contractsData?.contracts || [];

  // Partner form
  const partnerForm = useForm<PartnerFormData>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues: {
      name: "",
      contactEmail: "",
      relationship: "other",
      status: "pending",
      notes: "",
      feeSharePercent: 0,
    },
  });

  // Contract form
  const contractForm = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      partnerId: "",
      contractCode: "",
      valueUsd: 0,
      startDate: new Date(),
      endDate: new Date(),
      status: "pending",
      description: "",
    },
  });

  // Create/update partner mutation
  const createPartnerMutation = useMutation({
    mutationFn: async (data: PartnerFormData) => {
      const response = await apiRequest("POST", "/api/admin/partners", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      setIsPartnerDialogOpen(false);
      partnerForm.reset();
      toast({
        title: "Success",
        description: "Partner created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create partner",
        variant: "destructive",
      });
    },
  });

  // Create/update contract mutation
  const createContractMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const response = await apiRequest("POST", "/api/admin/service-contracts", data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/partners"] });
      setIsContractDialogOpen(false);
      contractForm.reset();
      toast({
        title: "Success",
        description: "Contract created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contract",
        variant: "destructive",
      });
    },
  });

  const handlePartnerSubmit = (data: PartnerFormData) => {
    createPartnerMutation.mutate(data);
  };

  const handleContractSubmit = (data: ContractFormData) => {
    createContractMutation.mutate(data);
  };

  if (isLoadingPartners || isLoadingContracts) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Partners & Contracts</h1>
            <p className="text-muted-foreground mt-1">Loading...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Partners & Contracts</h1>
          <p className="text-muted-foreground mt-1">
            Manage institutional partnerships and service agreements
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Partner Organizations</CardTitle>
                <CardDescription>
                  Active and pending institutional partners
                </CardDescription>
              </div>
              {isAdmin && (
                <Dialog open={isPartnerDialogOpen} onOpenChange={setIsPartnerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Partner
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Partner Organization</DialogTitle>
                      <DialogDescription>
                        Create a new institutional partner
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...partnerForm}>
                      <form onSubmit={partnerForm.handleSubmit(handlePartnerSubmit)} className="space-y-4">
                        <FormField
                          control={partnerForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={partnerForm.control}
                          name="contactEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Email</FormLabel>
                              <FormControl>
                                <Input type="email" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={partnerForm.control}
                          name="relationship"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relationship</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="prime_broker">Prime Broker</SelectItem>
                                  <SelectItem value="custody">Custody Provider</SelectItem>
                                  <SelectItem value="liquidity_provider">Liquidity Provider</SelectItem>
                                  <SelectItem value="security_auditor">Security Auditor</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={partnerForm.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={partnerForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes (optional)</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={partnerForm.control}
                          name="feeSharePercent"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fee share (%)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  placeholder="0"
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                Portion of platform fees attributed to this partner (reporting only).
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsPartnerDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={createPartnerMutation.isPending}>
                            {createPartnerMutation.isPending ? "Creating..." : "Create Partner"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Fee share (%)</TableHead>
                  <TableHead className="text-right">Contracts</TableHead>
                  <TableHead className="text-right">Total Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No partners found
                    </TableCell>
                  </TableRow>
                ) : (
                  partners.map((partner) => (
                    <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                      <TableCell className="font-medium" data-testid={`text-partner-name-${partner.id}`}>
                        {partner.name}
                      </TableCell>
                      <TableCell data-testid={`text-partner-contact-${partner.id}`}>
                        {partner.contactEmail}
                      </TableCell>
                      <TableCell data-testid={`text-partner-relationship-${partner.id}`}>
                        {formatRelationship(partner.relationship)}
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
                      <TableCell className="text-right font-mono">
                        {partner.feeSharePercent != null
                          ? `${parseFloat(partner.feeSharePercent as any).toFixed(2)}%`
                          : "0.00%"}
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-partner-contracts-${partner.id}`}>
                        {partner.contractsCount || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(partner.totalContractValueUsd)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Service Contracts</CardTitle>
                <CardDescription>
                  All partnership agreements and service contracts
                </CardDescription>
              </div>
              {isAdmin && (
                <Dialog open={isContractDialogOpen} onOpenChange={setIsContractDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Contract
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Add Service Contract</DialogTitle>
                      <DialogDescription>
                        Create a new service contract
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...contractForm}>
                      <form onSubmit={contractForm.handleSubmit(handleContractSubmit)} className="space-y-4">
                        <FormField
                          control={contractForm.control}
                          name="partnerId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Partner</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a partner" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {partners.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contractForm.control}
                          name="contractCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contract Code</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="CTR-2024-001" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contractForm.control}
                          name="valueUsd"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Value (USD)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={contractForm.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Start Date</FormLabel>
                                <FormControl>
                                  <Input
                                    type="date"
                                    {...field}
                                    value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
                                    onChange={(e) => field.onChange(new Date(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={contractForm.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>End Date</FormLabel>
                                <FormControl>
                                  <Input
                                    type="date"
                                    {...field}
                                    value={field.value ? format(new Date(field.value), "yyyy-MM-dd") : ""}
                                    onChange={(e) => field.onChange(new Date(e.target.value))}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={contractForm.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="terminated">Terminated</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={contractForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Description (optional)</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsContractDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" disabled={createContractMutation.isPending}>
                            {createContractMutation.isPending ? "Creating..." : "Create Contract"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
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
                {contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No contracts found
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => (
                    <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                      <TableCell className="font-mono" data-testid={`text-contract-id-${contract.id}`}>
                        {contract.contractCode}
                      </TableCell>
                      <TableCell data-testid={`text-contract-partner-${contract.id}`}>
                        {contract.partnerName || "Unknown"}
                      </TableCell>
                      <TableCell className="font-mono" data-testid={`text-contract-value-${contract.id}`}>
                        {formatCurrency(contract.valueUsd)}
                      </TableCell>
                      <TableCell data-testid={`text-contract-start-${contract.id}`}>
                        {format(new Date(contract.startDate), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell data-testid={`text-contract-end-${contract.id}`}>
                        {format(new Date(contract.endDate), "MMM dd, yyyy")}
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
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
