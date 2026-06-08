import { BaseCommand, AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import { findDefaultBillingPolicy, findBillingPolicyById } from "@/modules/billing/repositories/billing-policy.repository";
import { findActiveDiscountRules, createAppliedDiscount } from "@/modules/billing/repositories/discount-rule.repository";
import { findActiveTaxRules, createAppliedTax } from "@/modules/billing/repositories/tax-rule.repository";
import { createInvoice, getLastInvoiceNumber } from "@/modules/finance/repositories/invoice.repository";
import { createPaymentPlan } from "@/modules/finance/repositories/payment-plan.repository";
import { calculateBilling } from "@/modules/billing/services/billing-calculator.service";
import type { Invoice } from "@/modules/finance/types";

export interface GenerateInvoiceFromEnrollmentInput {
  enrollmentId: string;
  // If not provided, load the active default policy
  billingPolicyId?: string | null;
  dueDate?: Date | null;
}

export interface GenerateInvoiceResult {
  invoice: Invoice;
  activatedStatus: string;
}

export class GenerateInvoiceFromEnrollmentCommand extends BaseCommand<
  GenerateInvoiceFromEnrollmentInput,
  GenerateInvoiceResult
> {
  async validate(): Promise<void> {
    const db = await getDb();
    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId: this.context.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!enrollment) throw new NotFoundError("Matrícula", this.input.enrollmentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.INVOICES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<GenerateInvoiceResult> {
    const db = await getDb();

    // 1. Load enrollment + course for base price
    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId: this.context.organizationId, deletedAt: null },
      select: {
        id: true,
        studentId: true,
        branchId: true,
        courseId: true,
        billingPolicyId: true,
        status: true,
        course: { select: { price: true } },
      },
    });
    if (!enrollment) throw new NotFoundError("Matrícula", this.input.enrollmentId);

    // 2. Resolve billing policy
    const policyId = this.input.billingPolicyId ?? enrollment.billingPolicyId;
    const policy = policyId
      ? await findBillingPolicyById(policyId, this.context.organizationId)
      : await findDefaultBillingPolicy(this.context.organizationId);

    if (!policy) {
      throw new BusinessRuleError(
        "Nenhuma política de faturação ativa encontrada. Configure uma política padrão em Definições → Faturação."
      );
    }

    if (!policy.autoGenerateInvoiceOnEnrollment) {
      throw new BusinessRuleError("A política de faturação não permite a geração automática de faturas.");
    }

    // 3. Load active discount and tax rules
    const [activeDiscounts, activeTaxes] = await Promise.all([
      findActiveDiscountRules(this.context.organizationId),
      findActiveTaxRules(this.context.organizationId),
    ]);

    // 4. Calculate billing
    const courseBasePrice = enrollment.course.price
      ? (enrollment.course.price as { toNumber(): number }).toNumber()
      : 0;
    const calculation = calculateBilling(policy, courseBasePrice, activeDiscounts, activeTaxes);

    if (calculation.totalAmount <= 0) {
      throw new BusinessRuleError("O valor total calculado deve ser maior que zero. Verifique as taxas da política.");
    }

    // 5. Generate invoice number
    const lastNum = await getLastInvoiceNumber(this.context.organizationId);
    const invoiceNumber = `FAT-${String(lastNum + 1).padStart(6, "0")}`;

    // 6. Create invoice with items (billingPolicyId set atomically at creation)
    const invoice = await createInvoice({
      organizationId: this.context.organizationId,
      branchId: enrollment.branchId ?? null,
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      billingPolicyId: policy.id,
      invoiceNumber,
      dueDate: this.input.dueDate ?? null,
      subtotal: calculation.subtotal,
      discountAmount: calculation.discountAmount,
      taxAmount: calculation.taxAmount,
      totalAmount: calculation.totalAmount,
      notes: null,
      createdBy: this.context.userId,
      items: calculation.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        itemType: item.itemType,
        feeDefinitionId: item.feeDefinitionId,
      })),
    });

    // 7. Record which billing policy was used on the enrollment
    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { billingPolicyId: policy.id },
    });

    // 8. Store applied discounts (auditable snapshot)
    for (const discount of calculation.discounts) {
      await createAppliedDiscount({
        organizationId: this.context.organizationId,
        invoiceId: invoice.id,
        discountRuleId: discount.discountRuleId,
        amount: discount.amount,
        description: discount.name,
      });
    }

    // 9. Store applied taxes (auditable snapshot)
    for (const tax of calculation.taxes) {
      await createAppliedTax({
        organizationId: this.context.organizationId,
        invoiceId: invoice.id,
        taxRuleId: tax.taxRuleId,
        amount: tax.amount,
        rate: tax.rate,
        description: tax.name,
      });
    }

    // 10. Create payment plan if installments required
    if (policy.installmentsRequired && policy.defaultNumberOfInstallments && calculation.installmentsPreview.length > 0) {
      const firstDue = this.input.dueDate ?? new Date();
      const installments = calculation.installmentsPreview.map((inst, i) => {
        const dueDate = new Date(firstDue);
        dueDate.setMonth(dueDate.getMonth() + i);
        return { invoiceId: invoice.id, installmentNumber: inst.number, dueDate, amount: inst.amount };
      });

      await createPaymentPlan({
        organizationId: this.context.organizationId,
        invoiceId: invoice.id,
        name: `Plano — ${invoice.invoiceNumber}`,
        numberOfInstallments: policy.defaultNumberOfInstallments,
        totalAmount: calculation.totalAmount,
        installments,
      });
    }

    // 11. Determine new enrollment status based on activationRule
    let newEnrollmentStatus = "PENDING_PAYMENT";
    if (policy.activationRule === "AFTER_INVOICE_CREATED") {
      newEnrollmentStatus = "ACTIVE";
    } else if (policy.activationRule === "MANUAL") {
      newEnrollmentStatus = enrollment.status; // keep current
    }

    if (newEnrollmentStatus !== enrollment.status) {
      await db.enrollment.update({ where: { id: enrollment.id }, data: { status: newEnrollmentStatus } });
      await db.enrollmentStatusHistory.create({
        data: {
          enrollmentId: enrollment.id,
          fromStatus: enrollment.status,
          toStatus: newEnrollmentStatus,
          reason: `Ativado automaticamente pela política '${policy.name}'`,
          changedBy: this.context.userId,
        },
      });
    }

    // 12. Audit
    await auditService.log(this.context, {
      entity: "Invoice",
      entityId: invoice.id,
      action: "enrollment_invoice.generated",
      newValues: {
        invoiceNumber,
        enrollmentId: enrollment.id,
        billingPolicyId: policy.id,
        billingPolicyName: policy.name,
        subtotal: calculation.subtotal,
        discountAmount: calculation.discountAmount,
        taxAmount: calculation.taxAmount,
        totalAmount: calculation.totalAmount,
        itemCount: calculation.items.length,
        discountCount: calculation.discounts.length,
        taxCount: calculation.taxes.length,
        installmentsCreated: policy.installmentsRequired ? (policy.defaultNumberOfInstallments ?? 0) : 0,
        activationRule: policy.activationRule,
        newEnrollmentStatus,
      },
    });

    return { invoice, activatedStatus: newEnrollmentStatus };
  }
}
