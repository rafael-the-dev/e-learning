import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import {
  STUDENT_LEVEL_PROGRESS_STATUS_LABELS,
  STUDENT_COURSE_PROGRESS_STATUS_LABELS,
  SUBJECT_ELIGIBILITY_STATUS_LABELS,
} from "@/modules/prerequisites/types";
import { STUDENT_SUBJECT_PROGRESS_STATUS_LABELS } from "@/modules/assessments/types";
import { TrendingUp, Lock, BookOpen } from "lucide-react";
import type { StudentLevelProgress, StudentCourseProgress } from "@/modules/prerequisites/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { SubjectEligibilityRow } from "@/modules/students/student-360/services/student-360.service";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  PASSED: "secondary",
  COMPLETED: "secondary",
  PROMOTED: "secondary",
  FAILED: "destructive",
  BLOCKED: "destructive",
  RECOVERY_REQUIRED: "outline",
  INCOMPLETE: "outline",
};

interface StudentProgressTabProps {
  courseProgress: StudentCourseProgress[];
  levelProgress: StudentLevelProgress[];
  subjectProgress: StudentSubjectProgress[];
  eligibility: SubjectEligibilityRow[];
}

export function StudentProgressTab({
  courseProgress,
  levelProgress,
  subjectProgress,
  eligibility,
}: StudentProgressTabProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Progresso do Curso</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {courseProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sem progresso de curso registado.</p>
          ) : (
            <div className="space-y-2">
              {courseProgress.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate">{c.courseName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.earnedCredits != null ? `${c.earnedCredits} créditos` : ""}
                  </span>
                  <span className="font-medium tabular-nums shrink-0">{c.finalGrade != null ? c.finalGrade.toFixed(1) : "—"}</span>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "outline"} className="shrink-0">
                    {STUDENT_COURSE_PROGRESS_STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Progresso por Nível</CardTitle>
        </CardHeader>
        <CardContent>
          {levelProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sem progresso de nível registado.</p>
          ) : (
            <div className="space-y-2">
              {levelProgress.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate">{l.courseLevelName}</span>
                  <span className="font-medium tabular-nums shrink-0">{l.finalGrade != null ? l.finalGrade.toFixed(1) : "—"}</span>
                  <Badge variant={STATUS_VARIANT[l.status] ?? "outline"} className="shrink-0">
                    {STUDENT_LEVEL_PROGRESS_STATUS_LABELS[l.status] ?? l.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Progresso por Disciplina</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {subjectProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sem progresso de disciplina registado.</p>
          ) : (
            <div className="space-y-2">
              {subjectProgress.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0">
                  <span className="min-w-0 flex-1 truncate">{s.subjectName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {s.attendancePercentage != null ? `${s.attendancePercentage.toFixed(1)}% assiduidade` : ""}
                  </span>
                  <span className="font-medium tabular-nums shrink-0">{s.finalGrade != null ? s.finalGrade.toFixed(1) : "—"}</span>
                  <Badge variant={STATUS_VARIANT[s.status] ?? "outline"} className="shrink-0">
                    {STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Pré-requisitos / Elegibilidade</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {eligibility.length === 0 ? (
            <EmptyState
              icon={<Lock className="size-8" />}
              title="Sem dados de elegibilidade"
              description="Este aluno não tem uma matrícula ativa com nível definido."
            />
          ) : (
            <div className="space-y-3">
              {eligibility.map(({ levelSubject, eligibility: result }) => (
                <div key={levelSubject.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{levelSubject.subjectName}</span>
                    <Badge variant={result.isEligible ? "secondary" : "destructive"}>
                      {SUBJECT_ELIGIBILITY_STATUS_LABELS[result.status] ?? result.status}
                    </Badge>
                  </div>
                  {result.missingPrerequisites.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {result.missingPrerequisites.flatMap((group) =>
                        group.items.map((item) => (
                          <li key={item.itemId}>
                            Requer {item.subjectName}
                            {item.minimumRequiredGrade != null ? ` (mín. ${item.minimumRequiredGrade})` : ""}
                            {item.currentStatus
                              ? ` — estado atual: ${STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[item.currentStatus] ?? item.currentStatus}`
                              : " — ainda não iniciado"}
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
