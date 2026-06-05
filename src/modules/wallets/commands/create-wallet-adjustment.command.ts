import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { createWalletAdjustmentSchema, type CreateWalletAdjustmentInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById, getWalletBalance } from "@/modules/wallets/repositories/wallet.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
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

    // Negative adjustment must not exceed available balance
    if (this.input.amount < 0) {
      const balance = await getWalletBalance(this.input.walletId);
      if (Math.abs(this.input.amount) > balance) {
        throw new BusinessRuleError(
          `O ajuste negativo (${Math.abs(this.input.amount)}) excede o saldo disponível (${balance.toFixed(2)})`
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
    const row = await db.studentWalletTransaction.create({
      data: {
        organizationId: this.context.organizationId,
        studentWalletId: this.input.walletId,
        type: "ADJUSTMENT",
        amount: this.input.amount,
        description: this.input.description,
        createdBy: this.context.userId,
      },
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: this.input.walletId,
      action: "wallet.adjustment",
      newValues: { amount: this.input.amount, description: this.input.description },
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
