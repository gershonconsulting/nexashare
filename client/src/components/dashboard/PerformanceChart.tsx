import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ChartData {
  days: string[];
  impressions: number[];
  targets: number[];
}

interface PerformanceChartProps {
  data: ChartData;
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  const [timeframe, setTimeframe] = useState("7days");
  
  // This would be replaced with real chart rendering using a library like Recharts
  // For this MVP, we'll use the simple CSS chart as in the design
  
  return (
    <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-neutral-900">Performance Overview</h3>
        <div className="relative">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[150px] bg-neutral-50 border border-neutral-200 text-neutral-700 py-1 text-sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="chart-container" style={{ width: '100%', height: '230px', position: 'relative' }}>
        {data.days.map((day, index) => (
          <div key={`target-${index}`} className="chart-bar bg-primary/20" 
            style={{ 
              left: `${9 + index * 11}%`, 
              width: '6%', 
              height: `${(data.targets[index] / Math.max(...data.targets)) * 90}%`,
              position: 'absolute',
              bottom: 0,
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.5s ease'
            }}
          />
        ))}
        
        {data.days.map((day, index) => (
          <div key={`impression-${index}`} className="chart-bar bg-primary" 
            style={{ 
              left: `${9 + index * 11}%`, 
              width: '6%', 
              height: `${(data.impressions[index] / Math.max(...data.targets)) * 90}%`,
              position: 'absolute',
              bottom: 0,
              borderRadius: '4px 4px 0 0',
              transition: 'height 0.5s ease'
            }}
          />
        ))}
      </div>
      
      <div className="flex justify-between text-xs text-neutral-500 mt-4">
        {data.days.map((day, index) => (
          <span key={index}>{day}</span>
        ))}
      </div>
      
      <div className="flex items-center justify-center mt-6 space-x-8">
        <div className="flex items-center">
          <div className="h-3 w-3 bg-primary mr-2"></div>
          <span className="text-sm text-neutral-600">Impressions</span>
        </div>
        <div className="flex items-center">
          <div className="h-3 w-3 bg-primary/20 mr-2"></div>
          <span className="text-sm text-neutral-600">Target</span>
        </div>
      </div>
    </div>
  );
}
