import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface PricePoint {
  timestamp: string | Date;
  price: number;
}

interface SpotMiniChartProps {
  data: PricePoint[];
  height?: number;
  color?: string;
}

/**
 * Mini sparkline chart for spot price history
 * Uses recharts for rendering, but styled minimally
 */
export function SpotMiniChart({ 
  data, 
  height = 60,
  color = "hsl(var(--primary))"
}: SpotMiniChartProps) {
  // Transform data for recharts
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map((point) => ({
      price: point.price,
      timestamp: typeof point.timestamp === 'string' 
        ? new Date(point.timestamp).getTime() 
        : point.timestamp instanceof Date
        ? point.timestamp.getTime()
        : Date.now(),
    }));
  }, [data]);

  // If no data, show placeholder
  if (!chartData || chartData.length === 0) {
    return (
      <div 
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height: `${height}px` }}
      >
        History coming soon
      </div>
    );
  }

  // If only one point, show a flat line
  if (chartData.length === 1) {
    return (
      <div 
        className="flex items-center justify-center"
        style={{ height: `${height}px` }}
      >
        <div 
          className="w-full border-t"
          style={{ borderColor: color, opacity: 0.5 }}
        />
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart 
        data={chartData} 
        margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
      >
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

