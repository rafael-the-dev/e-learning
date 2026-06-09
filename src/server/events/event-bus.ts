import { getDb } from "@/server/db";
import { EventDispatcher } from "./event-dispatcher";
import type { DomainEvent, PersistedDomainEvent } from "./domain-event";
import type { DomainEventHandler } from "./event-handlers";

// =============================================================================
// EVENT BUS
// Single entry point for publishing domain events.
// 1. Persists event as PENDING.
// 2. Synchronously dispatches to registered handlers.
// Architecture is ready for async/background processing: replace dispatch()
// call with queue enqueue and process the PENDING event in a background worker.
// =============================================================================

export class EventBus {
  private readonly dispatcher: EventDispatcher;

  constructor(handlers: DomainEventHandler[]) {
    this.dispatcher = new EventDispatcher(handlers);
  }

  async publish(event: DomainEvent): Promise<void> {
    const db = await getDb();

    const record = await db.domainEvent.create({
      data: {
        organizationId: event.organizationId,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: JSON.stringify({ ...event.payload, _actorId: event.actorId }),
        status: "PENDING",
      },
    });

    const persisted: PersistedDomainEvent = {
      ...event,
      id: record.id,
      status: record.status,
      occurredAt: record.occurredAt,
      retryCount: record.retryCount,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };

    await this.dispatcher.dispatch(persisted);
  }
}
