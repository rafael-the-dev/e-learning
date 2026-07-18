import { Card, CardContent } from "@/shared/components/ui/card";
import type { TeacherExamOverviewDto } from "@/modules/teacher-examinations/types";
import { formatExamDate, formatExamTime } from "./teacher-exam-status-labels";

// KPI cards for the teacher exam Resumo. Operational only — no admin/global
// metrics. Presentational.

function KpiCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function TeacherExamKpiCards({ overview }: { overview: TeacherExamOverviewDto }) {
  const next = overview.nextSession;
  const nextValue = next ? next.subjectName ?? next.title : "—";
  const nextHint = next
    ? `${formatExamDate(next.startsAt)} · ${formatExamTime(next.startsAt)}`
    : "Sem exames agendados";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Próximo exame" value={nextValue} hint={nextHint} />
      <KpiCard label="Hoje" value={overview.todayCount} hint="Sessões atribuídas hoje" />
      <KpiCard label="Presenças pendentes" value={overview.attendancePendingCount} />
      <KpiCard label="Resultados por lançar" value={overview.resultsToEnterCount} />
      <KpiCard label="Resultados por submeter" value={overview.resultsToSubmitCount} />
    </div>
  );
}
