import Link from "next/link";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { getCategoriesWithCounts } from "@/modules/courses/services/course.service";
import { CategoriesPageClient } from "@/modules/courses/components/categories-page-client";

export const metadata = { title: "Categorias de Cursos" };

export default async function CourseCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSE_CATEGORIES_VIEW);

  const { search, status } = await searchParams;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.COURSE_CATEGORIES_CREATE);
  const canUpdate = ability.can(PERMISSIONS.COURSE_CATEGORIES_UPDATE);
  const canArchive = ability.can(PERMISSIONS.COURSE_CATEGORIES_ARCHIVE);
  const canDelete = ability.can(PERMISSIONS.COURSE_CATEGORIES_DELETE);

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
      canCreate={canCreate}
      canUpdate={canUpdate}
      canArchive={canArchive}
      canDelete={canDelete}
    />
  );
}
