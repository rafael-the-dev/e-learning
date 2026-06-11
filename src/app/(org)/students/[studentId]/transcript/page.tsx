import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getStudentTranscript } from "@/modules/grades/services/academic-progress.service";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Boletim de Notas" };

const PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
};

const PROGRESS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default",
  FAILED: "destructive",
  RECOVERY_REQUIRED: "destructive",
  BLOCKED: "destructive",
  IN_PROGRESS: "secondary",
  INCOMPLETE: "outline",
  NOT_STARTED: "outline",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativo",
  PENDING: "Pendente",
  SUSPENDED: "Suspenso",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
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
            {transcript.map((enr) => (
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
                    <Link
                      href={`/enrollments/${enr.enrollmentId}`}
                      className="text-xs hover:underline text-primary"
                    >
                      Ver matrícula
                    </Link>
                  </div>
                </div>

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
                      {enr.subjects.map((subject) => {
                        const variant = PROGRESS_BADGE_VARIANT[subject.status] ?? "outline";
                        return (
                          <tr key={subject.id} className="hover:bg-muted/20">
                            <td className="px-5 py-3 font-medium">
                              {subject.subjectName ?? subject.levelSubjectId}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums font-mono font-semibold">
                              {subject.finalGrade != null
                                ? subject.finalGrade.toLocaleString("pt-PT", {
                                    minimumFractionDigits: 1,
                                    maximumFractionDigits: 1,
                                  })
                                : <span className="text-muted-foreground font-normal">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                              {subject.minimumPassingGrade != null ? subject.minimumPassingGrade : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <Badge variant={variant} className="text-xs">
                                {PROGRESS_STATUS_LABELS[subject.status] ?? subject.status}
                              </Badge>
                            </td>
                            <td className="px-5 py-3 text-muted-foreground text-xs">
                              {subject.completedAt
                                ? new Date(subject.completedAt).toLocaleDateString("pt-PT")
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
