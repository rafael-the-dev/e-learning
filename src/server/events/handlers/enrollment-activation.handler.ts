import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";

// =============================================================================
// ENROLLMENT ACTIVATION HANDLER
// On payment.confirmed: checks enrollment billing policy activation rule.
// If activationRule is AFTER_FIRST_PAYMENT or AFTER_FULL_PAYMENT, attempts
// to activate the enrollment automatically.
//
// Critical: This handler only triggers side-effect activation.
// Financial correctness remains inside ConfirmPaymentCommand.
// =============================================================================

export class EnrollmentActivationEventHandler implements DomainEventHandler {
  readonly handlerName = "EnrollmentActivationEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return event.eventType === DomainEventType.PAYMENT_CONFIRMED;
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;
    const enrollmentId = payload.enrollmentId as string | undefined;
    if (!enrollmentId) return;

    const db = await getDb();

    const enrollment = await db.enrollment.findFirst({
      where: { id: enrollmentId, organizationId: event.organizationId },
      select: { id: true, status: true, courseId: true },
    });
    if (!enrollment || enrollment.status !== "PENDING_PAYMENT") return;

    // Find the billing policy associated with this enrollment's course
    const policy = await db.enrollmentBillingPolicy.findFirst({
      where: {
        organizationId: event.organizationId,
        isDefault: true,
        status: "ACTIVE",
      },
      select: { activationRule: true },
    });
    if (!policy) return;

    if (
      policy.activationRule === "AFTER_FIRST_PAYMENT" ||
      policy.activationRule === "AFTER_FULL_PAYMENT"
    ) {
      if (policy.activationRule === "AFTER_FULL_PAYMENT") {
        // Only activate if the invoice associated with this payment is fully paid
        const invoiceId = payload.invoiceId as string | undefined;
        if (invoiceId) {
          const invoice = await db.invoice.findFirst({
            where: { id: invoiceId, organizationId: event.organizationId },
            select: { status: true },
          });
          if (invoice?.status !== "PAID") return;
        }
      }

      await db.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "ACTIVE", updatedAt: new Date() },
      });

      await db.enrollmentStatusHistory.create({
        data: {
          enrollmentId: enrollment.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "ACTIVE",
          changedBy: (payload._actorId as string | undefined) ?? null,
          reason: "Ativação automática por pagamento",
        },
      });

      // Notify student — cannot re-publish enrollment.activated here (circular dep
      // with event-publisher → registry → this handler), so create notification directly.
      const studentId = payload.studentId as string | undefined;
      if (studentId) {
        const student = await db.student.findFirst({
          where: { id: studentId, organizationId: event.organizationId },
          select: { userId: true },
        });
        if (student?.userId) {
          await db.notification.create({
            data: {
              organizationId: event.organizationId,
              userId: student.userId,
              type: "ENROLLMENT_APPROVED",
              channel: "IN_APP",
              title: "Matrícula ativada",
              body: "A sua matrícula foi ativada automaticamente após confirmação do pagamento.",
              data: JSON.stringify({ enrollmentId: enrollment.id }),
              status: "SENT",
              sentAt: new Date(),
            },
          });
        }
      }
    }
  }
}
