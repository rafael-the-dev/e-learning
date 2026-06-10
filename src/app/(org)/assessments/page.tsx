import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { findAssessmentsByOrganization } from "@/modules/assessments/repositories/assessment.repository";
import { AssessmentsTable } from "@/modules/assessments/components/assessments-table";
import { Plus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Avaliações" };

export default async function AssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    periodId?: string;
    classGroupId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, periodId, classGroupId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.ASSESSMENTS_CREATE);
  const canEdit = ability.can(PERMISSIONS.ASSESSMENTS_UPDATE);
  const canCancel = ability.can(PERMISSIONS.ASSESSMENTS_CANCEL);

  const result = await findAssessmentsByOrganization(context.organizationId, {
    ...pagination,
    search,
    status,
    assessmentPeriodId: periodId,
    classGroupId,
  });

  const scheduled = result.data.filter((a) => a.status === "SCHEDULED").length;
  const graded = result.data.filter((a) => a.status === "GRADED").length;
  const cancelled = result.data.filter((a) => a.status === "CANCELLED").length;

  return (
    <>
      <PageHeader
        title="Avaliações"
        description="Gerir avaliações e lançamento de notas."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/assessments/new">
                <Plus className="size-4 mr-1.5" />
                Nova Avaliação
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Agendadas" value={scheduled} />
          <StatCard title="Classificadas" value={graded} />
          <StatCard title="Canceladas" value={cancelled} />
        </div>

        <AssessmentsTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
          canEdit={canEdit}
          canCancel={canCancel}
        />
      </div>
    </>
  );
}
