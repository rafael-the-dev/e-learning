import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { createDepositSchema, type CreateDepositInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById } from "@/modules/wallets/repositories/wallet.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { recordWalletCredit } from "@/modules/finance/ledger/services/financial-transaction.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import type { WalletTransaction } from "@/modules/wallets/types";

export class CreateDepositCommand extends BaseCommand<CreateDepositInput, WalletTransaction> {
  private walletStudentId: string | null = null;

  async validate(): Promise<void> {
    const result = createDepositSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const wallet = await findWalletById(this.input.walletId, this.context.organizationId);
    if (!wallet) throw new NotFoundError("Carteira", this.input.walletId);
    if (wallet.status === "SUSPENDED") throw new BusinessRuleError("Não é possível depositar numa carteira suspensa");
    this.walletStudentId = wallet.studentId;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.WALLET_TRANSACTIONS_DEPOSIT)) throw new AuthorizationError();
  }

  async execute(): Promise<WalletTransaction> {
    const db = await getDb();
    const row = await db.$transaction(async (tx) => {
      const walletTx = await tx.studentWalletTransaction.create({
        data: {
          organizationId: this.context.organizationId,
          studentWalletId: this.input.walletId,
          type: "DEPOSIT",
          amount: this.input.amount,
          referenceType: this.input.referenceType ?? null,
          referenceId: this.input.referenceId ?? null,
          description: this.input.description ?? null,
          createdBy: this.context.userId,
        },
      });
      await recordWalletCredit(tx, this.context.organizationId, {
        sourceId: walletTx.id,
        amount: this.input.amount,
        studentId: this.walletStudentId,
        description: this.input.description ?? "Depósito na carteira",
        actorId: this.context.userId,
      });
      return walletTx;
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: this.input.walletId,
      action: "wallet.deposit",
      newValues: { amount: this.input.amount, studentId: this.walletStudentId },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.WALLET_DEPOSIT_CREATED,
      aggregateType: DomainAggregateType.WALLET,
      aggregateId: this.input.walletId,
      actorId: this.context.userId,
      payload: {
        walletId: this.input.walletId,
        studentId: this.walletStudentId ?? undefined,
        amount: this.input.amount,
        transactionId: row.id,
      },
    });

    return {
      id: row.id,
      organizationId: row.organizationId,
      studentWalletId: row.studentWalletId,
      type: row.type as WalletTransaction["type"],
      amount: Number(row.amount),
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      description: row.description,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    };
  }
}
