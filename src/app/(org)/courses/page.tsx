import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCoursesByOrganization,
  getCourseStats,
  getActiveCategoriesByOrganization,
} from "@/modules/courses/services/course.service";
import { CoursesTable } from "@/modules/courses/components/courses-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { BookOpen, Plus, Tags } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Cursos" };

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    categoryId?: string;
  }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.COURSES_READ);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status, categoryId } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, stats, categories] = await Promise.all([
    getCoursesByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
      categoryId,
    }),
    getCourseStats(context.organizationId),
    getActiveCategoriesByOrganization(context.organizationId),
  ]);

  const totalActive = stats["ACTIVE"] ?? 0;
  const totalDraft = stats["DRAFT"] ?? 0;
  const totalArchived = stats["ARCHIVED"] ?? 0;

  return (
    <>
      <PageHeader
        title="Cursos"
        description="Gerir os cursos e programas da organização."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/courses/categories">
                <Tags className="size-4 mr-1.5" />
                Categorias
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/courses/new">
                <Plus className="size-4 mr-1.5" />
                Novo Curso
              </Link>
            </Button>
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total" value={result.total} />
          <StatCard label="Ativos" value={totalActive} />
          <StatCard label="Rascunhos" value={totalDraft} />
          <StatCard label="Arquivados" value={totalArchived} />
        </div>

        <CoursesTable
          result={result}
          categories={categories}
          defaultSearch={search}
          defaultStatus={status}
          defaultCategoryId={categoryId}
        />
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
