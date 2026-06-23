import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseById,
  getActiveCategoriesByOrganization,
} from "@/modules/courses/services/course.service";
import { EditCourseForm } from "@/modules/courses/components/course-form";
import { NotFoundError } from "@/shared/lib/command";

export const metadata = { title: "Editar Curso" };

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSES_UPDATE);

  const { courseId } = await params;

  let course;
  try {
    course = await getCourseById(courseId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const categories = await getActiveCategoriesByOrganization(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/courses" className="hover:text-foreground transition-colors">
        Cursos
      </Link>
      <span>/</span>
      <Link
        href={`/courses/${course.id}`}
        className="hover:text-foreground transition-colors"
      >
        {course.name}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Curso"
        description={course.name}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <EditCourseForm course={course} categories={categories} />
      </div>
    </>
  );
}
