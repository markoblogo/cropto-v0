import { BarChart3, TrendingUp, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MetricCardsProps {
  totalOptions: number;
  openPositions: number;
  totalVolume: number;
}

export function MetricCards({ totalOptions, openPositions, totalVolume }: MetricCardsProps) {
  const metrics = [
    {
      title: "Total Options",
      value: totalOptions.toString(),
      icon: BarChart3,
      description: "All time contracts",
      color: "primary",
      testId: "card-metric-total-options"
    },
    {
      title: "Open Positions",
      value: openPositions.toString(),
      icon: TrendingUp,
      description: "Currently active",
      color: "secondary",
      testId: "card-metric-open-positions"
    },
    {
      title: "Total Volume",
      value: `$${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      description: "Aggregate value",
      color: "accent",
      testId: "card-metric-total-volume"
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card 
            key={metric.title}
            className="relative overflow-hidden rounded-2xl border-2 hover-elevate active-elevate-2 transition-all duration-200"
            data-testid={metric.testId}
          >
            {/* Gradient Background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${
              metric.color === 'primary' ? 'from-primary/10 to-primary/5' :
              metric.color === 'secondary' ? 'from-secondary/10 to-secondary/5' :
              'from-accent/10 to-accent/5'
            }`} />

            {/* Content */}
            <div className="relative p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${
                  metric.color === 'primary' ? 'bg-primary/20' :
                  metric.color === 'secondary' ? 'bg-secondary/20' :
                  'bg-accent/20'
                }`}>
                  <Icon className={`h-6 w-6 ${
                    metric.color === 'primary' ? 'text-primary' :
                    metric.color === 'secondary' ? 'text-secondary' :
                    'text-accent'
                  }`} />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium">
                  {metric.title}
                </p>
                <p 
                  className="text-4xl font-bold font-mono tracking-tight"
                  data-testid={`text-${metric.testId}-value`}
                >
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground">
                  {metric.description}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
