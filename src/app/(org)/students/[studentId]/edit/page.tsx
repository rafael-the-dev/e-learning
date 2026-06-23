import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getStudentById,
  getActiveBranches,
} from "@/modules/students/services/student.service";
import { EditStudentForm } from "@/modules/students/components/student-form";
import { NotFoundError } from "@/shared/lib/command";

export const metadata = { title: "Editar Aluno" };

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENTS_UPDATE);

  const { studentId } = await params;

  let student;
  try {
    student = await getStudentById(studentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const branches = await getActiveBranches(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/students" className="hover:text-foreground transition-colors">
        Alunos
      </Link>
      <span>/</span>
      <Link
        href={`/students/${student.id}`}
        className="hover:text-foreground transition-colors"
      >
        {student.fullName}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Aluno"
        description={student.fullName}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <EditStudentForm student={student} branches={branches} />
      </div>
    </>
  );
}
