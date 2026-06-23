import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getActiveBranches } from "@/modules/students/services/student.service";
import { CreateStudentForm } from "@/modules/students/components/student-form";

export const metadata = { title: "Novo Aluno" };

export default async function NewStudentPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENTS_CREATE);

  const branches = await getActiveBranches(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/students" className="hover:text-foreground transition-colors">
        Alunos
      </Link>
      <span>/</span>
      <span className="text-foreground">Novo</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Novo Aluno"
        description="Registar um novo aluno na organização."
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <CreateStudentForm branches={branches} />
      </div>
    </>
  );
}
