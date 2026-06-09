import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";

// =============================================================================
// STUDENT TIMELINE HANDLER
// Placeholder — Student Timeline module is not yet implemented.
// When implemented, this handler will write structured timeline entries
// for each relevant domain event tied to a student aggregate.
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.ENROLLMENT_CREATED,
  DomainEventType.ENROLLMENT_ACTIVATED,
  DomainEventType.ENROLLMENT_CANCELLED,
  DomainEventType.ENROLLMENT_COMPLETED,
  DomainEventType.PAYMENT_CONFIRMED,
  DomainEventType.INVOICE_PAID,
]);

export class StudentTimelineEventHandler implements DomainEventHandler {
  readonly handlerName = "StudentTimelineEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  // TODO: implement once StudentTimeline module is created.
  // Each event should create a StudentTimelineEntry record keyed by studentId.
  async handle(_event: PersistedDomainEvent): Promise<void> {
    // No-op until Student Timeline module is implemented.
  }
}
