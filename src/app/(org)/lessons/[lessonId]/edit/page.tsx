import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getLessonById } from "@/modules/lessons/services/lesson.service";
import { EditLessonForm } from "@/modules/lessons/components/lesson-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return { title: `Editar Lição ${lessonId}` };
}

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.LESSONS_UPDATE);

  const { lessonId } = await params;
  const lesson = await getLessonById(lessonId, context.organizationId).catch(() => null);

  if (!lesson) notFound();

  return (
    <>
      <PageHeader
        title="Editar Lição"
        description={lesson.title}
      />
      <div className="p-8 max-w-2xl">
        <EditLessonForm lesson={lesson} />
      </div>
    </>
  );
}
