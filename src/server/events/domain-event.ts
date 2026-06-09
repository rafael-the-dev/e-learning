import type { DomainAggregateType, DomainEventType } from "./event-types";

// =============================================================================
// DOMAIN EVENT VALUE OBJECT
// Passed to eventPublisher.publish() by commands after their transaction
// succeeds. The bus persists it and dispatches to registered handlers.
// =============================================================================

export interface DomainEvent {
  organizationId: string;
  eventType: DomainEventType;
  aggregateType: DomainAggregateType;
  aggregateId: string;
  payload: Record<string, unknown>;
  actorId?: string;
}

export interface PersistedDomainEvent extends DomainEvent {
  id: string;
  status: string;
  occurredAt: Date;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}
