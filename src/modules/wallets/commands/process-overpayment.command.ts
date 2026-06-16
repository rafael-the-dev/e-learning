import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { processOverpaymentSchema, type ProcessOverpaymentInput } from "@/modules/wallets/schemas/wallet.schema";
import { findWalletById } from "@/modules/wallets/repositories/wallet.repository";
import { recordWalletCredit } from "@/modules/finance/ledger/services/financial-transaction.service";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import type { StudentWallet } from "@/modules/wallets/types";

export class ProcessOverpaymentCommand extends BaseCommand<ProcessOverpaymentInput, StudentWallet> {
  private walletId: string | null = null;

  async validate(): Promise<void> {
    const result = processOverpaymentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const student = await db.student.findFirst({
      where: { id: this.input.studentId, organizationId: this.context.organizationId },
      select: { id: true },
    });
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);

    const payment = await db.payment.findFirst({
      where: { id: this.input.paymentId, organizationId: this.context.organizationId },
      select: { id: true },
    });
    if (!payment) throw new NotFoundError("Pagamento", this.input.paymentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<StudentWallet> {
    const db = await getDb();

    await db.$transaction(async (tx) => {
      // Find or create wallet atomically
      const existing = await tx.studentWallet.findFirst({
        where: { organizationId: this.context.organizationId, studentId: this.input.studentId },
        select: { id: true },
      });

      if (existing) {
        this.walletId = existing.id;
      } else {
        const created = await tx.studentWallet.create({
          data: {
            organizationId: this.context.organizationId,
            studentId: this.input.studentId,
            status: "ACTIVE",
            createdBy: this.context.userId,
          },
          select: { id: true },
        });
        this.walletId = created.id;
      }

      const walletTx = await tx.studentWalletTransaction.create({
        data: {
          organizationId: this.context.organizationId,
          studentWalletId: this.walletId,
          type: "OVERPAYMENT",
          amount: this.input.amount,
          referenceType: "Payment",
          referenceId: this.input.paymentId,
          description: "Excesso de pagamento creditado na carteira",
          createdBy: this.context.userId,
        },
      });
      await recordWalletCredit(tx, this.context.organizationId, {
        sourceId: walletTx.id,
        amount: this.input.amount,
        studentId: this.input.studentId,
        paymentId: this.input.paymentId,
        description: "Excesso de pagamento creditado na carteira",
        actorId: this.context.userId,
      });
    });

    await auditService.log(this.context, {
      entity: "StudentWallet",
      entityId: this.walletId!,
      action: "wallet.overpayment",
      newValues: {
        amount: this.input.amount,
        paymentId: this.input.paymentId,
        studentId: this.input.studentId,
      },
    });

    const updated = await findWalletById(this.walletId!, this.context.organizationId);
    if (!updated) throw new BusinessRuleError("Erro ao recuperar carteira");
    return updated;
  }
}
