import { DashboardSideCard, DashboardInsightRow } from "@/shared/components/layout/executive-dashboard";
import { Badge } from "@/shared/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import type { StudentAlert } from "@/modules/students/student-360/types";

const SEVERITY_TO_INSIGHT: Record<StudentAlert["severity"], "critical" | "warning" | "info"> = {
  CRITICAL: "critical",
  HIGH: "warning",
  MEDIUM: "info",
};

export function StudentAlertsPanel({ alerts }: { alerts: StudentAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <DashboardSideCard
      title="Alertas"
      icon={<ShieldAlert className="size-4" />}
      badge={<Badge variant="destructive" className="text-xs">{alerts.length}</Badge>}
    >
      <div className="space-y-2">
        {alerts.map((alert) => (
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
      </div>
    </DashboardSideCard>
  );
}
