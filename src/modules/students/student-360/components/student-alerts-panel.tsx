import { DashboardSideCard, DashboardInsightRow } from "@/shared/components/layout/executive-dashboard";
import { Badge } from "@/shared/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import type { StudentAlert } from "@/modules/students/student-360/types";

const SEVERITY_TO_INSIGHT: Record<StudentAlert["severity"], "critical" | "warning" | "info"> = {
  CRITICAL: "critical",
  HIGH: "warning",
  MEDIUM: "info",
};

// Priority alerts (H7): actionable items only, capped so the panel stays scannable.
// Alerts are already sorted by severity (CRITICAL → HIGH → MODERATE) at the source.
const MAX_VISIBLE_ALERTS = 5;

export function StudentAlertsPanel({ alerts }: { alerts: StudentAlert[] }) {
  if (alerts.length === 0) return null;

  const visible = alerts.slice(0, MAX_VISIBLE_ALERTS);
  const hidden = alerts.length - visible.length;

  return (
    <DashboardSideCard
      title="Alertas Prioritários"
      icon={<ShieldAlert className="size-4" />}
      badge={<Badge variant="destructive" className="text-xs">{alerts.length}</Badge>}
    >
      <div className="space-y-2">
        {visible.map((alert) => (
          <DashboardInsightRow
            key={alert.id}
            insight={{
              id: alert.id,
              message: `${alert.message} ${alert.recommendedAction}`,
              severity: SEVERITY_TO_INSIGHT[alert.severity],
              linkHref: alert.href,
              linkLabel: alert.href ? "Ver" : undefined,
            }}
          />
        ))}
        {hidden > 0 && (
          <p className="text-xs text-muted-foreground pt-1">+{hidden} outro(s) item(ns) a exigir atenção</p>
        )}
      </div>
    </DashboardSideCard>
  );
}
