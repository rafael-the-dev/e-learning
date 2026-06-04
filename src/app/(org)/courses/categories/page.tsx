import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getCategoriesWithCounts } from "@/modules/courses/services/course.service";
import { CategoriesPageClient } from "@/modules/courses/components/categories-page-client";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Categorias de Cursos" };

export default async function CourseCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.COURSE_CATEGORIES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { search, status } = await searchParams;

  const categories = await getCategoriesWithCounts(context.organizationId);

  const totalActive = categories.filter((c) => c.status === "ACTIVE").length;
  const totalInactive = categories.filter((c) => c.status === "INACTIVE").length;
  const totalArchived = categories.filter((c) => c.status === "ARCHIVED").length;

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/courses" className="hover:text-foreground transition-colors">
        Cursos
      </Link>
      <span>/</span>
      <span className="text-foreground">Categorias</span>
    </nav>
  );

  return (
    <CategoriesPageClient
      categories={categories}
      defaultSearch={search}
      defaultStatus={status}
      totalActive={totalActive}
      totalInactive={totalInactive}
      totalArchived={totalArchived}
      breadcrumb={breadcrumb}
    />
  );
}
