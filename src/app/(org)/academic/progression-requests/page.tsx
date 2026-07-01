import { PageHeader } from "@/shared/components/layout/page-header";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfTeacherScoped } from "@/server/auth/teacher-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  listProgressionRequests,
  findRequestCourseOptions,
  findRequestLevelOptions,
} from "@/modules/prerequisites/repositories/level-progression-request.repository";
import { ProgressionRequestFilters } from "@/modules/prerequisites/components/progression-request-filters";
import { ProgressionRequestsTable } from "@/modules/prerequisites/components/progression-requests-table";
import { GitBranchPlus } from "lucide-react";

export const metadata = { title: "Pedidos de Progressão" };

const VALID_DECISIONS = new Set(["PENDING", "APPROVED", "REJECTED"]);

function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

export default async function ProgressionRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    courseId?: string;
    levelId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LEVEL_PROGRESSION_REQUESTS_VIEW);
  // Teacher-scoped users are routed to their own Portal — this org-wide queue is
  // never shown to them. See docs/teacher-access-scope.md.
  await redirectIfTeacherScoped(context);

  const sp = await searchParams;
  const decision = sp.status && VALID_DECISIONS.has(sp.status) ? sp.status : undefined;
  const pageNum = sp.page ? Math.max(1, parseInt(sp.page, 10) || 1) : 1;

  const [result, courses, levels] = await Promise.all([
    listProgressionRequests(context.organizationId, {
      decision,
      courseId: sp.courseId || undefined,
      fromLevelId: sp.levelId || undefined,
      requestedFrom: parseDate(sp.from),
      requestedTo: parseDate(sp.to, true),
      page: pageNum,
      pageSize: 20,
    }),
    findRequestCourseOptions(context.organizationId),
    findRequestLevelOptions(context.organizationId),
  ]);

  const hasFilters = !!(decision || sp.courseId || sp.levelId || sp.from || sp.to);

  return (
    <>
      <PageHeader
        title="Pedidos de Progressão"
        description="Fila de aprovação manual de progressão de nível. Reveja, aprove ou rejeite cada pedido."
      />

      <div className="p-8 space-y-6">
        <ProgressionRequestFilters
          courses={courses}
          levels={levels}
          defaultDecision={decision}
          defaultCourseId={sp.courseId}
          defaultLevelId={sp.levelId}
          defaultFrom={sp.from}
          defaultTo={sp.to}
        />

        {result.total === 0 ? (
          <EmptyState
            icon={<GitBranchPlus className="size-8" />}
            title={hasFilters ? "Nenhum pedido corresponde aos filtros" : "Sem pedidos de progressão"}
            description={
              hasFilters
                ? "Ajuste os filtros para ver outros pedidos."
                : "Não existem pedidos de progressão manual a aguardar revisão."
            }
          />
        ) : (
          <ProgressionRequestsTable
            data={result.data}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
          />
        )}
      </div>
    </>
  );
}
