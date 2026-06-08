import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
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
  let context;
  try {
    context = await requirePermission(PERMISSIONS.BILLING_POLICIES_VIEW);
  } catch {
    redirect("/forbidden");
  }

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
