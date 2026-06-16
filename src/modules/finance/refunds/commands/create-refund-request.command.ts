import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import {
  createRefundRequestSchema,
  type CreateRefundRequestInput,
} from "@/modules/finance/refunds/schemas/refund.schema";
import {
  findRefundById,
  calculateAvailableToRequest,
} from "@/modules/finance/refunds/repositories/refund.repository";
import { getNextRefundNumber } from "@/modules/finance/services/financial-sequence.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { Refund } from "@/modules/finance/refunds/types";
import { getDb } from "@/server/db";

export class CreateRefundRequestCommand extends BaseCommand<CreateRefundRequestInput, Refund> {
  async validate(): Promise<void> {
    const result = createRefundRequestSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.REFUNDS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Refund> {
    const db = await getDb();

    const payment = await db.payment.findFirst({
      where: { id: this.input.paymentId, organizationId: this.context.organizationId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        branchId: true,
        studentId: true,
        enrollmentId: true,
        invoiceId: true,
      },
    });

    if (!payment) throw new BusinessRuleError("Pagamento não encontrado nesta organização");
    if (payment.status !== "CONFIRMED") {
      throw new BusinessRuleError("Apenas pagamentos confirmados podem ser reembolsados");
    }

    // availableToRequest subtracts REQUESTED + APPROVED + COMPLETED refunds so
    // over-approval is prevented even before any refund reaches COMPLETED.
    const availableToRequest = await calculateAvailableToRequest(
      this.input.paymentId,
      this.context.organizationId
    );
    if (this.input.amount > availableToRequest) {
      throw new BusinessRuleError(
        `O valor de reembolso (${this.input.amount}) excede o valor disponível para reembolso (${availableToRequest})`
      );
    }

    const receipt = await db.receipt.findFirst({
      where: {
        paymentId: this.input.paymentId,
        organizationId: this.context.organizationId,
        status: "ISSUED",
      },
      select: { id: true },
    });

    const refundId = await db.$transaction(async (tx) => {
      const refundNumber = await getNextRefundNumber(tx);
      const row = await tx.refund.create({
        data: {
          organizationId: this.context.organizationId,
          branchId: payment.branchId ?? null,
          paymentId: this.input.paymentId,
          receiptId: receipt?.id ?? null,
          studentId: payment.studentId ?? null,
          enrollmentId: payment.enrollmentId ?? null,
          invoiceId: payment.invoiceId ?? null,
          refundNumber,
          amount: this.input.amount,
          reason: this.input.reason,
          refundMethod: this.input.refundMethod,
          notes: this.input.notes ?? null,
          requestedBy: this.context.userId,
          updatedAt: new Date(),
        },
        select: { id: true },
      });
      return row.id;
    });

    const refund = await findRefundById(refundId, this.context.organizationId);
    if (!refund) throw new BusinessRuleError("Erro ao recuperar reembolso após criação");

    await auditService.log(this.context, {
      entity: "Refund",
      entityId: refund.id,
      action: "refund.requested",
      newValues: {
        refundNumber: refund.refundNumber,
        amount: refund.amount,
        paymentId: this.input.paymentId,
      },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.REFUND_REQUESTED,
      entityType: "Refund",
      entityId: refund.id,
      amount: refund.amount,
      afterData: { refundNumber: refund.refundNumber, status: "REQUESTED", refundMethod: refund.refundMethod },
      metadata: {
        paymentId: this.input.paymentId,
        studentId: refund.studentId ?? null,
        enrollmentId: refund.enrollmentId ?? null,
        reason: this.input.reason,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.REFUND_REQUESTED,
      aggregateType: DomainAggregateType.REFUND,
      aggregateId: refund.id,
      actorId: this.context.userId,
      payload: {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        paymentId: this.input.paymentId,
        amount: refund.amount,
        studentId: refund.studentId ?? undefined,
        enrollmentId: refund.enrollmentId ?? undefined,
      },
    });

    return refund;
  }
}
