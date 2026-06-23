import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getBillingPolicies, getBillingPolicyStats } from "@/modules/billing/services/billing.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { PoliciesClient } from "./_components/policies-client";

export const metadata = { title: "Políticas de Faturação" };

export default async function BillingPoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.BILLING_POLICIES_VIEW);

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, stats] = await Promise.all([
    getBillingPolicies(context.organizationId, { ...pagination, search, status }),
    getBillingPolicyStats(context.organizationId),
  ]);

  return (
    <PoliciesClient
      result={result}
      stats={stats}
      canCreate={ability.can(PERMISSIONS.BILLING_POLICIES_CREATE)}
      canEdit={ability.can(PERMISSIONS.BILLING_POLICIES_UPDATE)}
      search={search}
      status={status}
    />
  );
}
