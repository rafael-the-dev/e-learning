import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";
import { BillingTabs } from "./_components/billing-tabs";

export const metadata = { title: "Definições de Faturação" };

export default async function BillingSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePermission(PERMISSIONS.BILLING_POLICIES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  return (
    <div>
      <PageHeader
        title="Definições de Faturação"
        description="Configure políticas, taxas, descontos e impostos aplicados automaticamente nas matrículas."
      />
      <BillingTabs />
      {children}
    </div>
  );
}
