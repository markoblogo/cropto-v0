import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AUTH_PROMPT_EVENT, type AuthPromptDetail } from "@/lib/authPrompt";

export function AuthPromptGateway() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [returnTo, setReturnTo] = useState("/");

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<AuthPromptDetail>;
      setReturnTo(customEvent.detail?.returnTo || "/");
      setOpen(true);
    };
    window.addEventListener(AUTH_PROMPT_EVENT, handler);
    return () => window.removeEventListener(AUTH_PROMPT_EVENT, handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("auth.login.title")}</DialogTitle>
          <DialogDescription>
            {t("header.authPrompt.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("button.cancel")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(returnTo)}`)}>
            {t("button.register")}
          </Button>
          <Button onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(returnTo)}`)}>
            {t("button.login")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
