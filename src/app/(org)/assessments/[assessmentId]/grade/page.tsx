import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { assertTeacherCanAccessAssessment } from "@/server/auth/teacher-access";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { getDb } from "@/server/db";
import { findAssessmentById } from "@/modules/assessments/repositories/assessment.repository";
import { BulkGradeForm } from "@/modules/assessments/components/bulk-grade-form";

export const metadata = { title: "Lançar Notas" };

export default async function GradeAssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.ASSESSMENT_RESULTS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never this org-wide grading screen. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { assessmentId } = await params;
  // Teacher-scoped users may only grade an assessment they own or for a class
  // group they teach (IDOR guard). 404 so we don't disclose existence.
  try {
    await assertTeacherCanAccessAssessment(context, assessmentId);
  } catch (e) {
    if (e instanceof AuthorizationError) notFound();
    throw e;
  }

  const assessment = await findAssessmentById(assessmentId, context.organizationId);
  if (!assessment) notFound();

  if (assessment.status === "CANCELLED") redirect(`/assessments/${assessmentId}`);

  // Resolve what the current user may do
  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);

  const canGrade = ability.can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE);
  const canEditGraded = ability.can(PERMISSIONS.GRADES_UPDATE);
  const canReopen = ability.can(PERMISSIONS.ASSESSMENTS_REOPEN);

  // LOCKED assessments: only admins who can reopen may see the edit path
  const isLocked = assessment.status === "LOCKED";
  const isGraded = assessment.status === "GRADED";

  // Who may actually enter/edit grades right now
  const canEnterGrades =
    !isLocked &&
    (
      (!isGraded && canGrade) ||   // first grading
      (isGraded && canEditGraded)  // re-grading
    );

  const db = await getDb();

  // Build student list — always look up grades by (enrollmentId, assessmentComponentId),
  // which is the unique key in StudentAssessmentResult. This is correct regardless of
  // whether the grade came from this specific assessment event or a previous one.
  let students: {
    studentId: string;
    enrollmentId: string | null;
    studentName: string;
    existingScore: number | null;
    existingResultId: string | null;
  }[] = [];

  if (assessment.classGroupId && assessment.assessmentComponentId) {
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

    const enrollmentIds = enrollments.map((e) => e.id);

    // Fetch current canonical grade for this component across all enrolled students.
    // Uses assessmentComponentId (unique per enrollment) — not assessmentEventId,
    // which gets overwritten on each re-grade and would miss grades from other events.
    const existingResults = enrollmentIds.length > 0
      ? await db.studentAssessmentResult.findMany({
          where: {
            organizationId: context.organizationId,
            assessmentComponentId: assessment.assessmentComponentId,
            enrollmentId: { in: enrollmentIds },
            status: { not: "CANCELLED" },
          },
          select: { id: true, enrollmentId: true, grade: true },
        })
      : [];

    const resultByEnrollment = new Map(existingResults.map((r) => [r.enrollmentId, r]));

    students = enrollments.map((enr) => {
      const existing = resultByEnrollment.get(enr.id);
      return {
        studentId: enr.student.id,
        enrollmentId: enr.id,
        studentName: `${enr.student.firstName} ${enr.student.lastName}`,
        existingScore: existing?.grade != null ? parseFloat(String(existing.grade)) : null,
        existingResultId: existing?.id ?? null,
      };
    });
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
        <BulkGradeForm
          assessment={assessment}
          students={students}
          canEnterGrades={canEnterGrades}
          isGraded={isGraded}
          isLocked={isLocked}
          canReopen={canReopen}
        />
      </div>
    </>
  );
}
