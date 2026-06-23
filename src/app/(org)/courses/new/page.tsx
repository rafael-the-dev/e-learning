import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getActiveCategoriesByOrganization } from "@/modules/courses/services/course.service";
import { CreateCourseForm } from "@/modules/courses/components/course-form";

export const metadata = { title: "Novo Curso" };

export default async function NewCoursePage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSES_CREATE);

  const categories = await getActiveCategoriesByOrganization(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/courses" className="hover:text-foreground transition-colors">
        Cursos
      </Link>
      <span>/</span>
      <span className="text-foreground">Novo</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Novo Curso"
        description="Criar um novo curso na organização."
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <CreateCourseForm categories={categories} />
      </div>
    </>
  );
}
