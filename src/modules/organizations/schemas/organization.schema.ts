import { z } from "zod";

const emailField = z
  .union([z.string().email("Endereço de e-mail inválido"), z.literal("")])
  .optional();

export const createOrganizationSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  slug: z
    .string()
    .min(2, "O slug deve ter pelo menos 2 caracteres")
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Apenas letras minúsculas, números e hífens"),
  email: emailField,
  phone: z.string().max(30).optional(),
  address: z.string().max(255).optional(),
  timezone: z.string().optional(),
  locale: z.string().max(10).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: emailField,
  phone: z.string().max(30).optional(),
  address: z.string().max(255).optional(),
  logoUrl: z.string().optional(),
  timezone: z.string().optional(),
  locale: z.string().max(10).optional(),
});

export type CreateOrganizationSchema = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationSchema = z.infer<typeof updateOrganizationSchema>;
