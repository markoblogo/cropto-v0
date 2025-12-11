import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsAdminLevelUser } from "@/hooks/useIsAdminLevelUser";

interface RiskOverviewResponse {
  userRole?: string;
  metrics: {
    activeOptions: number;
    openMarginCalls: number;
    overdueMarginCalls: number;
    totalLockedCollateral: string;
  };
}

export default function RiskDashboard() {
  const [, setLocation] = useLocation();
  const isAdminLevelUser = useIsAdminLevelUser();

  const { data, isLoading, isError, error } = useQuery<RiskOverviewResponse>({
    queryKey: ["/api/risk/overview"],
    enabled: !!isAdminLevelUser,
  });

  useEffect(() => {
    if (!isAdminLevelUser) {
      setLocation("/");
    }
  }, [isAdminLevelUser, setLocation]);

  if (!isAdminLevelUser) {
    return null;
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (isError) {
    return (
      <MainLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Risk Dashboard</h1>
          <p className="text-destructive">
            Failed to load risk overview: {(error as Error)?.message || "Unknown error"}
          </p>
        </div>
      </MainLayout>
    );
  }

  const metrics = data?.metrics;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-1">Risk Dashboard</h1>
            <p className="text-muted-foreground">
              Overview of margin calls, open positions, and locked collateral.
            </p>
          </div>
          <Badge variant="outline">
            Role: {data?.userRole || "unknown"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Options</CardTitle>
              <CardDescription>Open, filled, or in margin call</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics?.activeOptions ?? 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open Margin Calls</CardTitle>
              <CardDescription>Pending actions</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics?.openMarginCalls ?? 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overdue Margin Calls</CardTitle>
              <CardDescription>Past deadline</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-destructive">{metrics?.overdueMarginCalls ?? 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Locked Collateral</CardTitle>
              <CardDescription>Across active options</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics?.totalLockedCollateral ?? "0"}</p>
              <p className="text-sm text-muted-foreground">CROPT (string value)</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

