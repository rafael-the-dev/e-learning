import type { RoleStatus } from "@/shared/types/common";

// =============================================================================
// ROLES MODULE TYPES
// =============================================================================

export interface OrganizationRoleListItem {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isSystem: boolean;
  status: RoleStatus;
  permissionCount: number;
  userCount: number;
  createdAt: Date;
}

export interface OrganizationRoleDetail {
  id: string;
  organizationId: string | null;
  name: string;
  code: string | null;
  description: string | null;
  isSystem: boolean;
  status: RoleStatus;
  createdAt: Date;
  updatedAt: Date;
  permissionIds: string[];
}

export interface PermissionCatalogItem {
  id: string;
  module: string;
  action: string;
  description: string | null;
}

export interface PermissionMatrixPermission extends PermissionCatalogItem {
  code: string;
  label: string;
  granted: boolean;
}

export interface PermissionMatrixGroup {
  module: string;
  label: string;
  total: number;
  grantedCount: number;
  permissions: PermissionMatrixPermission[];
}

export interface PermissionMatrix {
  groups: PermissionMatrixGroup[];
  totalPermissions: number;
  totalGranted: number;
}

export interface RoleAssignedUser {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  assignedAt: Date;
}

export interface RoleAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdAt: Date;
}

export interface RoleKpis {
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
  usersWithRole: number;
  totalPermissions: number;
  archivedRoles: number;
}
