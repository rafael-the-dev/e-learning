import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseById,
  getLevelsByCourse,
} from "@/modules/courses/services/course.service";
import { LevelsTable } from "@/modules/courses/components/levels-table";
import { NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Níveis do Curso" };
}

export default async function CourseLevelsPage({
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

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canManage = ability.can(PERMISSIONS.COURSE_LEVELS_CREATE);

  let course;
  let levels;
  try {
    [course, levels] = await Promise.all([
      getCourseById(courseId, context.organizationId),
      getLevelsByCourse(courseId, context.organizationId),
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
      <span className="text-foreground">Níveis</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Níveis do Curso"
        description={`Gerir os níveis de "${course.name}".`}
        breadcrumb={breadcrumb}
      />

      <div className="p-8">
        <LevelsTable courseId={course.id} levels={levels} canManage={canManage} />
      </div>
    </>
  );
}
