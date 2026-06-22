import { z } from "zod";

const CODE_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const createOrganizationRoleSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  code: z
    .string()
    .min(2, "O código deve ter pelo menos 2 caracteres")
    .max(50)
    .regex(CODE_REGEX, "O código deve estar em MAIÚSCULAS_COM_UNDERSCORE"),
  description: z.string().max(500).optional(),
});

export const updateOrganizationRoleSchema = z.object({
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  description: z.string().max(500).optional(),
});

export const duplicateOrganizationRoleSchema = z.object({
  sourceRoleId: z.string().min(1, "Selecione uma role de origem"),
  name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres").max(100),
  code: z
    .string()
    .min(2, "O código deve ter pelo menos 2 caracteres")
    .max(50)
    .regex(CODE_REGEX, "O código deve estar em MAIÚSCULAS_COM_UNDERSCORE"),
});

export const updateRolePermissionsSchema = z.object({
  roleId: z.string().min(1),
  permissionIds: z.array(z.string().min(1)),
});

export const listOrganizationRolesSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["system", "custom"]).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type CreateOrganizationRoleSchema = z.infer<typeof createOrganizationRoleSchema>;
export type UpdateOrganizationRoleSchema = z.infer<typeof updateOrganizationRoleSchema>;
export type DuplicateOrganizationRoleSchema = z.infer<typeof duplicateOrganizationRoleSchema>;
export type UpdateRolePermissionsSchema = z.infer<typeof updateRolePermissionsSchema>;
export type ListOrganizationRolesSchema = z.infer<typeof listOrganizationRolesSchema>;
