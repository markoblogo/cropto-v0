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

/**
 * Hook to check if the current user has admin-level permissions
 * Returns true for: admin, broker, super_admin (case-insensitive)
 */
export function useIsAdminLevelUser(): boolean {
  const { data: userData } = useQuery<UserData | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  if (!userData?.user) return false;

  const role = userData.user.role?.toLowerCase();
  return role === 'admin' || role === 'broker' || role === 'super_admin';
}



