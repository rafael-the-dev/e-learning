import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { registerPaymentSchema, type RegisterPaymentInput } from "@/modules/finance/schemas/payment.schema";
import { findInvoiceById } from "@/modules/finance/repositories/invoice.repository";
import { findPaymentById, getLastPaymentNumber } from "@/modules/finance/repositories/payment.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findWalletByStudentId, getWalletBalance } from "@/modules/wallets/repositories/wallet.repository";
import type { Payment, Invoice } from "@/modules/finance/types";
import type { StudentWallet } from "@/modules/wallets/types";
import { getDb } from "@/server/db";

export class RegisterPaymentCommand extends BaseCommand<RegisterPaymentInput, Payment> {
  private invoice: Invoice | null = null;
  private wallet: StudentWallet | null = null;
  private totalAmount = 0;

  async validate(): Promise<void> {
    const result = registerPaymentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this.totalAmount = this.input.splits.reduce((sum, s) => sum + s.amount, 0);
    if (this.totalAmount <= 0) {
      throw new BusinessRuleError("O valor total do pagamento deve ser maior que zero");
    }

    this.invoice = await findInvoiceById(this.input.invoiceId, this.context.organizationId);
    if (!this.invoice) throw new NotFoundError("Fatura", this.input.invoiceId);
    if (this.invoice.status === "CANCELLED") throw new BusinessRuleError("Não é possível pagar uma fatura cancelada");
    if (this.invoice.status === "PAID") throw new BusinessRuleError("Fatura já está totalmente paga");

    // Wallet credit validation
    const walletCredit = this.input.walletCreditAmount ?? 0;
    if (walletCredit > 0) {
      if (!this.invoice.studentId) {
        throw new BusinessRuleError("Crédito de carteira não pode ser aplicado a faturas sem aluno");
      }
      this.wallet = await findWalletByStudentId(this.invoice.studentId, this.context.organizationId);
      if (!this.wallet) throw new BusinessRuleError("O aluno não tem uma carteira ativa");
      if (this.wallet.status === "SUSPENDED") throw new BusinessRuleError("Carteira suspensa");
      if (walletCredit > this.invoice.balanceAmount) {
        throw new BusinessRuleError(
          `O crédito (${walletCredit}) excede o saldo da fatura (${this.invoice.balanceAmount})`
        );
      }
      const balance = await getWalletBalance(this.wallet.id);
      if (walletCredit > balance) {
        throw new BusinessRuleError(`Saldo insuficiente na carteira. Disponível: ${balance.toFixed(2)}`);
      }
    }

    if (this.input.installmentId) {
      const db = await getDb();
      const inst = await db.installment.findFirst({
        where: { id: this.input.installmentId, organizationId: this.context.organizationId },
        select: { id: true, status: true },
      });
      if (!inst) throw new BusinessRuleError("Prestação não encontrada nesta organização");
      if (inst.status === "PAID") throw new BusinessRuleError("Prestação já está paga");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.PAYMENTS_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Payment> {
    const invoice = this.invoice!;
    const walletCredit = this.input.walletCreditAmount ?? 0;

    // How much of the invoice balance remains after wallet credit
    const remainingAfterCredit = invoice.balanceAmount - walletCredit;
    // How much cash actually applies to the invoice (capped at remaining balance)
    const cashApplied = Math.min(this.totalAmount, remainingAfterCredit);
    // Any cash excess above the invoice remaining balance goes back to the wallet
    const overpaymentAmount = Math.max(0, this.totalAmount - remainingAfterCredit);

    const totalSettled = walletCredit + cashApplied;

    const primarySplit = this.input.splits.reduce((max, s) => (s.amount > max.amount ? s : max));
    const lastNum = await getLastPaymentNumber(this.context.organizationId);
    const paymentNumber = `PAG-${String(lastNum + 1).padStart(6, "0")}`;
    const paymentDate = this.input.paymentDate ? new Date(this.input.paymentDate) : new Date();

    const db = await getDb();

    const created = await db.$transaction(async (tx) => {
      // Re-check wallet balance inside the transaction to guard against race conditions
      if (walletCredit > 0) {
        const walletId = this.wallet!.id;
        const balanceResult = await tx.studentWalletTransaction.aggregate({
          where: { studentWalletId: walletId },
          _sum: { amount: true },
        });
        const liveBalance = (balanceResult._sum.amount as { toNumber(): number } | null)?.toNumber() ?? 0;
        if (walletCredit > liveBalance) {
          throw new BusinessRuleError(`Saldo insuficiente na carteira. Disponível: ${liveBalance.toFixed(2)}`);
        }
      }

      // 1. Create payment record
      const paymentRow = await tx.payment.create({
        data: {
          organizationId: this.context.organizationId,
          invoiceId: invoice.id,
          installmentId: this.input.installmentId ?? null,
          studentId: invoice.studentId,
          enrollmentId: invoice.enrollmentId,
          paymentNumber,
          paymentDate,
          totalAmount: this.totalAmount,
          invoiceAppliedAmount: totalSettled,
          method: primarySplit.method,
          notes: this.input.notes ?? null,
          createdBy: this.context.userId,
        },
        select: { id: true },
      });

      // 2. Create payment splits
      await tx.paymentSplit.createMany({
        data: this.input.splits.map((s) => ({
          organizationId: this.context.organizationId,
          paymentId: paymentRow.id,
          method: s.method,
          amount: s.amount,
          reference: s.reference ?? null,
          notes: s.notes ?? null,
        })),
      });

      // 3. Apply wallet credit: debit wallet + record CreditApplication
      if (walletCredit > 0) {
        const walletId = this.wallet!.id;
        await tx.studentWalletTransaction.create({
          data: {
            organizationId: this.context.organizationId,
            studentWalletId: walletId,
            type: "CREDIT_APPLIED",
            amount: -walletCredit,
            referenceType: "Invoice",
            referenceId: invoice.id,
            description: `Crédito aplicado via pagamento ${paymentNumber}`,
            createdBy: this.context.userId,
          },
        });
        await tx.creditApplication.create({
          data: {
            organizationId: this.context.organizationId,
            studentId: invoice.studentId!,
            studentWalletId: walletId,
            invoiceId: invoice.id,
            paymentId: paymentRow.id,
            amount: walletCredit,
            createdBy: this.context.userId,
          },
        });
      }

      // 4. Update invoice balance
      const inv = await tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { paidAmount: true, totalAmount: true },
      });
      const newPaid = Number(inv.paidAmount) + totalSettled;
      const newBalance = Number(inv.totalAmount) - newPaid;
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
        },
      });

