import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { PageHeader } from "@/shared/components/layout/page-header";

export const metadata = { title: "Roles e Permissões" };

export default async function RolesSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermissionOrRedirect(PERMISSIONS.ORGANIZATION_ROLES_VIEW);

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
