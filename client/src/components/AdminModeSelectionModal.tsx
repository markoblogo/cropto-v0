import { User, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AdminModeSelectionModalProps {
  open: boolean;
  userRole: 'ADMIN' | 'SUPER_ADMIN';
  onSelect: (mode: 'USER' | 'ADMIN') => void;
  onCancel: () => void;
}

const modes = [
  {
    value: 'USER' as const,
    label: 'Enter as User',
    icon: User,
    description: 'Access the platform as a regular user',
    color: 'text-blue-600 dark:text-blue-400',
  },
  {
    value: 'ADMIN' as const,
    label: 'Enter as Admin',
    icon: Shield,
    description: 'Access admin features and management tools',
    color: 'text-purple-600 dark:text-purple-400',
  },
];

export function AdminModeSelectionModal({ open, userRole, onSelect, onCancel }: AdminModeSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onCancel();
      }
    }}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-admin-mode-selection">
        <DialogHeader>
          <DialogTitle>Choose Login Mode</DialogTitle>
          <DialogDescription>
            You have {userRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'} privileges. 
            How would you like to enter the platform?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-3 pt-4">
          {modes.map((mode) => {
            const Icon = mode.icon;
            
            return (
              <Card
                key={mode.value}
                className="p-4 cursor-pointer transition-all hover-elevate hover:border-primary"
                onClick={() => onSelect(mode.value)}
                data-testid={`card-mode-${mode.value.toLowerCase()}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-lg bg-background ${mode.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-base mb-1">{mode.label}</h3>
                    <p className="text-sm text-muted-foreground">{mode.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
          
          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={onCancel}
            data-testid="button-cancel-mode-selection"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
