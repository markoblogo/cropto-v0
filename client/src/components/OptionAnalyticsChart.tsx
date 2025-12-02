import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { StrikeVolumePoint, AnalyticsMetric } from "@/lib/optionCalculations";

export interface OptionAnalyticsChartProps {
  data: StrikeVolumePoint[];
  metric: AnalyticsMetric;
  /**
   * Human-readable filters label, e.g. "Commodity: GMO Soybeans • Expiry: Dec 10, 2025"
   */
  filtersLabel?: string;
  commodity?: string;
  expiry?: string;
}

const CALL_COLOR = "hsl(142, 76%, 36%)"; // Green (aligned with existing positive/P&L styles)
const PUT_COLOR = "hsl(0, 84%, 60%)"; // Red (aligned with existing negative/P&L styles)

export function StrikeVolumeChart({
  data,
  metric,
  filtersLabel,
  commodity,
  expiry,
}: OptionAnalyticsChartProps) {
  // Transform data: Calls go negative (left), Puts go positive (right)
  const chartData = data.map((item) => ({
    strike: item.strike,
    callVolume: -item.callVolume, // Negative for left side
    putVolume: item.putVolume, // Positive for right side
    // Keep original values for tooltip
    callVolumeOriginal: item.callVolume,
    putVolumeOriginal: item.putVolume,
  }));

  // Calculate domain for X axis
  const allVolumes = data.flatMap((item) => [item.callVolume, item.putVolume]);
  const maxVolume = allVolumes.length > 0 ? Math.max(...allVolumes) : 100;
  const xAxisDomain = [-maxVolume * 1.1, maxVolume * 1.1];

  // Format strike for Y axis
  const formatStrike = (value: number) => `$${value.toFixed(0)}`;

  // Format volume for X axis (absolute value)
  const formatVolume = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000) {
      return `${(absValue / 1000).toFixed(1)}k`;
    }
    return absValue.toFixed(0);
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <p className="font-semibold mb-2">Strike: ${data.strike.toFixed(2)}</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CALL_COLOR }} />
              <span>
                Calls: <span className="font-mono font-semibold">{data.callVolumeOriginal.toFixed(2)} t</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PUT_COLOR }} />
              <span>
                Puts: <span className="font-mono font-semibold">{data.putVolumeOriginal.toFixed(2)} t</span>
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {metric === "volume" ? "Volume" : "Open Interest"} Analytics
          </CardTitle>
          <CardDescription>
            {filtersLabel
              ? filtersLabel
              : [
                  commodity && `Commodity: ${commodity}`,
                  expiry && `Expiry: ${new Date(expiry).toLocaleDateString()}`,
                ]
                  .filter(Boolean)
                  .join(" • ")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">
                {metric === "volume"
                  ? "No volume data for the selected filters."
                  : "No open interest data for the selected filters."}
              </p>
              <p className="text-sm">Try another expiry or commodity.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {metric === "volume" ? "Volume" : "Open Interest"} Analytics
        </CardTitle>
        <CardDescription>
          {filtersLabel
            ? filtersLabel
            : [
                commodity && `Commodity: ${commodity}`,
                expiry && `Expiry: ${new Date(expiry).toLocaleDateString()}`,
              ]
                .filter(Boolean)
                .join(" • ")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 20, right: 30, left: 60, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                domain={xAxisDomain}
                tickFormatter={formatVolume}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                label={{
                  value: metric === "volume" ? "Volume (t)" : "Open Interest (t)",
                  position: "insideBottom",
                  offset: -10,
                  style: { textAnchor: "middle" },
                }}
              />
              <YAxis
                type="category"
                dataKey="strike"
                tickFormatter={formatStrike}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value) => {
                  if (value === "callVolume") return "Calls";
                  if (value === "putVolume") return "Puts";
                  return value;
                }}
              />
              {/* Central vertical line at X = 0 for symmetry */}
              <ReferenceLine x={0} stroke="hsl(var(--border))" />
              <Bar
                dataKey="callVolume"
                name="Calls"
                fill={CALL_COLOR}
                radius={[0, 4, 4, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-call-${index}`} fill={CALL_COLOR} />
                ))}
              </Bar>
              <Bar
                dataKey="putVolume"
                name="Puts"
                fill={PUT_COLOR}
                radius={[4, 0, 0, 4]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-put-${index}`} fill={PUT_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// Backwards-compatible export so existing usages keep working
export const OptionAnalyticsChart = StrikeVolumeChart;


