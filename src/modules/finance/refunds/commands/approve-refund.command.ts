import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import {
  approveRefundSchema,
  type ApproveRefundInput,
} from "@/modules/finance/refunds/schemas/refund.schema";
import { findRefundById } from "@/modules/finance/refunds/repositories/refund.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { Refund } from "@/modules/finance/refunds/types";
import { getDb } from "@/server/db";

export class ApproveRefundCommand extends BaseCommand<ApproveRefundInput, Refund> {
  async validate(): Promise<void> {
    const result = approveRefundSchema.safeParse(this.input);
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
    if (!createAbility(perms).can(PERMISSIONS.REFUNDS_APPROVE)) throw new AuthorizationError();
  }

  async execute(): Promise<Refund> {
    const db = await getDb();

    const existing = await findRefundById(this.input.refundId, this.context.organizationId);
    if (!existing) throw new BusinessRuleError("Reembolso não encontrado nesta organização");
    if (existing.status !== "REQUESTED") {
      throw new BusinessRuleError("Apenas reembolsos com estado REQUESTED podem ser aprovados");
    }

    await db.refund.update({
      where: { id: this.input.refundId },
      data: {
        status: "APPROVED",
        approvedBy: this.context.userId,
        approvedAt: new Date(),
        ...(this.input.notes !== undefined ? { notes: this.input.notes } : {}),
        updatedAt: new Date(),
      },
    });

    const refund = await findRefundById(this.input.refundId, this.context.organizationId);
    if (!refund) throw new BusinessRuleError("Erro ao recuperar reembolso após aprovação");

    await auditService.log(this.context, {
      entity: "Refund",
      entityId: refund.id,
      action: "refund.approved",
      oldValues: { status: "REQUESTED" },
      newValues: { status: "APPROVED", approvedBy: this.context.userId },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.REFUND_APPROVED,
      entityType: "Refund",
      entityId: refund.id,
      amount: refund.amount,
      beforeData: { status: "REQUESTED" },
      afterData: { status: "APPROVED" },
      metadata: { refundNumber: refund.refundNumber, paymentId: refund.paymentId },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.REFUND_APPROVED,
      aggregateType: DomainAggregateType.REFUND,
      aggregateId: refund.id,
      actorId: this.context.userId,
      payload: {
        refundId: refund.id,
        refundNumber: refund.refundNumber,
        paymentId: refund.paymentId,
        amount: refund.amount,
      },
    });

    return refund;
  }
}
