import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFeedbackSchema } from "@shared/schema";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { CheckCircle2, Send } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { useTranslation } from "react-i18next";

type FeedbackFormData = z.infer<typeof insertFeedbackSchema> & {
  category: "bug" | "data" | "ux" | "other";
};

export default function Feedback() {
  const { t, i18n } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const feedbackFormSchema = useMemo(
    () =>
      insertFeedbackSchema.extend({
        name: z.string().min(1, t("page.feedback.validation.nameRequired")),
        email: z
          .string()
          .min(1, t("page.feedback.validation.emailRequired"))
          .email(t("page.feedback.validation.emailInvalid")),
        role: z.string().min(1, t("page.feedback.validation.roleRequired")),
        category: z.enum(["bug", "data", "ux", "other"]),
        message: z.string().min(1, t("page.feedback.validation.messageRequired")),
        screenshotUrl: z
          .string()
          .optional()
          .refine((value) => {
            if (!value) return true;
            if (value.startsWith("/uploads/")) return true;
            try {
              new URL(value);
              return true;
            } catch {
              return false;
            }
          }, t("page.feedback.validation.urlInvalid")),
      }),
    [t]
  );

  const { data: authData } = useQuery<{
    user?: { name?: string; email?: string; role?: string; walletAddress?: string; id?: string };
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!localStorage.getItem("cropto_token"),
  });

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackFormSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      role: "",
      category: "other",
      message: "",
      screenshotUrl: "",
    },
  });

  useEffect(() => {
    const user = authData?.user;
    if (!user) return;

    if (!form.getValues("name")) form.setValue("name", user.name || "", { shouldValidate: true });
    if (!form.getValues("email")) form.setValue("email", user.email || "", { shouldValidate: true });
    if (!form.getValues("role")) form.setValue("role", user.role || "", { shouldValidate: true });
  }, [authData, form]);

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      const user = authData?.user;
      const currentPath = window.location.pathname + window.location.search;
      const normalizedLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
      const metadataLine =
        `\n\n---\n` +
        `Category: ${data.category}\n` +
        `Environment: ${window.location.hostname}\n` +
        `Page: ${currentPath}\n` +
        `Language: ${normalizedLang}\n` +
        `User ID: ${user?.id ?? "anonymous"}\n` +
        `Wallet: ${user?.walletAddress ?? "not connected"}\n` +
        `User Agent: ${navigator.userAgent}`;

      const payload = {
        ...data,
        message: `${data.message}${metadataLine}`,
      };

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to submit feedback");
      }
      return response.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: t("page.feedback.toast.successTitle"),
        description: t("page.feedback.toast.successDesc"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("page.feedback.toast.errorTitle"),
        description: error.message || t("page.feedback.toast.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => {
          const result = String(reader.result || "");
          const payload = result.split(",")[1];
          if (!payload) {
            reject(new Error("Failed to parse file data"));
            return;
          }
          resolve(payload);
        };
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/feedback/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          dataBase64,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }

      const body = await response.json();
      return body.url as string;
    },
    onSuccess: (url) => {
      form.setValue("screenshotUrl", url, { shouldDirty: true, shouldValidate: true });
      toast({
        title: t("page.feedback.toast.successTitle"),
        description: t("page.feedback.upload.success"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("page.feedback.toast.errorTitle"),
        description: error?.message || t("page.feedback.upload.failed"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FeedbackFormData) => {
    submitMutation.mutate(data);
  };

  const handleScreenshotFile = (file?: File) => {
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const envSummary = useMemo(() => {
    const user = authData?.user;
    return {
      environment: window.location.hostname,
      page: window.location.pathname + window.location.search,
      language: (i18n.resolvedLanguage || i18n.language || "en").split("-")[0],
      wallet: user?.walletAddress || t("page.feedback.environment.notConnected"),
      userId: user?.id || "anonymous",
    };
  }, [authData, i18n.language, i18n.resolvedLanguage, t]);

  if (submitted) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center">
          <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" data-testid="icon-success" />
            </div>
            <CardTitle data-testid="text-success-title">{t("page.feedback.success.title")}</CardTitle>
            <CardDescription data-testid="text-success-description">
              {t("page.feedback.toast.successDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                setSubmitted(false);
                form.reset();
              }}
              className="w-full"
              variant="outline"
              data-testid="button-submit-another"
            >
              {t("page.feedback.actions.submitAnother")}
            </Button>
          </CardContent>
        </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle data-testid="text-page-title">{t("page.feedback.title")}</CardTitle>
            <CardDescription data-testid="text-page-description">
              {t("page.feedback.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.name.label")} *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("page.feedback.fields.name.placeholder")}
                          {...field}
                          data-testid="input-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium mb-2">{t("page.feedback.environment.title")}</p>
                  <p className="text-muted-foreground">{t("page.feedback.environment.environment")}: {envSummary.environment}</p>
                  <p className="text-muted-foreground">{t("page.feedback.environment.page")}: {envSummary.page}</p>
                  <p className="text-muted-foreground">{t("page.feedback.environment.language")}: {envSummary.language}</p>
                  <p className="text-muted-foreground">{t("page.feedback.environment.wallet")}: {envSummary.wallet}</p>
                  <p className="text-muted-foreground">{t("page.feedback.environment.userId")}: {envSummary.userId}</p>
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.email.label")} *</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("page.feedback.fields.email.placeholder")}
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.role.label")} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder={t("page.feedback.fields.role.placeholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Partner" data-testid="option-partner">Partner</SelectItem>
                          <SelectItem value="Investor" data-testid="option-investor">Investor</SelectItem>
                          <SelectItem value="Tester" data-testid="option-tester">Tester</SelectItem>
                          <SelectItem value="Developer" data-testid="option-developer">Developer</SelectItem>
                          <SelectItem value="Other" data-testid="option-other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.category.label")} *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder={t("page.feedback.fields.category.placeholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="bug">{t("page.feedback.category.bug")}</SelectItem>
                          <SelectItem value="data">{t("page.feedback.category.data")}</SelectItem>
                          <SelectItem value="ux">{t("page.feedback.category.ux")}</SelectItem>
                          <SelectItem value="other">{t("page.feedback.category.other")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.message.label")} *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("page.feedback.fields.message.placeholder")}
                          className="min-h-32 resize-none"
                          {...field}
                          data-testid="input-message"
                        />
                      </FormControl>
                      <FormDescription>{t("page.feedback.helperText")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="screenshotUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("page.feedback.fields.screenshotUrl.label")}</FormLabel>
                      <div className="rounded-md border border-dashed p-3">
                        <p className="text-sm text-muted-foreground mb-2">
                          {t("page.feedback.upload.hint")}
                        </p>
                        <Input
                          type="file"
                          accept="image/*"
                          disabled={uploadMutation.isPending}
                          onChange={(e) => handleScreenshotFile(e.target.files?.[0])}
                          data-testid="input-screenshot-file"
                        />
                        {uploadMutation.isPending && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("page.feedback.upload.uploading")}
                          </p>
                        )}
                      </div>
                      <FormControl>
                        <Input
                          placeholder={t("page.feedback.fields.screenshotUrl.placeholder")}
                          {...field}
                          value={field.value || ""}
                          data-testid="input-screenshot-url"
                        />
                      </FormControl>
                      <FormDescription>{t("page.feedback.upload.orPasteUrl")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitMutation.isPending || !form.formState.isValid}
                  data-testid="button-submit-feedback"
                >
                  {submitMutation.isPending ? (
                    t("page.feedback.actions.submitting")
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t("page.feedback.actions.submit")}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {t("page.feedback.privacyNote")}
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
