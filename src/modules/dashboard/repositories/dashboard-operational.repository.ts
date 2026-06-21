import { getDb } from "@/server/db";

// =============================================================================
// DASHBOARD OPERATIONAL REPOSITORY
// "Turmas sem professor" is already covered by getOperationalIssues() in
// class-group-metrics.service.ts — reused directly in dashboard-health.service.ts
// rather than duplicated here.
// =============================================================================

// A course counts as "sem estrutura" when it has no CourseLevel at all — there
// is nothing to enroll a student into beyond the course shell.
export async function countCoursesWithoutStructure(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.course.count({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: "ARCHIVED" },
      levels: { none: {} },
    },
  });
}

// "Incompleta" = an enrollment that never finished setup: still DRAFT, or
// ACTIVE without a class group assigned (so the student has no lessons,
// attendance, or assessments to attach to).
export async function countIncompleteEnrollments(organizationId: string): Promise<number> {
  const db = await getDb();
  return db.enrollment.count({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ status: "DRAFT" }, { status: "ACTIVE", classGroupId: null }],
    },
  });
}
