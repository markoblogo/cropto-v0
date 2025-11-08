import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function MockModeBanner() {
  const [dismissed, setDismissed] = useState(false);
  
  const mockEnv = (import.meta.env.VITE_MOCK_ONCHAIN || "").toLowerCase() === "true";
  const mintEnabled = (import.meta.env.VITE_ENABLE_MINT || "").toLowerCase() === "true";
  const show = mockEnv || !mintEnabled;
  
  if (!show || dismissed) return null;

  return (
    <Alert className="border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20 mb-6" data-testid="banner-mock-mode">
      <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
      <AlertDescription className="ml-2 flex-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <strong className="text-orange-800 dark:text-orange-300">DEMO / MOCK MODE:</strong>{" "}
            <span className="text-orange-700 dark:text-orange-400">
              {mockEnv ? "Mock on-chain is enabled — blockchain actions are simulated." : null}
              {!mintEnabled ? (!mockEnv ? " On-chain minting is disabled (ENABLE_MINT not true)." : "") : null}
            </span>
            <div className="mt-2 text-sm text-orange-600 dark:text-orange-500">
              For real on-chain tests: fund your wallet with POL on Polygon Amoy faucet and set{" "}
              <code className="bg-orange-100 dark:bg-orange-900/30 px-1 py-0.5 rounded">VITE_MOCK_ONCHAIN=false</code> and{" "}
              <code className="bg-orange-100 dark:bg-orange-900/30 px-1 py-0.5 rounded">VITE_ENABLE_MINT=true</code>.
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
            onClick={() => setDismissed(true)}
            data-testid="button-dismiss-banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
