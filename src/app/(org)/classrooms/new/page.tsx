import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ClassroomForm } from "@/modules/classrooms/components/classroom-form";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Nova Sala" };

export default async function NewClassroomPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASSROOMS_CREATE);
  } catch {
    redirect("/forbidden");
  }

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
