import { describe, it, expect, vi, beforeEach } from "vitest";

const { studentFindFirst, userFindFirst, enrollmentFindFirst } = vi.hoisted(() => ({
  studentFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  enrollmentFindFirst: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    student: { findFirst: studentFindFirst },
    user: { findFirst: userFindFirst },
    enrollment: { findFirst: enrollmentFindFirst },
  }),
}));

vi.mock("@/modules/notifications/services/notification.service", () => ({
  createNotification: vi.fn(),
  createNotificationFromEvent: vi.fn(),
}));

import {
  createNotification,
  createNotificationFromEvent,
} from "@/modules/notifications/services/notification.service";
import { DomainEventType, DomainAggregateType } from "../../event-types";
import type { PersistedDomainEvent } from "../../domain-event";
import { CommunicationEventHandler } from "../communication.handler";

const ORG_ID = "org-1";

function makeEvent(overrides: Partial<PersistedDomainEvent> = {}): PersistedDomainEvent {
  return {
    id: "event-1",
    organizationId: ORG_ID,
    eventType: DomainEventType.ENROLLMENT_ACTIVATED,
    aggregateType: DomainAggregateType.ENROLLMENT,
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

describe("CommunicationEventHandler — enrollment.activated (manual path, migrated)", () => {
  it("calls createNotificationFromEvent with enrollment/student/course variables, never the plain createNotification", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });
    enrollmentFindFirst.mockResolvedValue({
      enrollmentNumber: "ENR-001",
      student: { firstName: "Maria", lastName: "Silva" },
      course: { name: "Categoria B" },
    });

    const handler = new CommunicationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ENROLLMENT_ACTIVATED,
        payload: { studentId: "student-1", enrollmentId: "enrollment-1" },
      })
    );

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "enrollment.activated",
        recipientUserId: "user-1",
        variables: {
          enrollmentId: "enrollment-1",
          enrollmentNumber: "ENR-001",
          studentName: "Maria Silva",
          courseName: "Categoria B",
        },
        referenceId: "enrollment-1",
      })
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("does nothing when the student has no linked user account", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue(null);

    const handler = new CommunicationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ENROLLMENT_ACTIVATED,
        payload: { studentId: "student-1", enrollmentId: "enrollment-1" },
      })
    );

    expect(createNotificationFromEvent).not.toHaveBeenCalled();
  });
});

describe("CommunicationEventHandler — attendance.justification_approved (migrated)", () => {
  it("calls createNotificationFromEvent with the justificationId variable", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });

    const handler = new CommunicationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
        payload: { studentId: "student-1", justificationId: "justification-1" },
      })
    );

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "attendance.justification_approved",
        recipientUserId: "user-1",
        variables: { justificationId: "justification-1" },
        referenceId: "justification-1",
      })
    );
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("CommunicationEventHandler — attendance.justification_rejected (migrated)", () => {
  it("calls createNotificationFromEvent with justificationId and rejectionReason", async () => {
    studentFindFirst.mockResolvedValue({ email: "aluno@example.com" });
    userFindFirst.mockResolvedValue({ id: "user-1" });

    const handler = new CommunicationEventHandler();
    await handler.handle(
      makeEvent({
        eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
        payload: {
          studentId: "student-1",
          justificationId: "justification-1",
          rejectionReason: "Documento ilegível",
        },
      })
    );

    expect(createNotificationFromEvent).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        eventType: "attendance.justification_rejected",
        recipientUserId: "user-1",
        variables: { justificationId: "justification-1", rejectionReason: "Documento ilegível" },
        referenceId: "justification-1",
      })
    );
    expect(createNotification).not.toHaveBeenCalled();
  });
});
