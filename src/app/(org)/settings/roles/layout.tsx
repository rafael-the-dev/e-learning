import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";

export const metadata = { title: "Roles e Permissões" };

export default async function RolesSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePermission(PERMISSIONS.ORGANIZATION_ROLES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  return (
    <div>
      <PageHeader
        title="Roles e Permissões"
        description="Gerencie os perfis de acesso da organização usando permissões globais do sistema."
      />
      {children}
    </div>
  );
}
