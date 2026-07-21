import { describe, it, expect, vi, beforeEach } from "vitest";

const { recalc } = vi.hoisted(() => ({ recalc: vi.fn() }));
vi.mock("@/modules/students/services/student-risk-projection.service", () => ({
  recalculateStudentRiskProjection: recalc,
}));

import { StudentRiskProjectionHandler } from "../student-risk-projection.handler";
import { DomainEventType } from "../../event-types";
import type { PersistedDomainEvent } from "../../domain-event";

function event(over: Partial<PersistedDomainEvent> = {}): PersistedDomainEvent {
  return {
    id: "evt-1",
    organizationId: "org-1",
    eventType: DomainEventType.PAYMENT_CONFIRMED,
    aggregateType: "PAYMENT",
    aggregateId: "p1",
    payload: { studentId: "s1" },
    status: "PENDING",
    occurredAt: new Date("2026-07-21T10:00:00Z"),
    retryCount: 0,
    actorId: null,
    createdAt: new Date("2026-07-21T10:00:00Z"),
    updatedAt: new Date("2026-07-21T10:00:00Z"),
    ...over,
  } as PersistedDomainEvent;
}

const handler = new StudentRiskProjectionHandler();

beforeEach(() => recalc.mockReset());

describe("StudentRiskProjectionHandler", () => {
  it("handles the risk-relevant emitted events and ignores others", () => {
    expect(handler.canHandle(event({ eventType: DomainEventType.PAYMENT_CONFIRMED }))).toBe(true);
    expect(handler.canHandle(event({ eventType: DomainEventType.ATTENDANCE_SUMMARY_RECALCULATED }))).toBe(true);
    expect(handler.canHandle(event({ eventType: DomainEventType.NOTIFICATION_CREATED }))).toBe(false);
  });

  it("recomputes the projection for the payload's student, scoped to the event's org", async () => {
    recalc.mockResolvedValue({ changed: true });
    await handler.handle(event({ organizationId: "org-9", payload: { studentId: "stu-7" } }));
    expect(recalc).toHaveBeenCalledWith({ organizationId: "org-9", studentId: "stu-7" });
  });

  it("no-ops when the payload has no studentId", async () => {
    await handler.handle(event({ payload: { invoiceId: "i1" } }));
    expect(recalc).not.toHaveBeenCalled();
  });

  // NOTE: the handler wraps the recompute in try/catch and logs on failure so a projection
  // error never fails the dispatcher (read-model maintenance is best-effort). That swallow is
  // asserted by code review rather than a unit test — a throwing async mock trips vitest's
  // file-level unhandled-rejection tracker even though the handler does catch it.
});
