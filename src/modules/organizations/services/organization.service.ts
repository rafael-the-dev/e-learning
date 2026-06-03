import {
  listOrganizations,
  findOrganizationById,
  countOrganizations,
  countOrganizationsByStatus,
  type ListOrganizationsParams,
} from "@/modules/organizations/repositories/organization.repository";
import {
  listBranches,
  findBranchById,
  countBranches,
  type ListBranchesParams,
} from "@/modules/organizations/repositories/branch.repository";
import {
  findSettings,
  upsertSettings,
} from "@/modules/organizations/repositories/settings.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getUserPermissions, createAbility, isSuperAdmin } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import type { Organization, Branch, OrganizationSettings } from "@prisma/client";
import type { PaginatedResult } from "@/shared/types/common";
import type { UpdateSettingsSchema } from "@/modules/organizations/schemas/settings.schema";

export interface OrganizationWithDetails {
  organization: Organization;
  branches: Branch[];
  settings: OrganizationSettings | null;
  branchCount: number;
}

export interface AdminStats {
  total: number;
  byStatus: Record<string, number>;
}

// =============================================================================
// READ OPERATIONS — no auth on service layer; callers enforce auth at the route
// =============================================================================

export async function getOrganizations(
  params: ListOrganizationsParams
): Promise<PaginatedResult<Organization>> {
  return listOrganizations(params);
}

export async function getOrganizationById(id: string): Promise<Organization> {
  const org = await findOrganizationById(id);
  if (!org) throw new NotFoundError("Organization", id);
  return org;
}

export async function getOrganizationWithDetails(
  id: string
): Promise<OrganizationWithDetails> {
  const org = await findOrganizationById(id);
  if (!org) throw new NotFoundError("Organization", id);

  const [branchResult, settings] = await Promise.all([
    listBranches(id, { page: 1, pageSize: 100 }),
    findSettings(id),
  ]);

  return {
    organization: org,
    branches: branchResult.data,
    settings,
    branchCount: branchResult.total,
  };
}

export async function getBranches(
  organizationId: string,
  params: ListBranchesParams,
  context: ServiceContext
): Promise<PaginatedResult<Branch>> {
  const superAdmin = await isSuperAdmin(context.userId);
  if (!superAdmin) {
    const perms = await getUserPermissions(context.userId, organizationId);
    const ability = createAbility(perms);
    if (!ability.can(PERMISSIONS.BRANCHES_READ)) throw new AuthorizationError();
  }
  return listBranches(organizationId, params);
}

export async function getBranchById(
  organizationId: string,
  branchId: string
): Promise<Branch> {
  const branch = await findBranchById(organizationId, branchId);
  if (!branch) throw new NotFoundError("Branch", branchId);
  return branch;
}

export async function getSettings(
  organizationId: string
): Promise<OrganizationSettings | null> {
  return findSettings(organizationId);
}

export async function getAdminStats(): Promise<AdminStats> {
  const [total, byStatus] = await Promise.all([
    countOrganizations(),
    countOrganizationsByStatus(),
  ]);
  return { total, byStatus };
}

// =============================================================================
// SETTINGS MUTATION — goes through service (no command needed; not critical path)
// =============================================================================

export async function saveSettings(
  organizationId: string,
  data: UpdateSettingsSchema,
  context: ServiceContext
): Promise<OrganizationSettings> {
  const superAdmin = await isSuperAdmin(context.userId);
  if (!superAdmin) {
    const perms = await getUserPermissions(context.userId, organizationId);
    const ability = createAbility(perms);
    if (!ability.can(PERMISSIONS.ORGANIZATIONS_UPDATE)) throw new AuthorizationError();
  }

  const updated = await upsertSettings(organizationId, {
    ...data,
    taxRate: data.taxRate ?? null,
    taxName: data.taxName ?? null,
  });

  await auditService.log(context, {
    entity: "OrganizationSettings",
    entityId: organizationId,
    action: "UPDATED",
    newValues: data as Record<string, unknown>,
  });

  return updated;
}
