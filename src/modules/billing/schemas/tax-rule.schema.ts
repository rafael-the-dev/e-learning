import { z } from "zod";

const TAX_APPLIES_TO = ["ENROLLMENT", "COURSE", "ALL"] as const;

export const createTaxRuleSchema = z.object({
  code: z.string().min(1, "O código é obrigatório").max(50, "Máximo 50 caracteres"),
  name: z.string().min(1, "O nome é obrigatório").max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  rate: z
    .number({ error: "A taxa é obrigatória" })
    .positive("A taxa deve ser positiva")
    .max(100, "A taxa não pode exceder 100%"),
  appliesTo: z.enum(TAX_APPLIES_TO, { error: "Aplicação inválida" }).default("ENROLLMENT"),
  isIncludedInPrice: z.boolean().default(false),
});

export type CreateTaxRuleSchema = z.infer<typeof createTaxRuleSchema>;

export const updateTaxRuleSchema = createTaxRuleSchema.partial().extend({
  taxRuleId: z.string().min(1),
});

export type UpdateTaxRuleSchema = z.infer<typeof updateTaxRuleSchema>;
