import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  getTeacherById,
  getActiveBranches,
} from "@/modules/teachers/services/teacher.service";
import { EditTeacherForm } from "@/modules/teachers/components/teacher-form";
import { NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Editar Professor" };

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_UPDATE);
  } catch {
    redirect("/forbidden");
  }

  const { teacherId } = await params;

  let teacher;
  try {
    teacher = await getTeacherById(teacherId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const branches = await getActiveBranches(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/teachers" className="hover:text-foreground transition-colors">
        Professores
      </Link>
      <span>/</span>
      <Link
        href={`/teachers/${teacher.id}`}
        className="hover:text-foreground transition-colors"
      >
        {teacher.fullName}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Professor"
        description={teacher.fullName}
        breadcrumb={breadcrumb}
      />

      <div className="p-8 max-w-2xl">
        <EditTeacherForm teacher={teacher} branches={branches} />
      </div>
    </>
  );
}
