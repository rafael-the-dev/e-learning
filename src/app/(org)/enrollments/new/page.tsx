import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { CreateEnrollmentForm } from "@/modules/enrollments/components/enrollment-form";
import { getDb } from "@/server/db";

export const metadata = { title: "Nova Matrícula" };

async function getFormOptions(organizationId: string) {
  const db = await getDb();
  const [students, courses, levels, classGroups, branches, academicYears, terms] = await Promise.all([
    db.student.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { notIn: ["SUSPENDED", "DROPPED"] },
      },
      select: { id: true, firstName: true, lastName: true, code: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    db.course.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.courseLevel.findMany({
      where: { course: { organizationId }, status: "ACTIVE" },
      select: { id: true, name: true, courseId: true },
      orderBy: { order: "asc" },
    }),
    db.classGroup.findMany({
      where: {
        organizationId,
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
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" },
    }),
    db.academicTerm.findMany({
      where: { organizationId: organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, name: true, academicYearId: true },
      orderBy: [{ academicYearId: "asc" }, { order: "asc" }],
    }),
  ]);
  return { students, courses, levels, classGroups, branches, academicYears, terms };
}

export default async function NewEnrollmentPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ENROLLMENTS_CREATE);

  const options = await getFormOptions(context.organizationId);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/enrollments" className="hover:text-foreground transition-colors">
        Matrículas
      </Link>
      <span>/</span>
      <span className="text-foreground">Nova</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Nova Matrícula"
        description="Registar um aluno num curso."
        breadcrumb={breadcrumb}
      />
      <div className="p-8 max-w-2xl">
        <CreateEnrollmentForm
          students={options.students}
          courses={options.courses}
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
