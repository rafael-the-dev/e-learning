import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseById,
  getLevelsByCourse,
} from "@/modules/courses/services/course.service";
import { getEnrollmentStatsByCourse } from "@/modules/enrollments/services/enrollment.service";
import { LevelsTable } from "@/modules/courses/components/levels-table";
import { NotFoundError } from "@/shared/lib/command";
import { Layers, BookOpen, Clock, Users } from "lucide-react";

export async function generateMetadata() {
  return { title: "Níveis do Curso" };
}

export default async function CourseLevelsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSES_READ);

  const { courseId } = await params;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canManage = ability.can(PERMISSIONS.COURSE_LEVELS_CREATE);
  const canViewEnrollments = ability.can(PERMISSIONS.ENROLLMENTS_VIEW);

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

  const enrollmentStats = canViewEnrollments
    ? await getEnrollmentStatsByCourse(courseId, context.organizationId)
    : null;

  const activeLevels = levels.filter((l) => l.status === "ACTIVE").length;
  const totalSubjects = levels.reduce((sum, l) => sum + (l.subjectsCount ?? 0), 0);
  const totalHours = course.totalHours
    ?? levels.reduce((sum, l) => sum + (l.totalHours ?? 0), 0);

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
        description={`Estrutura curricular de "${course.name}".`}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Níveis Ativos"
            value={activeLevels}
            description={`${levels.length} no total`}
            icon={<Layers className="size-5" />}
          />
          <StatCard
            title="Disciplinas"
            value={totalSubjects}
            description="em todos os níveis"
            icon={<BookOpen className="size-5" />}
          />
          <StatCard
            title="Carga Horária"
            value={totalHours ? `${totalHours}h` : "—"}
            description="carga total do curso"
            icon={<Clock className="size-5" />}
          />
          {enrollmentStats && (
            <StatCard
              title="Matrículas Ativas"
              value={enrollmentStats.active}
              description={`${enrollmentStats.total} no total`}
              icon={<Users className="size-5" />}
            />
          )}
        </div>

        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Níveis do Curso</h3>
          </div>
          <LevelsTable
            courseId={course.id}
            levels={levels}
            canManage={canManage}
            enrollmentCountsByLevel={enrollmentStats?.byLevel}
          />
        </div>
      </div>
    </>
  );
}
