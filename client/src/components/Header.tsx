import { Button } from "@/components/ui/button";
import { Menu, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { NotificationsDropdown } from "./NotificationsDropdown";
import FlagSwitcher from "./FlagSwitcher";
import { useTranslation } from "react-i18next";
import { useUserTier } from "@/hooks/useUserTier";
import { useTradingGuard } from "@/hooks/useTradingGuard";

interface HeaderProps {
  onCreateOption: () => void;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
}

export function Header({ onCreateOption, onOpenLogin, onOpenWalletModal }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const userTier = useUserTier();
  const guardTradingAction = useTradingGuard({
    onOpenLogin,
    onOpenWalletModal,
  });

  // Fetch current user
  const { data: userData } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
      walletAddress?: string;
      network?: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;

  // Check if user has admin-level permissions
  const isAdminLevelUser = user && (
    user.role === 'admin' || 
    user.role === 'broker' || 
    user.role === 'super_admin' ||
    user.role === 'ADMIN' ||
    user.role === 'BROKER' ||
    user.role === 'SUPER_ADMIN'
  );

  // Get status badge text and styles based on user tier
  const getStatusBadge = () => {
    switch (userTier) {
      case "guest":
        return {
          text: "Not logged in",
          className: "bg-muted/50 text-muted-foreground",
        };
      case "user_no_wallet":
        return {
          text: "Wallet: Not connected",
          className: "bg-orange-500/20 text-orange-600",
        };
      case "trader_full":
        return {
          text: "Wallet: Connected",
          className: "bg-green-500/20 text-green-600",
        };
    }
  };

  const statusBadge = getStatusBadge();

  const handleLogout = () => {
    localStorage.removeItem('cropto_token');
    localStorage.removeItem('cropto_admin_mode'); // Clear any stale admin mode
    queryClient.clear();
    setLocation('/login');
    toast({
      title: t('toast.loggedOut'),
      description: t('toast.loggedOutDesc'),
    });
  };

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -ml-2">
            <img 
              src="/cropto-logo.png" 
              alt={t('site.logoAlt')}
              className="h-8 w-auto"
              data-testid="img-header-logo"
            />
            <span className="font-bold text-lg hidden sm:inline">{t('site.title')}</span>
          </Link>

          {/* Navigation - Hidden on mobile, shown on md+ */}
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/portfolio">
              <Button variant="ghost" size="sm" data-testid="button-nav-portfolio">
                {t('nav.portfolio')}
              </Button>
            </Link>
            <Link href="/spot-trading">
              <Button 
                variant="ghost" 
                size="sm" 
                data-testid="button-nav-spot"
                className={location.startsWith("/spot-trading") ? "bg-accent" : ""}
              >
                {t('nav.spot')}
              </Button>
            </Link>
            <Link href="/options">
              <Button 
                variant="ghost" 
                size="sm" 
                data-testid="button-nav-options"
                className={location === "/options" ? "bg-accent" : ""}
              >
                {t('nav.options')}
              </Button>
            </Link>
            <Link href="/about">
              <Button variant="ghost" size="sm" data-testid="button-nav-about">
                {t('nav.about')}
              </Button>
            </Link>
            <Link href="/partners-contracts">
              <Button variant="ghost" size="sm" data-testid="button-nav-partners">
                {t('nav.partners')}
              </Button>
            </Link>
            <Link href="/onchain-tx">
              <Button variant="ghost" size="sm" data-testid="button-nav-transactions">
                {t('nav.transactions')}
              </Button>
            </Link>
            <Link href="/feedback">
              <Button variant="ghost" size="sm" data-testid="button-nav-feedback">
                {t('nav.feedback')}
              </Button>
            </Link>
            {isAdminLevelUser && (
              <Link href="/admin">
                <Button variant="ghost" size="sm" data-testid="button-nav-admin">
                  {t('nav.admin')}
                </Button>
              </Link>
            )}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <FlagSwitcher />
            
            {/* Mobile Menu Button */}
            <Button 
              variant="ghost" 
              size="icon"
              className="md:hidden"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {user ? (
              <>
                {/* Notifications */}
                <NotificationsDropdown />

                {/* User Tier Status Badge */}
                <Badge className={statusBadge.className} data-testid="badge-user-tier-status">
                  {statusBadge.text}
                </Badge>

                {/* Create Option CTA */}
                <Button
                  size="sm"
                  onClick={() => guardTradingAction(onCreateOption)}
                  className="bg-primary text-primary-foreground font-semibold"
                  data-testid="button-header-create-option"
                >
                  <span className="hidden sm:inline">{t('button.createOption')}</span>
                  <span className="sm:hidden">{t('button.create')}</span>
                </Button>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{t('button.logout')}</span>
                </Button>
              </>
            ) : (
              <>
                {/* Login/Register Buttons */}
                <Link href="/login">
                  <Button variant="outline" size="sm" data-testid="button-login">
                    {t('button.login')}
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" data-testid="button-register">
                    {t('button.register')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
