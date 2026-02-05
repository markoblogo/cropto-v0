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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const searchParams = new URLSearchParams(window.location.search);
  const returnTo = searchParams.get("returnTo") || "/";

  const registerSchema = z.object({
    email: z
      .string()
      .min(1, t("auth.register.validation.emailRequired"))
      .refine((email) => email.includes("@"), t("auth.register.validation.emailInvalid")),
    password: z.string().min(6, t("auth.register.validation.passwordMin")),
    role: z.enum(["farmer", "trader", "broker"], {
      errorMap: () => ({ message: t("auth.register.validation.roleRequired") }),
    }),
  });

  type RegisterFormValues = z.infer<typeof registerSchema>;

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      role: undefined,
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/register", data);
      const result = await response.json();

      // Save token to localStorage
      localStorage.setItem("cropto_token", result.token);

      toast({
        title: t("auth.register.toast.successTitle"),
        description: t("auth.register.toast.successDesc"),
      });

      // Redirect back to requested page (or dashboard by default)
      setLocation(returnTo);
    } catch (error: any) {
      toast({
        title: t("auth.register.toast.failedTitle"),
        description: error.message || t("auth.register.toast.failedDesc"),
        variant: "destructive",
      });
    } finally {
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
          data-testid="button-register-go-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("site.backToDashboard")}
        </Button>
        <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">{t("auth.register.title")}</CardTitle>
          <CardDescription>
            {t("auth.register.subtitle")}
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
                    <FormLabel>{t("auth.register.emailLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder={t("auth.register.emailPlaceholder")}
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
                    <FormLabel>{t("auth.register.passwordLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder={t("auth.register.passwordPlaceholder")}
                        data-testid="input-password"
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
                    <FormLabel>{t("auth.register.roleLabel")}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-role">
                          <SelectValue placeholder={t("auth.register.rolePlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="farmer" data-testid="option-farmer">
                          {t("auth.register.roleFarmer")}
                        </SelectItem>
                        <SelectItem value="trader" data-testid="option-trader">
                          {t("auth.register.roleTrader")}
                        </SelectItem>
                        <SelectItem value="broker" data-testid="option-broker">
                          {t("auth.register.roleBroker")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-register"
              >
                {isLoading ? t("auth.register.buttonLoading") : t("auth.register.button")}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            {t("auth.register.alreadyAccount")}{" "}
            <Link
              href="/login"
              className="text-primary hover:underline"
              data-testid="link-login"
            >
              {t("auth.register.loginLink")}
            </Link>
          </p>
        </CardFooter>
      </Card>
      </div>
    </div>
  );
}
