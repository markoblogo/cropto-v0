import { Button } from "@/components/ui/button";
import { Menu, LogOut, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { NotificationsDropdown } from "./NotificationsDropdown";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  onCreateOption: () => void;
}

export function Header({ onCreateOption }: HeaderProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

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

  const handleLogout = () => {
    localStorage.removeItem('cropto_token');
    queryClient.clear();
    setLocation('/login');
    toast({
      title: "Logged out",
      description: "You have been logged out successfully",
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
              alt="Cropto" 
              className="h-8 w-auto"
              data-testid="img-header-logo"
            />
            <span className="font-bold text-lg hidden sm:inline">Cropto</span>
          </Link>

          {/* Navigation - Hidden on mobile, shown on md+ */}
          <nav className="hidden md:flex items-center gap-1">
            {location !== "/" && (
              <Link href="/">
                <Button variant="ghost" size="sm" data-testid="button-nav-dashboard">
                  {t('nav.dashboard')}
                </Button>
              </Link>
            )}
            <Link href="/portfolio">
              <Button variant="ghost" size="sm" data-testid="button-nav-portfolio">
                Portfolio
              </Button>
            </Link>
            <Link href="/docs">
              <Button variant="ghost" size="sm" data-testid="button-nav-docs">
                Docs
              </Button>
            </Link>
            <Link href="/faq">
              <Button variant="ghost" size="sm" data-testid="button-nav-faq">
                FAQ
              </Button>
            </Link>
            <Link href="/testing">
              <Button variant="ghost" size="sm" data-testid="button-nav-testing">
                Testing
              </Button>
            </Link>
            <Link href="/partners-contracts">
              <Button variant="ghost" size="sm" data-testid="button-nav-partners">
                Partners
              </Button>
            </Link>
            <Link href="/onchain-tx">
              <Button variant="ghost" size="sm" data-testid="button-nav-transactions">
                Transactions
              </Button>
            </Link>
            <Link href="/feedback">
              <Button variant="ghost" size="sm" data-testid="button-nav-feedback">
                Feedback
              </Button>
            </Link>
            {user?.role === "broker" && (
              <>
                <Link href="/admin">
                  <Button variant="ghost" size="sm" data-testid="button-nav-admin">
                    Admin
                  </Button>
                </Link>
                <Link href="/admin/reconciliation">
                  <Button variant="ghost" size="sm" data-testid="button-nav-reconciliation">
                    Reconciliation
                  </Button>
                </Link>
                <Link href="/admin/index">
                  <Button variant="ghost" size="sm" data-testid="button-nav-index">
                    Index
                  </Button>
                </Link>
              </>
            )}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <LanguageSwitcher />
            
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
                {/* User Role Badge */}
                <Badge variant="secondary" className="capitalize hidden sm:flex" data-testid="badge-user-role">
                  <User className="h-3 w-3 mr-1" />
                  {user.role}
                </Badge>

                {/* Notifications */}
                <NotificationsDropdown />

                {/* Create Option CTA */}
                <Button
                  size="sm"
                  onClick={onCreateOption}
                  className="bg-primary text-primary-foreground font-semibold"
                  data-testid="button-header-create-option"
                >
                  <span className="hidden sm:inline">{t('button.createOption')}</span>
                  <span className="sm:hidden">Create</span>
                </Button>

                {/* Logout Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <>
                {/* Login/Register Buttons */}
                <Link href="/login">
                  <Button variant="outline" size="sm" data-testid="button-login">
                    Login
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" data-testid="button-register">
                    Register
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
