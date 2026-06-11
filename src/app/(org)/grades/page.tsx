import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  STUDENT_RESULT_STATUS_LABELS,
  GRADE_COMPONENT_TYPE_LABELS,
} from "@/modules/grades/types";
import { STUDENT_SUBJECT_PROGRESS_STATUS_LABELS } from "@/modules/assessments/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Notas" };

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    subjectId?: string;
    studentId?: string;
    classGroupId?: string;
    status?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.GRADES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);
  const db = await getDb();
  const { organizationId } = context;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canGrade = ability.can(PERMISSIONS.GRADES_CREATE);

  // Build filter
  const where: any = {
    organizationId,
    status: { not: "CANCELLED" },
  };
  if (sp.subjectId) where.subjectId = sp.subjectId;
  if (sp.studentId) where.studentId = sp.studentId;
  if (sp.classGroupId) {
    where.enrollment = { classGroupId: sp.classGroupId };
  }
  if (sp.status) where.status = sp.status;

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [results, total] = await Promise.all([
    db.studentAssessmentResult.findMany({
      where,
      skip,
      take: pagination.pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        grade: true,
        maxGrade: true,
        normalizedGrade: true,
        status: true,
        gradedAt: true,
        assessmentComponent: { select: { name: true, componentType: true } },
        student: { select: { firstName: true, lastName: true, code: true } },
        subject: { select: { name: true } },
        enrollment: { select: { enrollmentNumber: true } },
      },
    }),
    db.studentAssessmentResult.count({ where }),
  ]);

  // Stats
  const [graded, drafts] = await Promise.all([
    db.studentAssessmentResult.count({ where: { organizationId, status: "GRADED" } }),
    db.studentAssessmentResult.count({ where: { organizationId, status: "DRAFT" } }),
  ]);

  // Filter options
  const [subjects, classGroups] = await Promise.all([
    db.subject.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Notas"
        description="Notas de avaliação direta por componente e disciplina"
        actions={
          canGrade ? (
            <Button asChild size="sm">
              <Link href="/grades/entry">
                <ClipboardList className="size-4 mr-2" />
                Lançar Notas
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total de Notas" value={total} />
          <StatCard title="Classificadas" value={graded} />
          <StatCard title="Rascunho" value={drafts} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <form method="GET" className="flex flex-wrap gap-3">
            <select
              name="subjectId"
              defaultValue={sp.subjectId ?? ""}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todas as disciplinas</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              name="classGroupId"
              defaultValue={sp.classGroupId ?? ""}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todas as turmas</option>
              {classGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Todos os estados</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SUBMITTED">Submetido</option>
              <option value="GRADED">Classificado</option>
            </select>

            <Button type="submit" size="sm" variant="outline">
              Filtrar
            </Button>
          </form>
        </div>

        {/* Table */}
        {results.length === 0 ? (
          <EmptyState
            title="Sem notas"
            description="Nenhuma nota encontrada com os filtros aplicados."
          />
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Aluno</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Disciplina</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Componente</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Nota</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">%</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Estado</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((r) => {
                  const studentName = [r.student.firstName, r.student.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{studentName}</div>
                        {r.student.code && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {r.student.code}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{r.subject.name}</td>
                      <td className="px-4 py-2.5">
                        <div>{r.assessmentComponent.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {GRADE_COMPONENT_TYPE_LABELS[r.assessmentComponent.componentType] ??
                            r.assessmentComponent.componentType}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {Number(r.grade)} / {Number(r.maxGrade)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">
                        {Number(r.normalizedGrade).toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={r.status === "GRADED" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STUDENT_RESULT_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.gradedAt
                          ? new Date(r.gradedAt).toLocaleDateString("pt-PT")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > pagination.pageSize && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Mostrando {skip + 1}–{Math.min(skip + pagination.pageSize, total)} de {total}
            </span>
            <div className="flex gap-2">
              {pagination.page > 1 && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/grades?page=${pagination.page - 1}${sp.subjectId ? `&subjectId=${sp.subjectId}` : ""}${sp.status ? `&status=${sp.status}` : ""}`}
                  >
                    Anterior
                  </Link>
                </Button>
              )}
              {skip + pagination.pageSize < total && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={`/grades?page=${pagination.page + 1}${sp.subjectId ? `&subjectId=${sp.subjectId}` : ""}${sp.status ? `&status=${sp.status}` : ""}`}
                  >
                    Próximo
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
