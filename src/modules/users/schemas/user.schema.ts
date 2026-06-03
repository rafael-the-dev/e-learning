import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  email: z.string().email("Endereço de e-mail inválido"),
  phone: z.string().max(30).optional(),
  roleId: z.string().min(1, "Selecione um papel"),
  password: z.string().min(8, "A palavra-passe deve ter pelo menos 8 caracteres"),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  phone: z.string().max(30).optional(),
});

export const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1, "Selecione um papel"),
});

export const disableUserSchema = z.object({
  userId: z.string().min(1),
});

export const removeUserSchema = z.object({
  userId: z.string().min(1),
});

export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
export type AssignRoleSchema = z.infer<typeof assignRoleSchema>;
export type DisableUserSchema = z.infer<typeof disableUserSchema>;
export type RemoveUserSchema = z.infer<typeof removeUserSchema>;
