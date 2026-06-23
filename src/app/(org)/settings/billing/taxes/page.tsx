import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTaxRules, getTaxRuleStats } from "@/modules/billing/services/billing.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { TaxesClient } from "./_components/taxes-client";

export const metadata = { title: "Regras de Imposto" };

export default async function TaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.TAX_RULES_VIEW);

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, stats] = await Promise.all([
    getTaxRules(context.organizationId, { ...pagination, search, status }),
    getTaxRuleStats(context.organizationId),
  ]);

  return (
    <TaxesClient
      result={result}
      stats={stats}
      canCreate={ability.can(PERMISSIONS.TAX_RULES_CREATE)}
      canEdit={ability.can(PERMISSIONS.TAX_RULES_UPDATE)}
      search={search}
      status={status}
    />
  );
}
