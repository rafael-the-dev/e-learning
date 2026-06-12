import { cn } from "@/shared/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { ReactNode } from "react";

// ─── Two-column grid below KPI cards ─────────────────────────────────────────

export function ExecutiveMainGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 xl:grid-cols-12 gap-6", className)}>
      {children}
    </div>
  );
}

// Left column: 70% (col-span-8)
export function ExecutiveLeftColumn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("xl:col-span-8 space-y-6", className)}>
      {children}
    </div>
  );
}

// Right column: 30% (col-span-4)
export function ExecutiveRightColumn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("xl:col-span-4 space-y-4", className)}>
      {children}
    </div>
  );
}

// ─── KPI grid ─────────────────────────────────────────────────────────────────

export function ExecutiveKpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-4", className)}>
      {children}
    </div>
  );
}

// ─── Right-column compact card ────────────────────────────────────────────────

interface DashboardSideCardProps {
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function DashboardSideCard({ title, icon, badge, children, className, noPadding }: DashboardSideCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {badge && <span className="ml-auto">{badge}</span>}
        </div>
      </CardHeader>
      {noPadding ? (
        <div>{children}</div>
      ) : (
        <CardContent>{children}</CardContent>
      )}
    </Card>
  );
}

// ─── Quick action tile ────────────────────────────────────────────────────────

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface QuickActionTileProps {
  href: string;
  icon: ReactNode;
  label: string;
  description?: string;
  count?: number;
  variant?: "default" | "warning" | "destructive" | "success";
}

const TILE_STYLES = {
  default: "hover:bg-muted/60",
  warning: "hover:bg-amber-50 border-amber-100",
  destructive: "hover:bg-red-50 border-red-100",
  success: "hover:bg-green-50 border-green-100",
};

const ICON_BG = {
  default: "bg-muted/50 text-muted-foreground",
  warning: "bg-amber-50 text-amber-600",
  destructive: "bg-red-50 text-red-600",
  success: "bg-green-50 text-green-600",
};

export function QuickActionTile({ href, icon, label, description, count, variant = "default" }: QuickActionTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
        TILE_STYLES[variant]
      )}
    >
      <div className={cn("rounded-md p-2 shrink-0", ICON_BG[variant])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
        {count !== undefined && !description && (
          <p className="text-xs text-muted-foreground">{count.toLocaleString("pt-PT")} registos</p>
        )}
      </div>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

// ─── Insight row ──────────────────────────────────────────────────────────────

interface InsightItem {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
  linkHref?: string;
  linkLabel?: string;
}

const INSIGHT_ROW_STYLES = {
  critical: { border: "border-red-500 bg-red-50/50", text: "text-red-700", dot: "bg-red-500" },
  warning: { border: "border-amber-400 bg-amber-50/50", text: "text-amber-700", dot: "bg-amber-500" },
  info: { border: "border-blue-400 bg-blue-50/50", text: "text-blue-700", dot: "bg-blue-500" },
} as const;

export function DashboardInsightRow({ insight }: { insight: InsightItem }) {
  const styles = INSIGHT_ROW_STYLES[insight.severity];

  const row = (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border-l-4 px-4 py-2.5",
        styles.border
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <span className={cn("size-2 rounded-full mt-1.5 shrink-0", styles.dot)} />
        <p className={cn("text-sm font-medium", styles.text)}>{insight.message}</p>
      </div>
      {insight.linkHref && insight.linkLabel && (
        <span className={cn("text-xs font-medium shrink-0 hover:underline", styles.text)}>
          {insight.linkLabel} →
        </span>
      )}
    </div>
  );

  if (insight.linkHref) {
    return <Link href={insight.linkHref}>{row}</Link>;
  }
  return row;
}
