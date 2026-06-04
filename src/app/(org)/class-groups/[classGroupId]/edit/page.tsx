import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getClassGroupById,
  getClassGroupFormReferenceData,
} from "@/modules/class-groups/services/class-group.service";
import { EditClassGroupForm } from "@/modules/class-groups/components/class-group-form";
import { NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Editar Turma" };

export default async function EditClassGroupPage({
  params,
}: {
  params: Promise<{ classGroupId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASS_GROUPS_UPDATE);
  } catch {
    redirect("/forbidden");
  }

  const { classGroupId } = await params;

  let group;
  try {
    group = await getClassGroupById(classGroupId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { courses, levels, teachers, branches } = await getClassGroupFormReferenceData(
    context.organizationId
  );

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/class-groups" className="hover:text-foreground transition-colors">
        Turmas
      </Link>
      <span>/</span>
      <Link
        href={`/class-groups/${group.id}`}
        className="hover:text-foreground transition-colors"
      >
        {group.name}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Turma"
        description={`Atualizar informação de "${group.name}".`}
        breadcrumb={breadcrumb}
      />
      <div className="p-8 max-w-2xl">
        <EditClassGroupForm
          classGroup={group}
          courses={courses}
          levels={levels}
          teachers={teachers}
          branches={branches}
        />
      </div>
    </>
  );
}
