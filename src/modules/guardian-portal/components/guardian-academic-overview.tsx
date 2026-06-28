import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { GraduationCap } from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import { STUDENT_STATUS_LABELS } from "@/modules/students/types";
import { GUARDIAN_RELATIONSHIP_LABELS } from "@/modules/guardian-portal/types";
import type { GuardianAcademicOverview } from "@/modules/guardian-portal/types";

interface Props {
  overview: GuardianAcademicOverview;
  relationshipType: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export function GuardianAcademicOverviewCard({ overview, relationshipType }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Resumo do Educando</CardTitle>
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="outline">
              {GUARDIAN_RELATIONSHIP_LABELS[relationshipType] ?? relationshipType}
            </Badge>
            {overview.academicStatusLabel && (
              <Badge variant="secondary">{overview.academicStatusLabel}</Badge>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {/* Identity — always visible to a linked guardian. */}
          <Field label="Aluno" value={overview.studentName} />
          <Field label="Número de Aluno" value={overview.studentNumber ?? "—"} />
          <Field label="Estado do Aluno" value={STUDENT_STATUS_LABELS[overview.studentStatus] ?? overview.studentStatus} />

          {/* Academic metadata — nulled by the service when canViewAcademic is
              false, so each row is omitted rather than rendered as "—". */}
          {overview.enrollmentStatus != null && (
            <Field
              label="Estado da Matrícula"
              value={ENROLLMENT_STATUS_LABELS[overview.enrollmentStatus] ?? overview.enrollmentStatus}
            />
          )}
          {overview.courseName != null && <Field label="Curso" value={overview.courseName} />}
          {overview.currentLevelName != null && <Field label="Nível Atual" value={overview.currentLevelName} />}
          {overview.classGroupName != null && <Field label="Turma" value={overview.classGroupName} />}
          {overview.overallAverage != null && (
            <Field label="Média Geral" value={`${overview.overallAverage}%`} />
          )}
          {overview.attendancePercentage != null && (
            <Field label="Frequência" value={`${overview.attendancePercentage}%`} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
