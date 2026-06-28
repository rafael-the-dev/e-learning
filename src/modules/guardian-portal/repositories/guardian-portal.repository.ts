import { getDb } from "@/server/db";

// =============================================================================
// GUARDIAN PORTAL — REPOSITORY
// The single source of truth for resolving which students a guardian may see.
// Every query binds organizationId AND guardianUserId, and only ACTIVE links
// (deletedAt IS NULL). A studentId is NEVER trusted from client input — the
// caller validates it against {@link findGuardianLink} before any student read.
// =============================================================================

export interface GuardianLinkRow {
  /** GuardianStudent.id */
  linkId: string;
  studentId: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canReceiveNotifications: boolean;
  student: {
    firstName: string;
    lastName: string;
    code: string | null;
    status: string;
  };
}

export interface GuardianStudentEnrollmentSummary {
  studentId: string;
  courseName: string | null;
  classGroupName: string | null;
}

function mapLink(row: {
  id: string;
  studentId: string;
  relationshipType: string;
  isPrimary: boolean;
  canViewAcademic: boolean;
  canViewAttendance: boolean;
  canViewFinance: boolean;
  canViewDocuments: boolean;
  canReceiveNotifications: boolean;
  student: { firstName: string; lastName: string; code: string | null; status: string };
}): GuardianLinkRow {
  return {
    linkId: row.id,
    studentId: row.studentId,
    relationshipType: row.relationshipType,
    isPrimary: row.isPrimary,
    canViewAcademic: row.canViewAcademic,
    canViewAttendance: row.canViewAttendance,
    canViewFinance: row.canViewFinance,
    canViewDocuments: row.canViewDocuments,
    canReceiveNotifications: row.canReceiveNotifications,
    student: row.student,
  };
}

/** All ACTIVE guardian→student links for this guardian in this org. */
export async function findGuardianLinks(
  organizationId: string,
  guardianUserId: string
): Promise<GuardianLinkRow[]> {
  const db = await getDb();
  const rows = await db.guardianStudent.findMany({
    // `student: { deletedAt: null }` drops dangling links to soft-deleted
    // students — links are not cascade-removed on student soft-delete, so a
    // stale link must never surface a deleted student.
    where: { organizationId, guardianUserId, deletedAt: null, student: { deletedAt: null } },
    select: {
      id: true,
      studentId: true,
      relationshipType: true,
      isPrimary: true,
      canViewAcademic: true,
      canViewAttendance: true,
      canViewFinance: true,
      canViewDocuments: true,
      canReceiveNotifications: true,
      student: { select: { firstName: true, lastName: true, code: true, status: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(mapLink);
}

/**
 * Validates a single guardian→student link. Returns null when no ACTIVE link
 * exists for (org, guardian, student) — used to reject a forged studentId
 * query param and to enforce cross-student / cross-tenant isolation.
 */
export async function findGuardianLink(
  organizationId: string,
  guardianUserId: string,
  studentId: string
): Promise<GuardianLinkRow | null> {
  const db = await getDb();
  const row = await db.guardianStudent.findFirst({
    // Also rejects a link to a soft-deleted student (see findGuardianLinks).
    where: { organizationId, guardianUserId, studentId, deletedAt: null, student: { deletedAt: null } },
    select: {
      id: true,
      studentId: true,
      relationshipType: true,
      isPrimary: true,
      canViewAcademic: true,
      canViewAttendance: true,
      canViewFinance: true,
      canViewDocuments: true,
      canReceiveNotifications: true,
      student: { select: { firstName: true, lastName: true, code: true, status: true } },
    },
  });
  return row ? mapLink(row) : null;
}

/**
 * Lightweight course + class-group labels for the student selector. One row per
 * studentId (the student's most recent ACTIVE enrollment, else most recent
 * enrollment). Re-asserts organizationId — the studentIds always originate from
 * already-scoped link rows, but the repo never trusts that.
 */
export async function findGuardianStudentEnrollmentSummaries(
  organizationId: string,
  studentIds: string[]
): Promise<Map<string, GuardianStudentEnrollmentSummary>> {
  const result = new Map<string, GuardianStudentEnrollmentSummary>();
  if (studentIds.length === 0) return result;

  const db = await getDb();
  const enrollments = await db.enrollment.findMany({
    where: { organizationId, studentId: { in: studentIds }, deletedAt: null },
    select: {
      studentId: true,
      status: true,
      enrollmentDate: true,
      course: { select: { name: true } },
      classGroup: { select: { name: true } },
    },
    // ACTIVE first, then most recent — the first row we see per student wins.
    orderBy: [{ enrollmentDate: "desc" }],
  });

  // Prefer an ACTIVE enrollment if present; otherwise fall back to the latest.
  for (const e of enrollments) {
    const existing = result.get(e.studentId);
    const isActive = e.status === "ACTIVE";
    if (!existing) {
      result.set(e.studentId, {
        studentId: e.studentId,
        courseName: e.course?.name ?? null,
        classGroupName: e.classGroup?.name ?? null,
      });
    } else if (isActive) {
      // Upgrade to the ACTIVE enrollment's labels.
      result.set(e.studentId, {
        studentId: e.studentId,
        courseName: e.course?.name ?? null,
        classGroupName: e.classGroup?.name ?? null,
      });
    }
  }

  return result;
}
