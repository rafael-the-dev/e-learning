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
  DomainEventType.ATTENDANCE_STUDENT_AT_RISK,
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
      case DomainEventType.PAYMENT_CONFIRMED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const userId = await resolveStudentUserId(studentId);

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
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
          select: { title: true },
        });
        if (!lesson) return;

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

        const userId = await resolveStudentUserId(studentId);

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
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

        const userId = await resolveStudentUserId(studentId);

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
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

        const userId = await resolveStudentUserId(studentId);

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
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

      case DomainEventType.ATTENDANCE_STUDENT_AT_RISK: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const userId = await resolveStudentUserId(studentId);
        const subjectName = payload.subjectName ? ` na disciplina de ${String(payload.subjectName)}` : "";

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
            type: "ATTENDANCE_RISK",
            channel: "IN_APP",
            title: "Risco de reprovação por faltas",
            body: `A sua taxa de presenças${subjectName} está abaixo do limite de risco. Regularize a sua frequência.`,
            data: JSON.stringify({
              enrollmentId: payload.enrollmentId,
              levelSubjectId: payload.levelSubjectId,
              currentPercentage: payload.currentPercentage,
              minimumPercentage: payload.minimumPercentage,
            }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.ATTENDANCE_STUDENT_BELOW_REQUIRED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const userId = await resolveStudentUserId(studentId);
        const subjectName = payload.subjectName ? ` na disciplina de ${String(payload.subjectName)}` : "";

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
            type: "ATTENDANCE_BELOW_REQUIRED",
            channel: "IN_APP",
            title: "Presenças abaixo do mínimo",
            body: `A sua taxa de presenças${subjectName} caiu abaixo do mínimo exigido. Pode não ser aprovado por faltas.`,
            data: JSON.stringify({
              enrollmentId: payload.enrollmentId,
              levelSubjectId: payload.levelSubjectId,
              currentPercentage: payload.currentPercentage,
              minimumPercentage: payload.minimumPercentage,
            }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const userId = await resolveStudentUserId(studentId);

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
            type: "ATTENDANCE_JUSTIFICATION_APPROVED",
            channel: "IN_APP",
            title: "Justificação de falta aprovada",
            body: `A sua justificação de falta foi aprovada.`,
            data: JSON.stringify({ justificationId: payload.justificationId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }

      case DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED: {
        const studentId = payload.studentId as string | undefined;
        if (!studentId) return;

        const userId = await resolveStudentUserId(studentId);
        const reason = payload.rejectionReason ? ` Motivo: ${String(payload.rejectionReason)}` : "";

        await db.notification.create({
          data: {
            organizationId: event.organizationId,
            userId: userId ?? undefined,
            type: "ATTENDANCE_JUSTIFICATION_REJECTED",
            channel: "IN_APP",
            title: "Justificação de falta rejeitada",
            body: `A sua justificação de falta foi rejeitada.${reason}`,
            data: JSON.stringify({ justificationId: payload.justificationId }),
            status: "SENT",
            sentAt: new Date(),
          },
        });
        break;
      }
    }
  }
}
