import { notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getClassroomById } from "@/modules/classrooms/services/classroom.service";
import { ClassroomForm } from "@/modules/classrooms/components/classroom-form";
import { getDb } from "@/server/db";

export const metadata = { title: "Editar Sala" };

export default async function EditClassroomPage({
  params,
}: {
  params: Promise<{ classroomId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASSROOMS_UPDATE);

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
