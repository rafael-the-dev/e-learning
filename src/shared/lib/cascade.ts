// =============================================================================
// CASCADE CONTEXT
// Threaded through the grade → subject → level → course recalculation cascade so
// the whole chain can run atomically inside one interactive transaction while
// deferring domain-event publication until AFTER that transaction commits.
//
//   - `client`: the transaction client. When present, every DB write in the
//     cascade uses it, so the canonical grade and all derived progress commit
//     (or roll back) together. When absent, helpers fall back to getDb().
//   - `events`: a collector. When present, the cascade PUSHES domain events into
//     it instead of publishing them, and the transaction owner publishes them
//     after commit — so no event is ever emitted for a rolled-back change. When
//     absent (legacy standalone calls), helpers publish immediately.
// =============================================================================

import type { PrismaClientOrTx } from "@/server/db";
import type { DomainEvent } from "@/server/events/domain-event";
import { eventPublisher } from "@/server/events/event-publisher";

export interface CascadeContext {
  client?: PrismaClientOrTx;
  events?: DomainEvent[];
}

/**
 * Emit a domain event through the cascade context: collect it for post-commit
 * publication when a collector is present, otherwise publish immediately.
 */
export async function emitOrCollect(
  ctx: CascadeContext | undefined,
  event: DomainEvent
): Promise<void> {
  if (ctx?.events) {
    ctx.events.push(event);
    return;
  }
  await eventPublisher.publish(event);
}
