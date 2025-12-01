import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OptionChainTable } from "@/components/OptionChainTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { Option } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { StatusBadge } from "@/components/StatusBadge";
import { OptionTypeBadge } from "@/components/OptionTypeBadge";

export default function OptionChain() {
  const { t } = useTranslation();
  const [selectedCommodity, setSelectedCommodity] = useState<string>("ALL");
  const [selectedExpiry, setSelectedExpiry] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Fetch options
  const { data: options = [], isLoading, error } = useQuery<Option[]>({
    queryKey: ["/api/options"],
  });

  // Extract unique commodities from options
  const commodities = useMemo(() => {
    const commoditySet = new Set<string>();
    options.forEach((option) => {
      // Extract commodity from title or use indexId
      if (option.title) {
        const parts = option.title.split('-');
        if (parts.length > 0 && parts[0]) {
          commoditySet.add(parts[0].replace(/_/g, ' '));
        }
      } else if (option.indexId) {
        commoditySet.add(option.indexId);
      }
    });
    return Array.from(commoditySet).sort();
  }, [options]);

  // Extract unique expiry dates from options
  const expiryDates = useMemo(() => {
    const expirySet = new Set<string>();
    options.forEach((option) => {
      if (option.expirationDate) {
        const expiry = typeof option.expirationDate === 'string'
          ? new Date(option.expirationDate)
          : option.expirationDate;
        if (!isNaN(expiry.getTime())) {
          expirySet.add(format(expiry, "yyyy-MM-dd"));
        }
      }
    });
    return Array.from(expirySet).sort();
  }, [options]);

  // Filter options based on selected filters
  const filteredOptions = useMemo(() => {
    return options.filter((option) => {
      // Commodity filter
      if (selectedCommodity !== "ALL") {
        const commodityName = option.title
          ? option.title.split('-')[0]?.replace(/_/g, ' ')
          : option.indexId || "";
        if (commodityName !== selectedCommodity) {
          return false;
        }
      }

      // Type filter
      if (selectedType !== "ALL") {
        if (option.type !== selectedType) {
          return false;
        }
      }

      // Expiry filter
      if (selectedExpiry !== "ALL") {
        if (!option.expirationDate) {
          return false;
        }
        const expiry = typeof option.expirationDate === 'string'
          ? new Date(option.expirationDate)
          : option.expirationDate;
        if (isNaN(expiry.getTime())) {
          return false;
        }
        const expiryStr = format(expiry, "yyyy-MM-dd");
        if (expiryStr !== selectedExpiry) {
          return false;
        }
      }

      return true;
    });
  }, [options, selectedCommodity, selectedExpiry, selectedType]);

  const handleViewOption = (option: Option) => {
    setSelectedOption(option);
    setIsViewDialogOpen(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Option Chain</h1>
          <p className="text-muted-foreground mt-2">
            Browse and filter all available option contracts
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Commodity Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Commodity</label>
                <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                  <SelectTrigger>
                    <SelectValue placeholder="All commodities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    {commodities.map((commodity) => (
                      <SelectItem key={commodity} value={commodity}>
                        {commodity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Expiry Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Expiry</label>
                <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                  <SelectTrigger>
                    <SelectValue placeholder="All expiry dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All</SelectItem>
                    {expiryDates.map((expiryStr) => {
                      const expiry = new Date(expiryStr);
                      return (
                        <SelectItem key={expiryStr} value={expiryStr}>
                          {format(expiry, "MMM dd, yyyy")}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Tabs value={selectedType} onValueChange={setSelectedType}>
                  <TabsList className="w-full">
                    <TabsTrigger value="ALL" className="flex-1">All</TabsTrigger>
                    <TabsTrigger value="CALL" className="flex-1">Call</TabsTrigger>
                    <TabsTrigger value="PUT" className="flex-1">Put</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Options Table */}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load options. Please try again.
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                Options ({filteredOptions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (
                <OptionChainTable
                  options={filteredOptions}
                  isLoading={isLoading}
                  onView={handleViewOption}
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* View Option Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Option Details</DialogTitle>
              <DialogDescription>
                View full details of the selected option contract
              </DialogDescription>
            </DialogHeader>
            {selectedOption && (
              <div className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Commodity</label>
                    <p className="text-sm font-medium">
                      {selectedOption.title?.split('-')[0]?.replace(/_/g, ' ') || selectedOption.indexId || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Type</label>
                    <div className="mt-1">
                      <OptionTypeBadge type={selectedOption.type as "CALL" | "PUT"} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Strike Price</label>
                    <p className="text-sm font-medium font-mono">
                      ${parseFloat(selectedOption.strike || "0").toFixed(2)} / ton
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Quantity</label>
                    <p className="text-sm font-medium font-mono">
                      {parseFloat(selectedOption.qty || "0").toFixed(2)} tons
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Premium</label>
                    <p className="text-sm font-medium font-mono">
                      {parseFloat(selectedOption.premium || "0").toFixed(2)} CROPT / ton
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total: {(parseFloat(selectedOption.premium || "0") * parseFloat(selectedOption.qty || "0")).toFixed(2)} CROPT
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">
                      <StatusBadge status={selectedOption.status || "UNKNOWN"} />
                    </div>
                  </div>
                  {selectedOption.expirationDate && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Expiration Date</label>
                      <p className="text-sm font-medium">
                        {format(
                          typeof selectedOption.expirationDate === 'string'
                            ? new Date(selectedOption.expirationDate)
                            : selectedOption.expirationDate,
                          "MMM dd, yyyy"
                        )}
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Created</label>
                    <p className="text-sm font-medium">
                      {format(new Date(selectedOption.createdAt), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                </div>
                {selectedOption.title && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Title</label>
                    <p className="text-sm font-mono break-all">{selectedOption.title}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

