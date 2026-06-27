import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import {
  getLessonById,
  getLessonAttachments,
  getLessonSubjects,
} from "@/modules/lessons/services/lesson.service";
import { LessonDetailActions } from "@/modules/lessons/components/lesson-detail-actions";
import { LessonDetailTabs } from "@/modules/lessons/components/lesson-detail-tabs";
import { VideoLoader } from "@/modules/lessons/components/video/video-loader";
import {
  LESSON_STATUS_LABELS,
  LESSON_TYPE_LABELS,
} from "@/modules/lessons/types";
import { Pencil, Clock } from "lucide-react";
import type { ProgressContext } from "@/modules/lessons/components/video/video-types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return { title: `Lição ${lessonId}` };
}

export default async function LessonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ enrollmentId?: string; subjectId?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LESSONS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { lessonId } = await params;
  const sp = await searchParams;

  const [lesson, attachments, subjects] = await Promise.all([
    getLessonById(lessonId, context.organizationId).catch(() => null),
    getLessonAttachments(lessonId, context.organizationId),
    getLessonSubjects(lessonId, context.organizationId),
  ]);

  if (!lesson) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  // Resolve progress context when the caller supplies enrollment + subject params.
  // This is how student-facing flows (e.g. enrollment portal) link to lesson playback.
  let progressContext: ProgressContext | undefined;

  const hasProgressPermission = ability.can(PERMISSIONS.LESSON_PROGRESS_UPDATE);
  const { enrollmentId, subjectId } = sp;

  if (hasProgressPermission && enrollmentId && subjectId && lesson.status === "PUBLISHED") {
    const db = await getDb();

    const [enrollment, subjectLesson, existingProgress] = await Promise.all([
      db.enrollment.findFirst({
        where: { id: enrollmentId, organizationId: context.organizationId, status: "ACTIVE", deletedAt: null },
        select: { id: true },
      }),
      db.subjectLesson.findFirst({
        where: { subjectId, lessonId, organizationId: context.organizationId, deletedAt: null },
        select: { id: true, minWatchPercentage: true },
      }),
      db.studentLessonProgress.findFirst({
        where: { lessonId, enrollmentId, organizationId: context.organizationId },
        select: { watchedSeconds: true, progressPercentage: true, status: true },
      }),
    ]);

    if (enrollment && subjectLesson) {
      progressContext = {
        lessonId,
        subjectId,
        enrollmentId,
        minWatchPercentage: subjectLesson.minWatchPercentage,
        initialProgress: existingProgress
          ? {
              watchedSeconds: existingProgress.watchedSeconds,
              progressPercentage: Number(existingProgress.progressPercentage),
              status: existingProgress.status,
            }
          : undefined,
      };
    }
  }

  const hasVideo =
    lesson.videoProvider !== "NONE" &&
    (lesson.externalVideoId !== null || lesson.videoUrl !== null);

  const statusVariant =
    lesson.status === "PUBLISHED" ? "default" : lesson.status === "DRAFT" ? "secondary" : "outline";

  return (
    <>
      <PageHeader
        title={lesson.title}
        description={lesson.summary ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {ability.can(PERMISSIONS.LESSONS_UPDATE) && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/lessons/${lesson.id}/edit`}>
                  <Pencil className="size-4 mr-1.5" />
                  Editar
                </Link>
              </Button>
            )}
            <LessonDetailActions
              lesson={lesson}
              canPublish={ability.can(PERMISSIONS.LESSONS_PUBLISH)}
              canArchive={ability.can(PERMISSIONS.LESSONS_ARCHIVE)}
              canDelete={ability.can(PERMISSIONS.LESSONS_DELETE)}
            />
          </div>
        }
      />

      <div className="p-4 sm:p-8 space-y-8">
        {/* Status / type / duration */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={statusVariant}>
            {LESSON_STATUS_LABELS[lesson.status] ?? lesson.status}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {LESSON_TYPE_LABELS[lesson.lessonType] ?? lesson.lessonType}
          </span>
          {lesson.durationMinutes && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="size-3.5" />
              {lesson.durationMinutes} min
            </span>
          )}
        </div>

        {/* Video player */}
        {hasVideo && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Vídeo
            </h2>
            <VideoLoader
              video={{
                videoProvider: lesson.videoProvider,
                videoUrl: lesson.videoUrl,
                externalVideoId: lesson.externalVideoId,
                title: lesson.title,
              }}
              progressContext={progressContext}
            />
          </section>
        )}

        {/* Tabbed content */}
        <LessonDetailTabs
          description={lesson.description}
          objectives={lesson.objectives}
          lessonId={lesson.id}
          attachments={attachments}
          canCreateAttachment={ability.can(PERMISSIONS.LESSON_ATTACHMENTS_CREATE)}
          canDeleteAttachment={ability.can(PERMISSIONS.LESSON_ATTACHMENTS_DELETE)}
          subjects={subjects}
        />
      </div>
    </>
  );
}
