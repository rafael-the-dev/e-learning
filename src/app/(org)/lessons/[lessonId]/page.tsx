import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getLessonById,
  getLessonAttachments,
  getLessonSubjects,
} from "@/modules/lessons/services/lesson.service";
import { LessonDetailActions } from "@/modules/lessons/components/lesson-detail-actions";
import { LessonAttachmentsPanel } from "@/modules/lessons/components/lesson-attachments-panel";
import {
  LESSON_STATUS_LABELS,
  LESSON_TYPE_LABELS,
  VIDEO_PROVIDER_LABELS,
} from "@/modules/lessons/types";
import { Pencil, BookOpen, Clock, Video } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

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
}: {
  params: Promise<{ lessonId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.LESSONS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { lessonId } = await params;

  const [lesson, attachments, subjects] = await Promise.all([
    getLessonById(lessonId, context.organizationId).catch(() => null),
    getLessonAttachments(lessonId, context.organizationId),
    getLessonSubjects(lessonId, context.organizationId),
  ]);

  if (!lesson) notFound();

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

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

      <div className="p-8 space-y-8 max-w-4xl">
        {/* Meta */}
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
          {lesson.videoProvider !== "NONE" && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Video className="size-3.5" />
              {VIDEO_PROVIDER_LABELS[lesson.videoProvider] ?? lesson.videoProvider}
            </span>
          )}
        </div>

        {/* Video — only loaded on detail page, never in list */}
        {lesson.videoProvider !== "NONE" && lesson.externalVideoId && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vídeo</h2>
            <div className="rounded-lg border p-4 bg-muted/30 text-sm space-y-1">
              <p><span className="font-medium">Fornecedor:</span> {VIDEO_PROVIDER_LABELS[lesson.videoProvider]}</p>
              <p><span className="font-medium">ID:</span> <code className="font-mono text-xs">{lesson.externalVideoId}</code></p>
              {lesson.videoUrl && (
                <p>
                  <span className="font-medium">URL:</span>{" "}
                  <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">
                    Ver vídeo
                  </a>
                </p>
              )}
            </div>
          </section>
        )}

        {/* Description */}
        {lesson.description && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h2>
            <p className="text-sm whitespace-pre-wrap">{lesson.description}</p>
          </section>
        )}

        {/* Objectives */}
        {lesson.objectives && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Objetivos de Aprendizagem</h2>
            <p className="text-sm whitespace-pre-wrap">{lesson.objectives}</p>
          </section>
        )}

        {/* Attachments */}
        <LessonAttachmentsPanel
          lessonId={lesson.id}
          attachments={attachments}
          canCreate={ability.can(PERMISSIONS.LESSON_ATTACHMENTS_CREATE)}
          canDelete={ability.can(PERMISSIONS.LESSON_ATTACHMENTS_DELETE)}
        />

        {/* Subjects using this lesson */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
            <BookOpen className="size-4" />
            Disciplinas que usam esta lição ({subjects.length})
          </h2>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Esta lição ainda não foi atribuída a nenhuma disciplina.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <li key={s.subjectId}>
                  <Badge variant="outline">{s.subjectName}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
