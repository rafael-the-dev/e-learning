import {
  listDomainEvents,
  findDomainEventById,
  getDomainEventStats,
} from "../repositories/domain-event.repository";
import type { ListDomainEventsParams, DomainEventRecord } from "../types";
import type { PaginatedResult } from "@/shared/types/common";

// =============================================================================
// DOMAIN EVENT SERVICE
// Read-only queries. Mutations happen inside EventBus and EventDispatcher.
// =============================================================================

export async function getDomainEventsByOrganization(
  organizationId: string,
  params: ListDomainEventsParams
): Promise<PaginatedResult<DomainEventRecord>> {
  return listDomainEvents(organizationId, params);
}

export async function getDomainEventDetail(
  id: string,
  organizationId: string
): Promise<DomainEventRecord | null> {
  return findDomainEventById(id, organizationId);
}

export async function getDomainEventStatsByOrganization(
  organizationId: string
): Promise<Record<string, number>> {
  return getDomainEventStats(organizationId);
}
