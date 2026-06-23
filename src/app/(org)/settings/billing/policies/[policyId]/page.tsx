import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findBillingPolicyById } from "@/modules/billing/repositories/billing-policy.repository";
import { findActiveFeeDefinitionsByOrganization } from "@/modules/billing/repositories/fee-definition.repository";
import { PolicyFeesManager } from "@/modules/billing/components/policy-fees-manager";
import { Badge } from "@/shared/components/ui/badge";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { BILLING_POLICY_STATUS_LABELS, INVOICE_MODE_LABELS, ACTIVATION_RULE_LABELS } from "@/modules/billing/types";
import { Separator } from "@/shared/components/ui/separator";

export default async function BillingPolicyDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.BILLING_POLICIES_VIEW);

  const { policyId } = await params;
  const [policy, availableFees, perms] = await Promise.all([
    findBillingPolicyById(policyId, context.organizationId),
    findActiveFeeDefinitionsByOrganization(context.organizationId),
    getUserPermissions(context.userId, context.organizationId),
  ]);

  if (!policy) notFound();

  const ability = createAbility(perms);
  const canEdit = ability.can(PERMISSIONS.BILLING_POLICIES_UPDATE);

  return (
    <>
      <PageHeader
        title={policy.name}
        description={policy.description ?? undefined}
        breadcrumb={
          <Link href="/settings/billing/policies" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" />
            Políticas de Faturação
          </Link>
        }
        actions={
          <Badge variant={policy.status === "ACTIVE" ? "default" : "destructive"}>
            {BILLING_POLICY_STATUS_LABELS[policy.status] ?? policy.status}
            {policy.isDefault && " · Padrão"}
          </Badge>
        }
      />

      <div className="p-8 space-y-8">
        {/* Policy Configuration Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">Modo de Fatura</p>
            <p className="text-sm font-medium mt-0.5">{INVOICE_MODE_LABELS[policy.invoiceMode]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Regra de Ativação</p>
            <p className="text-sm font-medium mt-0.5">{ACTIVATION_RULE_LABELS[policy.activationRule]}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Geração Automática</p>
            <p className="text-sm font-medium mt-0.5">{policy.autoGenerateInvoiceOnEnrollment ? "Sim" : "Não"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prestações</p>
            <p className="text-sm font-medium mt-0.5">
              {policy.installmentsRequired
                ? `${policy.defaultNumberOfInstallments ?? "—"} prestações`
                : "Não requeridas"}
            </p>
          </div>
        </div>

        <Separator />

        <PolicyFeesManager
          policy={policy}
          availableFees={availableFees}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
