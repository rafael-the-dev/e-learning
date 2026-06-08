import { z } from "zod";

const FEE_TYPES = [
  "REGISTRATION_FEE",
  "COURSE_FEE",
  "MATERIAL_FEE",
  "EXAM_FEE",
  "CERTIFICATE_FEE",
  "PENALTY",
  "OTHER",
] as const;

const FEE_APPLIES_TO = [
  "ENROLLMENT",
  "COURSE",
  "LEVEL",
  "CERTIFICATE",
  "EXAM",
  "MANUAL",
] as const;

export const createFeeDefinitionSchema = z.object({
  code: z.string().min(1, "O código é obrigatório").max(50, "Máximo 50 caracteres"),
  name: z.string().min(1, "O nome é obrigatório").max(100, "Máximo 100 caracteres"),
  description: z.string().max(500, "Máximo 500 caracteres").optional(),
  feeType: z.enum(FEE_TYPES, { error: "Tipo de taxa inválido" }),
  defaultAmount: z.number({ error: "Valor padrão é obrigatório" }).nonnegative("O valor não pode ser negativo"),
  appliesTo: z.enum(FEE_APPLIES_TO, { error: "Aplicação inválida" }).default("ENROLLMENT"),
  isMandatory: z.boolean().default(false),
  priority: z.number().int().min(1).max(99).default(7),
});

export type CreateFeeDefinitionSchema = z.infer<typeof createFeeDefinitionSchema>;

export const updateFeeDefinitionSchema = createFeeDefinitionSchema.partial().extend({
  feeDefinitionId: z.string().min(1),
});

export type UpdateFeeDefinitionSchema = z.infer<typeof updateFeeDefinitionSchema>;
