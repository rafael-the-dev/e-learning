import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { findAssessmentPoliciesByOrganization } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findAssessmentPeriodsByOrganization } from "@/modules/assessments/repositories/assessment-period.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import { CreateAssessmentForm } from "@/modules/assessments/components/create-assessment-form";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Nova Avaliação" };

async function getFormDeps(organizationId: string) {
  const db = await getDb();
  const [policiesResult, periodsResult, classGroups, teachers, academicYears, academicTerms] =
    await Promise.all([
      findAssessmentPoliciesByOrganization(organizationId, { page: 1, pageSize: 200, status: "ACTIVE" }),
      findAssessmentPeriodsByOrganization(organizationId, { page: 1, pageSize: 200, status: "ACTIVE" }),
      db.classGroup.findMany({
        where: { organizationId, deletedAt: null, status: "ACTIVE" },
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
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENTS_CREATE);
  } catch {
    redirect("/forbidden");
  }

  const { policiesResult, periodsResult, classGroups, teachers, academicYears, academicTerms, policyLevelSubjectMap } =
    await getFormDeps(context.organizationId);

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
