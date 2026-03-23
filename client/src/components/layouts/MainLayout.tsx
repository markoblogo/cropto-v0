import { Header } from "../Header";
import { Footer } from "../Footer";
import React from "react";
import { useLocation } from "wouter";

interface MainLayoutProps {
  children: React.ReactNode;
  onCreateOption?: () => void;
  onOpenLogin?: () => void;
  onOpenWalletModal?: () => void;
}

export function MainLayout({ 
  children, 
  onCreateOption = () => {},
  onOpenLogin,
  onOpenWalletModal 
}: MainLayoutProps) {
  const [location] = useLocation();
  const isSeaBrokerageMonitorRoute = location.startsWith("/spike-monitor");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        onCreateOption={onCreateOption}
        onOpenLogin={onOpenLogin}
        onOpenWalletModal={onOpenWalletModal}
      />
      <main
        className={`container mx-auto flex-1 w-full px-4 sm:px-6 lg:px-8 ${
          isSeaBrokerageMonitorRoute ? "py-2.5" : "py-8"
        }`}
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
