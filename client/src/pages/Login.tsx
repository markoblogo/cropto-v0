import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

type LoginFormValues = {
  email: string;
  password: string;
};

export default function Login() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = searchParams.get("returnTo") || "/";

  const loginSchema = z.object({
    email: z.string()
      .min(1, t("auth.login.validation.emailRequired"))
      .refine((email) => email.includes("@"), t("auth.login.validation.emailInvalid")),
    password: z.string().min(1, t("auth.login.validation.passwordRequired")),
  });

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/login", data);
      const result = await response.json();

      // Save token to localStorage
      localStorage.setItem("cropto_token", result.token);
      
      // Clear any stale admin mode - we now rely on backend role only
      localStorage.removeItem("cropto_admin_mode");
      
      toast({
        title: t("toast.success"),
        description: t("auth.login.toast.success"),
      });
      setLocation(returnTo);
    } catch (error: any) {
      toast({
        title: t("auth.login.toast.failedTitle"),
        description: error.message || t("auth.login.toast.failedDesc"),
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Button
            variant="ghost"
            className="mb-4 px-2"
            onClick={handleGoBack}
            data-testid="button-login-go-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("site.backToDashboard")}
          </Button>
          <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{t("auth.login.title")}</CardTitle>
          <CardDescription>
            {t("auth.login.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.login.emailLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder={t("auth.login.emailPlaceholder")}
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("auth.login.passwordLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={t("auth.login.passwordPlaceholder")}
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-login"
              >
                {isLoading ? t("auth.login.buttonLoading") : t("auth.login.button")}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            {t("auth.login.noAccount")}{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              {t("auth.login.registerLink")}
            </Link>
          </p>
        </CardFooter>
        </Card>
        </div>
      </div>
  );
}
