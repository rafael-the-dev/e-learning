import { SYSTEM_ROLES } from "@/server/auth/permissions";
import {
  findOrganizationRoles,
  findOrganizationRoleById,
  findOrganizationRoleOptions,
  findRoleByCodeInOrg,
  type ListOrganizationRolesParams,
} from "@/modules/roles/repositories/organization-role.repository";

// =============================================================================
// ORGANIZATION ROLE SERVICE
// =============================================================================

const RESERVED_CODES = new Set<string>(Object.values(SYSTEM_ROLES));

export function getOrganizationRoles(organizationId: string, params: ListOrganizationRolesParams) {
  return findOrganizationRoles(organizationId, params);
}

export function getOrganizationRoleDetail(roleId: string, organizationId: string) {
  return findOrganizationRoleById(roleId, organizationId);
}

export function getOrganizationRoleOptions(organizationId: string) {
  return findOrganizationRoleOptions(organizationId);
}

export interface CodeValidationResult {
  valid: boolean;
  reason?: "RESERVED" | "DUPLICATE";
}

/** Validates a custom role code is not a reserved system-role code and is unique within the org. */
export async function validateRoleCodeUnique(
  code: string,
  organizationId: string
): Promise<CodeValidationResult> {
  if (RESERVED_CODES.has(code)) {
    return { valid: false, reason: "RESERVED" };
  }
  const existing = await findRoleByCodeInOrg(code, organizationId);
  if (existing) {
    return { valid: false, reason: "DUPLICATE" };
  }
  return { valid: true };
}
