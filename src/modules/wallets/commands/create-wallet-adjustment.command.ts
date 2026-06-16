import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { createWalletAdjustmentSchema, type CreateWalletAdjustmentInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById, getWalletBalance } from "@/modules/wallets/repositories/wallet.repository";
import { lockAndGetWalletBalance } from "@/modules/wallets/services/wallet-concurrency.service";
import { recordWalletCredit, recordWalletDebit } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { financialAuditService } from "@/modules/finance/audit/services/financial-audit.service";
import { FinancialAuditEventType } from "@/shared/types/common";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { WalletTransaction } from "@/modules/wallets/types";

export class CreateWalletAdjustmentCommand extends BaseCommand<CreateWalletAdjustmentInput, WalletTransaction> {
  async validate(): Promise<void> {
    const result = createWalletAdjustmentSchema.safeParse(this.input);
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

    // Fast-fail for negative adjustments: non-locking pre-check for user feedback.
    // The authoritative check happens under lock inside execute().
    if (this.input.amount < 0) {
      const balance = await getWalletBalance(this.input.walletId);
      if (Math.abs(this.input.amount) > balance) {
        throw new BusinessRuleError(
          `O ajuste negativo (${Math.abs(this.input.amount).toFixed(2)}) excede o saldo disponível (${balance.toFixed(2)})`
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.WALLET_TRANSACTIONS_ADJUST)) throw new AuthorizationError();
  }

  async execute(): Promise<WalletTransaction> {
    const db = await getDb();

    const row = await db.$transaction(async (tx) => {
      // Negative adjustments consume wallet balance and must be serialised
      // to prevent double-spend under concurrent requests.
      if (this.input.amount < 0) {
        const { balance: liveBalance } = await lockAndGetWalletBalance(
          tx,
          this.input.walletId,
          this.context.organizationId
        );
        if (Math.abs(this.input.amount) > liveBalance) {
          throw new BusinessRuleError(
            `O ajuste negativo (${Math.abs(this.input.amount).toFixed(2)}) excede o saldo disponível (${liveBalance.toFixed(2)})`
          );
        }
      }

      const walletTx = await tx.studentWalletTransaction.create({
        data: {
          organizationId: this.context.organizationId,
          studentWalletId: this.input.walletId,
          type: "ADJUSTMENT",
          amount: this.input.amount,
          description: this.input.description,
          createdBy: this.context.userId,
        },
      });

      // Ledger: positive adjustment = wallet liability created (DEBIT for org)
      //         negative adjustment = wallet balance reduced, cash paid out (DEBIT for org)
      if (this.input.amount > 0) {
        await recordWalletCredit(tx, this.context.organizationId, {
          sourceId: walletTx.id,
          amount: this.input.amount,
          studentId: null,
          description: this.input.description ?? "Ajuste positivo de carteira",
          actorId: this.context.userId,
        });
      } else {
        await recordWalletDebit(tx, this.context.organizationId, {
          sourceId: walletTx.id,
          amount: Math.abs(this.input.amount),
          studentId: null,
          description: this.input.description ?? "Ajuste negativo de carteira",
          actorId: this.context.userId,
        });
      }

      return walletTx;
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: this.input.walletId,
      action: "wallet.adjustment",
      newValues: { amount: this.input.amount, description: this.input.description },
    });

    await financialAuditService.log(this.context, {
      eventType: FinancialAuditEventType.WALLET_ADJUSTMENT,
      entityType: "StudentWallet",
      entityId: this.input.walletId,
      amount: this.input.amount,
      afterData: { amount: this.input.amount, type: this.input.amount > 0 ? "CREDIT" : "DEBIT" },
      metadata: { description: this.input.description ?? null, walletTransactionId: row.id },
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
