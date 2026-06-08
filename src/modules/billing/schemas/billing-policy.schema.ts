import { z } from "zod";

const INVOICE_MODES = ["MANUAL", "SINGLE_INVOICE", "INSTALLMENT_INVOICES"] as const;
const ACTIVATION_RULES = [
  "MANUAL",
  "AFTER_INVOICE_CREATED",
  "AFTER_REGISTRATION_FEE",
  "AFTER_FIRST_PAYMENT",
  "AFTER_FULL_PAYMENT",
] as const;

const billingPolicyBaseSchema = z.object({
  name: z.string().min(1, "O nome é obrigatório").max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  autoGenerateInvoiceOnEnrollment: z.boolean().default(true),
  invoiceMode: z.enum(INVOICE_MODES, { error: "Modo de faturação inválido" }).default("SINGLE_INVOICE"),
  activationRule: z.enum(ACTIVATION_RULES, { error: "Regra de ativação inválida" }).default("MANUAL"),
  installmentsRequired: z.boolean().default(false),
  defaultNumberOfInstallments: z.number().int().min(2).max(60).optional().nullable(),
  minimumFirstPaymentAmount: z.number().nonnegative().optional().nullable(),
  allowWalletCreditOnEnrollment: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

const installmentsRefinement = (data: { installmentsRequired?: boolean; defaultNumberOfInstallments?: number | null }, ctx: z.RefinementCtx) => {
  if (data.installmentsRequired && !data.defaultNumberOfInstallments) {
    ctx.addIssue({
      path: ["defaultNumberOfInstallments"],
      code: "custom",
      message: "Número de prestações é obrigatório quando prestações são requeridas",
    });
  }
};

export const createBillingPolicySchema = billingPolicyBaseSchema.superRefine(installmentsRefinement);

export type CreateBillingPolicySchema = z.infer<typeof createBillingPolicySchema>;

export const updateBillingPolicySchema = billingPolicyBaseSchema
  .partial()
  .extend({ policyId: z.string().min(1) })
  .superRefine(installmentsRefinement);

export type UpdateBillingPolicySchema = z.infer<typeof updateBillingPolicySchema>;
