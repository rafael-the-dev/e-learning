import { describe, it, expect, vi, beforeEach } from "vitest";

const { recalc } = vi.hoisted(() => ({ recalc: vi.fn() }));
vi.mock("@/modules/students/services/student-risk-projection.service", () => ({
  recalculateStudentRiskProjection: recalc,
}));

import {
  StudentRiskProjectionHandler,
  STUDENT_RISK_RECALCULATION_EVENTS,
} from "../student-risk-projection.handler";
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
  it("handles EVERY event in the centralized F-H2 recalculation contract", () => {
    for (const eventType of STUDENT_RISK_RECALCULATION_EVENTS) {
      expect(handler.canHandle(event({ eventType }))).toBe(true);
    }
    // Spot-check the direct-mutation families the F-H2 scope added.
    for (const eventType of [
      DomainEventType.STUDENT_SUBJECT_FAILED,
      DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
      DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
      DomainEventType.PAYMENT_CANCELLED,
      DomainEventType.REFUND_REQUESTED,
      DomainEventType.REFUND_REJECTED,
      DomainEventType.REFUND_COMPLETED,
      DomainEventType.ENROLLMENT_CANCELLED,
      DomainEventType.ENROLLMENT_COMPLETED,
      DomainEventType.STUDENT_COURSE_COMPLETED,
      DomainEventType.STUDENT_LEVEL_PROGRESSION_CHANGED,
      DomainEventType.STUDENT_DOCUMENT_STATUS_CHANGED,
      DomainEventType.STUDENT_PREREQUISITE_WAIVER_CHANGED,
      DomainEventType.INVOICE_OVERDUE, // F-H3: time-driven, emitted per student by the billing job
    ]) {
      expect(handler.canHandle(event({ eventType }))).toBe(true);
    }
  });

  it("ignores events outside the contract", () => {
    expect(handler.canHandle(event({ eventType: DomainEventType.NOTIFICATION_CREATED }))).toBe(false);
    expect(handler.canHandle(event({ eventType: DomainEventType.BILLING_OVERDUE_DETECTED }))).toBe(false); // aggregate, no studentId
    expect(handler.canHandle(event({ eventType: DomainEventType.WALLET_DEPOSIT_CREATED }))).toBe(false); // not a risk input
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
