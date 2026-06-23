import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getActiveBranches } from "@/modules/teachers/services/teacher.service";
import { CreateTeacherForm } from "@/modules/teachers/components/teacher-form";

export const metadata = { title: "Novo Professor" };

export default async function NewTeacherPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.TEACHERS_CREATE);

  const branches = await getActiveBranches(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/teachers" className="hover:text-foreground transition-colors">
        Professores
      </Link>
      <span>/</span>
      <span className="text-foreground">Novo</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Novo Professor"
        description="Registar um novo professor na organização."
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <CreateTeacherForm branches={branches} />
      </div>
    </>
  );
}
