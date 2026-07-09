import { describe, expect, it, vi } from "vitest";
import type { DomainEvent } from "@/server/events/domain-event";
import { DomainAggregateType, DomainEventType } from "@/server/events/event-types";
import {
  CertificateOutboxService,
  type OutboxDeliverFn,
} from "../certificate-outbox.service";
import {
  OUTBOX_MAX_RETRIES,
  canRetry,
  nextRetryAt,
  retryDelayMs,
} from "../retry-policy";

// =============================================================================
// Certificate Outbox — Phase 14 tests
// -----------------------------------------------------------------------------
// enqueue / publish / retry / max-retries → dead letter / markDelivered /
// markFailed, plus the pure retry-policy maths. Delivery is driven by an injected
// `deliver` fn so success vs failure is fully controllable (the production default
// wraps eventPublisher, which never throws → always delivers on first attempt).
// =============================================================================

const NOW = new Date("2026-07-09T10:00:00.000Z");

function evt(id = "c1"): DomainEvent {
  return {
    organizationId: "org-A",
    eventType: DomainEventType.CERTIFICATE_ISSUED,
    aggregateType: DomainAggregateType.CERTIFICATE,
    aggregateId: id,
    actorId: "u-1",
    payload: { organizationId: "org-A", certificateId: id, studentId: "stu-secret" },
  };
}

const okDeliver: OutboxDeliverFn = vi.fn(async () => {});
const failDeliver: OutboxDeliverFn = vi.fn(async () => {
  throw new Error("bus down");
});

describe("retry policy (pure)", () => {
  it("canRetry is true below the max and false once reached", () => {
    expect(canRetry(0)).toBe(true);
    expect(canRetry(OUTBOX_MAX_RETRIES - 1)).toBe(true);
    expect(canRetry(OUTBOX_MAX_RETRIES)).toBe(false);
  });

  it("retryDelayMs grows exponentially (base * 2^(n-1)); 0 for n<=0", () => {
    expect(retryDelayMs(0)).toBe(0);
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(2)).toBe(2000);
    expect(retryDelayMs(3)).toBe(4000);
  });

  it("nextRetryAt offsets now by the exponential delay", () => {
    expect(nextRetryAt(NOW, 1).getTime()).toBe(NOW.getTime() + 1000);
    expect(nextRetryAt(NOW, 2).getTime()).toBe(NOW.getTime() + 2000);
  });
});

describe("outbox — enqueue + publish (happy path)", () => {
  it("enqueue records a PENDING entry; publish delivers it once", async () => {
    const deliver = vi.fn(async () => {});
    const ob = new CertificateOutboxService(deliver);
    ob.enqueue(evt("c1"), NOW);
    expect(ob.listPending()).toHaveLength(1);

    await ob.publish(NOW);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(ob.listPending()).toHaveLength(0);
    expect(ob.summary()).toMatchObject({ total: 1, pending: 0, delivered: 1, failed: 0 });
  });

  it("dispatch enqueues every event then publishes (Command → enqueue → publish)", async () => {
    const deliver = vi.fn(async () => {});
    const ob = new CertificateOutboxService(deliver);
    await ob.dispatch([evt("a"), evt("b"), evt("c")], NOW);
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(ob.summary()).toMatchObject({ total: 3, delivered: 3, pending: 0, failed: 0 });
  });

  it("summary is sanitized — no event payload is exposed", async () => {
    const ob = new CertificateOutboxService(failDeliver);
    await ob.dispatch([evt("c1")], NOW);
    // drive to dead letter
    await ob.retry(NOW);
    await ob.retry(NOW);
    const summary = ob.summary();
    expect(summary.deadLetter).toHaveLength(1);
    const entry = summary.deadLetter[0];
    expect(entry).toMatchObject({ eventType: DomainEventType.CERTIFICATE_ISSUED, aggregateId: "c1" });
    expect(entry).not.toHaveProperty("payload");
    expect(entry).not.toHaveProperty("event");
    expect(JSON.stringify(summary)).not.toContain("stu-secret");
  });
});

describe("outbox — retry + dead letter", () => {
  it("a failing delivery stays PENDING (retryable) then dead-letters after the budget", async () => {
    const deliver = vi.fn(async () => {
      throw new Error("bus down");
    });
    const ob = new CertificateOutboxService(deliver);
    ob.enqueue(evt("c1"), NOW);

    await ob.publish(NOW); // attempt #1 → fail → retryCount 1, still PENDING
    expect(ob.listPending()).toHaveLength(1);
    expect(ob.listPending()[0].retryCount).toBe(1);
    expect(ob.listPending()[0].nextRetryAt).not.toBeNull();

    await ob.retry(NOW); // attempt #2 → retryCount 2, PENDING
    expect(ob.listPending()[0].retryCount).toBe(2);

    await ob.retry(NOW); // attempt #3 → retryCount 3 → FAILED (dead letter)
    expect(ob.listPending()).toHaveLength(0);
    expect(ob.listFailed()).toHaveLength(1);
    expect(ob.listFailed()[0].retryCount).toBe(OUTBOX_MAX_RETRIES);
    expect(ob.summary()).toMatchObject({ total: 1, pending: 0, delivered: 0, failed: 1 });
    expect(deliver).toHaveBeenCalledTimes(3);
  });

  it("a dead-lettered entry is never re-attempted and is never deleted", async () => {
    const deliver = vi.fn(async () => {
      throw new Error("bus down");
    });
    const ob = new CertificateOutboxService(deliver);
    ob.enqueue(evt("c1"), NOW);
    await ob.publish(NOW);
    await ob.retry(NOW);
    await ob.retry(NOW);
    expect(ob.listFailed()).toHaveLength(1);

    deliver.mockClear();
    await ob.publish(NOW); // nothing PENDING
    await ob.retry(NOW); // FAILED is not retryable
    expect(deliver).not.toHaveBeenCalled();
    expect(ob.listFailed()).toHaveLength(1); // still queryable
  });

  it("retry re-drives only previously-failed entries and can eventually succeed", async () => {
    let attempts = 0;
    const deliver = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
    });
    const ob = new CertificateOutboxService(deliver);
    ob.enqueue(evt("c1"), NOW);
    await ob.publish(NOW); // fail #1 → PENDING retryCount 1
    expect(ob.listPending()[0].retryCount).toBe(1);
    await ob.retry(NOW); // succeeds
    expect(ob.listPending()).toHaveLength(0);
    expect(ob.summary()).toMatchObject({ delivered: 1, failed: 0 });
  });
});

describe("outbox — markDelivered / markFailed direct", () => {
  it("markDelivered flips an entry to DELIVERED", () => {
    const ob = new CertificateOutboxService(okDeliver);
    const id = ob.enqueue(evt("c1"), NOW);
    ob.markDelivered(id, NOW);
    expect(ob.summary()).toMatchObject({ delivered: 1, pending: 0 });
  });

  it("markFailed increments retryCount and dead-letters past the budget", () => {
    const ob = new CertificateOutboxService(okDeliver);
    const id = ob.enqueue(evt("c1"), NOW);
    ob.markFailed(id, NOW); // 1
    ob.markFailed(id, NOW); // 2
    expect(ob.listPending()[0].retryCount).toBe(2);
    ob.markFailed(id, NOW); // 3 → FAILED
    expect(ob.listFailed()).toHaveLength(1);
  });

  it("mark* on an unknown id is a no-op (never throws)", () => {
    const ob = new CertificateOutboxService(okDeliver);
    expect(() => ob.markDelivered("nope")).not.toThrow();
    expect(() => ob.markFailed("nope")).not.toThrow();
  });
});
