import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getUserInOrganization,
  getAssignableRoles,
} from "@/modules/users/services/user.service";
import { EditUserForm } from "@/modules/users/components/user-form";
import { NotFoundError } from "@/shared/lib/command";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.USERS_UPDATE);

  const { userId } = await params;

  let user;
  try {
    user = await getUserInOrganization(userId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const roles = await getAssignableRoles(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/users" className="hover:text-foreground transition-colors">
        Utilizadores
      </Link>
      <span>/</span>
      <Link
        href={`/users/${userId}`}
        className="hover:text-foreground transition-colors"
      >
        {user.name}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Utilizador"
        description={user.name}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <EditUserForm user={user} roles={roles} />
      </div>
    </>
  );
}
