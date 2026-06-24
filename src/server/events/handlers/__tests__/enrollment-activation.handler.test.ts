import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const {
  enrollmentFindFirst,
  enrollmentBillingPolicyFindFirst,
  enrollmentUpdate,
  enrollmentStatusHistoryCreate,
  studentFindFirst,
  courseFindFirst,
  userFindFirst,
} = vi.hoisted(() => ({
  enrollmentFindFirst: vi.fn(),
  enrollmentBillingPolicyFindFirst: vi.fn(),
  enrollmentUpdate: vi.fn(),
  enrollmentStatusHistoryCreate: vi.fn(),
  studentFindFirst: vi.fn(),
  courseFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    enrollment: { findFirst: enrollmentFindFirst, update: enrollmentUpdate },
    enrollmentBillingPolicy: { findFirst: enrollmentBillingPolicyFindFirst },
    enrollmentStatusHistory: { create: enrollmentStatusHistoryCreate },
    student: { findFirst: studentFindFirst },
    course: { findFirst: courseFindFirst },
    user: { findFirst: userFindFirst },
  }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  createNotificationFromEvent: vi.fn(),
}));

import { createNotificationFromEvent } from "@/modules/notifications/services/notification.service";
import { DomainEventType, DomainAggregateType } from "../../event-types";
import type { PersistedDomainEvent } from "../../domain-event";
import { EnrollmentActivationEventHandler } from "../enrollment-activation.handler";

const ORG_ID = "org-1";

function makeEvent(overrides: Partial<PersistedDomainEvent> = {}): PersistedDomainEvent {
  return {
    id: "event-1",
    organizationId: ORG_ID,
    eventType: DomainEventType.PAYMENT_CONFIRMED,
    aggregateType: DomainAggregateType.PAYMENT,
    aggregateId: "agg-1",
    payload: {},
    status: "PROCESSING",
    occurredAt: new Date(),
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeEnrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: "enrollment-1",
    status: "PENDING_PAYMENT",
    billingPolicyId: "policy-1",
    studentId: "student-1",
    courseId: "course-1",
    enrollmentNumber: "ENR-001",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("EnrollmentActivationEventHandler — auto-activation routes through createNotificationFromEvent", () => {
  it("activates the enrollment and notifies via the rule/template path, not a hardcoded message", async () => {
    enrollmentFindFirst.mockResolvedValue(makeEnrollment());
    enrollmentBillingPolicyFindFirst.mockResolvedValue({ activationRule: "AFTER_FIRST_PAYMENT" });
    enrollmentUpdate.mockResolvedValue({});
    enrollmentStatusHistoryCreate.mockResolvedValue({});
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com", firstName: "Maria", lastName: "Silva" });
    courseFindFirst.mockResolvedValue({ name: "Categoria B" });
    userFindFirst.mockResolvedValue({ id: "user-1" });

    const handler = new EnrollmentActivationEventHandler();
    await handler.handle(
      makeEvent({ payload: { enrollmentId: "enrollment-1", paymentId: "payment-1" } })
    );

    expect(enrollmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "enrollment-1" }, data: expect.objectContaining({ status: "ACTIVE" }) })
    );

    // No call accepts a literal title/message — the only way to send text here
    // is through the eventType + variables resolved by the rule/template engine.
    expect(createNotificationFromEvent).toHaveBeenCalledWith(ORG_ID, {
      eventType: "enrollment.activated",
      recipientUserId: "user-1",
      variables: {
        enrollmentId: "enrollment-1",
        enrollmentNumber: "ENR-001",
        studentName: "Maria Silva",
        courseName: "Categoria B",
      },
      referenceId: "enrollment-1",
    });
  });

  it("does not throw and creates no notification when the rule engine resolves nothing (e.g. a disabled enrollment.activated rule)", async () => {
    enrollmentFindFirst.mockResolvedValue(makeEnrollment());
    enrollmentBillingPolicyFindFirst.mockResolvedValue({ activationRule: "AFTER_FIRST_PAYMENT" });
    enrollmentUpdate.mockResolvedValue({});
    enrollmentStatusHistoryCreate.mockResolvedValue({});
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com", firstName: "Maria", lastName: "Silva" });
    courseFindFirst.mockResolvedValue({ name: "Categoria B" });
    userFindFirst.mockResolvedValue({ id: "user-1" });
    (createNotificationFromEvent as Mock).mockResolvedValue(null);

    const handler = new EnrollmentActivationEventHandler();
    await expect(
      handler.handle(makeEvent({ payload: { enrollmentId: "enrollment-1", paymentId: "payment-1" } }))
    ).resolves.not.toThrow();

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ eventType: "enrollment.activated" })
    );
  });

  it("does not activate or notify when the billing policy's activationRule is MANUAL", async () => {
    enrollmentFindFirst.mockResolvedValue(makeEnrollment());
    enrollmentBillingPolicyFindFirst.mockResolvedValue({ activationRule: "MANUAL" });

    const handler = new EnrollmentActivationEventHandler();
    await handler.handle(
      makeEvent({ payload: { enrollmentId: "enrollment-1", paymentId: "payment-1" } })
    );

    expect(enrollmentUpdate).not.toHaveBeenCalled();
    expect(createNotificationFromEvent).not.toHaveBeenCalled();
  });

  it("does nothing when the student has no linked user account", async () => {
    enrollmentFindFirst.mockResolvedValue(makeEnrollment());
    enrollmentBillingPolicyFindFirst.mockResolvedValue({ activationRule: "AFTER_FIRST_PAYMENT" });
    enrollmentUpdate.mockResolvedValue({});
    enrollmentStatusHistoryCreate.mockResolvedValue({});
    studentFindFirst.mockResolvedValue({ email: null, firstName: "Maria", lastName: "Silva" });
    courseFindFirst.mockResolvedValue({ name: "Categoria B" });

    const handler = new EnrollmentActivationEventHandler();
    await handler.handle(
      makeEvent({ payload: { enrollmentId: "enrollment-1", paymentId: "payment-1" } })
    );

    expect(createNotificationFromEvent).not.toHaveBeenCalled();
  });
});
