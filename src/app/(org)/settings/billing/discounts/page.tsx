import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDiscountRules, getDiscountRuleStats } from "@/modules/billing/services/billing.service";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { DiscountsClient } from "./_components/discounts-client";

export const metadata = { title: "Regras de Desconto" };

export default async function DiscountsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.DISCOUNT_RULES_VIEW);

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, stats] = await Promise.all([
    getDiscountRules(context.organizationId, { ...pagination, search, status }),
    getDiscountRuleStats(context.organizationId),
  ]);

  return (
    <DiscountsClient
      result={result}
      stats={stats}
      canCreate={ability.can(PERMISSIONS.DISCOUNT_RULES_CREATE)}
      canEdit={ability.can(PERMISSIONS.DISCOUNT_RULES_UPDATE)}
      search={search}
      status={status}
    />
  );
}
