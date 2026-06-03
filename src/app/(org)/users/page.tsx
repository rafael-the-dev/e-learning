import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUsersByOrganization, getAssignableRoles } from "@/modules/users/services/user.service";
import { UsersTable } from "@/modules/users/components/users-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { UserPlus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Utilizadores" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    role?: string;
    status?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.USERS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, role, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, roles] = await Promise.all([
    getUsersByOrganization(context.organizationId, {
      ...pagination,
      search,
      role,
      status,
    }),
    getAssignableRoles(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Utilizadores"
        description="Gerir os utilizadores da organização."
        actions={
          <Button asChild size="sm">
            <Link href="/users/new">
              <UserPlus className="size-4 mr-1.5" />
              Novo Utilizador
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-4">
        <UsersTable
          result={result}
          roles={roles}
          defaultSearch={search}
          defaultRole={role}
          defaultStatus={status}
        />
      </div>
    </>
  );
}
