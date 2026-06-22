import type { PaginationParams } from "@/shared/types/common";
import {
  findUsersByRole,
  countDistinctUsersWithAnyRole,
} from "@/modules/roles/repositories/role-assignment.repository";

// =============================================================================
// ROLE ASSIGNMENT SERVICE
// =============================================================================

export function getRoleAssignedUsers(
  roleId: string,
  organizationId: string,
  params: PaginationParams
) {
  return findUsersByRole(roleId, organizationId, params);
}

export function getUsersWithRoleCount(organizationId: string) {
  return countDistinctUsersWithAnyRole(organizationId);
}
