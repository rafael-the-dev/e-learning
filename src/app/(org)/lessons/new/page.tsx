import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CreateLessonForm } from "@/modules/lessons/components/lesson-form";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Nova Lição" };
}

export default async function NewLessonPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.LESSONS_CREATE);
    void context;
  } catch {
    redirect("/forbidden");
  }

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
