import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getTeachersByOrganization,
  getActiveBranches,
} from "@/modules/teachers/services/teacher.service";
import { TeachersTable } from "@/modules/teachers/components/teachers-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { UserPlus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Professores" };

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    branchId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, branchId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, branches] = await Promise.all([
    getTeachersByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      branchId,
    }),
    getActiveBranches(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Professores"
        description="Gerir os professores e instrutores da organização."
        actions={
          <Button asChild size="sm">
            <Link href="/teachers/new">
              <UserPlus className="size-4 mr-1.5" />
              Novo Professor
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-4">
        <TeachersTable
          result={result}
          branches={branches}
          defaultSearch={search}
          defaultStatus={status}
          defaultBranchId={branchId}
        />
      </div>
    </>
  );
}
