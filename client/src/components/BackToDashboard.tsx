import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { Link } from "wouter";

interface BackToDashboardProps {
  className?: string;
}

export function BackToDashboard({ className }: BackToDashboardProps) {
  return (
    <Button variant="outline" size="sm" asChild className={className} data-testid="button-back-dashboard">
      <Link href="/">
        <Home className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>
    </Button>
  );
}
