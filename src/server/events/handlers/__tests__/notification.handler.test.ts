import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { studentFindFirst, userFindFirst, paymentFindFirst, invoiceFindFirst, assessmentResultFindMany, assessmentFindFirst } =
  vi.hoisted(() => ({
    studentFindFirst: vi.fn(),
    userFindFirst: vi.fn(),
    paymentFindFirst: vi.fn(),
    invoiceFindFirst: vi.fn(),
    assessmentResultFindMany: vi.fn(),
    assessmentFindFirst: vi.fn(),
  }));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    student: { findFirst: studentFindFirst },
    user: { findFirst: userFindFirst },
    payment: { findFirst: paymentFindFirst },
    invoice: { findFirst: invoiceFindFirst },
    assessmentResult: { findMany: assessmentResultFindMany },
    assessment: { findFirst: assessmentFindFirst },
  }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  createNotificationFromEvent: vi.fn(),
  createManyNotificationsFromEvent: vi.fn(),
}));

import {
  createNotificationFromEvent,
  createManyNotificationsFromEvent,
} from "@/modules/notifications/services/notification.service";
import { DomainEventType, DomainAggregateType } from "../../event-types";
import type { PersistedDomainEvent } from "../../domain-event";
import { NotificationEventHandler } from "../notification.handler";

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

beforeEach(() => vi.clearAllMocks());

describe("NotificationEventHandler — payment.confirmed", () => {
  it("calls createNotificationFromEvent with the eventType and rendering variables (test #11)", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });
    paymentFindFirst.mockResolvedValue({ paymentNumber: "PAY-001" });

    const handler = new NotificationEventHandler();
    const event = makeEvent({
      eventType: DomainEventType.PAYMENT_CONFIRMED,
      payload: { studentId: "student-1", paymentId: "payment-1" },
    });
    await handler.handle(event);

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "payment.confirmed",
        recipientUserId: "user-1",
        variables: { paymentId: "payment-1", paymentNumber: "PAY-001" },
        referenceId: "payment-1",
      })
    );
  });

  it("does nothing when the student has no linked user account", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue(null);

    const handler = new NotificationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.PAYMENT_CONFIRMED,
        payload: { studentId: "student-1", paymentId: "payment-1" },
      })
    );

    expect(createNotificationFromEvent).not.toHaveBeenCalled();
  });
});

describe("NotificationEventHandler — invoice.overdue (test #12)", () => {
  it("calls createNotificationFromEvent with invoice variables", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });
    invoiceFindFirst.mockResolvedValue({ invoiceNumber: "INV-002" });

    const handler = new NotificationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.INVOICE_OVERDUE,
        payload: { studentId: "student-1", invoiceId: "invoice-1" },
      })
    );

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "invoice.overdue",
        recipientUserId: "user-1",
        variables: { invoiceId: "invoice-1", invoiceNumber: "INV-002" },
        referenceId: "invoice-1",
      })
    );
  });
});

describe("NotificationEventHandler — assessment.results_published (test #13)", () => {
  it("calls createManyNotificationsFromEvent with one input per graded student with a linked user account", async () => {
    assessmentResultFindMany.mockResolvedValue([{ studentId: "student-1" }, { studentId: "student-2" }]);
    assessmentFindFirst.mockResolvedValue({ title: "Exame de Código" });
    studentFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "student-1" ? { email: "a@example.com" } : { email: "b@example.com" }
    );
    userFindFirst.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === "a@example.com" ? { id: "user-1" } : null
    );

    const handler = new NotificationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ASSESSMENT_RESULTS_PUBLISHED,
        payload: { assessmentId: "assessment-1" },
      })
    );

    expect(createManyNotificationsFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "assessment.results_published",
          recipientUserId: "user-1",
          variables: { assessmentId: "assessment-1", assessmentTitle: "Exame de Código" },
          referenceId: "assessment-1",
        }),
      ])
    );
    const inputs = (createManyNotificationsFromEvent as Mock).mock.calls[0][1];
    expect(inputs).toHaveLength(1);
  });
});

describe("NotificationEventHandler — attendance.student_at_risk (test #14)", () => {
  it("calls createNotificationFromEvent with the studentId variable", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });

    const handler = new NotificationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ATTENDANCE_STUDENT_AT_RISK,
        payload: { studentId: "student-1", levelSubjectId: "ls-1" },
      })
    );

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "attendance.student_at_risk",
        recipientUserId: "user-1",
        variables: { studentId: "student-1" },
        referenceId: "student-1:ls-1",
      })
    );
  });
});
