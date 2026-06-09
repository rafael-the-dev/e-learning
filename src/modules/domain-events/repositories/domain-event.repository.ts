import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult } from "@/shared/types/common";
import type { DomainEventRecord, ListDomainEventsParams } from "../types";

// =============================================================================
// DOMAIN EVENT REPOSITORY
// All queries are scoped to organizationId.
// =============================================================================

const eventSelect = {
  id: true,
  organizationId: true,
  eventType: true,
  aggregateType: true,
  aggregateId: true,
  payload: true,
  status: true,
  occurredAt: true,
  processedAt: true,
  failedAt: true,
  failureReason: true,
  retryCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listDomainEvents(
  organizationId: string,
  params: ListDomainEventsParams
): Promise<PaginatedResult<DomainEventRecord>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    ...(params.eventType ? { eventType: params.eventType } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.aggregateType ? { aggregateType: params.aggregateType } : {}),
    ...(params.search
      ? {
          OR: [
            { aggregateId: { contains: params.search } },
            { eventType: { contains: params.search } },
          ],
        }
      : {}),
  };

  const [total, data] = await Promise.all([
    db.domainEvent.count({ where }),
    db.domainEvent.findMany({
      where,
      select: eventSelect,
      orderBy: { occurredAt: "desc" },
      skip,
      take,
    }),
  ]);

  return buildPaginationMeta(data as DomainEventRecord[], total, params);
}

export async function findDomainEventById(
  id: string,
  organizationId: string
): Promise<DomainEventRecord | null> {
  const db = await getDb();
  const record = await db.domainEvent.findFirst({
    where: { id, organizationId },
    select: {
      ...eventSelect,
      handlerLogs: {
        select: {
          id: true,
          organizationId: true,
          eventId: true,
          handlerName: true,
          status: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
          failureReason: true,
          retryCount: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return record as DomainEventRecord | null;
}

export async function getDomainEventStats(organizationId: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.domainEvent.groupBy({
    by: ["status"],
    where: { organizationId },
    _count: { status: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row._count.status;
  return result;
}
