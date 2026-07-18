import { Card, CardContent } from "@/shared/components/ui/card";
import type { StudentExamOverviewDto } from "@/modules/student-examinations/types";
import { formatExamDate } from "./student-exam-status-labels";

// KPI cards for the student exam Overview. Presentational only.

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

export function StudentExamKpiCards({ overview }: { overview: StudentExamOverviewDto }) {
  const next = overview.nextExam;
  const nextValue = next ? next.subjectName ?? next.title : "—";
  const nextHint = next ? formatExamDate(next.startsAt) : "Sem exames agendados";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Próximo exame" value={nextValue} hint={nextHint} />
      <KpiCard label="Exames esta semana" value={overview.examsThisWeek} />
      <KpiCard label="Resultados por publicar" value={overview.resultsPendingPublication} />
      <KpiCard label="Recursos pendentes" value={overview.pendingAppeals} />
    </div>
  );
}
