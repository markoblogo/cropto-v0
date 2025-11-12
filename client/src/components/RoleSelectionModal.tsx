import { useState } from "react";
import { User, TrendingUp, Briefcase } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface RoleSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const roles = [
  {
    value: 'farmer' as const,
    label: 'Farmer',
    icon: User,
    description: 'I grow and sell grain commodities',
    color: 'text-green-600 dark:text-green-400',
  },
  {
    value: 'trader' as const,
    label: 'Trader',
    icon: TrendingUp,
    description: 'I trade commodity options and futures',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    value: 'broker' as const,
    label: 'Broker',
    icon: Briefcase,
    description: 'I facilitate trades and manage the platform',
    color: 'text-purple-600 dark:text-purple-400',
  },
];

export function RoleSelectionModal({ open, onOpenChange, onSuccess }: RoleSelectionModalProps) {
  const [selectedRole, setSelectedRole] = useState<'farmer' | 'trader' | 'broker' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!selectedRole) {
      toast({
        title: "Please select a role",
        description: "Choose the role that best describes you",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiRequest("PUT", "/api/auth/update-role", {
        role: selectedRole,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      // Invalidate user query to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Welcome to Cropto!",
        description: `Your account has been set up as a ${selectedRole}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Role selection error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to set up your account",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Welcome to Cropto!</DialogTitle>
          <DialogDescription>
            Let's set up your account. What best describes your role?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 pt-4">
          <div className="grid gap-3">
            {roles.map((role) => {
              const Icon = role.icon;
              const isSelected = selectedRole === role.value;
              
              return (
                <Card
                  key={role.value}
                  className={`p-4 cursor-pointer transition-all hover-elevate ${
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border'
                  }`}
                  onClick={() => setSelectedRole(role.value)}
                  data-testid={`card-role-${role.value}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg bg-background ${role.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-base mb-1">{role.label}</h3>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected 
                        ? 'border-primary bg-primary' 
                        : 'border-border'
                    }`}>
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!selectedRole || isSubmitting}
            className="w-full"
            size="lg"
            data-testid="button-submit-role"
          >
            {isSubmitting ? "Setting up..." : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
