import { Card, CardContent } from "@/components/ui/card";

type Props = {
  healthPct: number;
  totalNotionalUsd: number;
  requiredMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
};

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PortfolioHealthGauge({
  healthPct,
  totalNotionalUsd,
  requiredMargin,
  realizedPnl,
  unrealizedPnl,
}: Props) {
  const pct = Math.max(0, Math.min(200, healthPct || 0));
  const barPct = Math.max(0, Math.min(100, pct));
  const color =
    pct >= 80 ? "bg-primary" : pct >= 50 ? "bg-amber-400" : "bg-destructive";
  const textColor =
    pct >= 80 ? "text-primary" : pct >= 50 ? "text-amber-600" : "text-destructive";

  return (
    <Card className="border border-muted/60">
      <CardContent className="relative px-4 pt-3 pb-6">
        {/* Top row */}
        <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap text-sm md:text-base md:grid md:overflow-visible md:whitespace-normal md:grid-cols-[minmax(180px,1.2fr)_1fr_1fr_1fr_1fr_auto]">
          <div className="font-semibold min-w-[160px] md:min-w-0 md:truncate">Portfolio Health</div>

          <InlineStat label="Notional" value={`$${formatMoney(totalNotionalUsd)}`} />
          <InlineStat label="Margin" value={`$${formatMoney(requiredMargin)}`} />
          <InlineStat
            label="Realized"
            value={`${realizedPnl >= 0 ? "+" : ""}$${formatMoney(realizedPnl)}`}
          />
          <InlineStat
            label="Unrealized"
            value={`${unrealizedPnl >= 0 ? "+" : ""}$${formatMoney(unrealizedPnl)}`}
          />

          <div className={`font-bold ${textColor} md:justify-self-end tabular-nums`}>
            {pct.toFixed(0)}%
          </div>
        </div>

        {/* Bottom progress bar */}
        <div className="absolute left-3 right-3 bottom-2 h-2 rounded-full bg-muted/60 overflow-hidden">
          <div
            className={`h-full ${color} transition-all`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 truncate">
      <span className="text-muted-foreground">{label}:</span>{" "}
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

