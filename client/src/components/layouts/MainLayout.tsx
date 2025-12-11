import { Header } from "../Header";
import { Footer } from "../Footer";
import React from "react";

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
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header 
        onCreateOption={onCreateOption}
        onOpenLogin={onOpenLogin}
        onOpenWalletModal={onOpenWalletModal}
      />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {children}
      </main>
      <Footer />
    </div>
  );
}

