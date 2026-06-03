import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getAssignableRoles } from "@/modules/users/services/user.service";
import { CreateUserForm } from "@/modules/users/components/user-form";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Novo Utilizador" };

export default async function NewUserPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.USERS_CREATE);
  } catch {
    redirect("/forbidden");
  }

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
