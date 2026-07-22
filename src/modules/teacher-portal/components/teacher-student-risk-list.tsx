import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ShieldAlert, Info } from "lucide-react";
import { RISK_TYPE_LABELS } from "@/modules/teacher-portal/types";
import type { StudentRiskRow, RiskSeverity } from "@/modules/teacher-portal/types";
import type { RiskMetric } from "@/modules/students/services/risk-projection-readiness.service";
import { RISK_METRIC_UNAVAILABLE_LABEL } from "@/shared/lib/risk-metric-display";

const SEVERITY_BADGE_VARIANT: Record<RiskSeverity, "destructive" | "warning" | "info"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "info",
};

interface Props {
  rows: StudentRiskRow[];
  // F-M8: when the canonical attendance dimension is not ready, its rows are omitted; we show an
  // explicit note so the empty/short list is never read as "no attendance risk".
  attendanceRisk: RiskMetric<number>;
}

function AttendanceUnavailableNote({ attendanceRisk }: { attendanceRisk: RiskMetric<number> }) {
  if (attendanceRisk.status === "AVAILABLE") return null;
  return (
    <p className="flex items-center gap-1.5 pt-2 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      {RISK_METRIC_UNAVAILABLE_LABEL[attendanceRisk.reason]} — risco de assiduidade não incluído.
    </p>
  );
}

export function TeacherStudentRiskList({ rows, attendanceRisk }: Props) {
  if (rows.length === 0) {
    return (
      <>
        <EmptyState
          icon={<ShieldAlert className="size-8" />}
          title="Sem alunos em risco."
          description="Nenhum aluno das suas turmas ativas apresenta sinais de risco."
          className="border-0"
        />
        <AttendanceUnavailableNote attendanceRisk={attendanceRisk} />
      </>
    );
  }

  return (
    <>
      <ul className="divide-y">
        {rows.map((row, index) => (
          <li key={`${row.studentId}-${row.riskType}-${index}`} className="flex items-center gap-3 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{row.studentName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {row.classGroupName} · {row.detail}
              </p>
            </div>
            <Badge variant={SEVERITY_BADGE_VARIANT[row.severity]} className="shrink-0">
              {RISK_TYPE_LABELS[row.riskType]}
            </Badge>
          </li>
        ))}
      </ul>
      <AttendanceUnavailableNote attendanceRisk={attendanceRisk} />
    </>
  );
}
