import { z } from "zod";

const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
const DISCOUNT_APPLIES_TO = ["ENROLLMENT", "COURSE", "ALL"] as const;

const discountRuleBaseSchema = z.object({
  code: z.string().min(1, "O código é obrigatório").max(50, "Máximo 50 caracteres"),
  name: z.string().min(1, "O nome é obrigatório").max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  discountType: z.enum(DISCOUNT_TYPES, { error: "Tipo de desconto inválido" }),
  value: z.number({ error: "O valor é obrigatório" }).positive("O valor deve ser positivo"),
  appliesTo: z.enum(DISCOUNT_APPLIES_TO, { error: "Aplicação inválida" }).default("ENROLLMENT"),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  stackable: z.boolean().default(false),
});

const discountRuleRefinement = (
  data: { discountType?: string; value?: number; startDate?: string | null; endDate?: string | null },
  ctx: z.RefinementCtx
) => {
  if (data.discountType === "PERCENTAGE" && data.value !== undefined && data.value > 100) {
    ctx.addIssue({ path: ["value"], code: "custom", message: "A percentagem não pode exceder 100%" });
  }
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    ctx.addIssue({ path: ["endDate"], code: "custom", message: "A data de fim deve ser posterior à data de início" });
  }
};

export const createDiscountRuleSchema = discountRuleBaseSchema.superRefine(discountRuleRefinement);

export type CreateDiscountRuleSchema = z.infer<typeof createDiscountRuleSchema>;

export const updateDiscountRuleSchema = discountRuleBaseSchema
  .partial()
  .extend({ discountRuleId: z.string().min(1) })
  .superRefine(discountRuleRefinement);

export type UpdateDiscountRuleSchema = z.infer<typeof updateDiscountRuleSchema>;
