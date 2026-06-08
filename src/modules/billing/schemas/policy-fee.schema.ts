import { z } from "zod";

const AMOUNT_TYPES = ["FIXED", "PERCENTAGE_OF_COURSE_PRICE", "COURSE_BASE_PRICE"] as const;

const policyFeeBaseSchema = z.object({
  policyId: z.string().min(1, "A política é obrigatória"),
  feeDefinitionId: z.string().min(1, "A taxa é obrigatória"),
  amountType: z.enum(AMOUNT_TYPES, { error: "Tipo de valor inválido" }).default("FIXED"),
  fixedAmount: z.number().nonnegative("O valor não pode ser negativo").optional().nullable(),
  percentage: z.number().min(0).max(100, "A percentagem não pode exceder 100%").optional().nullable(),
  isRequired: z.boolean().default(true),
  priority: z.number().int().min(1).max(99).default(7),
});

const policyFeeRefinement = (
  data: { amountType?: string; fixedAmount?: number | null; percentage?: number | null },
  ctx: z.RefinementCtx
) => {
  if (data.amountType === "FIXED" && (data.fixedAmount === null || data.fixedAmount === undefined)) {
    ctx.addIssue({
      path: ["fixedAmount"],
      code: "custom",
      message: "Valor fixo é obrigatório para o tipo 'Valor Fixo'",
    });
  }
  if (data.amountType === "PERCENTAGE_OF_COURSE_PRICE" && (data.percentage === null || data.percentage === undefined)) {
    ctx.addIssue({
      path: ["percentage"],
      code: "custom",
      message: "Percentagem é obrigatória para o tipo 'Percentagem do Preço do Curso'",
    });
  }
};

export const addPolicyFeeSchema = policyFeeBaseSchema.superRefine(policyFeeRefinement);

export type AddPolicyFeeSchema = z.infer<typeof addPolicyFeeSchema>;

export const updatePolicyFeeSchema = policyFeeBaseSchema
  .partial()
  .extend({ policyFeeId: z.string().min(1), policyId: z.string().min(1) })
  .superRefine(policyFeeRefinement);

export type UpdatePolicyFeeSchema = z.infer<typeof updatePolicyFeeSchema>;
