import {
  findUsersByOrganization,
  findUserInOrganization,
  findAssignableRoles,
  type ListUsersParams,
} from "@/modules/users/repositories/user.repository";
import { NotFoundError } from "@/shared/lib/command";
import type { PaginatedResult } from "@/shared/types/common";
import type { OrgUser, AssignableRole } from "@/modules/users/types";

// =============================================================================
// USERS SERVICE
// Read operations — no auth here; callers enforce auth at the route/action layer.
// Mutations go through Commands.
// =============================================================================

export async function getUsersByOrganization(
  organizationId: string,
  params: ListUsersParams
): Promise<PaginatedResult<OrgUser>> {
  return findUsersByOrganization(organizationId, params);
}

export async function getUserInOrganization(
  userId: string,
  organizationId: string
): Promise<OrgUser> {
  const user = await findUserInOrganization(userId, organizationId);
  if (!user) throw new NotFoundError("Utilizador", userId);
  return user;
}

export async function getAssignableRoles(
  organizationId: string
): Promise<AssignableRole[]> {
  return findAssignableRoles(organizationId);
}
