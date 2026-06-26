import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ShieldAlert } from "lucide-react";
import { RISK_TYPE_LABELS } from "@/modules/teacher-portal/types";
import type { StudentRiskRow, RiskSeverity } from "@/modules/teacher-portal/types";

const SEVERITY_BADGE_VARIANT: Record<RiskSeverity, "destructive" | "warning" | "info"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "info",
};

interface Props {
  rows: StudentRiskRow[];
}

export function TeacherStudentRiskList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-8" />}
        title="Sem alunos em risco."
        description="Nenhum aluno das suas turmas ativas apresenta sinais de risco."
        className="border-0"
      />
    );
  }

  return (
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
  );
}
