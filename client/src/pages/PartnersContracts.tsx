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
import { useTranslation } from "react-i18next";

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

type PartnerFormData = {
  name: string;
  contactEmail: string;
  relationship: "prime_broker" | "custody" | "liquidity_provider" | "security_auditor" | "other";
  status: "active" | "pending" | "inactive";
  notes?: string;
  feeSharePercent?: number;
};

type ContractFormData = {
  partnerId: string;
  contractCode: string;
  valueUsd: number;
  startDate: Date;
  endDate: Date;
  status: "active" | "pending" | "completed" | "terminated";
  description?: string;
};

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
  const { t } = useTranslation();
  const isAdmin = useIsAdminLevelUser();
  const { toast } = useToast();
  const [isPartnerDialogOpen, setIsPartnerDialogOpen] = useState(false);
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);

  const partnerFormSchema = z.object({
    name: z.string().min(1, t("page.partnersContracts.validation.nameRequired")),
    contactEmail: z.string().email(t("page.partnersContracts.validation.invalidEmail")),
    relationship: z.enum(["prime_broker", "custody", "liquidity_provider", "security_auditor", "other"]),
    status: z.enum(["active", "pending", "inactive"]),
    notes: z.string().optional(),
    feeSharePercent: z.coerce.number().min(0).max(100).optional(),
  });

  const contractFormSchema = z.object({
    partnerId: z.string().min(1, t("page.partnersContracts.validation.partnerRequired")),
    contractCode: z.string().min(1, t("page.partnersContracts.validation.contractCodeRequired")),
    valueUsd: z.coerce.number().positive(t("page.partnersContracts.validation.valuePositive")),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    status: z.enum(["active", "pending", "completed", "terminated"]),
    description: z.string().optional(),
  });

  const formatRelationship = (rel: string): string => {
    const map: Record<string, string> = {
      prime_broker: t("page.partnersContracts.relationship.prime_broker"),
      custody: t("page.partnersContracts.relationship.custody"),
      liquidity_provider: t("page.partnersContracts.relationship.liquidity_provider"),
      security_auditor: t("page.partnersContracts.relationship.security_auditor"),
      other: t("page.partnersContracts.relationship.other"),
    };
    return map[rel] || rel;
  };

  const formatStatus = (status: string): string => {
    const map: Record<string, string> = {
      active: t("page.partnersContracts.status.active"),
      pending: t("page.partnersContracts.status.pending"),
      inactive: t("page.partnersContracts.status.inactive"),
      completed: t("page.partnersContracts.status.completed"),
      terminated: t("page.partnersContracts.status.terminated"),
    };
    return map[status] || status;
  };

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
        title: t("page.partnersContracts.toast.successTitle"),
        description: t("page.partnersContracts.toast.partnerCreated"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("page.partnersContracts.toast.errorTitle"),
        description: error.message || t("page.partnersContracts.toast.partnerCreateFailed"),
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
        title: t("page.partnersContracts.toast.successTitle"),
        description: t("page.partnersContracts.toast.contractCreated"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("page.partnersContracts.toast.errorTitle"),
        description: error.message || t("page.partnersContracts.toast.contractCreateFailed"),
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
            <h1 className="text-3xl font-bold">{t("page.partnersContracts.title")}</h1>
            <p className="text-muted-foreground mt-1">{t("page.partnersContracts.loading")}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t("page.partnersContracts.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("page.partnersContracts.subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("page.partnersContracts.partners.title")}</CardTitle>
                <CardDescription>
                  {t("page.partnersContracts.partners.description")}
                </CardDescription>
              </div>
              {isAdmin && (
                <Dialog open={isPartnerDialogOpen} onOpenChange={setIsPartnerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      {t("page.partnersContracts.partners.addButton")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("page.partnersContracts.dialog.partner.title")}</DialogTitle>
                      <DialogDescription>
                        {t("page.partnersContracts.dialog.partner.description")}
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...partnerForm}>
                      <form onSubmit={partnerForm.handleSubmit(handlePartnerSubmit)} className="space-y-4">
                        <FormField
                          control={partnerForm.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.name")}</FormLabel>
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
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.contactEmail")}</FormLabel>
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
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.relationship")}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="prime_broker">{t("page.partnersContracts.relationship.prime_broker")}</SelectItem>
                                  <SelectItem value="custody">{t("page.partnersContracts.relationship.custody")}</SelectItem>
                                  <SelectItem value="liquidity_provider">{t("page.partnersContracts.relationship.liquidity_provider")}</SelectItem>
                                  <SelectItem value="security_auditor">{t("page.partnersContracts.relationship.security_auditor")}</SelectItem>
                                  <SelectItem value="other">{t("page.partnersContracts.relationship.other")}</SelectItem>
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
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.status")}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">{t("page.partnersContracts.status.active")}</SelectItem>
                                  <SelectItem value="pending">{t("page.partnersContracts.status.pending")}</SelectItem>
                                  <SelectItem value="inactive">{t("page.partnersContracts.status.inactive")}</SelectItem>
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
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.notes")}</FormLabel>
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
                              <FormLabel>{t("page.partnersContracts.dialog.partner.fields.feeShare")}</FormLabel>
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
                                {t("page.partnersContracts.dialog.partner.fields.feeShareHint")}
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
                            {t("page.partnersContracts.dialog.partner.actions.cancel")}
                          </Button>
                          <Button type="submit" disabled={createPartnerMutation.isPending}>
                            {createPartnerMutation.isPending
                              ? t("page.partnersContracts.dialog.partner.actions.creating")
                              : t("page.partnersContracts.dialog.partner.actions.create")}
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
                  <TableHead>{t("page.partnersContracts.partners.table.organization")}</TableHead>
                  <TableHead>{t("page.partnersContracts.partners.table.contact")}</TableHead>
                  <TableHead>{t("page.partnersContracts.partners.table.relationship")}</TableHead>
                  <TableHead>{t("page.partnersContracts.partners.table.status")}</TableHead>
                  <TableHead className="text-right">{t("page.partnersContracts.partners.table.feeShare")}</TableHead>
                  <TableHead className="text-right">{t("page.partnersContracts.partners.table.contracts")}</TableHead>
                  <TableHead className="text-right">{t("page.partnersContracts.partners.table.totalValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {t("page.partnersContracts.partners.empty")}
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
                          {formatStatus(partner.status)}
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
                <CardTitle>{t("page.partnersContracts.contracts.title")}</CardTitle>
                <CardDescription>
                  {t("page.partnersContracts.contracts.description")}
                </CardDescription>
              </div>
              {isAdmin && (
                <Dialog open={isContractDialogOpen} onOpenChange={setIsContractDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      {t("page.partnersContracts.contracts.addButton")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{t("page.partnersContracts.dialog.contract.title")}</DialogTitle>
                      <DialogDescription>
                        {t("page.partnersContracts.dialog.contract.description")}
                      </DialogDescription>
                    </DialogHeader>
                    <Form {...contractForm}>
                      <form onSubmit={contractForm.handleSubmit(handleContractSubmit)} className="space-y-4">
                        <FormField
                          control={contractForm.control}
                          name="partnerId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("page.partnersContracts.dialog.contract.fields.partner")}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t("page.partnersContracts.dialog.contract.fields.partnerPlaceholder")} />
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
                              <FormLabel>{t("page.partnersContracts.dialog.contract.fields.contractCode")}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder={t("page.partnersContracts.dialog.contract.fields.contractCodePlaceholder")} />
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
                              <FormLabel>{t("page.partnersContracts.dialog.contract.fields.valueUsd")}</FormLabel>
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
                                <FormLabel>{t("page.partnersContracts.dialog.contract.fields.startDate")}</FormLabel>
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
                                <FormLabel>{t("page.partnersContracts.dialog.contract.fields.endDate")}</FormLabel>
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
                              <FormLabel>{t("page.partnersContracts.dialog.contract.fields.status")}</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="active">{t("page.partnersContracts.status.active")}</SelectItem>
                                  <SelectItem value="pending">{t("page.partnersContracts.status.pending")}</SelectItem>
                                  <SelectItem value="completed">{t("page.partnersContracts.status.completed")}</SelectItem>
                                  <SelectItem value="terminated">{t("page.partnersContracts.status.terminated")}</SelectItem>
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
                              <FormLabel>{t("page.partnersContracts.dialog.contract.fields.description")}</FormLabel>
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
                            {t("page.partnersContracts.dialog.contract.actions.cancel")}
                          </Button>
                          <Button type="submit" disabled={createContractMutation.isPending}>
                            {createContractMutation.isPending
                              ? t("page.partnersContracts.dialog.contract.actions.creating")
                              : t("page.partnersContracts.dialog.contract.actions.create")}
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
                  <TableHead>{t("page.partnersContracts.contracts.table.contractId")}</TableHead>
                  <TableHead>{t("page.partnersContracts.contracts.table.partner")}</TableHead>
                  <TableHead>{t("page.partnersContracts.contracts.table.value")}</TableHead>
                  <TableHead>{t("page.partnersContracts.contracts.table.startDate")}</TableHead>
                  <TableHead>{t("page.partnersContracts.contracts.table.endDate")}</TableHead>
                  <TableHead>{t("page.partnersContracts.contracts.table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("page.partnersContracts.contracts.empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => (
                    <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                      <TableCell className="font-mono" data-testid={`text-contract-id-${contract.id}`}>
                        {contract.contractCode}
                      </TableCell>
                      <TableCell data-testid={`text-contract-partner-${contract.id}`}>
                        {contract.partnerName || t("page.partnersContracts.contracts.unknownPartner")}
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
                          {formatStatus(contract.status)}
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
