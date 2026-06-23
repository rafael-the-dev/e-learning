import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getAssignableRoles } from "@/modules/users/services/user.service";
import { CreateUserForm } from "@/modules/users/components/user-form";

export const metadata = { title: "Novo Utilizador" };

export default async function NewUserPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.USERS_CREATE);

  const roles = await getAssignableRoles(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/users" className="hover:text-foreground transition-colors">
        Utilizadores
      </Link>
      <span>/</span>
      <span className="text-foreground">Novo</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Novo Utilizador"
        description="Adicionar um utilizador à organização."
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <CreateUserForm roles={roles} />
      </div>
    </>
  );
}
