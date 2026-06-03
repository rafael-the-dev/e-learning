import { z } from "zod";

const emailField = z
  .union([z.string().email("Endereço de e-mail inválido"), z.literal("")])
  .optional();

export const createBranchSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  phone: z.string().max(30).optional(),
  email: emailField,
  isDefault: z.boolean().optional(),
});

export const updateBranchSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  code: z.string().max(20).optional(),
  address: z.string().max(255).optional(),
  phone: z.string().max(30).optional(),
  email: emailField,
  isDefault: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export type CreateBranchSchema = z.infer<typeof createBranchSchema>;
export type UpdateBranchSchema = z.infer<typeof updateBranchSchema>;
