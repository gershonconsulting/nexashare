import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
  change?: {
    value: string;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, icon, iconBgColor, iconColor, change }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center">
        <div className={cn("h-12 w-12 rounded-full flex items-center justify-center mr-4", iconBgColor)}>
          <i className={cn(`${icon} text-xl`, iconColor)}></i>
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-600">{title}</p>
          <h3 className="text-2xl font-bold text-neutral-900">{value}</h3>
          {change && (
            <p className={cn(
              "text-xs flex items-center mt-1",
              change.isPositive ? "text-success" : "text-error"
            )}>
              <i className={cn(
                "fas mr-1",
                change.isPositive ? "fa-arrow-up" : "fa-arrow-down"
              )}></i>
              {change.value}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
