import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getEnrollmentById } from "@/modules/enrollments/services/enrollment.service";
import { EditEnrollmentForm } from "@/modules/enrollments/components/enrollment-form";
import { NotFoundError } from "@/shared/lib/command";
import { getDb } from "@/server/db";
import type { AuthContext } from "@/server/auth/context";

export async function generateMetadata() {
  return { title: "Editar Matrícula" };
}

async function getFormOptions(organizationId: string, courseId: string) {
  const db = await getDb();
  const [levels, classGroups, branches, academicYears, terms] = await Promise.all([
    db.courseLevel.findMany({
      where: { courseId, status: "ACTIVE" },
      select: { id: true, name: true, courseId: true },
      orderBy: { order: "asc" },
    }),
    db.classGroup.findMany({
      where: {
        organizationId,
        courseId,
        deletedAt: null,
        status: { in: ["ACTIVE", "FORMING"] },
      },
      select: {
        id: true,
        name: true,
        courseId: true,
        courseLevelId: true,
        academicYearId: true,
        academicTermId: true,
        capacity: true,
        currentCount: true,
      },
      orderBy: { name: "asc" },
    }),
    db.branch.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.academicYear.findMany({
      where: { organizationId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
    db.academicTerm.findMany({
      where: { organizationId: organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, academicYearId: true },
      orderBy: [{ academicYearId: "asc" }, { order: "asc" }],
    }),
  ]);
  return { levels, classGroups, branches, academicYears, terms };
}

export default async function EditEnrollmentPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ENROLLMENTS_UPDATE);
  } catch {
    redirect("/forbidden");
  }

  const { enrollmentId } = await params;

  let enrollment;
  try {
    enrollment = await getEnrollmentById(enrollmentId, context.organizationId);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  if (["COMPLETED", "CANCELLED"].includes(enrollment.status)) {
    redirect(`/enrollments/${enrollmentId}`);
  }

  const options = await getFormOptions(context.organizationId, enrollment.courseId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/enrollments" className="hover:text-foreground transition-colors">
        Matrículas
      </Link>
      <span>/</span>
      <Link
        href={`/enrollments/${enrollment.id}`}
        className="hover:text-foreground transition-colors"
      >
        {enrollment.enrollmentNumber ?? enrollment.id}
      </Link>
      <span>/</span>
      <span className="text-foreground">Editar</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Editar Matrícula"
        description={`${enrollment.studentName} — ${enrollment.courseName}`}
        breadcrumb={breadcrumb}
      />
      <div className="p-8 max-w-2xl">
        <EditEnrollmentForm
          enrollment={enrollment}
          levels={options.levels}
          classGroups={options.classGroups}
          branches={options.branches}
          academicYears={options.academicYears}
          terms={options.terms}
        />
      </div>
    </>
  );
}
