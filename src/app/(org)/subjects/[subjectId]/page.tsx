import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getSubjectById } from "@/modules/courses/services/course.service";
import {
  getSubjectLessons,
  getPublishedLessons,
} from "@/modules/lessons/services/lesson.service";
import { SubjectLessonsPanel } from "@/modules/lessons/components/subject-lessons-panel";
import { SUBJECT_STATUS_LABELS } from "@/modules/courses/types";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return { title: `Disciplina ${subjectId}` };
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.SUBJECTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { subjectId } = await params;
  const sp = await searchParams;
  const activeTab = sp.tab === "lessons" ? "lessons" : "info";

  const subject = await getSubjectById(subjectId, context.organizationId).catch(() => null);
  if (!subject) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const canViewLessons = ability.can(PERMISSIONS.SUBJECT_LESSONS_VIEW);

  const [subjectLessons, publishedLessons] = canViewLessons
    ? await Promise.all([
        getSubjectLessons(subjectId, context.organizationId),
        getPublishedLessons(context.organizationId),
      ])
    : [[], []];

  const statusVariant =
    subject.status === "ACTIVE" ? "default" : subject.status === "INACTIVE" ? "secondary" : "outline";

  return (
    <>
      <PageHeader
        title={subject.name}
        description={subject.description ?? undefined}
      />

      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant}>
            {SUBJECT_STATUS_LABELS[subject.status] ?? subject.status}
          </Badge>
          {subject.code && (
            <span className="text-sm text-muted-foreground font-mono">{subject.code}</span>
          )}
        </div>

        <Tabs defaultValue={activeTab}>
          <TabsList>
            <TabsTrigger value="info">Informação</TabsTrigger>
            {canViewLessons && (
              <TabsTrigger value="lessons">
                Lições ({subjectLessons.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <div className="rounded-md border p-4 space-y-3 max-w-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Nome</span>
                <span>{subject.name}</span>
                {subject.code && (
                  <>
                    <span className="text-muted-foreground">Código</span>
                    <span className="font-mono">{subject.code}</span>
                  </>
                )}
                <span className="text-muted-foreground">Estado</span>
                <span>{SUBJECT_STATUS_LABELS[subject.status] ?? subject.status}</span>
                <span className="text-muted-foreground">Criada em</span>
                <span>{subject.createdAt.toLocaleDateString("pt-PT")}</span>
              </div>
            </div>
          </TabsContent>

          {canViewLessons && (
            <TabsContent value="lessons" className="mt-4">
              <SubjectLessonsPanel
                subjectId={subjectId}
                subjectLessons={subjectLessons}
                availableLessons={publishedLessons}
                canAssign={ability.can(PERMISSIONS.SUBJECT_LESSONS_ASSIGN)}
                canEdit={ability.can(PERMISSIONS.SUBJECT_LESSONS_UPDATE)}
                canRemove={ability.can(PERMISSIONS.SUBJECT_LESSONS_REMOVE)}
                canReorder={ability.can(PERMISSIONS.SUBJECT_LESSONS_REORDER)}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
