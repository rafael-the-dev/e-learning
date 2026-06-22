import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getOrganizationRoleDetail } from "@/modules/roles/services/organization-role.service";
import { getPermissionMatrix } from "@/modules/roles/services/permission-matrix.service";
import { getRoleAssignedUsers } from "@/modules/roles/services/role-assignment.service";
import { getRoleAuditTrail } from "@/modules/roles/services/role-audit.service";
import { findUsersByOrganization } from "@/modules/users/repositories/user.repository";
import { PageHeader } from "@/shared/components/layout/page-header";
import { ROLE_LABELS } from "@/modules/users/types";
import { RoleHeaderActions } from "./_components/role-header-actions";
import { RoleDetailTabs } from "./_components/role-detail-tabs";

export const metadata = { title: "Detalhe da Role" };

export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ roleId: string }>;
  searchParams: Promise<{ usersPage?: string; auditPage?: string }>;
}) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.ORGANIZATION_ROLES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { roleId } = await params;
  const { usersPage, auditPage } = await searchParams;

  const role = await getOrganizationRoleDetail(roleId, context.organizationId);
  if (!role) notFound();

  const [matrix, assignedUsers, auditTrail, perms, orgUsers] = await Promise.all([
    getPermissionMatrix(roleId),
    getRoleAssignedUsers(roleId, context.organizationId, normalizePaginationParams(usersPage, "50")),
    getRoleAuditTrail(context.organizationId, roleId, normalizePaginationParams(auditPage, "20")),
    getUserPermissions(context.userId, context.organizationId),
    findUsersByOrganization(context.organizationId, { page: 1, pageSize: 200 }),
  ]);

  const assignedUserIds = new Set(assignedUsers.data.map((u) => u.userId));
  const availableUsers = orgUsers.data
    .filter((u) => !assignedUserIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, email: u.email }));

  const ability = createAbility(perms);
  const canUpdate = ability.can(PERMISSIONS.ORGANIZATION_ROLES_UPDATE);
  const canArchive = ability.can(PERMISSIONS.ORGANIZATION_ROLES_ARCHIVE);
  const canManagePermissions = ability.can(PERMISSIONS.ORGANIZATION_ROLES_MANAGE_PERMISSIONS);
  const canAssignUsers = ability.can(PERMISSIONS.ORGANIZATION_ROLES_ASSIGN_USERS);

  return (
    <>
      <PageHeader
        title={ROLE_LABELS[role.name] ?? role.name}
        description={role.description ?? undefined}
        breadcrumb={
          <Link
            href="/settings/roles"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Roles e Permissões
          </Link>
        }
        actions={
          <RoleHeaderActions
            role={role}
            canUpdate={canUpdate}
            canArchive={canArchive}
          />
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">Código</p>
            <p className="text-sm font-medium font-mono mt-0.5">{role.code ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tipo</p>
            <p className="text-sm font-medium mt-0.5">{role.isSystem ? "Sistema" : "Customizada"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Permissões</p>
            <p className="text-sm font-medium mt-0.5">{matrix.totalGranted}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Criado em</p>
            <p className="text-sm font-medium mt-0.5">{role.createdAt.toLocaleDateString("pt-PT")}</p>
          </div>
        </div>

        <RoleDetailTabs
          role={role}
          matrix={matrix}
          assignedUsers={assignedUsers}
          availableUsers={availableUsers}
          auditTrail={auditTrail}
          canManagePermissions={canManagePermissions}
          canAssignUsers={canAssignUsers}
        />
      </div>
    </>
  );
}
