import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Download, CheckCircle2, MessageSquare, Mail, User, Briefcase, Calendar } from "lucide-react";
import type { Feedback } from "@shared/schema";
import { BackToDashboard } from "@/components/BackToDashboard";

export default function AdminFeedback() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Check authentication and role
  const { data: userData, isLoading: isAuthLoading } = useQuery<{ 
    user: { 
      id: string; 
      email: string; 
      role: string;
    } 
  } | null>({
    queryKey: ["/api/auth/me"],
    retry: false,
    enabled: !!localStorage.getItem('cropto_token'),
  });

  const user = userData?.user;
  const isAdminLevelUser = user && (
    user.role?.toLowerCase() === 'admin' || 
    user.role?.toLowerCase() === 'broker' || 
    user.role?.toLowerCase() === 'super_admin'
  );

  // Redirect if not admin-level
  useEffect(() => {
    if (!isAuthLoading && (!user || !isAdminLevelUser)) {
      setLocation("/");
    }
  }, [isAuthLoading, user, isAdminLevelUser, setLocation]);

  const { data: feedbackList = [], isLoading } = useQuery<Feedback[]>({
    queryKey: ["/api/admin/feedback"],
    enabled: !!isAdminLevelUser,
  });

  // Show loading while checking auth
  if (isAuthLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header onCreateOption={() => {}} />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  // Don't render if not admin (redirect will happen via useEffect)
  if (!isAdminLevelUser) {
    return null;
  }

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/feedback/${id}/resolve`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("cropto_token")}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to resolve feedback");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/feedback"] });
      toast({
        title: "Feedback resolved",
        description: "The feedback has been marked as resolved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resolve feedback",
        variant: "destructive",
      });
    },
  });

  const handleExport = async () => {
    try {
      const response = await fetch("/api/admin/feedback/export", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("cropto_token")}`,
        },
      });
      
      if (!response.ok) {
        throw new Error("Failed to export feedback");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "feedback-export.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Export successful",
        description: "Feedback data has been exported to CSV",
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Failed to export feedback",
        variant: "destructive",
      });
    }
  };

  const openFeedback = feedbackList.filter(f => f.status === "open");
  const resolvedFeedback = feedbackList.filter(f => f.status === "resolved");

  return (
    <div className="min-h-screen bg-background">
      <Header onCreateOption={() => {}} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Partner Feedback</h1>
              <p className="text-muted-foreground" data-testid="text-page-description">
                View and manage feedback from partners
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BackToDashboard />
              <Button onClick={handleExport} variant="outline" data-testid="button-export-csv">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Feedback</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-count">{openFeedback.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Resolved Feedback</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-resolved-count">{resolvedFeedback.length}</div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">Loading feedback...</p>
              </CardContent>
            </Card>
          ) : feedbackList.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground" data-testid="text-no-feedback">No feedback submitted yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {feedbackList.map((feedback) => (
                <Card key={feedback.id} data-testid={`card-feedback-${feedback.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant={feedback.status === "open" ? "default" : "secondary"}
                            data-testid={`badge-status-${feedback.id}`}
                          >
                            {feedback.status}
                          </Badge>
                          <Badge variant="outline" data-testid={`badge-role-${feedback.id}`}>
                            <Briefcase className="w-3 h-3 mr-1" />
                            {feedback.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span data-testid={`text-name-${feedback.id}`}>{feedback.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <span data-testid={`text-email-${feedback.id}`}>{feedback.email}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span data-testid={`text-date-${feedback.id}`}>
                              {feedback.createdAt && format(new Date(feedback.createdAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                      {feedback.status === "open" && (
                        <Button
                          size="sm"
                          onClick={() => resolveMutation.mutate(feedback.id)}
                          disabled={resolveMutation.isPending}
                          data-testid={`button-resolve-${feedback.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-1">Message</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-message-${feedback.id}`}>
                        {feedback.message}
                      </p>
                    </div>
                    {feedback.screenshotUrl && (
                      <div>
                        <p className="text-sm font-medium mb-1">Screenshot</p>
                        <a 
                          href={feedback.screenshotUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                          data-testid={`link-screenshot-${feedback.id}`}
                        >
                          {feedback.screenshotUrl}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
