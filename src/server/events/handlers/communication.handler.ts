import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import { createNotification, createNotificationFromEvent } from "@/modules/notifications/services/notification.service";
import { NotificationType, NotificationSeverity } from "@/shared/types/common";

// =============================================================================
// COMMUNICATION EVENT HANDLER
// Reacts to key domain events and creates in-app notifications.
// Handlers re-fetch data from DB — payload IDs are trusted for lookup only.
//
// payment.confirmed, invoice.overdue and attendance.student_at_risk moved to
// NotificationEventHandler (Notifications Center Phase 1). lesson.published
// is no longer handled here — it never had a single recipient (Notification
// now requires recipientUserId) and nothing ever surfaced it to a user.
//
// Phase 2: enrollment.activated and attendance.justification_approved/rejected
// are catalogued events, so they now go through createNotificationFromEvent
// (rule + template driven) instead of hardcoded title/message. enrollment.cancelled
// and attendance.student_below_required are NOT in the Phase 2 catalog — they
// keep using the plain createNotification() path unchanged, since routing them
// through the rule engine without a seeded rule would silently stop them firing.
//
// enrollment.activated fires from two distinct triggers — manual activation
// (this handler, via ActivateEnrollmentCommand) and automatic activation after
// payment (EnrollmentActivationEventHandler, on payment.confirmed). Both now
// call createNotificationFromEvent with the same variable set (enrollmentId,
// enrollmentNumber, studentName, courseName), so an org's rule/template for
// enrollment.activated governs both paths identically — neither hardcodes text.
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.ENROLLMENT_ACTIVATED,
  DomainEventType.ENROLLMENT_CANCELLED,
  DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED,
  DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
  DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
]);

export class CommunicationEventHandler implements DomainEventHandler {
  readonly handlerName = "CommunicationEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const db = await getDb();
    const payload = event.payload as Record<string, unknown>;

    async function resolveStudentUserId(studentId: string): Promise<string | null> {
      const student = await db.student.findFirst({
        where: { id: studentId, organizationId: event.organizationId },
        select: { email: true },
      });
      if (!student?.email) return null;
      const user = await db.user.findFirst({ where: { email: student.email }, select: { id: true } });
      return user?.id ?? null;
    }

    switch (event.eventType) {
      case DomainEventType.ENROLLMENT_ACTIVATED: {
        const studentId = payload.studentId as string | undefined;
        const enrollmentId = payload.enrollmentId as string | undefined;
        if (!studentId || !enrollmentId) return;

        const recipientUserId = await resolveStudentUserId(studentId);
        if (!recipientUserId) return;

        // Same variable set as the auto-activation path (EnrollmentActivationEventHandler)
        // so a custom enrollment.activated template renders identically either way.
        const enrollment = await db.enrollment.findFirst({
          where: { id: enrollmentId, organizationId: event.organizationId },
          select: {
            enrollmentNumber: true,
            student: { select: { firstName: true, lastName: true } },
            course: { select: { name: true } },
          },
        });

        await createNotificationFromEvent(event.organizationId, {
          eventType: DomainEventType.ENROLLMENT_ACTIVATED,
          recipientUserId,
          variables: {
            enrollmentId,
            enrollmentNumber: enrollment?.enrollmentNumber,
            studentName: enrollment ? `${enrollment.student.firstName} ${enrollment.student.lastName}` : undefined,
            courseName: enrollment?.course.name,
          },
          referenceId: enrollmentId,
        });
        break;
      }

      case DomainEventType.ENROLLMENT_CANCELLED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const recipientUserId = await resolveStudentUserId(studentId);
        if (!recipientUserId) return;

        await createNotification(event.organizationId, {
          recipientUserId,
          type: NotificationType.ENROLLMENT_CANCELLED,
          severity: NotificationSeverity.WARNING,
          title: "Matrícula cancelada",
          message: "A sua matrícula foi cancelada.",
          actionUrl: undefined,
          metadata: { referenceId: payload.enrollmentId },
        });
        break;
      }

      case DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const recipientUserId = await resolveStudentUserId(studentId);
        if (!recipientUserId) return;

        const subjectName = payload.subjectName ? ` na disciplina de ${String(payload.subjectName)}` : "";
        const levelSubjectId = payload.levelSubjectId as string | undefined;

        await createNotification(event.organizationId, {
          recipientUserId,
          type: NotificationType.ATTENDANCE_BELOW_REQUIRED,
          severity: NotificationSeverity.CRITICAL,
          title: "Presenças abaixo do mínimo",
          message: `A sua taxa de presenças${subjectName} caiu abaixo do mínimo exigido. Pode não ser aprovado por faltas.`,
          actionUrl: `/students/${studentId}`,
          metadata: { referenceId: levelSubjectId ? `${studentId}:${levelSubjectId}` : studentId },
        });
        break;
      }

      case DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED: {
        const studentId = payload.studentId as string | undefined;
        const justificationId = payload.justificationId as string | undefined;
        if (!studentId || !justificationId) return;

        const recipientUserId = await resolveStudentUserId(studentId);
        if (!recipientUserId) return;

        await createNotificationFromEvent(event.organizationId, {
          eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
          recipientUserId,
          variables: { justificationId },
          referenceId: justificationId,
        });
        break;
      }

      case DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED: {
        const studentId = payload.studentId as string | undefined;
        const justificationId = payload.justificationId as string | undefined;
        if (!studentId || !justificationId) return;

        const recipientUserId = await resolveStudentUserId(studentId);
        if (!recipientUserId) return;

        await createNotificationFromEvent(event.organizationId, {
          eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
          recipientUserId,
          variables: { justificationId, rejectionReason: payload.rejectionReason },
          referenceId: justificationId,
        });
        break;
      }
    }
  }
}
