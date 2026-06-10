import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";

// =============================================================================
// ENROLLMENT ACTIVATION HANDLER
// On payment.confirmed: loads the enrollment's own billingPolicyId (stored at
// invoice-generation time) and evaluates the activationRule. Falls back to the
// org's default active policy if the enrollment has no stored policyId.
//
// Critical: financial correctness (invoice/payment state) remains inside
// ConfirmPaymentCommand. This handler only drives the enrollment status side-effect.
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
      select: { id: true, status: true, billingPolicyId: true, studentId: true },
    });
    if (!enrollment || enrollment.status !== "PENDING_PAYMENT") return;

    // Resolve billing policy: use the one stored on the enrollment (set at invoice
    // generation time), falling back to the org default only if none was stored.
    const policy = enrollment.billingPolicyId
      ? await db.enrollmentBillingPolicy.findFirst({
          where: { id: enrollment.billingPolicyId, organizationId: event.organizationId, status: "ACTIVE" },
          select: { activationRule: true },
        })
      : await db.enrollmentBillingPolicy.findFirst({
          where: { organizationId: event.organizationId, isDefault: true, status: "ACTIVE" },
          select: { activationRule: true },
        });

    if (!policy) return;

    const { activationRule } = policy;
    if (activationRule === "MANUAL" || activationRule === "AFTER_INVOICE_CREATED") return;

    const invoiceId = payload.invoiceId as string | undefined;
    let shouldActivate = false;

    if (activationRule === "AFTER_FIRST_PAYMENT") {
      // Any confirmed payment is enough — invoice may still be PARTIALLY_PAID.
      shouldActivate = true;
    } else if (activationRule === "AFTER_FULL_PAYMENT") {
      if (invoiceId) {
        const invoice = await db.invoice.findFirst({
          where: { id: invoiceId, organizationId: event.organizationId },
          select: { status: true },
        });
        shouldActivate = invoice?.status === "PAID";
      }
    } else if (activationRule === "AFTER_REGISTRATION_FEE") {
      // Activate when the REGISTRATION_FEE invoice item has been fully paid.
      // Check: sum of all allocations against REGISTRATION_FEE items equals
      // the item's totalPrice (i.e. balanceAmount == 0).
      if (invoiceId) {
        const regFeeItem = await db.invoiceItem.findFirst({
          where: {
            invoiceId,
            invoice: { organizationId: event.organizationId },
            itemType: "REGISTRATION_FEE",
          },
          select: { id: true, status: true },
        });
        // Item status is set to "PAID" when balanceAmount reaches 0 in ConfirmPaymentCommand
        shouldActivate = regFeeItem?.status === "PAID";
      }
    }

    if (!shouldActivate) return;

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
        reason: `Ativação automática — regra: ${activationRule}`,
      },
    });

    // Resolve the student's user account via email (Student has no direct userId FK).
    const studentId = enrollment.studentId;
    if (studentId) {
      const student = await db.student.findFirst({
        where: { id: studentId, organizationId: event.organizationId },
        select: { email: true },
      });
      let userId: string | null = null;
      if (student?.email) {
        const user = await db.user.findFirst({ where: { email: student.email }, select: { id: true } });
        userId = user?.id ?? null;
      }

      await db.notification.create({
        data: {
          organizationId: event.organizationId,
          userId: userId ?? undefined,
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