      // 5. Handle overpayment: credit excess cash back to wallet
      if (overpaymentAmount > 0 && invoice.studentId) {
        // Find or create wallet inside the transaction
        let walletId = this.wallet?.id;
        if (!walletId) {
          const existing = await tx.studentWallet.findFirst({
            where: { organizationId: this.context.organizationId, studentId: invoice.studentId },
            select: { id: true },
          });
          if (existing) {
            walletId = existing.id;
          } else {
            const created = await tx.studentWallet.create({
              data: {
                organizationId: this.context.organizationId,
                studentId: invoice.studentId,
                status: "ACTIVE",
                createdBy: this.context.userId,
              },
              select: { id: true },
            });
            walletId = created.id;
          }
        }
        await tx.studentWalletTransaction.create({
          data: {
            organizationId: this.context.organizationId,
            studentWalletId: walletId,
            type: "OVERPAYMENT",
            amount: overpaymentAmount,
            referenceType: "Payment",
            referenceId: paymentRow.id,
            description: "Excesso de pagamento creditado na carteira",
            createdBy: this.context.userId,
          },
        });
      }

      // 6. Update installment if provided
      if (this.input.installmentId) {
        const inst = await tx.installment.findUniqueOrThrow({
          where: { id: this.input.installmentId },
          select: { paidAmount: true, amount: true },
        });
        const newInstPaid = Number(inst.paidAmount) + cashApplied;
        const newInstBalance = Number(inst.amount) - newInstPaid;
        await tx.installment.update({
          where: { id: this.input.installmentId },
          data: {
            paidAmount: newInstPaid,
            balanceAmount: newInstBalance,
            status: newInstBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
          },
        });
      }

      return paymentRow;
    });

    const payment = await findPaymentById(created.id, this.context.organizationId);
    if (!payment) throw new BusinessRuleError("Erro ao recuperar pagamento após criação");

    // Audit: payment created
    await auditService.log(this.context, {
      entity: "Payment",
      entityId: payment.id,
      action: "CREATED",
      newValues: {
        paymentNumber,
        totalAmount: this.totalAmount,
        walletCreditAmount: walletCredit > 0 ? walletCredit : undefined,
        overpaymentAmount: overpaymentAmount > 0 ? overpaymentAmount : undefined,
        invoiceId: invoice.id,
        status: "PENDING",
        splits: this.input.splits.length,
      },
    });

    // Audit: wallet credit applied
    if (walletCredit > 0) {
      await auditService.log(this.context, {
        entity: "StudentWallet",
        entityId: this.wallet!.id,
        action: "wallet.credit_applied",
        newValues: { amount: walletCredit, invoiceId: invoice.id, paymentId: payment.id },
      });
    }

    // Audit: overpayment
    if (overpaymentAmount > 0) {
      await auditService.log(this.context, {
        entity: "StudentWallet",
        entityId: this.wallet?.id ?? "auto-created",
        action: "wallet.overpayment",
        newValues: { amount: overpaymentAmount, paymentId: payment.id, studentId: invoice.studentId },
      });
    }

    return payment;
  }
}
