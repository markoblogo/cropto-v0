import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { BackToDashboard } from "@/components/BackToDashboard";
import { AdminModeSelectionModal } from "@/components/AdminModeSelectionModal";

const loginSchema = z.object({
  email: z.string()
    .min(1, "Email is required")
    .refine((email) => email.includes("@"), "Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showAdminModeSelection, setShowAdminModeSelection] = useState(false);
  const [userRole, setUserRole] = useState<'ADMIN' | 'SUPER_ADMIN' | null>(null);

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

      // Check if user is ADMIN or SUPER_ADMIN
      if (result.user?.role === 'ADMIN' || result.user?.role === 'SUPER_ADMIN') {
        setUserRole(result.user.role);
        setShowAdminModeSelection(true);
        setIsLoading(false);
      } else {
        // Regular USER - clear any stale admin mode and redirect immediately
        localStorage.removeItem("cropto_admin_mode");
        toast({
          title: "Success",
          description: "Logged in successfully",
        });
        setLocation("/");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleAdminModeSelection = (mode: 'USER' | 'ADMIN') => {
    // Store the selected mode in localStorage
    localStorage.setItem("cropto_admin_mode", mode);

    toast({
      title: "Success",
      description: `Logged in successfully as ${mode === 'ADMIN' ? 'Admin' : 'User'}`,
    });

    setShowAdminModeSelection(false);
    setLocation("/");
  };

  const handleAdminModeCancel = () => {
    // User cancelled mode selection - log them out
    localStorage.removeItem("cropto_token");
    localStorage.removeItem("cropto_admin_mode");
    
    toast({
      title: "Cancelled",
      description: "Login cancelled",
    });

    setShowAdminModeSelection(false);
    setUserRole(null);
  };

  return (
    <>
      {userRole && (
        <AdminModeSelectionModal
          open={showAdminModeSelection}
          userRole={userRole}
          onSelect={handleAdminModeSelection}
          onCancel={handleAdminModeCancel}
        />
      )}
      
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <BackToDashboard />
          <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login to Cropto</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="farmer@example.com"
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Enter your password"
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
                {isLoading ? "Logging in..." : "Login"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              Register
            </Link>
          </p>
        </CardFooter>
        </Card>
        </div>
      </div>
    </>
  );
}
