import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getStudentsByOrganization,
  getActiveBranches,
} from "@/modules/students/services/student.service";
import { StudentsTable } from "@/modules/students/components/students-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { UserPlus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Alunos" };

export default async function StudentsPage({
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
    context = await requirePermission(PERMISSIONS.STUDENTS_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, branchId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, branches] = await Promise.all([
    getStudentsByOrganization(context.organizationId, {
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
        title="Alunos"
        description="Gerir os alunos da organização."
        actions={
          <Button asChild size="sm">
            <Link href="/students/new">
              <UserPlus className="size-4 mr-1.5" />
              Novo Aluno
            </Link>
          </Button>
        }
      />

      <div className="p-8 space-y-4">
        <StudentsTable
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
