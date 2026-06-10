import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { findProgressByOrganization } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { StudentProgressTable } from "@/modules/assessments/components/student-progress-table";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Progresso por Disciplina" };

export default async function StudentProgressPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    levelSubjectId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.STUDENT_SUBJECT_PROGRESS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, levelSubjectId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canRecalculate = ability.can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE);

  const result = await findProgressByOrganization(context.organizationId, {
    ...pagination,
    search,
    status,
    levelSubjectId,
  });

  const passed = result.data.filter((p) => p.status === "PASSED").length;
  const failed = result.data.filter((p) => p.status === "FAILED").length;
  const inProgress = result.data.filter((p) => p.status === "IN_PROGRESS").length;

  return (
    <>
      <PageHeader
        title="Progresso por Disciplina"
        description="Acompanhar o progresso dos alunos em cada disciplina."
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Aprovados" value={passed} />
          <StatCard title="Reprovados" value={failed} />
          <StatCard title="Em progresso" value={inProgress} />
        </div>

        <StudentProgressTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
          canRecalculate={canRecalculate}
        />
      </div>
    </>
  );
}
