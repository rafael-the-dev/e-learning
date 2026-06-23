import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ClassroomForm } from "@/modules/classrooms/components/classroom-form";
import { getDb } from "@/server/db";

export const metadata = { title: "Nova Sala" };

export default async function NewClassroomPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.CLASSROOMS_CREATE);

  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId: context.organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Nova Sala" description="Criar uma nova sala física ou online." />
      <div className="p-8">
        <ClassroomForm branches={branches} />
      </div>
    </>
  );
}
