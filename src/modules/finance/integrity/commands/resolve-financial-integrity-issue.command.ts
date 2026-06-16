import { BaseCommand, ValidationError, AuthorizationError, BusinessRuleError } from "@/shared/lib/command";
import { z } from "zod";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import {
  findIntegrityIssueById,
  updateIssueStatus,
} from "../repositories/integrity-issue.repository";
import type { FinancialIntegrityIssue } from "../types";

// =============================================================================
// SCHEMA
// =============================================================================

const resolveIssueSchema = z.object({
  issueId: z.string().min(1),
  newStatus: z.enum(["RESOLVED", "ACKNOWLEDGED", "SUPPRESSED"]),
  resolutionNotes: z.string().max(2000).optional(),
});

export type ResolveFinancialIntegrityIssueInput = z.infer<typeof resolveIssueSchema>;

// =============================================================================
// COMMAND
// =============================================================================

/**
 * Transitions a FinancialIntegrityIssue to RESOLVED, ACKNOWLEDGED, or SUPPRESSED.
 *
 * Business rules:
 * - The issue must belong to the actor's organization.
 * - Only OPEN or ACKNOWLEDGED issues can transition (RESOLVED/SUPPRESSED are terminal).
 * - Resolution notes are required when setting status to RESOLVED.
 * - This command NEVER auto-repairs any financial data.
 */
export class ResolveFinancialIntegrityIssueCommand extends BaseCommand<
  ResolveFinancialIntegrityIssueInput,
  FinancialIntegrityIssue
> {
  private existing: FinancialIntegrityIssue | null = null;

  async validate(): Promise<void> {
    const result = resolveIssueSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (
      this.input.newStatus === "RESOLVED" &&
      (!this.input.resolutionNotes || this.input.resolutionNotes.trim().length === 0)
    ) {
      throw new ValidationError(
        "Notas de resolução são obrigatórias ao marcar um problema como RESOLVED",
        { resolutionNotes: ["Campo obrigatório para resolução"] }
      );
    }

    // Pre-load for use in authorize + execute
    this.existing = await findIntegrityIssueById(
      this.input.issueId,
      this.context.organizationId
    );

    if (!this.existing) {
      throw new BusinessRuleError("Problema de integridade não encontrado nesta organização");
    }

    const transitionable = new Set(["OPEN", "ACKNOWLEDGED"]);
    if (!transitionable.has(this.existing.status)) {
      throw new BusinessRuleError(
        `Problema com status "${this.existing.status}" não pode ser alterado (apenas OPEN e ACKNOWLEDGED são transitáveis)`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INTEGRITY_ISSUES_RESOLVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<FinancialIntegrityIssue> {
    const existing = this.existing!;

    const updated = await updateIssueStatus(
      existing.id,
      this.context.organizationId,
      this.input.newStatus,
      this.context.userId,
      this.input.resolutionNotes
    );

    if (!updated) {
      throw new BusinessRuleError("Erro ao atualizar o problema de integridade");
    }

    await auditService.log(this.context, {
      entity: "FinancialIntegrityIssue",
      entityId: existing.id,
      action: `integrity_issue.${this.input.newStatus.toLowerCase()}`,
      oldValues: { status: existing.status },
      newValues: {
        status: this.input.newStatus,
        checkName: existing.checkName,
        category: existing.category,
        entityType: existing.entityType,
        entityId: existing.entityId,
        resolutionNotes: this.input.resolutionNotes ?? null,
        resolvedBy: this.context.userId,
      },
    });

    const eventTypeMap: Record<string, FinancialAuditEventType> = {
      RESOLVED:     FinancialAuditEventType.INTEGRITY_ISSUE_RESOLVED,
      ACKNOWLEDGED: FinancialAuditEventType.INTEGRITY_ISSUE_ACKNOWLEDGED,
      SUPPRESSED:   FinancialAuditEventType.INTEGRITY_ISSUE_SUPPRESSED,
    };

    await financialAuditService.log(this.context, {
      eventType: eventTypeMap[this.input.newStatus],
      entityType: "FinancialIntegrityIssue",
      entityId: existing.id,
      beforeData: { status: existing.status },
      afterData: { status: this.input.newStatus, resolutionNotes: this.input.resolutionNotes ?? null },
      metadata: {
        checkName: existing.checkName,
        category: existing.category,
        severity: existing.severity,
        affectedEntityType: existing.entityType,
        affectedEntityId: existing.entityId,
      },
    });

    return updated;
  }
}
