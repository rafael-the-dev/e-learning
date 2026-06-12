import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, GraduationCap, TrendingUp } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getStudentTranscript } from "@/modules/grades/services/academic-progress.service";
import { TranscriptSubjectRow } from "./transcript-subject-row";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Boletim de Notas" };

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PENDING: "Pendente",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

const LEVEL_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  ELIGIBLE_TO_PROGRESS: "Elegível",
  PROMOTED: "Promovido",
  PROMOTED_WITH_PENDING_SUBJECTS: "Promovido c/ Pendentes",
  BLOCKED: "Bloqueado",
  COMPLETED: "Concluído",
};

const LEVEL_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default", COMPLETED: "default", PROMOTED: "default",
  FAILED: "destructive", BLOCKED: "destructive",
  IN_PROGRESS: "secondary", PROMOTED_WITH_PENDING_SUBJECTS: "secondary",
  ELIGIBLE_TO_PROGRESS: "outline", NOT_STARTED: "outline",
};

export default async function StudentTranscriptPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.TRANSCRIPTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { studentId } = await params;
  const db = await getDb();

  const student = await db.student.findFirst({
    where: { id: studentId, organizationId: context.organizationId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      code: true,
      email: true,
    },
  });

  if (!student) notFound();

  const transcript = await getStudentTranscript(studentId, context.organizationId);

  type LevelProgressRow = {
    id: string;
    status: string;
    finalGrade: { toNumber(): number } | null;
    earnedCredits: number | null;
    courseLevelId: string;
    courseLevel: { name: string; order: number };
  };

  // Level progress per enrollment
  const levelProgressByEnrollment = new Map<string, LevelProgressRow[]>();
  const courseProgressByEnrollment = new Map<string, { status: string; finalGrade: { toNumber(): number } | null; progressReason: string | null } | null>();
  const canViewLevelProgress = context.ability?.can(PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW) ?? true;

  if (canViewLevelProgress && transcript.length > 0) {
    for (const enr of transcript) {
      const lp = await db.studentLevelProgress.findMany({
        where: { enrollmentId: enr.enrollmentId, organizationId: context.organizationId },
        select: {
          id: true,
          status: true,
          finalGrade: true,
          earnedCredits: true,
          courseLevelId: true,
          courseLevel: { select: { name: true, order: true } },
        },
        orderBy: { courseLevel: { order: "asc" } },
      }) as LevelProgressRow[];
      levelProgressByEnrollment.set(enr.enrollmentId, lp);

      const cp = await db.studentCourseProgress.findFirst({
        where: { enrollmentId: enr.enrollmentId, organizationId: context.organizationId },
        select: { status: true, finalGrade: true, progressReason: true },
      });
      courseProgressByEnrollment.set(enr.enrollmentId, cp);
    }
  }

  const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        title="Boletim de Notas"
        description={studentName}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/students/${studentId}`}>
              <ChevronLeft className="size-4 mr-1" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="p-8 max-w-4xl space-y-8">
        {/* Student summary */}
        <div className="rounded-xl border p-5 flex items-center gap-4">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center shrink-0">
            <GraduationCap className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">{studentName}</p>
            {student.code && (
              <p className="text-sm text-muted-foreground font-mono">{student.code}</p>
            )}
            {student.email && (
              <p className="text-sm text-muted-foreground">{student.email}</p>
            )}
          </div>
        </div>

        {transcript.length === 0 ? (
          <EmptyState
            title="Sem matrículas"
            description="Este aluno não tem matrículas registadas."
          />
        ) : (
          <div className="space-y-8">
            {transcript.map((enr) => {
              const levelProgress = levelProgressByEnrollment.get(enr.enrollmentId) ?? [];
              const courseProgress = courseProgressByEnrollment.get(enr.enrollmentId);
              return (
              <div key={enr.enrollmentId} className="rounded-xl border overflow-hidden">
                {/* Enrollment header */}
                <div className="bg-muted/40 px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{enr.courseName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {enr.courseLevelName && (
                        <span className="text-sm text-muted-foreground">{enr.courseLevelName}</span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {ENROLLMENT_STATUS_LABELS[enr.enrollmentStatus] ?? enr.enrollmentStatus}
                      </Badge>
                      {courseProgress && (
                        <Badge variant={LEVEL_BADGE_VARIANT[courseProgress.status] ?? "outline"} className="text-xs">
                          {LEVEL_PROGRESS_STATUS_LABELS[courseProgress.status] ?? courseProgress.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {enr.startDate && (
                      <p>{new Date(enr.startDate).toLocaleDateString("pt-PT")} —{" "}
                        {enr.completedAt
                          ? new Date(enr.completedAt).toLocaleDateString("pt-PT")
                          : "presente"}
                      </p>
                    )}
                    {courseProgress?.finalGrade != null && (
                      <p className="font-mono font-semibold text-foreground">
                        {parseFloat(String(courseProgress.finalGrade)).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        <span className="text-xs font-normal text-muted-foreground ml-1">média final</span>
                      </p>
                    )}
                    <Link
                      href={`/enrollments/${enr.enrollmentId}`}
                      className="text-xs hover:underline text-primary"
                    >
                      Ver matrícula
                    </Link>
                  </div>
                </div>

                {/* Level Progress Summary */}
                {levelProgress.length > 0 && (
                  <div className="px-5 py-3 bg-muted/20 border-b flex flex-wrap gap-3 items-center">
                    <TrendingUp className="size-3.5 text-muted-foreground shrink-0" />
                    {levelProgress.map((lp) => (
                      <div key={lp.id} className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">{lp.courseLevel.name}:</span>
                        <Badge variant={LEVEL_BADGE_VARIANT[lp.status] ?? "outline"} className="text-xs py-0">
                          {LEVEL_PROGRESS_STATUS_LABELS[lp.status] ?? lp.status}
                        </Badge>
                        {lp.finalGrade != null && (
                          <span className="font-mono font-semibold">
                            {parseFloat(String(lp.finalGrade)).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Subjects table */}
                {enr.subjects.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground">
                    Sem resultados académicos registados.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-muted-foreground">
                        <th className="text-left px-5 py-2.5 font-medium">Disciplina</th>
                        <th className="text-right px-5 py-2.5 font-medium w-32">Nota Final</th>
                        <th className="text-right px-5 py-2.5 font-medium w-28">Mínimo</th>
                        <th className="text-left px-5 py-2.5 font-medium w-36">Estado</th>
                        <th className="text-left px-5 py-2.5 font-medium w-32">Concluído</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {enr.subjects.map((subject) => (
                        <TranscriptSubjectRow
                          key={subject.levelSubjectId}
                          subject={subject}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>
    </>
  );
}
