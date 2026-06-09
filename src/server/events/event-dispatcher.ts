import { getDb } from "@/server/db";
import type { DomainEventHandler } from "./event-handlers";
import type { PersistedDomainEvent } from "./domain-event";

// =============================================================================
// EVENT DISPATCHER
// Runs each registered handler for a persisted event.
// - Checks DomainEventHandlerLog for idempotency (skip if already PROCESSED).
// - Records FAILED handlers without rolling back successful ones.
// - If all handlers complete, marks the event PROCESSED.
// - If any handler fails, marks the event FAILED with a summary.
// =============================================================================

export class EventDispatcher {
  constructor(private readonly handlers: DomainEventHandler[]) {}

  async dispatch(event: PersistedDomainEvent): Promise<void> {
    const db = await getDb();
    const applicableHandlers = this.handlers.filter((h) => h.canHandle(event));

    if (applicableHandlers.length === 0) {
      await db.domainEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return;
    }

    await db.domainEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSING" },
    });

    const failures: string[] = [];

    for (const handler of applicableHandlers) {
      const existing = await db.domainEventHandlerLog.findUnique({
        where: { eventId_handlerName: { eventId: event.id, handlerName: handler.handlerName } },
        select: { status: true },
      });

      if (existing?.status === "PROCESSED") continue;
      if (existing?.status === "SKIPPED") continue;

      const log = existing
        ? await db.domainEventHandlerLog.update({
            where: { eventId_handlerName: { eventId: event.id, handlerName: handler.handlerName } },
            data: { status: "PROCESSING", startedAt: new Date(), retryCount: { increment: 1 } },
          })
        : await db.domainEventHandlerLog.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              handlerName: handler.handlerName,
              status: "PROCESSING",
              startedAt: new Date(),
            },
          });

      try {
        await handler.handle(event);
        await db.domainEventHandlerLog.update({
          where: { id: log.id },
          data: { status: "PROCESSED", completedAt: new Date() },
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push(`${handler.handlerName}: ${reason}`);
        await db.domainEventHandlerLog.update({
          where: { id: log.id },
          data: { status: "FAILED", failedAt: new Date(), failureReason: reason },
        });
        console.error(`[EventDispatcher] handler ${handler.handlerName} failed for event ${event.id}:`, err);
      }
    }

    if (failures.length === 0) {
      await db.domainEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    } else {
      await db.domainEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: failures.join("; "),
          retryCount: { increment: 1 },
        },
      });
    }
  }
}
