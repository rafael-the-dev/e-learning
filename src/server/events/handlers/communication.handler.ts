import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";

// =============================================================================
// COMMUNICATION EVENT HANDLER
// Reacts to key domain events and creates in-app notifications.
// Handlers re-fetch data from DB — payload IDs are trusted for lookup only.
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.PAYMENT_CONFIRMED,
  DomainEventType.LESSON_PUBLISHED,
  DomainEventType.INVOICE_OVERDUE,
  DomainEventType.ENROLLMENT_ACTIVATED,
  DomainEventType.ENROLLMENT_CANCELLED,
]);

export class CommunicationEventHandler implements DomainEventHandler {
  readonly handlerName = "CommunicationEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const db = await getDb();
    const payload = event.payload as Record<string, unknown>;

    switch (event.eventType) {
      case DomainEventType.PAYMENT_CONFIRMED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const student = await db.student.findFirst({
          where: { id: studentId, organizationId: event.organizationId },
          select: { userId: true, firstName: true, lastName: true },
        });
        if (!student?.userId) return;

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: student.userId,
            type: "PAYMENT_RECEIVED",
            channel: "IN_APP",
            title: "Pagamento confirmado",
            body: `O seu pagamento foi confirmado com sucesso.`,
            data: JSON.stringify({ paymentId: payload.paymentId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.LESSON_PUBLISHED: {
        const lessonId = payload.lessonId as string | undefined;
        if (!lessonId) return;

        const lesson = await db.lesson.findFirst({
          where: { id: lessonId, organizationId: event.organizationId },
          select: { title: true, subjectId: true },
        });
        if (!lesson) return;

        // Notify enrolled students who have access to this lesson's subject
        // For now, create a general system notification record
        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            type: "CLASS_SCHEDULED",
            channel: "IN_APP",
            title: "Nova lição publicada",
            body: `A lição "${lesson.title}" foi publicada.`,
            data: JSON.stringify({ lessonId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.INVOICE_OVERDUE: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const student = await db.student.findFirst({
          where: { id: studentId, organizationId: event.organizationId },
          select: { userId: true },
        });
        if (!student?.userId) return;

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: student.userId,
            type: "PAYMENT_OVERDUE",
            channel: "IN_APP",
            title: "Fatura em atraso",
            body: `Tem uma fatura em atraso. Por favor regularize a sua situação.`,
            data: JSON.stringify({ invoiceId: payload.invoiceId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.ENROLLMENT_ACTIVATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const student = await db.student.findFirst({
          where: { id: studentId, organizationId: event.organizationId },
          select: { userId: true },
        });
        if (!student?.userId) return;

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: student.userId,
            type: "ENROLLMENT_APPROVED",
            channel: "IN_APP",
            title: "Matrícula ativada",
            body: `A sua matrícula foi ativada com sucesso.`,
            data: JSON.stringify({ enrollmentId: payload.enrollmentId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.ENROLLMENT_CANCELLED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const student = await db.student.findFirst({
          where: { id: studentId, organizationId: event.organizationId },
          select: { userId: true },
        });
        if (!student?.userId) return;

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: student.userId,
            type: "ENROLLMENT_CANCELLED",
            channel: "IN_APP",
            title: "Matrícula cancelada",
            body: `A sua matrícula foi cancelada.`,
            data: JSON.stringify({ enrollmentId: payload.enrollmentId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }
    }
  }
}
