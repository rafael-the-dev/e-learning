import type { DomainEvent } from "@/server/events/domain-event";
import { eventPublisher } from "@/server/events/event-publisher";
import {
  OutboxEntryStatus,
  type OutboxEntrySummary,
  type OutboxSummary,
} from "@/modules/certificates/types/operational";
import { canRetry, nextRetryAt } from "./retry-policy";

// =============================================================================
// CERTIFICATE OUTBOX SERVICE (Phase 14) — IN-PROCESS, IN-MEMORY
// -----------------------------------------------------------------------------
// The single seam through which every certificate command publishes its
// post-commit domain events. Instead of calling `eventPublisher.publish()`
// directly, a command now does: enqueue(event) → publish(). This guarantees the
// events are RECORDED (in memory, this phase) before delivery, so they can be
// replayed via retry()/publish() and inspected (dead-letter) when delivery fails.
//
// It changes NO event payload and adds NO domain rule. The only mutable state in
// the whole operational-hardening phase lives here. Delivery is done by an
// injectable `deliver` fn (default: `eventPublisher.publish`, which itself never
// throws — so in production entries deliver on the first attempt; tests inject a
// throwing `deliver` to exercise retry / dead-letter).
//
// Persistence is DEFERRED: a future phase may back this with an outbox table +
// worker without changing this API (enqueue/publish/retry/list/mark*).
// =============================================================================

interface OutboxEntry {
  id: string;
  event: DomainEvent;
  status: OutboxEntryStatus;
  retryCount: number;
  enqueuedAt: Date;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
}

export type OutboxDeliverFn = (event: DomainEvent) => Promise<void>;

function toSummary(entry: OutboxEntry): OutboxEntrySummary {
  return {
    id: entry.id,
    organizationId: entry.event.organizationId,
    eventType: entry.event.eventType,
    aggregateType: entry.event.aggregateType,
    aggregateId: entry.event.aggregateId,
    status: entry.status,
    retryCount: entry.retryCount,
    enqueuedAt: entry.enqueuedAt,
    lastAttemptAt: entry.lastAttemptAt,
    nextRetryAt: entry.nextRetryAt,
  };
}

export class CertificateOutboxService {
  private readonly entries: OutboxEntry[] = [];
  private seq = 0;
  private readonly deliver: OutboxDeliverFn;

  constructor(deliver: OutboxDeliverFn = (event) => eventPublisher.publish(event)) {
    this.deliver = deliver;
  }

  /** Record an event for delivery (status PENDING, retryCount 0). Returns the id. */
  enqueue(event: DomainEvent, now: Date = new Date()): string {
    this.seq += 1;
    const id = `outbox-${this.seq}`;
    this.entries.push({
      id,
      event,
      status: OutboxEntryStatus.PENDING,
      retryCount: 0,
      enqueuedAt: now,
      lastAttemptAt: null,
      nextRetryAt: null,
    });
    return id;
  }

  /** Every entry still awaiting delivery (status PENDING). */
  listPending(): OutboxEntrySummary[] {
    return this.entries.filter((e) => e.status === OutboxEntryStatus.PENDING).map(toSummary);
  }

  /** The dead-letter entries (retry budget exhausted; status FAILED). Never auto-deleted. */
  listFailed(): OutboxEntrySummary[] {
    return this.entries.filter((e) => e.status === OutboxEntryStatus.FAILED).map(toSummary);
  }

  /** Mark an entry delivered (idempotent for unknown ids). */
  markDelivered(id: string, now: Date = new Date()): void {
    const entry = this.find(id);
    if (!entry) return;
    entry.status = OutboxEntryStatus.DELIVERED;
    entry.lastAttemptAt = now;
    entry.nextRetryAt = null;
  }

  /** Record a failed attempt: bump `retryCount`; stay PENDING (with an advisory
   *  `nextRetryAt`) while the budget allows, else move to the FAILED dead letter. */
  markFailed(id: string, now: Date = new Date()): void {
    const entry = this.find(id);
    if (!entry) return;
    entry.retryCount += 1;
    entry.lastAttemptAt = now;
    if (canRetry(entry.retryCount)) {
      entry.status = OutboxEntryStatus.PENDING;
      entry.nextRetryAt = nextRetryAt(now, entry.retryCount);
    } else {
      entry.status = OutboxEntryStatus.FAILED;
      entry.nextRetryAt = null;
    }
  }

  /** Attempt delivery of every PENDING entry once. Never throws: a delivery error
   *  is captured via `markFailed` (retry/dead-letter), successes via `markDelivered`. */
  async publish(now: Date = new Date()): Promise<void> {
    const pending = this.entries.filter((e) => e.status === OutboxEntryStatus.PENDING);
    for (const entry of pending) {
      await this.attempt(entry, now);
    }
  }

  /** Re-drive delivery for entries that have already failed at least once but are
   *  still retryable (PENDING with `retryCount > 0`). Never throws. */
  async retry(now: Date = new Date()): Promise<void> {
    const retryable = this.entries.filter(
      (e) => e.status === OutboxEntryStatus.PENDING && e.retryCount > 0
    );
    for (const entry of retryable) {
      await this.attempt(entry, now);
    }
  }

  /** Ergonomic command entrypoint: enqueue every event then publish once. Encodes
   *  the required Command → enqueue() → publish() flow in one call. Never throws. */
  async dispatch(events: DomainEvent[], now: Date = new Date()): Promise<void> {
    for (const event of events) this.enqueue(event, now);
    await this.publish(now);
  }

  /** Aggregate, SANITIZED delivery counts + the dead-letter list (no payloads). */
  summary(): OutboxSummary {
    let pending = 0;
    let delivered = 0;
    let failed = 0;
    for (const e of this.entries) {
      if (e.status === OutboxEntryStatus.PENDING) pending += 1;
      else if (e.status === OutboxEntryStatus.DELIVERED) delivered += 1;
      else if (e.status === OutboxEntryStatus.FAILED) failed += 1;
    }
    return {
      total: this.entries.length,
      pending,
      delivered,
      failed,
      deadLetter: this.entries
        .filter((e) => e.status === OutboxEntryStatus.FAILED)
        .map(toSummary),
    };
  }

  /** Discard all entries — test isolation only (the shared singleton persists across
   *  a process). Never used by production code paths. */
  reset(): void {
    this.entries.length = 0;
    this.seq = 0;
  }

  private find(id: string): OutboxEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  private async attempt(entry: OutboxEntry, now: Date): Promise<void> {
    try {
      await this.deliver(entry.event);
      this.markDelivered(entry.id, now);
    } catch {
      this.markFailed(entry.id, now);
    }
  }
}

/** Process-wide singleton every certificate command shares (in-memory, this phase). */
export const certificateOutbox = new CertificateOutboxService();
