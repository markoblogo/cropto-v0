import React, { createContext, useContext, useMemo, useState } from "react";
import WaitlistModal from "@/components/WaitlistModal";

export type WaitlistSource = "hero" | "banner";

type WaitlistContextValue = {
  openWaitlist: (source: WaitlistSource) => void;
  closeWaitlist: () => void;
  isOpen: boolean;
  source: WaitlistSource;
};

const WaitlistContext = createContext<WaitlistContextValue | null>(null);

export function WaitlistProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<WaitlistSource>("hero");

  const value = useMemo<WaitlistContextValue>(() => {
    return {
      isOpen,
      source,
      openWaitlist: (s) => {
        setSource(s);
        setIsOpen(true);
      },
      closeWaitlist: () => setIsOpen(false),
    };
  }, [isOpen, source]);

  return (
    <WaitlistContext.Provider value={value}>
      {children}
      <WaitlistModal open={isOpen} onOpenChange={setIsOpen} source={source} />
    </WaitlistContext.Provider>
  );
}

export function useWaitlist() {
  const ctx = useContext(WaitlistContext);
  if (!ctx) throw new Error("useWaitlist must be used within WaitlistProvider");
  return ctx;
}


