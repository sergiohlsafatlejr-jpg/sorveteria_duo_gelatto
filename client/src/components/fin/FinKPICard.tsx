import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FinKPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  trend?: { value: number; label: string };
  alert?: boolean;
  onClick?: () => void;
}

export function FinKPICard({
  title, value, subtitle, icon: Icon, iconColor = "text-primary",
  bgColor = "bg-primary/10", trend, alert, onClick,
}: FinKPICardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-card/60 p-4 flex flex-col gap-3 transition-all duration-200",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30",
        alert && "border-destructive/40 bg-destructive/5"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={cn("p-2 rounded-lg", bgColor)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
        {trend && (
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            trend.value > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-500"
          )}>
            {trend.value > 0 ? "+" : ""}{trend.value.toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
        <p className={cn("text-2xl font-bold mt-0.5", alert && "text-destructive")}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}
