import { useQuery } from "@tanstack/react-query";
import { CommodityIndexCard } from "./CommodityIndexCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface CommodityIndex {
  id: string;
  name: string;
  slug: string;
  category: string;
  hasVat: boolean;
  latestPrice: {
    price: number;
    delta: number | null;
    timestamp: string;
  } | null;
}

export function CommodityIndexesGrid() {
  const { data: indexes, isLoading, error } = useQuery<CommodityIndex[]>({
    queryKey: ["/api/indexes"],
    refetchInterval: 30000,
  });

  const handleViewDetails = (slug: string) => {
    window.location.href = `/index/${slug}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Commodity Index Prices</h2>
          <p className="text-muted-foreground mb-6">
            Real-time grain commodity prices from CPT ODESA and CPT PARITET ODESA
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="space-y-3 p-4 border rounded-lg">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Commodity Index Prices</h2>
          <p className="text-muted-foreground mb-6">
            Real-time grain commodity prices from CPT ODESA and CPT PARITET ODESA
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load commodity index data. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!indexes || indexes.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold mb-2">Commodity Index Prices</h2>
          <p className="text-muted-foreground mb-6">
            Real-time grain commodity prices from CPT ODESA and CPT PARITET ODESA
          </p>
        </div>
        <Alert>
          <AlertDescription>
            No commodity indexes available at this time.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="commodity-indexes-grid">
      <div>
        <h2 className="text-2xl font-bold mb-2">Commodity Index Prices</h2>
        <p className="text-muted-foreground mb-6">
          Real-time grain commodity prices from CPT ODESA and CPT PARITET ODESA
        </p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {indexes.map((index) => (
          <CommodityIndexCard
            key={index.id}
            index={index}
            onViewDetails={handleViewDetails}
          />
        ))}
      </div>
    </div>
  );
}
