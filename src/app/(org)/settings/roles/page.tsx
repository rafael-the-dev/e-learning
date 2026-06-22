import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { getOrganizationRoles, getOrganizationRoleOptions } from "@/modules/roles/services/organization-role.service";
import { getRoleKpis } from "@/modules/roles/services/role-metrics.service";
import { RolesPageClient } from "./_components/roles-page-client";

export const metadata = { title: "Roles e Permissões" };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; type?: string; status?: string }>;
}) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.ORGANIZATION_ROLES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, type, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, kpis, roleOptions] = await Promise.all([
    getOrganizationRoles(context.organizationId, {
      ...pagination,
      search,
      type: type === "system" || type === "custom" ? type : undefined,
      status: status === "ACTIVE" || status === "ARCHIVED" ? status : undefined,
    }),
    getRoleKpis(context.organizationId),
    getOrganizationRoleOptions(context.organizationId),
  ]);

  return (
    <RolesPageClient
      result={result}
      kpis={kpis}
      roleOptions={roleOptions}
      canCreate={ability.can(PERMISSIONS.ORGANIZATION_ROLES_CREATE)}
      canArchive={ability.can(PERMISSIONS.ORGANIZATION_ROLES_ARCHIVE)}
      search={search}
      type={type}
      status={status}
    />
  );
}
