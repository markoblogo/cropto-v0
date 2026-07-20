import { Link } from "wouter";
import { CalendarClock, CircleSlash2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ProductLifecycleBanner() {
  const { t } = useTranslation();

  return (
    <section className="border-b border-amber-200/75 bg-amber-50/80 text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/30 dark:text-amber-100/95">
      <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <Card className="border border-amber-200/65 bg-white/90 shadow-sm dark:border-amber-400/25 dark:bg-amber-950/45">
          <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between md:gap-4">
            <div className="space-y-2">
              <Badge variant="secondary" className="bg-amber-200/70 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
                {t("home.lifecycle.badge")}
              </Badge>
              <h2 className="text-lg font-semibold leading-tight sm:text-xl">
                {t("home.lifecycle.title")}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-foreground/85">
                {t("home.lifecycle.description")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/deck">
                  {t("home.lifecycle.actions.deck")}
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href="/#market-dashboard">
                  {t("home.lifecycle.actions.market")}
                </a>
              </Button>
              <Button size="sm" asChild>
                <Link href="/feedback">
                  {t("home.lifecycle.actions.feedback")}
                </Link>
              </Button>
            </div>
            <div className="grid w-full gap-1.5 text-xs text-muted-foreground md:w-auto">
              <div className="flex items-center gap-1.5">
                <CircleSlash2 className="h-4 w-4" />
                <span>{t("home.lifecycle.stateLine")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" />
                <span>{t("home.lifecycle.refreshLine")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" />
                <span>{t("home.lifecycle.lastChecked")}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
