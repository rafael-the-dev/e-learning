import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Separator } from "@/shared/components/ui/separator";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getCourseWithCounts,
  getLevelsByCourse,
} from "@/modules/courses/services/course.service";
import { CourseDetailActions } from "@/modules/courses/components/course-detail-actions";
import { LevelsTable } from "@/modules/courses/components/levels-table";
import { NotFoundError } from "@/shared/lib/command";
import {
  Pencil,
  BookOpen,
  Clock,
  Tag,
  DollarSign,
  Users,
  GraduationCap,
  Video,
  FileCheck,
  Layers,
} from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export default async function CourseDetailPage({
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
  const canManageLevels = ability.can(PERMISSIONS.COURSE_LEVELS_CREATE);

  let course;
  let levels;
  try {
    [course, levels] = await Promise.all([
      getCourseWithCounts(courseId, context.organizationId),
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
      <span className="text-foreground">{course.name}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={course.name}
        description={course.description ?? ""}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${course.id}/edit`}>
                <Pencil className="size-4 mr-1.5" />
                Editar
              </Link>
            </Button>
            <CourseDetailActions course={course} />
          </div>
        }
      />

      <div className="p-8 space-y-6">
        {/* Status + meta badges */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={course.status} />
          {course.code && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 font-mono">
              {course.code}
            </span>
          )}
          {course.categoryName && (
            <span className="text-sm border rounded-full px-2.5 py-0.5 flex items-center gap-1.5">
              <Tag className="size-3" />
              {course.categoryName}
            </span>
          )}
        </div>

        <Separator />

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetaCard
            icon={<Clock className="size-4 text-muted-foreground" />}
            label="Carga Horária"
            value={course.totalHours ? `${course.totalHours}h` : "—"}
          />
          <MetaCard
            icon={<DollarSign className="size-4 text-muted-foreground" />}
            label="Preço Base"
            value={
              course.price
                ? parseFloat(course.price).toLocaleString("pt-PT", {
                    style: "currency",
                    currency: "MZN",
                  })
                : "—"
            }
          />
          <MetaCard
            icon={<Layers className="size-4 text-muted-foreground" />}
            label="Níveis"
            value={String(course.levelsCount)}
          />
          <MetaCard
            icon={<BookOpen className="size-4 text-muted-foreground" />}
            label="Disciplinas"
            value={String(course.subjectsCount)}
          />
        </div>

        {/* Course Levels */}
        <div className="rounded-xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Níveis do Curso</h3>
          </div>
          <LevelsTable courseId={course.id} levels={levels} canManage={canManageLevels} />
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border p-5 space-y-4">
          <h3 className="text-sm font-semibold">Registo</h3>
          <dl className="space-y-2 text-sm">
            <DetailRow
              label="Criado a"
              value={new Date(course.createdAt).toLocaleDateString("pt-PT")}
            />
            <DetailRow
              label="Atualizado a"
              value={new Date(course.updatedAt).toLocaleDateString("pt-PT")}
            />
          </dl>
        </div>

        {/* Future: Enrollments */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <h3 className="text-sm font-semibold">Matrículas</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de matrículas em desenvolvimento.
          </p>
        </div>

        {/* Future: Class Groups */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GraduationCap className="size-4" />
            <h3 className="text-sm font-semibold">Turmas</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de turmas em desenvolvimento.
          </p>
        </div>

        {/* Future: Online Learning */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Video className="size-4" />
            <h3 className="text-sm font-semibold">Aprendizagem Online</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de aprendizagem online em desenvolvimento.
          </p>
        </div>

        {/* Future: Tests */}
        <div className="rounded-xl border border-dashed p-5 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileCheck className="size-4" />
            <h3 className="text-sm font-semibold">Testes e Avaliações</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo de avaliações em desenvolvimento.
          </p>
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
      <div className="flex items-center gap-2">{icon}<p className="text-xs text-muted-foreground">{label}</p></div>
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
