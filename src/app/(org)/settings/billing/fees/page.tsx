import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getFeeDefinitions, getFeeDefinitionStats } from "@/modules/billing/services/billing.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { FeesClient } from "./_components/fees-client";

export const metadata = { title: "Definições de Taxas" };

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FEE_DEFINITIONS_VIEW);

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, stats] = await Promise.all([
    getFeeDefinitions(context.organizationId, { ...pagination, search, status }),
    getFeeDefinitionStats(context.organizationId),
  ]);

  return (
    <FeesClient
      result={result}
      stats={stats}
      canCreate={ability.can(PERMISSIONS.FEE_DEFINITIONS_CREATE)}
      canEdit={ability.can(PERMISSIONS.FEE_DEFINITIONS_UPDATE)}
      search={search}
      status={status}
    />
  );
}
