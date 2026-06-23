import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CreateLessonForm } from "@/modules/lessons/components/lesson-form";

export async function generateMetadata() {
  return { title: "Nova Lição" };
}

export default async function NewLessonPage() {
  await requirePermissionOrRedirect(PERMISSIONS.LESSONS_CREATE);

  return (
    <>
      <PageHeader
        title="Nova Lição"
        description="Crie uma lição reutilizável para a biblioteca de conteúdo."
      />
      <div className="p-8 max-w-2xl">
        <CreateLessonForm />
      </div>
    </>
  );
}
