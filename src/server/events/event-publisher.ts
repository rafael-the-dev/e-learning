import { EventBus } from "./event-bus";
import { registeredHandlers } from "./registry";
import type { DomainEvent } from "./domain-event";

// =============================================================================
// EVENT PUBLISHER
// Thin singleton wrapper over EventBus.
// Commands call: await eventPublisher.publish({ ... })
// Must only be called AFTER the main database transaction has committed.
// =============================================================================

let _bus: EventBus | null = null;

function getBus(): EventBus {
  if (!_bus) _bus = new EventBus(registeredHandlers);
  return _bus;
}

export const eventPublisher = {
  async publish(event: DomainEvent): Promise<void> {
    try {
      await getBus().publish(event);
    } catch (err) {
      // Event infrastructure failures must never surface to the caller as
      // errors that could mislead the user into thinking the business
      // operation failed. Log and continue.
      console.error("[EventPublisher] failed to publish event", event.eventType, err);
    }
  },
};
