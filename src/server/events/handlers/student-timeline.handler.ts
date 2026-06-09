import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import {
  createTimelineEvent,
  findTimelineEventBySourceAndType,
} from "@/modules/student-timeline/repositories/student-timeline.repository";
import {
  TIMELINE_EVENT_DEFAULT_VISIBILITY,
  TIMELINE_EVENT_TYPE,
} from "@/modules/student-timeline/types";

// =============================================================================
// STUDENT TIMELINE EVENT HANDLER
// Listens to domain events and writes structured timeline entries per student.
// All handlers are idempotent via (sourceEventId + eventType) uniqueness check.
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.ENROLLMENT_CREATED,
  DomainEventType.ENROLLMENT_ACTIVATED,
  DomainEventType.ENROLLMENT_CANCELLED,
  DomainEventType.ENROLLMENT_COMPLETED,
  DomainEventType.INVOICE_CREATED,
  DomainEventType.INVOICE_PAID,
  DomainEventType.PAYMENT_CONFIRMED,
  DomainEventType.RECEIPT_ISSUED,
  DomainEventType.WALLET_DEPOSIT_CREATED,
  DomainEventType.WALLET_CREDIT_APPLIED,
  DomainEventType.WALLET_OVERPAYMENT_CREATED,
  DomainEventType.WALLET_REFUND_CREATED,
  DomainEventType.LESSON_COMPLETED,
  DomainEventType.CLASSROOM_BOOKING_CREATED,
  DomainEventType.CLASSROOM_BOOKING_UPDATED,
  DomainEventType.CLASSROOM_BOOKING_CANCELLED,
  DomainEventType.NOTIFICATION_SENT,
]);

export class StudentTimelineEventHandler implements DomainEventHandler {
  readonly handlerName = "StudentTimelineEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    const config = await this.resolveConfig(event, payload);
    if (!config) return; // not student-related or cannot resolve student

    // Idempotency guard
    const existing = await findTimelineEventBySourceAndType(
      event.id,
      config.eventType,
      event.organizationId
    );
    if (existing) return;

    const visibility =
      TIMELINE_EVENT_DEFAULT_VISIBILITY[config.eventType as keyof typeof TIMELINE_EVENT_DEFAULT_VISIBILITY] ??
      "INTERNAL";

    await createTimelineEvent({
      organizationId: event.organizationId,
      studentId: config.studentId,
      eventType: config.eventType,
      title: config.title,
      description: config.description ?? null,
      referenceType: config.referenceType ?? null,
      referenceId: config.referenceId ?? null,
      sourceEventId: event.id,
      actorUserId: event.actorId ?? null,
      visibility,
      metadata: config.metadata ?? null,
      occurredAt: event.occurredAt,
    });

