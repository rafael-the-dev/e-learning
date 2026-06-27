import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { assertTeacherCanAccessEnrollment } from "@/server/auth/teacher-access";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getEnrollmentById,
  getEnrollmentHistory,
} from "@/modules/enrollments/services/enrollment.service";
import { EnrollmentStatusActions } from "@/modules/enrollments/components/enrollment-status-actions";
import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
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
  FileText,
  Layers,
  TrendingUp,
} from "lucide-react";
import { ENROLLMENT_STATUS_LABELS } from "@/modules/enrollments/types";
import { Badge } from "@/shared/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/components/ui/accordion";
import { getEnrollmentAcademicProgress } from "@/modules/grades/services/academic-progress.service";
import { getDb } from "@/server/db";

const PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  INCOMPLETE: "Incompleto",
  BLOCKED: "Bloqueado",
};

const LEVEL_PROGRESS_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Por Iniciar",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Recuperação",
  ELIGIBLE_TO_PROGRESS: "Elegível para Progressão",
  PROMOTED: "Promovido",
  PROMOTED_WITH_PENDING_SUBJECTS: "Promovido c/ Pendentes",
  BLOCKED: "Bloqueado",
  COMPLETED: "Concluído",
};

const LEVEL_PROGRESS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PASSED: "default",
  COMPLETED: "default",
  PROMOTED: "default",
  FAILED: "destructive",
  RECOVERY_REQUIRED: "destructive",
  BLOCKED: "destructive",
  IN_PROGRESS: "secondary",
  PROMOTED_WITH_PENDING_SUBJECTS: "secondary",
  ELIGIBLE_TO_PROGRESS: "outline",
  NOT_STARTED: "outline",
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

const SOURCE_TYPE_LABELS: Record<string, string> = {
  CONTINUOUS: "Contínua",
  SCHEDULED_EVENT: "Evento",
  RECOVERY: "Recuperação",
};

export async function generateMetadata() {
  return { title: "Detalhes da Matrícula" };
}

