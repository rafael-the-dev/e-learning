import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getDb } from "@/server/db";
import { findAssessmentPoliciesByOrganization } from "@/modules/assessments/repositories/assessment-policy.repository";
import { AssessmentPoliciesTable } from "@/modules/assessments/components/assessment-policies-table";
import { AssessmentPolicyDrawer } from "@/modules/assessments/components/assessment-policy-drawer";
import { NewAssessmentPolicyButton } from "@/modules/assessments/components/new-assessment-policy-button";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Políticas de Avaliação" };

async function getLevelSubjectOptions(organizationId: string) {
  const db = await getDb();
  return db.levelSubject.findMany({
    where: { organizationId, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      subject: { select: { name: true } },
      courseLevel: { select: { name: true } },
    },
    orderBy: [{ subject: { name: "asc" } }],
  });
}

export default async function AssessmentPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENT_POLICIES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ASSESSMENT_POLICIES_CREATE);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENT_POLICIES_UPDATE);
  const canArchive = ability.can(PERMISSIONS.ASSESSMENT_POLICIES_ARCHIVE);

  const [result, levelSubjects] = await Promise.all([
    findAssessmentPoliciesByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
    }),
    canCreate ? getLevelSubjectOptions(context.organizationId) : [],
  ]);

  const active = result.data.filter((p) => p.status === "ACTIVE").length;
  const archived = result.data.filter((p) => p.status === "ARCHIVED").length;

  const levelSubjectOptions = levelSubjects.map((ls: any) => ({
    id: ls.id,
    subjectName: ls.subject?.name ?? "",
    courseLevelName: ls.courseLevel?.name ?? "",
  }));

  return (
    <>
      <PageHeader
        title="Políticas de Avaliação"
        description="Configurar regras de cálculo e aprovação por disciplina."
        actions={
          canCreate ? (
            <NewAssessmentPolicyButton levelSubjectOptions={levelSubjectOptions} />
          ) : undefined
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Ativas" value={active} />
          <StatCard title="Arquivadas" value={archived} />
        </div>

        <AssessmentPoliciesTable
          result={result}
          defaultSearch={search}
          canEdit={canEdit}
          canArchive={canArchive}
        />
      </div>
    </>
  );
}
