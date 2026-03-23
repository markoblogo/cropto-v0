import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Download, CheckCircle2, MessageSquare, Mail, User, Briefcase, Calendar } from "lucide-react";
import type { Feedback } from "@shared/schema";

type ParserHealthResponse = {
  generatedAt: string;
  sources: {
    IGC: {
      enabled: boolean;
      lastFetchAt: string | null;
      lastSuccessAt: string | null;
      lastRows: number | null;
      lastError: string | null;
      lastErrorAt: string | null;
      latestAsOf: string | null;
      status: "fresh" | "stale" | "no_recent";
    };
    USDA_AMS: {
      enabled: boolean;
      lastFetchAt: string | null;
      lastSuccessAt: string | null;
      lastRows: number | null;
      lastError: string | null;
      lastErrorAt: string | null;
      latestAsOf: string | null;
      lastPublishedDate: string | null;
      status: "fresh" | "stale" | "no_recent";
    };
    BARCHART_USDA: {
      enabled: boolean;
      lastFetchAt: string | null;
      lastSuccessAt: string | null;
      lastRows: number | null;
      lastError: string | null;
      lastErrorAt: string | null;
      latestAsOf: string | null;
      status: "fresh" | "stale" | "no_recent";
    };
    FUTURES_PROXY: {
      enabled: boolean;
      lastFetchAt: string | null;
      lastSuccessAt: string | null;
      lastRows: number | null;
      lastError: string | null;
      lastErrorAt: string | null;
      latestAsOf: string | null;
      status: "fresh" | "stale" | "no_recent";
    };
  };
  countries: Array<{
    source: string;
    country: string;
    latestAsOf: string | null;
    rows24h: number;
    totalRows: number;
    status: "fresh" | "stale" | "no_recent";
  }>;
};

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

  const { data: emailSettings } = useQuery<{ emails: string }>({
    queryKey: ["/api/admin/settings/feedback-emails"],
    enabled: !!isAdminLevelUser,
  });

  const { data: mailingModeSettings } = useQuery<{ mode: "manual" | "auto" }>({
    queryKey: ["/api/admin/settings/index-update-mailing-mode"],
    enabled: !!isAdminLevelUser,
  });
  const { data: parserHealth, isLoading: isParserHealthLoading } = useQuery<ParserHealthResponse>({
    queryKey: ["/api/admin/parsers/health"],
    enabled: !!isAdminLevelUser,
  });

  const [recipientEmails, setRecipientEmails] = useState("");
  const [mailingMode, setMailingMode] = useState<"manual" | "auto">("manual");

  useEffect(() => {
    if (emailSettings?.emails != null) {
      setRecipientEmails(emailSettings.emails);
    }
  }, [emailSettings?.emails]);

  useEffect(() => {
    if (mailingModeSettings?.mode) {
      setMailingMode(mailingModeSettings.mode);
    }
  }, [mailingModeSettings?.mode]);

  // Show loading while checking auth
  if (isAuthLoading || !user) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </MainLayout>
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

  const saveRecipientsMutation = useMutation({
    mutationFn: async (emails: string) => {
      const response = await fetch("/api/admin/settings/feedback-emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("cropto_token")}`,
        },
        body: JSON.stringify({ emails }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save recipients");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/feedback-emails"] });
      toast({
        title: "Saved",
        description: "Feedback alert recipients updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save recipients",
        variant: "destructive",
      });
    },
  });

  const saveMailingModeMutation = useMutation({
    mutationFn: async (mode: "manual" | "auto") => {
      const response = await fetch("/api/admin/settings/index-update-mailing-mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("cropto_token")}`,
        },
        body: JSON.stringify({ mode }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save mailing mode");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/index-update-mailing-mode"] });
      toast({
        title: "Saved",
        description: "Index update mailing mode updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save mailing mode",
        variant: "destructive",
      });
    },
  });

  const openFeedback = feedbackList.filter(f => f.status === "open");
  const resolvedFeedback = feedbackList.filter(f => f.status === "resolved");
  const statusBadgeClass = (status: "fresh" | "stale" | "no_recent") => {
    if (status === "fresh") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (status === "stale") return "bg-amber-100 text-amber-800 border-amber-200";
    return "bg-rose-100 text-rose-800 border-rose-200";
  };
  const fmt = (value: string | null | undefined) => {
    if (!value) return "n/a";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return "n/a";
    return dt.toLocaleString();
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Partner Feedback</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              View and manage feedback from partners
            </p>
          </div>
          <Button onClick={handleExport} variant="outline" data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback Alert Emails</CardTitle>
            <CardDescription>
              Comma-separated recipients for new feedback notifications. If empty, fallback address is used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={recipientEmails}
              onChange={(e) => setRecipientEmails(e.target.value)}
              placeholder="ops@cropto.com, support@cropto.com"
              data-testid="input-feedback-alert-emails"
            />
            <Button
              onClick={() => saveRecipientsMutation.mutate(recipientEmails)}
              disabled={saveRecipientsMutation.isPending}
              data-testid="button-save-feedback-alert-emails"
            >
              {saveRecipientsMutation.isPending ? "Saving..." : "Save recipients"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Index Update Email Mode</CardTitle>
            <CardDescription>
              Manual mode sends emails only for manual index updates. Auto mode enables emails for parser/automatic updates as well.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={mailingMode}
              onValueChange={(v) => setMailingMode(v as "manual" | "auto")}
              className="grid gap-3"
              data-testid="radio-index-update-mailing-mode"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="mailing-mode-manual" />
                <Label htmlFor="mailing-mode-manual">Manual (default)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="auto" id="mailing-mode-auto" />
                <Label htmlFor="mailing-mode-auto">Auto</Label>
              </div>
            </RadioGroup>
            <Button
              onClick={() => saveMailingModeMutation.mutate(mailingMode)}
              disabled={saveMailingModeMutation.isPending}
              data-testid="button-save-index-update-mailing-mode"
            >
              {saveMailingModeMutation.isPending ? "Saving..." : "Save mode"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Index Parser Health</CardTitle>
            <CardDescription>
              Live status for primary parsers and per-country freshness from stored index rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isParserHealthLoading || !parserHealth ? (
              <p className="text-sm text-muted-foreground">Loading parser health...</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  {(["IGC", "USDA_AMS", "BARCHART_USDA", "FUTURES_PROXY"] as const).map((sourceKey) => {
                    const source = parserHealth.sources[sourceKey];
                    return (
                      <div key={sourceKey} className="rounded-md border p-3 space-y-2" data-testid={`card-parser-${sourceKey.toLowerCase()}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{sourceKey}</p>
                          <Badge variant="outline" className={statusBadgeClass(source.status)}>
                            {source.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>Enabled: {source.enabled ? "yes" : "no"}</p>
                          <p>Last fetch: {fmt(source.lastFetchAt)}</p>
                          <p>Last success: {fmt(source.lastSuccessAt)}</p>
                          <p>Latest asOf: {fmt(source.latestAsOf)}</p>
                          <p>Last rows: {source.lastRows ?? 0}</p>
                          {sourceKey === "USDA_AMS" && "lastPublishedDate" in source ? (
                            <p>MARS latest published: {fmt(source.lastPublishedDate)}</p>
                          ) : null}
                          {source.lastError ? <p className="text-destructive">Last error: {source.lastError}</p> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-sm font-semibold">Country/source freshness</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {parserHealth.countries.map((row) => (
                      <div key={`${row.source}-${row.country}`} className="flex items-center justify-between rounded-sm border px-2 py-1 text-xs">
                        <div>
                          <span className="font-medium">{row.country}</span>
                          <span className="text-muted-foreground"> • {row.source}</span>
                          <span className="text-muted-foreground"> • rows24h: {row.rows24h}</span>
                        </div>
                        <Badge variant="outline" className={statusBadgeClass(row.status)}>
                          {row.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Generated: {fmt(parserHealth.generatedAt)}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
    </MainLayout>
  );
}
