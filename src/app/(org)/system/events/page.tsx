import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import {
  getDomainEventsByOrganization,
  getDomainEventStatsByOrganization,
} from "@/modules/domain-events/services/domain-event.service";
import { DomainEventsTable } from "@/modules/domain-events/components/domain-events-table";
import { DOMAIN_EVENT_STATUS_LABELS } from "@/modules/domain-events/types";

export const metadata = { title: "Eventos de Domínio" };

export default async function SystemEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    eventType?: string;
    aggregateType?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.DOMAIN_EVENTS_VIEW);

  const { page, search, status, eventType, aggregateType } = await searchParams;
  const pagination = normalizePaginationParams(page, 25);

  const [result, stats] = await Promise.all([
    getDomainEventsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      eventType,
      aggregateType,
    }),
    getDomainEventStatsByOrganization(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Eventos de Domínio"
        description="Registo de todos os eventos emitidos pelo sistema e respectivos handlers."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard
            title={DOMAIN_EVENT_STATUS_LABELS["PROCESSED"]!}
            value={stats["PROCESSED"] ?? 0}
          />
          <StatCard
            title={DOMAIN_EVENT_STATUS_LABELS["PENDING"]!}
            value={stats["PENDING"] ?? 0}
          />
          <StatCard
            title={DOMAIN_EVENT_STATUS_LABELS["PROCESSING"]!}
            value={stats["PROCESSING"] ?? 0}
          />
          <StatCard
            title={DOMAIN_EVENT_STATUS_LABELS["FAILED"]!}
            value={stats["FAILED"] ?? 0}
          />
        </div>

        <DomainEventsTable
          result={result}
          currentPage={pagination.page}
          defaultSearch={search}
          defaultStatus={status}
          defaultEventType={eventType}
          defaultAggregateType={aggregateType}
        />
      </div>
    </>
  );
}
