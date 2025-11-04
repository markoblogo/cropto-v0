import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Notification } from "@shared/schema";

export function NotificationsDropdown() {
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = notifications.filter(n => n.read === "false").length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "MARGIN_CALL":
        return "⚠️";
      case "OPTION_MATCHED":
        return "🤝";
      case "OPTION_EXERCISED":
        return "✓";
      case "LIQUIDATION":
        return "🔴";
      default:
        return "📢";
    }
  };

  const getNotificationTypeLabel = (type: string) => {
    switch (type) {
      case "MARGIN_CALL":
        return "Margin Call";
      case "OPTION_MATCHED":
        return "Option Matched";
      case "OPTION_EXERCISED":
        return "Option Exercised";
      case "LIQUIDATION":
        return "Liquidation";
      default:
        return "Notification";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80" data-testid="dropdown-notifications">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unreadCount} new
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground" data-testid="empty-notifications">
            No notifications yet
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                  notification.read === "false" ? "bg-muted/50" : ""
                }`}
                data-testid={`notification-item-${notification.id}`}
              >
                <div className="flex items-start gap-2 w-full">
                  <span className="text-lg flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold">
                        {getNotificationTypeLabel(notification.type)}
                      </span>
                      {notification.read === "false" && (
                        <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(notification.createdAt), "MMM dd, yyyy 'at' HH:mm")}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
