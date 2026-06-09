import type { PersistedDomainEvent } from "./domain-event";

// =============================================================================
// DOMAIN EVENT HANDLER INTERFACE
// Each handler is responsible for a single side-effect reaction to an event.
// Handlers must be idempotent: the bus checks DomainEventHandlerLog and skips
// handlers that have already PROCESSED the same event.
// =============================================================================

export interface DomainEventHandler {
  readonly handlerName: string;
  canHandle(event: PersistedDomainEvent): boolean;
  handle(event: PersistedDomainEvent): Promise<void>;
}
