import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getClassroomById } from "@/modules/classrooms/services/classroom.service";
import { ClassroomForm } from "@/modules/classrooms/components/classroom-form";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Editar Sala" };

export default async function EditClassroomPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASSROOMS_UPDATE);
  } catch {
    redirect("/forbidden");
  }

  const { classroomId } = await params;
  const db = await getDb();

  const [classroom, branches] = await Promise.all([
    getClassroomById(classroomId, context.organizationId),
    db.branch.findMany({
      where: { organizationId: context.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!classroom) notFound();

  return (
    <>
      <PageHeader title="Editar Sala" description={`A editar: ${classroom.name}`} />
      <div className="p-8">
        <ClassroomForm classroom={classroom} branches={branches} />
      </div>
    </>
  );
}
