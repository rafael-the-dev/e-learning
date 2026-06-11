import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getEnrollmentById,
  getEnrollmentHistory,
} from "@/modules/enrollments/services/enrollment.service";
import { EnrollmentStatusActions } from "@/modules/enrollments/components/enrollment-status-actions";
import { NotFoundError } from "@/shared/lib/command";
import {
  BookOpen,
  Pencil,
  GraduationCap,
  Building2,
  Calendar,
  ClipboardList,
  Users,
  CreditCard,
  Award,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import { findStudentAssessmentResults } from "@/modules/grades/repositories/student-assessment-result.repository";
import { Badge } from "@/shared/components/ui/badge";
import { STUDENT_RESULT_STATUS_LABELS } from "@/modules/grades/types";
import type { StudentAssessmentResult } from "@/modules/grades/types";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Detalhes da Matrícula" };
}

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ENROLLMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { enrollmentId } = await params;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.ENROLLMENTS_UPDATE);
  const canActivate = ability.can(PERMISSIONS.ENROLLMENTS_ACTIVATE);
  const canSuspend = ability.can(PERMISSIONS.ENROLLMENTS_SUSPEND);
  const canCancel = ability.can(PERMISSIONS.ENROLLMENTS_CANCEL);
  const canComplete = ability.can(PERMISSIONS.ENROLLMENTS_COMPLETE);

  let enrollment;
  try {
    enrollment = await getEnrollmentById(enrollmentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const history = await getEnrollmentHistory(enrollmentId, context.organizationId);

  const canViewGrades = ability.can(PERMISSIONS.GRADES_VIEW);
  const gradeResults = canViewGrades
    ? await findStudentAssessmentResults(context.organizationId, {
        enrollmentId,
        pageSize: 100,
      })
    : null;

  // Group grade results by subject
  const gradesBySubject = new Map<string, { subjectName: string; results: StudentAssessmentResult[] }>();
  if (gradeResults) {
    for (const r of gradeResults.data) {
      if (!gradesBySubject.has(r.subjectId)) {
        gradesBySubject.set(r.subjectId, { subjectName: r.subjectName ?? r.subjectId, results: [] });
      }
      gradesBySubject.get(r.subjectId)!.results.push(r);
    }
  }

  const isEditable = !["COMPLETED", "CANCELLED"].includes(enrollment.status);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/enrollments" className="hover:text-foreground transition-colors">
        Matrículas
      </Link>
      <span>/</span>
      <span className="text-foreground">{enrollment.enrollmentNumber ?? enrollmentId}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={`Matrícula ${enrollment.enrollmentNumber ?? ""}`}
        description={`${enrollment.studentName} — ${enrollment.courseName}`}
        breadcrumb={breadcrumb}
        actions={
          canEdit && isEditable ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/enrollments/${enrollment.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 max-w-3xl space-y-6">
        {/* Status row + quick actions */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={enrollment.status} />
          <span className="text-xs text-muted-foreground">
            {ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status}
          </span>
        </div>

        <EnrollmentStatusActions
          enrollment={enrollment}
          canActivate={canActivate}
          canSuspend={canSuspend}
          canCancel={canCancel}
          canComplete={canComplete}
        />

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetaCard
            icon={<Calendar className="size-4 text-muted-foreground" />}
            label="Data de Matrícula"
            value={new Date(enrollment.enrollmentDate).toLocaleDateString("pt-PT")}
          />
          <MetaCard
            icon={<Calendar className="size-4 text-muted-foreground" />}
            label="Data de Início"
            value={
              enrollment.startDate
                ? new Date(enrollment.startDate).toLocaleDateString("pt-PT")
                : "—"
            }
          />
          <MetaCard
            icon={<Calendar className="size-4 text-muted-foreground" />}
            label="Fim Previsto"
            value={
              enrollment.expectedEndDate
                ? new Date(enrollment.expectedEndDate).toLocaleDateString("pt-PT")
                : "—"
            }
          />
          <MetaCard
            icon={<ClipboardList className="size-4 text-muted-foreground" />}
            label="N.º Matrícula"
            value={enrollment.enrollmentNumber ?? "—"}
          />
        </div>

        {/* Student & Course */}
        <div className="rounded-xl border p-5 space-y-3">
          <h3 className="text-sm font-semibold">Informação</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0">
                <GraduationCap className="size-3.5" />
              </span>
              <dt className="w-28 shrink-0 text-muted-foreground">Aluno</dt>
              <dd className="font-medium truncate">
                <Link href={`/students/${enrollment.studentId}`} className="hover:underline">
                  {enrollment.studentName ?? "—"}
                </Link>
              </dd>
            </div>
            <DetailRow
              icon={<BookOpen className="size-3.5" />}
              label="Curso"
              value={enrollment.courseName ?? "—"}
            />
            {enrollment.courseLevelName && (
              <DetailRow
                icon={<ArrowRight className="size-3.5" />}
                label="Nível"
                value={enrollment.courseLevelName}
              />
            )}
            {enrollment.classGroupName && (
              <DetailRow
                icon={<Users className="size-3.5" />}
                label="Turma"
                value={enrollment.classGroupName}
              />
            )}
            {enrollment.branchName && (
              <DetailRow
                icon={<Building2 className="size-3.5" />}
                label="Filial"
                value={enrollment.branchName}
              />
            )}
            {enrollment.notes && (
              <div className="flex gap-2 items-start">
                <span className="text-muted-foreground shrink-0 mt-0.5">
                  <ClipboardList className="size-3.5" />
                </span>
                <dt className="w-28 shrink-0 text-muted-foreground">Notas</dt>
                <dd className="text-sm">{enrollment.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Status History */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Histórico de Estado</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem histórico de estados.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 text-sm">
                  <div className="size-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {h.fromStatus && (
                        <>
                          <StatusBadge status={h.fromStatus} />
                          <ArrowRight className="size-3.5 text-muted-foreground" />
                        </>
                      )}
                      <StatusBadge status={h.toStatus} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.changedAt).toLocaleString("pt-PT")}
                      </span>
                    </div>
                    {h.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Motivo: {h.reason}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Faturas e Pagamentos */}
        <div className="rounded-xl border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Faturas e Pagamentos</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/invoices?enrollmentId=${enrollment.id}`}>
                  Ver faturas
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/payments?search=${enrollment.enrollmentNumber ?? enrollment.id}`}>
                  Ver pagamentos
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Academic Progress */}
        {canViewGrades && (
          <div className="rounded-xl border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Progresso Académico</h3>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/grades?studentId=${enrollment.studentId}`}>
                  Ver notas
                </Link>
              </Button>
            </div>

            {gradesBySubject.size === 0 ? (
              <p className="text-sm text-muted-foreground">Sem notas registadas para esta matrícula.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(gradesBySubject.entries()).map(([subjectId, { subjectName, results }]) => {
                  const gradedResults = results.filter((r) => r.status === "GRADED");
                  const avgNorm = gradedResults.length > 0
                    ? gradedResults.reduce((s, r) => s + r.normalizedGrade, 0) / gradedResults.length
                    : null;
                  return (
                    <div key={subjectId} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{subjectName}</span>
                        {avgNorm != null && (
                          <span className="text-sm font-mono font-semibold">
                            {avgNorm.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {results.map((r) => (
                          <div
                            key={r.id}
                            className="text-xs border rounded px-2 py-1 flex items-center gap-1.5"
                          >
                            <span className="text-muted-foreground">{r.componentName}</span>
                            <span className="font-mono font-medium">{r.grade}/{r.maxGrade}</span>
                            <Badge variant={r.status === "GRADED" ? "default" : "secondary"} className="text-xs py-0">
                              {STUDENT_RESULT_STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Placeholder: Attendance */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ClipboardList className="size-4" />
            <h3 className="text-sm font-semibold">Assiduidade</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de assiduidade em desenvolvimento.
          </p>
        </div>

        {/* Placeholder: Certificates */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Award className="size-4" />
            <h3 className="text-sm font-semibold">Certificados</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de certificados em desenvolvimento.
          </p>
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border p-5 space-y-2">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Criado a"
              value={new Date(enrollment.createdAt).toLocaleString("pt-PT")}
            />
            <DetailRow
              icon={<Calendar className="size-3.5" />}
              label="Atualizado a"
              value={new Date(enrollment.updatedAt).toLocaleString("pt-PT")}
            />
          </dl>
        </div>
      </div>
    </>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium truncate">{value}</dd>
    </div>
  );
}
