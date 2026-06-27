import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { GraduationCap } from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import type { StudentAcademicOverview } from "@/modules/student-portal/types";

interface Props {
  overview: StudentAcademicOverview;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function StudentAcademicOverviewCard({ overview }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Resumo Académico</CardTitle>
          <span className="ml-auto">
            <Badge variant="secondary">{overview.academicStatusLabel}</Badge>
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Aluno" value={overview.studentName} />
          <Field label="Número de Aluno" value={overview.studentNumber ?? "—"} />
          <Field
            label="Estado da Matrícula"
            value={
              overview.enrollmentStatus
                ? ENROLLMENT_STATUS_LABELS[overview.enrollmentStatus] ?? overview.enrollmentStatus
                : "—"
            }
          />
          <Field label="Curso" value={overview.courseName ?? "—"} />
          <Field label="Nível Atual" value={overview.currentLevelName ?? "—"} />
          <Field label="Turma" value={overview.classGroupName ?? "—"} />
        </div>

        {overview.courseProgressPercent != null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progresso do Curso</span>
              <span className="font-medium text-foreground">{overview.courseProgressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(overview.courseProgressPercent, 100)}%` }}
              />
            </div>
          </div>
        )}

        {(overview.blockedLevelCount > 0 || overview.recoveryRequiredCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {overview.blockedLevelCount > 0 && (
              <Badge variant="destructive">{overview.blockedLevelCount} nível(eis) bloqueado(s)</Badge>
            )}
            {overview.recoveryRequiredCount > 0 && (
              <Badge variant="warning">{overview.recoveryRequiredCount} em recuperação</Badge>
            )}
          </div>
        )}

        {!overview.hasActiveEnrollment && (
          <p className="text-sm text-muted-foreground">Não tem nenhuma matrícula ativa de momento.</p>
        )}
      </CardContent>
    </Card>
  );
}
