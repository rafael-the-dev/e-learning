import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { resolveTeacherScope } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { findAssessmentPoliciesByOrganization } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findAssessmentPeriodsByOrganization } from "@/modules/assessments/repositories/assessment-period.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { CreateAssessmentForm } from "@/modules/assessments/components/create-assessment-form";

export const metadata = { title: "Nova Avaliação" };

async function getFormDeps(organizationId: string, classGroupTeacherId: string | undefined) {
  const db = await getDb();
  const [policiesResult, periodsResult, classGroups, teachers, academicYears, academicTerms] =
    await Promise.all([
      findAssessmentPoliciesByOrganization(organizationId, { page: 1, pageSize: 200, status: "ACTIVE" }),
      findAssessmentPeriodsByOrganization(organizationId, { page: 1, pageSize: 200, status: "ACTIVE" }),
      db.classGroup.findMany({
        // Teacher-scoped: only the teacher's own class groups (classGroupTeacherId).
        // Org-wide for admins/secretaries (undefined → no teacher filter).
        where: {
          organizationId,
          deletedAt: null,
          status: "ACTIVE",
          ...(classGroupTeacherId !== undefined && { teacherId: classGroupTeacherId }),
        },
        select: { id: true, name: true, courseLevelId: true },
        orderBy: { name: "asc" },
      }),
      db.teacher.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      db.academicYear.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "desc" },
      }),
      db.academicTerm.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

  // Resolve levelSubject IDs for each policy (for hidden form fields)
  const levelSubjectIds = [...new Set(policiesResult.data.map((p) => p.levelSubjectId))];
  const levelSubjectRows = await db.levelSubject.findMany({
    where: { id: { in: levelSubjectIds }, organizationId },
    select: {
      id: true,
      subjectId: true,
      courseLevel: { select: { id: true, courseId: true } },
    },
  });

  const levelSubjectMap: Record<string, { levelSubjectId: string; subjectId: string; courseLevelId: string; courseId: string }> = {};
  for (const ls of levelSubjectRows) {
    levelSubjectMap[ls.id] = {
      levelSubjectId: ls.id,
      subjectId: ls.subjectId,
      courseLevelId: ls.courseLevel?.id ?? "",
      courseId: ls.courseLevel?.courseId ?? "",
    };
  }

  const policyLevelSubjectMap: Record<string, { levelSubjectId: string; subjectId: string; courseLevelId: string; courseId: string }> = {};
  for (const p of policiesResult.data) {
    const ls = levelSubjectMap[p.levelSubjectId];
    if (ls) policyLevelSubjectMap[p.id] = ls;
  }

  return { policiesResult, periodsResult, classGroups, teachers, academicYears, academicTerms, policyLevelSubjectMap };
}

export default async function NewAssessmentPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ASSESSMENTS_CREATE);

  // Teacher-scoped users only see their own class groups in the dropdown; an
  // unlinked teacher (teacherId undefined) sees none. See docs/teacher-access-scope.md.
  const scope = await resolveTeacherScope(context);
  const classGroupTeacherId = scope.isTeacherScoped ? (scope.teacherId ?? "__none__") : undefined;

  const { policiesResult, periodsResult, classGroups, teachers, academicYears, academicTerms, policyLevelSubjectMap } =
    await getFormDeps(context.organizationId, classGroupTeacherId);

  const policies = policiesResult.data;
  const periods = periodsResult.data;

  // Load components for each active policy
  const componentsByPolicy: Record<string, any[]> = {};
  await Promise.all(
    policies.map(async (p) => {
      const comps = await findActiveComponentsByPolicy(p.id, context.organizationId);
      componentsByPolicy[p.id] = comps;
    })
  );

  return (
    <>
      <PageHeader
        title="Nova Avaliação"
        description="Criar uma nova avaliação associada a uma política e componente."
      />
      <div className="p-8">
        <CreateAssessmentForm
          policies={policies}
          periods={periods}
          classGroups={classGroups}
          teachers={teachers}
          academicYears={academicYears}
          academicTerms={academicTerms}
          componentsByPolicy={componentsByPolicy}
          policyLevelSubjectMap={policyLevelSubjectMap}
        />
      </div>
    </>
  );
}
