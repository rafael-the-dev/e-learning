import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getLessonsByOrganization,
  getLessonsStats,
} from "@/modules/lessons/services/lesson.service";
import { LessonsTable } from "@/modules/lessons/components/lessons-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { BookOpen } from "lucide-react";

export async function generateMetadata() {
  return { title: "Biblioteca de Lições" };
}

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    type?: string;
  }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LESSONS_VIEW);

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const [result, stats] = await Promise.all([
    getLessonsByOrganization(context.organizationId, {
      ...pagination,
      search: sp.search,
      status: sp.status,
      lessonType: sp.type,
    }),
    getLessonsStats(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Biblioteca de Lições"
        description="Conteúdo reutilizável que pode ser atribuído a múltiplas disciplinas."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total de Lições" value={stats.total} icon={<BookOpen className="size-4" />} />
          <StatCard title="Publicadas" value={stats.published} />
          <StatCard title="Rascunhos" value={stats.total - stats.published} />
          <StatCard title="Nesta Página" value={result.data.length} />
        </div>

        <LessonsTable
          result={result}
          defaultSearch={sp.search}
          defaultStatus={sp.status}
          defaultType={sp.type}
          canCreate={ability.can(PERMISSIONS.LESSONS_CREATE)}
          canEdit={ability.can(PERMISSIONS.LESSONS_UPDATE)}
          canPublish={ability.can(PERMISSIONS.LESSONS_PUBLISH)}
          canArchive={ability.can(PERMISSIONS.LESSONS_ARCHIVE)}
          canDelete={ability.can(PERMISSIONS.LESSONS_DELETE)}
        />
      </div>
    </>
  );
}
