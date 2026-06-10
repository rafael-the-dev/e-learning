import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { findAllResultsByAssessment } from "@/modules/assessments/repositories/assessment-result.repository";
import { BulkGradeForm } from "@/modules/assessments/components/bulk-grade-form";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Lançar Notas" };

export default async function GradeAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ASSESSMENT_RESULTS_GRADE);
  } catch {
    redirect("/forbidden");
  }

  const { assessmentId } = await params;
  const assessment = await findAssessmentById(assessmentId, context.organizationId);
  if (!assessment) notFound();

  if (assessment.status === "CANCELLED") redirect(`/assessments/${assessmentId}`);

  const [results, db] = await Promise.all([
    findAllResultsByAssessment(assessmentId, context.organizationId),
    getDb(),
  ]);

  // Get enrolled students for the class group if set
  let students: {
    studentId: string;
    enrollmentId: string | null;
    studentName: string;
    existingScore: number | null;
    existingResultId: string | null;
  }[] = [];

  if (assessment.classGroupId) {
    const enrollments = await db.enrollment.findMany({
      where: {
        classGroupId: assessment.classGroupId,
        organizationId: context.organizationId,
        deletedAt: null,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      select: {
        id: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ student: { firstName: "asc" } }, { student: { lastName: "asc" } }],
    });

    students = enrollments.map((enr) => {
      const existing = results.find((r) => r.studentId === enr.student.id);
      return {
        studentId: enr.student.id,
        enrollmentId: enr.id,
        studentName: `${enr.student.firstName} ${enr.student.lastName}`,
        existingScore: existing?.score != null ? Number(existing.score) : null,
        existingResultId: existing?.id ?? null,
      };
    });
  } else {
    // Fallback to existing results
    students = results.map((r) => ({
      studentId: r.studentId,
      enrollmentId: r.enrollmentId ?? null,
      studentName: r.studentName ?? r.studentId,
      existingScore: r.score != null ? Number(r.score) : null,
      existingResultId: r.id,
    }));
  }

  return (
    <>
      <PageHeader
        title="Lançar Notas"
        description={assessment.title}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/assessments/${assessmentId}`}>
              <ChevronLeft className="size-4 mr-1" />
              Voltar
            </Link>
          </Button>
        }
      />
      <div className="p-8">
        <BulkGradeForm assessment={assessment} students={students} />
      </div>
    </>
  );
}
