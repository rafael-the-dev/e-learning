import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CreateClassGroupForm } from "@/modules/class-groups/components/class-group-form";
import { getClassGroupFormReferenceData } from "@/modules/class-groups/services/class-group.service";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Nova Turma" };

export default async function NewClassGroupPage() {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.CLASS_GROUPS_CREATE);
  } catch {
    redirect("/forbidden");
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
      <span className="text-foreground">Nova Turma</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Nova Turma"
        description="Criar uma nova turma para um curso."
        breadcrumb={breadcrumb}
      />
      <div className="p-8 max-w-2xl">
        <CreateClassGroupForm
          courses={courses}
          levels={levels}
          teachers={teachers}
          branches={branches}
        />
      </div>
    </>
  );
}