export default async function EnrollmentDetailPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ENROLLMENTS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

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
    // Teacher-scoped users may only open an enrollment in a class group they
    // teach (IDOR guard). 404 so we don't disclose existence.
    await assertTeacherCanAccessEnrollment(context, enrollmentId);
    enrollment = await getEnrollmentById(enrollmentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof AuthorizationError) notFound();
    throw e;
  }

  const history = await getEnrollmentHistory(enrollmentId, context.organizationId);

  const canViewProgress = ability.can(PERMISSIONS.STUDENT_SUBJECT_PROGRESS_VIEW);
  const canViewLevelProgress = ability.can(PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW);
  const academicProgress = canViewProgress
    ? await getEnrollmentAcademicProgress(enrollmentId, context.organizationId)
    : [];

  // Level progress and course progress
  const db = await getDb();
  const levelProgressData = canViewLevelProgress
    ? await db.studentLevelProgress.findMany({
        where: { enrollmentId, organizationId: context.organizationId },
        select: {
          id: true,
          status: true,
          finalGrade: true,
          earnedCredits: true,
          courseLevelId: true,
          courseLevel: { select: { name: true, order: true } },
        },
        orderBy: { courseLevel: { order: "asc" } },
      })
    : [];

  const courseProgressData = canViewLevelProgress
    ? await db.studentCourseProgress.findFirst({
        where: { enrollmentId, organizationId: context.organizationId },
      })
    : null;

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

      <div className="p-6 space-y-6">
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

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
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

            {/* Academic Progress */}
            {canViewProgress && (
              <div className="rounded-xl border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Progresso Académico</h3>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/students/${enrollment.studentId}/transcript`}>
                      <FileText className="size-3.5 mr-1.5" />
                      Boletim
                    </Link>
                  </Button>
                </div>

                {academicProgress.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem notas registadas para esta matrícula.</p>
                ) : (
                  <Accordion type="multiple" className="space-y-2">
                    {academicProgress.map((subject) => {
                      const statusVariant = PROGRESS_BADGE_VARIANT[subject.status] ?? "outline";
                      return (
                        <AccordionItem
                          key={subject.levelSubjectId}
                          value={subject.levelSubjectId}
                          className="border rounded-lg px-4"
                        >
                          <AccordionTrigger className="py-3 hover:no-underline">
                            <div className="flex items-center justify-between w-full pr-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm font-medium truncate">{subject.subjectName}</span>
                                <Badge variant={statusVariant} className="text-xs shrink-0">
                                  {PROGRESS_STATUS_LABELS[subject.status] ?? subject.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 shrink-0 text-sm">
                                {subject.finalGrade != null && (
                                  <span className="font-mono font-semibold">
                                    {subject.finalGrade.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    {subject.minimumPassingGrade != null && (
                                      <span className="text-muted-foreground font-normal text-xs ml-1">
                                        / mín. {subject.minimumPassingGrade}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {subject.gradedCount}/{subject.components.length} componentes
                                </span>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-3">
                            <div className="space-y-2">
                              {subject.missingRequiredCount > 0 && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                  {subject.missingRequiredCount} componente(s) obrigatório(s) sem nota
                                </p>
                              )}
                              {subject.components.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Sem componentes configurados.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b text-muted-foreground">
                                      <th className="text-left py-1.5 font-medium">Componente</th>
                                      <th className="text-right py-1.5 font-medium w-20">Peso</th>
                                      <th className="text-right py-1.5 font-medium w-28">Nota</th>
                                      <th className="text-right py-1.5 font-medium w-24">Normalizada</th>
                                      <th className="text-left py-1.5 font-medium w-28 pl-3">Fonte</th>
                                      <th className="text-left py-1.5 font-medium w-28 pl-3">Data</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {subject.components.map((comp) => (
                                      <tr key={comp.componentId} className="text-muted-foreground hover:text-foreground">
                                        <td className="py-1.5">
                                          <span className={comp.isRequired ? "font-medium text-foreground" : ""}>
                                            {comp.componentName}
                                          </span>
                                          {comp.isRequired && (
                                            <span className="ml-1 text-destructive">*</span>
                                          )}
                                        </td>
                                        <td className="text-right py-1.5 tabular-nums">
                                          {comp.weight > 0 ? `${comp.weight}%` : "—"}
                                        </td>
                                        <td className="text-right py-1.5 tabular-nums font-mono">
                                          {comp.grade != null
                                            ? `${comp.grade.toLocaleString("pt-PT")} / ${comp.maxGrade}`
                                            : <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                        <td className="text-right py-1.5 tabular-nums">
                                          {comp.normalizedGrade != null
                                            ? `${comp.normalizedGrade.toLocaleString("pt-PT", { maximumFractionDigits: 1 })}%`
                                            : <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                        <td className="py-1.5 pl-3">
                                          {comp.sourceType
                                            ? SOURCE_TYPE_LABELS[comp.sourceType] ?? comp.sourceType
                                            : <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                        <td className="py-1.5 pl-3">
                                          {comp.gradedAt
                                            ? new Date(comp.gradedAt).toLocaleDateString("pt-PT")
                                            : <span className="text-muted-foreground/50">—</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {subject.completedAt && (
                                <p className="text-xs text-muted-foreground pt-1">
                                  Concluído a {new Date(subject.completedAt).toLocaleDateString("pt-PT")}
                                </p>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}

            {/* Level Progress */}
            {canViewLevelProgress && (
              <div className="rounded-xl border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Progressão por Nível</h3>
                  </div>
                  {courseProgressData && (
                    <div className="flex items-center gap-2">
                      {courseProgressData.finalGrade != null && (
                        <span className="text-sm font-mono font-semibold">
                          {parseFloat(String(courseProgressData.finalGrade)).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      )}
                      <Badge variant={LEVEL_PROGRESS_BADGE_VARIANT[courseProgressData.status] ?? "outline"} className="text-xs">
                        {LEVEL_PROGRESS_STATUS_LABELS[courseProgressData.status] ?? courseProgressData.status}
                      </Badge>
                    </div>
                  )}
                </div>

                {levelProgressData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de progressão registados.</p>
                ) : (
                  <div className="space-y-2">
                    {levelProgressData.map((lp) => {
                      const variant = LEVEL_PROGRESS_BADGE_VARIANT[lp.status] ?? "outline";
                      return (
                        <div key={lp.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <TrendingUp className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{lp.courseLevel.name}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {lp.earnedCredits != null && lp.earnedCredits > 0 && (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {lp.earnedCredits} créd.
                              </span>
                            )}
                            {lp.finalGrade != null && (
                              <span className="font-mono font-semibold tabular-nums">
                                {parseFloat(String(lp.finalGrade)).toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </span>
                            )}
                            <Badge variant={variant} className="text-xs">
                              {LEVEL_PROGRESS_STATUS_LABELS[lp.status] ?? lp.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {courseProgressData?.progressReason && (
                  <p className="text-xs text-muted-foreground">{courseProgressData.progressReason}</p>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Faturas e Pagamentos</h3>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link href={`/invoices?enrollmentId=${enrollment.id}`}>
                    Ver faturas
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="w-full justify-start">
                  <Link href={`/payments?search=${enrollment.enrollmentNumber ?? enrollment.id}`}>
                    Ver pagamentos
                  </Link>
                </Button>
              </div>
            </div>

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
