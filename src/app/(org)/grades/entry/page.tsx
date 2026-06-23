import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findStudentAssessmentResults } from "@/modules/grades/repositories/student-assessment-result.repository";
import { GradeEntryTable } from "@/modules/grades/components/grade-entry-table";

export const metadata = { title: "Lançamento de Notas" };

export default async function GradeEntryPage({
  searchParams,
}: {
  searchParams: Promise<{
    classGroupId?: string;
    subjectId?: string;
    componentId?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.GRADES_CREATE);

  const sp = await searchParams;
  const db = await getDb();
  const { organizationId } = context;

  // Filter options
  const [classGroups, subjects] = await Promise.all([
    db.classGroup.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "FORMING"] } },
      select: { id: true, name: true, courseId: true, courseLevelId: true },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const selectedClassGroup = sp.classGroupId
    ? classGroups.find((cg) => cg.id === sp.classGroupId)
    : null;

  const selectedSubject = sp.subjectId
    ? subjects.find((s) => s.id === sp.subjectId)
    : null;

  // Resolve LevelSubject from (classGroup.courseLevelId, subjectId) to find the right policy
  let levelSubjectId: string | null = null;
  if (sp.classGroupId && sp.subjectId) {
    const cg = classGroups.find((c) => c.id === sp.classGroupId);
    if (cg?.courseLevelId) {
      const ls = await db.levelSubject.findFirst({
        where: {
          organizationId,
          courseLevelId: cg.courseLevelId,
          subjectId: sp.subjectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      levelSubjectId = ls?.id ?? null;
    }
  }

  // Load components for the LevelSubject's active policy
  let components: Awaited<ReturnType<typeof findActiveComponentsByPolicy>> = [];
  let policy = null;
  if (levelSubjectId) {
    policy = await findActivePolicyForLevelSubject(levelSubjectId, organizationId);
    if (policy) {
      components = await findActiveComponentsByPolicy(policy.id, organizationId);
    }
  } else if (sp.subjectId && !sp.classGroupId) {
    // No class group selected yet — components will be empty
  }

  const selectedComponent = sp.componentId
    ? components.find((c) => c.id === sp.componentId)
    : null;

  // Load enrolled students for the selected class group
  let enrollmentRows: {
    enrollmentId: string;
    studentId: string;
    studentName: string;
    studentCode: string | null;
    existingResult?: any;
  }[] = [];

  if (selectedClassGroup && selectedComponent && sp.subjectId) {
    const enrollments = await db.enrollment.findMany({
      where: {
        organizationId,
        classGroupId: selectedClassGroup.id,
        deletedAt: null,
        status: "ACTIVE",
      },
      select: {
        id: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true, code: true } },
      },
      orderBy: [{ student: { firstName: "asc" } }],
    });

    // Fetch all existing results for this component in one query instead of N queries
    const existingResults = await findStudentAssessmentResults(organizationId, {
      assessmentComponentId: selectedComponent.id,
      pageSize: enrollments.length + 1,
    });
    const resultByEnrollment = new Map(
      existingResults.data.map((r) => [r.enrollmentId, r])
    );

    enrollmentRows = enrollments.map((e) => ({
      enrollmentId: e.id,
      studentId: e.studentId,
      studentName: [e.student.firstName, e.student.lastName].filter(Boolean).join(" "),
      studentCode: e.student.code ?? null,
      existingResult: resultByEnrollment.get(e.id) ?? undefined,
    }));
  }

  return (
    <>
      <PageHeader
        title="Lançamento de Notas"
        description="Selecione a turma, disciplina e componente para lançar notas"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/grades">
              <ArrowLeft className="size-4 mr-2" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Filters */}
        <div className="rounded-md border p-4 space-y-4">
          <h3 className="text-sm font-medium">Filtros</h3>
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Turma</label>
              <select
                name="classGroupId"
                defaultValue={sp.classGroupId ?? ""}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Selecionar turma</option>
                {classGroups.map((cg) => (
                  <option key={cg.id} value={cg.id}>
                    {cg.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Disciplina</label>
              <select
                name="subjectId"
                defaultValue={sp.subjectId ?? ""}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Selecionar disciplina</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Componente</label>
              <select
                name="componentId"
                defaultValue={sp.componentId ?? ""}
                disabled={components.length === 0}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">
                  {components.length === 0
                    ? sp.subjectId
                      ? policy
                        ? "Sem componentes ativos"
                        : "Sem política ativa"
                      : "Selecionar disciplina primeiro"
                    : "Selecionar componente"}
                </option>
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (máx: {c.maxGrade})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" size="sm">
                Aplicar Filtros
              </Button>
            </div>
          </form>
        </div>

        {/* Grade entry */}
        {!selectedClassGroup || !selectedComponent ? (
          <EmptyState
            title="Selecione os filtros"
            description="Escolha a turma, disciplina e componente para lançar notas."
          />
        ) : enrollmentRows.length === 0 ? (
          <EmptyState
            title="Sem alunos"
            description="Não existem alunos ativos inscritos nesta turma."
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-medium">
                {selectedClassGroup.name} · {selectedSubject?.name} · {selectedComponent.name}
              </h3>
            </div>
            <GradeEntryTable
              levelSubjectId={levelSubjectId!}
              component={selectedComponent}
              rows={enrollmentRows}
              canGrade={true}
            />
          </div>
        )}
      </div>
    </>
  );
}
