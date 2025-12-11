import { useQuery } from "@tanstack/react-query";

interface UserData {
  user: {
    id: string;
    email: string;
    role: string;
    walletAddress?: string;
    network?: string;
  };
}

export interface AdminAccessResult {
  isAdminLevel: boolean;
  isLoading: boolean;
  isError: boolean;
  status?: number;
  user: UserData["user"] | null;
  isUnauthorized: boolean;
}

/**
 * Shared helper that determines whether current user has admin/broker access.
 * Returns loading/error flags and unauthorized status for consistent guarding.
 */
export function useAdminAccess(): AdminAccessResult {
  const hasToken = !!localStorage.getItem("cropto_token");

  const query = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: hasToken,
  });

  const status = (query.error as any)?.status as number | undefined;
  const user = query.data?.user ?? null;
  const role = user?.role?.toLowerCase();
  const isAdminLevel = role === "admin" || role === "broker" || role === "super_admin";

  return {
    isAdminLevel,
    isLoading: query.isLoading,
    isError: query.isError,
    status,
    user,
    isUnauthorized: !hasToken || status === 401,
  };
}

/**
 * Backward-compatible boolean guard for admin-level access.
 */
export function useIsAdminLevelUser(): boolean {
  const { isAdminLevel } = useAdminAccess();
  return isAdminLevel;
}