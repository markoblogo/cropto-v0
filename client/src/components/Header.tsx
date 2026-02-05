import { Button } from "@/components/ui/button";
import { Menu, LogOut, MoreHorizontal, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { NotificationsDropdown } from "./NotificationsDropdown";
import FlagSwitcher from "./FlagSwitcher";
import { useTranslation } from "react-i18next";
import { useUserTier } from "@/hooks/useUserTier";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HeaderProps {
  onCreateOption: () => void;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
}

export function Header({ onCreateOption: _onCreateOption, onOpenLogin: _onOpenLogin, onOpenWalletModal: _onOpenWalletModal }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string>("/portfolio");
  const { toast } = useToast();
  const { t } = useTranslation();
  const userTier = useUserTier();

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

  // Define navigation items
  const primaryNav = [
    { to: "/portfolio", label: t("nav.portfolio"), testId: "button-nav-portfolio" },
  ];

  const indexTradingNav = [
    { to: "/spot-trading?country=ua", label: t("nav.tradeIndexUA"), testId: "button-nav-index-ua" },
    { to: "/spot-trading?country=br", label: t("nav.tradeIndexBR"), testId: "button-nav-index-br" },
    { to: "/spot-trading?country=ar", label: t("nav.tradeIndexAR"), testId: "button-nav-index-ar" },
    { to: "/spot-trading?country=us", label: t("nav.tradeIndexUS"), testId: "button-nav-index-us" },
    { to: "/arbitrage", label: t("nav.tradeArbitrage"), testId: "button-nav-index-arbitrage" },
  ];

  const optionsTradingNav = [
    { to: "/options?country=ua", label: t("nav.tradeOptionsUA"), testId: "button-nav-options-ua" },
    { to: "/options?country=br", label: t("nav.tradeOptionsBR"), testId: "button-nav-options-br" },
    { to: "/options?country=ar", label: t("nav.tradeOptionsAR"), testId: "button-nav-options-ar" },
    { to: "/options?country=us", label: t("nav.tradeOptionsUS"), testId: "button-nav-options-us" },
  ];

  const marketDataNav = [
    { to: "/market-data?country=ua", label: t("nav.indexUA"), testId: "button-nav-market-ua" },
    { to: "/market-data?country=br", label: t("nav.indexBR"), testId: "button-nav-market-br" },
    { to: "/market-data?country=ar", label: t("nav.indexAR"), testId: "button-nav-market-ar" },
    { to: "/market-data?country=us", label: t("nav.indexUS"), testId: "button-nav-market-us" },
  ];

  const secondaryNav = [
    { to: "/education", label: t("nav.aboutCropto"), testId: "button-nav-education" },
    { to: "/docs", label: t("nav.documentation"), testId: "button-nav-docs" },
    { to: "/wallet", label: t("nav.wallet"), testId: "button-nav-wallet" },
    { to: "/education#faq", label: t("nav.faqShort"), testId: "button-nav-faq" },
    { to: "/partners-contracts", label: t("nav.partners"), testId: "button-nav-partners" },
    { to: "/onchain-tx", label: t("nav.transactions"), testId: "button-nav-transactions" },
    { to: "/feedback", label: t("nav.feedback"), testId: "button-nav-feedback" },
    { to: "/admin", label: t("nav.admin"), testId: "button-nav-admin", requiresAdmin: true },
    { to: "/admin/waitlist", label: t("nav.waitlist"), testId: "button-nav-admin-waitlist", requiresAdmin: true },
    { to: "/markets/chain", label: t("nav.chain"), testId: "button-nav-chain" },
  ];

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

  const protectedPrefixes = ["/portfolio", "/wallet"];
  const requiresAuth = (to: string) => protectedPrefixes.some((prefix) => to.startsWith(prefix));

  const handleNavIntent = (to: string) => {
    if (!user && requiresAuth(to)) {
      setPendingRoute(to);
      setAuthPromptOpen(true);
      return;
    }
    setLocation(to);
    setIsMobileMenuOpen(false);
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
            {/* Primary Navigation */}
            {primaryNav.map((item) => {
              const isActive = location === item.to || 
                (item.to !== "/" && location.startsWith(item.to));
              return (
                <Button
                  key={item.to}
                  variant="ghost"
                  size="sm"
                  data-testid={item.testId}
                  className={isActive ? "bg-accent" : ""}
                  onClick={() => handleNavIntent(item.to)}
                >
                  {item.label}
                </Button>
              );
            })}

            {/* Index Trading Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-nav-index-trading"
                  className={location.startsWith("/spot-trading") || location.startsWith("/arbitrage") ? "bg-accent" : ""}
                >
                  {t("nav.indexTrading")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {indexTradingNav.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link href={item.to} data-testid={item.testId}>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Options Trading Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-nav-options-trading"
                  className={location.startsWith("/options") ? "bg-accent" : ""}
                >
                  {t("nav.optionsTrading")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {optionsTradingNav.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link href={item.to} data-testid={item.testId}>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Market Data Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="button-nav-market-data-dropdown"
                  className={location.startsWith("/market-data") ? "bg-accent" : ""}
                >
                  {t("nav.marketDataShort")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {marketDataNav.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link href={item.to} data-testid={item.testId}>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  data-testid="button-nav-more"
                  className="gap-1"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">{t("nav.more")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {secondaryNav
                  .filter((item) => !item.requiresAdmin || isAdminLevelUser)
                  .map((item) => {
                    const isActive = location === item.to || 
                      (item.to !== "/" && location.startsWith(item.to));
                    return (
                      <DropdownMenuItem 
                        key={item.to} 
                        className={isActive ? "bg-accent" : ""}
                        onClick={(e) => {
                          e.preventDefault();
                          handleNavIntent(item.to);
                        }}
                      >
                        <span data-testid={item.testId}>
                          {item.label}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
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
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {user ? (
              <>
                {/* Notifications */}
                <NotificationsDropdown />

                {/* User Tier Status Badge */}
                <Badge className={statusBadge.className} data-testid="badge-user-tier-status">
                  {statusBadge.text}
                </Badge>

                {/* Demo environment badge (replaces Create Option) */}
                <Badge
                  variant="secondary"
                  className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap"
                  data-testid="badge-demo-environment"
                >
                  Demo environment
                </Badge>

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

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t bg-background">
            <nav className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-2">
              {/* Primary Navigation */}
              {primaryNav.map((item) => (
                <Button
                  key={item.to}
                  variant="ghost"
                  className="w-full justify-start"
                  data-testid={`mobile-${item.testId}`}
                  onClick={() => handleNavIntent(item.to)}
                >
                  {item.label}
                </Button>
              ))}

              <Separator className="my-2" />

              {/* Index Trading Links */}
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{t("nav.indexTrading")}</div>
              {indexTradingNav.map((item) => (
                <Link key={item.to} href={item.to} onClick={() => setIsMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    data-testid={`mobile-${item.testId}`}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}

              <Separator className="my-2" />

              {/* Options Trading Links */}
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{t("nav.optionsTrading")}</div>
              {optionsTradingNav.map((item) => (
                <Link key={item.to} href={item.to} onClick={() => setIsMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    data-testid={`mobile-${item.testId}`}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}

              <Separator className="my-2" />

              {/* Market Data Links */}
              <div className="px-3 py-1 text-xs font-medium text-muted-foreground">{t("nav.marketDataShort")}</div>
              {marketDataNav.map((item) => (
                <Link key={item.to} href={item.to} onClick={() => setIsMobileMenuOpen(false)}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    data-testid={`mobile-${item.testId}`}
                  >
                    {item.label}
                  </Button>
                </Link>
              ))}

              <Separator className="my-2" />

              {/* Secondary Navigation */}
              {secondaryNav
                .filter((item) => !item.requiresAdmin || isAdminLevelUser)
                .map((item) => (
                  <Button
                    key={item.to}
                    variant="ghost"
                    className="w-full justify-start"
                    data-testid={`mobile-${item.testId}`}
                    onClick={() => handleNavIntent(item.to)}
                  >
                    {item.label}
                  </Button>
                ))}
            </nav>
          </div>
        )}
      </div>
      <Dialog open={authPromptOpen} onOpenChange={setAuthPromptOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("auth.login.title")}</DialogTitle>
            <DialogDescription>
              {t("header.authPrompt.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAuthPromptOpen(false)}>
              {t("button.cancel")}
            </Button>
            <Button variant="outline" onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(pendingRoute)}`)}>
              {t("button.register")}
            </Button>
            <Button onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(pendingRoute)}`)}>
              {t("button.login")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