    // Enrollment created with class group → also create CLASS_GROUP_ASSIGNED entry
    if (
      event.eventType === DomainEventType.ENROLLMENT_CREATED &&
      payload.classGroupId
    ) {
      const classGroupEventType = TIMELINE_EVENT_TYPE.CLASS_GROUP_ASSIGNED;
      const classGroupExisting = await findTimelineEventBySourceAndType(
        event.id,
        classGroupEventType,
        event.organizationId
      );
      if (!classGroupExisting) {
        const db = await getDb();
        const classGroup = await db.classGroup.findFirst({
          where: { id: payload.classGroupId as string },
          select: { name: true },
        });
        await createTimelineEvent({
          organizationId: event.organizationId,
          studentId: config.studentId,
          eventType: classGroupEventType,
          title: `Turma atribuída${classGroup ? `: ${classGroup.name}` : ""}`,
          description: null,
          referenceType: "CLASS_GROUP",
          referenceId: payload.classGroupId as string,
          sourceEventId: event.id,
          actorUserId: event.actorId ?? null,
          visibility: "STUDENT_VISIBLE",
          metadata: { classGroupId: payload.classGroupId },
          occurredAt: event.occurredAt,
        });
      }
    }
  }

  private async resolveConfig(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<{
    studentId: string;
    eventType: string;
    title: string;
    description?: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  } | null> {
    const db = await getDb();

    switch (event.eventType) {
      // ——— Enrollment ———
      case DomainEventType.ENROLLMENT_CREATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const enrollment = await db.enrollment.findFirst({
          where: { id: payload.enrollmentId as string, organizationId: event.organizationId },
          select: { enrollmentNumber: true, course: { select: { name: true } } },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.ENROLLMENT_CREATED,
          title: `Matrícula criada${enrollment?.course?.name ? ` em ${enrollment.course.name}` : ""}`,
          description: enrollment?.enrollmentNumber
            ? `Número de matrícula: ${enrollment.enrollmentNumber}`
            : undefined,
          referenceType: "ENROLLMENT",
          referenceId: payload.enrollmentId as string,
          metadata: { enrollmentId: payload.enrollmentId, courseId: payload.courseId },
        };
      }

      case DomainEventType.ENROLLMENT_ACTIVATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const enrollment = await db.enrollment.findFirst({
          where: { id: payload.enrollmentId as string, organizationId: event.organizationId },
          select: { enrollmentNumber: true, course: { select: { name: true } } },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.ENROLLMENT_ACTIVATED,
          title: `Matrícula ativada${enrollment?.course?.name ? ` em ${enrollment.course.name}` : ""}`,
          referenceType: "ENROLLMENT",
          referenceId: payload.enrollmentId as string,
          metadata: { enrollmentId: payload.enrollmentId },
        };
      }

      case DomainEventType.ENROLLMENT_CANCELLED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const enrollment = await db.enrollment.findFirst({
          where: { id: payload.enrollmentId as string, organizationId: event.organizationId },
          select: { course: { select: { name: true } } },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.ENROLLMENT_CANCELLED,
          title: `Matrícula cancelada${enrollment?.course?.name ? ` em ${enrollment.course.name}` : ""}`,
          referenceType: "ENROLLMENT",
          referenceId: payload.enrollmentId as string,
          metadata: { enrollmentId: payload.enrollmentId },
        };
      }

      case DomainEventType.ENROLLMENT_COMPLETED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const enrollment = await db.enrollment.findFirst({
          where: { id: payload.enrollmentId as string, organizationId: event.organizationId },
          select: { course: { select: { name: true } } },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.ENROLLMENT_ACTIVATED,
          title: `Matrícula concluída${enrollment?.course?.name ? ` em ${enrollment.course.name}` : ""}`,
          referenceType: "ENROLLMENT",
          referenceId: payload.enrollmentId as string,
          metadata: { enrollmentId: payload.enrollmentId },
        };
      }

      // ——— Invoice ———
      case DomainEventType.INVOICE_CREATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.INVOICE_CREATED,
          title: `Fatura criada${payload.invoiceNumber ? ` (${payload.invoiceNumber})` : ""}`,
          description: payload.totalAmount
            ? `Total: ${Number(payload.totalAmount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "INVOICE",
          referenceId: payload.invoiceId as string,
          metadata: { invoiceId: payload.invoiceId, totalAmount: payload.totalAmount },
        };
      }

      case DomainEventType.INVOICE_PAID: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.INVOICE_PAID,
          title: `Fatura paga${payload.invoiceNumber ? ` (${payload.invoiceNumber})` : ""}`,
          referenceType: "INVOICE",
          referenceId: payload.invoiceId as string,
          metadata: { invoiceId: payload.invoiceId },
        };
      }

      // ——— Payment ———
      case DomainEventType.PAYMENT_CONFIRMED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const payment = await db.payment.findFirst({
          where: { id: payload.paymentId as string, organizationId: event.organizationId },
          select: { totalAmount: true, paymentNumber: true },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.PAYMENT_CONFIRMED,
          title: `Pagamento confirmado${payment?.paymentNumber ? ` (${payment.paymentNumber})` : ""}`,
          description: payment?.totalAmount
            ? `Valor: ${Number(payment.totalAmount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "PAYMENT",
          referenceId: payload.paymentId as string,
          metadata: { paymentId: payload.paymentId, invoiceId: payload.invoiceId },
        };
      }

      // ——— Receipt ———
      case DomainEventType.RECEIPT_ISSUED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.RECEIPT_ISSUED,
          title: `Recibo emitido${payload.receiptNumber ? ` (${payload.receiptNumber})` : ""}`,
          description: payload.amount
            ? `Valor: ${Number(payload.amount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "RECEIPT",
          referenceId: payload.receiptId as string,
          metadata: { receiptId: payload.receiptId, paymentId: payload.paymentId },
        };
      }

      // ——— Wallet ———
      case DomainEventType.WALLET_DEPOSIT_CREATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.WALLET_DEPOSIT_CREATED,
          title: "Depósito na carteira",
          description: payload.amount
            ? `Valor depositado: ${Number(payload.amount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "WALLET",
          referenceId: payload.walletId as string,
          metadata: { walletId: payload.walletId, amount: payload.amount },
        };
      }

      case DomainEventType.WALLET_CREDIT_APPLIED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.WALLET_CREDIT_APPLIED,
          title: "Crédito de carteira aplicado",
          description: payload.amount
            ? `Crédito aplicado: ${Number(payload.amount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "WALLET",
          referenceId: payload.walletId as string,
          metadata: { walletId: payload.walletId, amount: payload.amount },
        };
      }

      case DomainEventType.WALLET_OVERPAYMENT_CREATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.WALLET_OVERPAYMENT_CREATED,
          title: "Excedente de pagamento registado",
          description: payload.amount
            ? `Excedente: ${Number(payload.amount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "WALLET",
          referenceId: payload.walletId as string,
          metadata: { walletId: payload.walletId, amount: payload.amount },
        };
      }

      case DomainEventType.WALLET_REFUND_CREATED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.WALLET_DEPOSIT_CREATED,
          title: "Reembolso para carteira",
          description: payload.amount
            ? `Valor reembolsado: ${Number(payload.amount).toLocaleString("pt-PT", { style: "currency", currency: "MZN" })}`
            : undefined,
          referenceType: "WALLET",
          referenceId: payload.walletId as string,
          metadata: { walletId: payload.walletId, amount: payload.amount, type: "REFUND" },
        };
      }

      // ——— Lesson ———
      case DomainEventType.LESSON_COMPLETED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        const lesson = await db.lesson.findFirst({
          where: { id: payload.lessonId as string, organizationId: event.organizationId },
          select: { title: true },
        });
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.LESSON_COMPLETED,
          title: `Lição concluída${lesson?.title ? `: ${lesson.title}` : ""}`,
          referenceType: "LESSON",
          referenceId: payload.lessonId as string,
          metadata: { lessonId: payload.lessonId },
        };
      }

      // ——— Classroom Booking ———
      case DomainEventType.CLASSROOM_BOOKING_CREATED:
      case DomainEventType.CLASSROOM_BOOKING_UPDATED:
      case DomainEventType.CLASSROOM_BOOKING_CANCELLED: {
        // Classroom bookings are tied to classGroups, not directly to students.
        // Resolve student from classGroupId if present.
        if (!payload.classGroupId) return null;

        // We create one timeline entry per affected student via classGroup.
        // This handler creates one global entry; for per-student it would need
        // to iterate enrolled students — skip if no direct studentId in payload.
        const directStudentId = payload.studentId as string | undefined;
        if (!directStudentId) return null;

        const actionLabel =
          event.eventType === DomainEventType.CLASSROOM_BOOKING_CREATED
            ? "criada"
            : event.eventType === DomainEventType.CLASSROOM_BOOKING_UPDATED
            ? "atualizada"
            : "cancelada";

        return {
          studentId: directStudentId,
          eventType: TIMELINE_EVENT_TYPE.CLASSROOM_BOOKING_CHANGED,
          title: `Reserva de sala ${actionLabel}`,
          referenceType: "CLASSROOM_BOOKING",
          referenceId: payload.bookingId as string,
          metadata: {
            bookingId: payload.bookingId,
            classGroupId: payload.classGroupId,
            classroomId: payload.classroomId,
          },
        };
      }

      // ——— Notification ———
      case DomainEventType.NOTIFICATION_SENT: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return null;
        return {
          studentId,
          eventType: TIMELINE_EVENT_TYPE.NOTIFICATION_SENT,
          title: `Notificação enviada${payload.type ? ` (${String(payload.type)})` : ""}`,
          description: payload.title as string | undefined,
          referenceType: "NOTIFICATION",
          referenceId: payload.notificationId as string | undefined,
          metadata: {
            notificationId: payload.notificationId,
            type: payload.type,
            channel: payload.channel,
          },
        };
      }

      default:
        return null;
    }
  }
}
