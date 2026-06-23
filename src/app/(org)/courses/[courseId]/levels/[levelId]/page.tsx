import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseById,
  getLevelById,
  getLevelSubjectsByLevel,
  getActiveSubjectsByOrganization,
} from "@/modules/courses/services/course.service";
import { LevelSubjectsPanel } from "@/modules/courses/components/level-subjects-panel";
import { NotFoundError } from "@/shared/lib/command";
import { BookOpen, Clock, Layers } from "lucide-react";

export async function generateMetadata() {
  return { title: "Detalhes do Nível" };
}

export default async function CourseLevelDetailPage({
  params,
}: {
  params: Promise<{ courseId: string; levelId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.COURSE_LEVELS_VIEW);

  const { courseId, levelId } = await params;

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canManageSubjects = ability.can(PERMISSIONS.LEVEL_SUBJECTS_ASSIGN);
  const canManagePrerequisites = ability.can(PERMISSIONS.PREREQUISITES_MANAGE);
  const canViewPolicy = ability.can(PERMISSIONS.GRADE_POLICIES_VIEW);
  const canCreatePolicy = ability.can(PERMISSIONS.GRADE_POLICIES_CREATE);
  const canEditPolicy = ability.can(PERMISSIONS.GRADE_POLICIES_UPDATE);
  const canArchivePolicy = ability.can(PERMISSIONS.GRADE_POLICIES_ARCHIVE);
  const canManagePolicyComponents = ability.can(PERMISSIONS.GRADE_COMPONENTS_CREATE);

  let course;
  let level;
  let levelSubjects;
  let availableSubjects;
  try {
    [course, level, levelSubjects, availableSubjects] = await Promise.all([
      getCourseById(courseId, context.organizationId),
      getLevelById(levelId, context.organizationId),
      getLevelSubjectsByLevel(levelId, context.organizationId),
      getActiveSubjectsByOrganization(context.organizationId),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  if (level.courseId !== courseId) notFound();

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
      <Link
        href={`/courses/${course.id}/levels`}
        className="hover:text-foreground transition-colors"
      >
        Níveis
      </Link>
      <span>/</span>
      <span className="text-foreground">{level.name}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={level.name}
        description={level.description ?? `Nível ${level.order + 1} de "${course.name}"`}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 space-y-6">
        {/* Level meta */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={level.status} />
          {level.code && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">
              {level.code}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <MetaCard
            icon={<Layers className="size-4 text-muted-foreground" />}
            label="Ordem"
            value={`Nível ${level.order + 1}`}
          />
          <MetaCard
            icon={<Clock className="size-4 text-muted-foreground" />}
            label="Carga Horária"
            value={level.totalHours ? `${level.totalHours}h` : "—"}
          />
          <MetaCard
            icon={<BookOpen className="size-4 text-muted-foreground" />}
            label="Disciplinas"
            value={String(levelSubjects.length)}
          />
        </div>

        {/* Level Subjects */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Disciplinas do Nível</h3>
          </div>
          <LevelSubjectsPanel
            courseId={courseId}
            courseLevelId={levelId}
            levelSubjects={levelSubjects}
            availableSubjects={availableSubjects}
            canManage={canManageSubjects}
            canManagePrerequisites={canManagePrerequisites}
            canViewPolicy={canViewPolicy}
            canCreatePolicy={canCreatePolicy}
            canEditPolicy={canEditPolicy}
            canArchivePolicy={canArchivePolicy}
            canManagePolicyComponents={canManagePolicyComponents}
          />
        </div>

        <div className="rounded-xl border p-5 space-y-2">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              label="Criado a"
              value={new Date(level.createdAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              label="Atualizado a"
              value={new Date(level.updatedAt).toLocaleDateString("pt-PT")}
            />
          </dl>
        </div>
      </div>
    </>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
