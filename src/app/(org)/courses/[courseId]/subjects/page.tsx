import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseById,
  getLevelsByCourse,
  getSubjectsByCourse,
} from "@/modules/courses/services/course.service";
import { SubjectsTable } from "@/modules/courses/components/subjects-table";
import { NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Disciplinas do Curso" };
}

export default async function CourseSubjectsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.COURSES_READ);
  } catch {
    redirect("/forbidden");
  }

  const { courseId } = await params;

  let course;
  let levels;
  let subjects;
  try {
    [course, levels, subjects] = await Promise.all([
      getCourseById(courseId, context.organizationId),
      getLevelsByCourse(courseId, context.organizationId),
      getSubjectsByCourse(courseId, context.organizationId),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

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
      <span className="text-foreground">Disciplinas</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Disciplinas"
        description={`Gerir as disciplinas de "${course.name}".`}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-3xl">
        <SubjectsTable courseId={course.id} subjects={subjects} levels={levels} />
      </div>
    </>
  );
}
