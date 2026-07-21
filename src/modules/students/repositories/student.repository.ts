import { getDb } from "@/server/db";
import { buildSkipTake, buildPaginationMeta } from "@/shared/lib/pagination";
import type { PaginatedResult, PaginationParams } from "@/shared/types/common";
import type { Student, StudentBranch, RiskStudent, TopCourseEnrollment, TopClassGroup } from "@/modules/students/types";
import { getStudentRiskDimensionAtRiskCounts } from "@/modules/students/repositories/student-risk-projection.repository";
import { getStudentRiskProjectionCoverage } from "@/modules/students/services/student-risk-projection-coverage.service";

// =============================================================================
// STUDENTS REPOSITORY
// All queries are scoped to organizationId. Never query cross-tenant.
// =============================================================================

export interface ListStudentsParams extends PaginationParams {
  search?: string;
  status?: string;
  branchId?: string;
  /**
   * Teacher scope (resolved server-side, never from client input): restrict to
   * students with at least one enrollment in a class group taught by this
   * teacher. See src/server/auth/teacher-scope.ts.
   */
  teacherId?: string;
}

const studentSelect = {
  id: true,
  userId: true,
  code: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  idType: true,
  idNumber: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
} as const;

function mapToStudent(row: {
  id: string;
  userId: string | null;
  code: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  idType: string | null;
  idNumber: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch: { id: string; name: string } | null;
}): Student {
  return {
    ...row,
    fullName: `${row.firstName} ${row.lastName}`,
  };
}

export async function findManyByOrganization(
  organizationId: string,
  params: ListStudentsParams
): Promise<PaginatedResult<Student>> {
  const db = await getDb();
  const { skip, take } = buildSkipTake(params);

  const where = {
    organizationId,
    deletedAt: null,
    ...(params.search && {
      OR: [
        { firstName: { contains: params.search } },
        { lastName: { contains: params.search } },
        { email: { contains: params.search } },
        { phone: { contains: params.search } },
        { idNumber: { contains: params.search } },
      ],
    }),
    ...(params.status && { status: params.status }),
    ...(params.branchId && { branchId: params.branchId }),
    ...(params.teacherId && {
      enrollments: { some: { deletedAt: null, classGroup: { teacherId: params.teacherId } } },
    }),
  };

  const [rows, total] = await Promise.all([
    db.student.findMany({
      where,
      select: studentSelect,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    db.student.count({ where }),
  ]);

  return buildPaginationMeta(rows.map(mapToStudent), total, params);
}

export async function findByIdInOrganization(
  id: string,
  organizationId: string
): Promise<Student | null> {
  const db = await getDb();
  const row = await db.student.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: studentSelect,
  });
  return row ? mapToStudent(row) : null;
}

/**
 * Resolves the Student profile linked to a platform login. Scoped to the org so
 * the same user can never resolve to a student in another tenant. Returns null
 * (not NotFoundError) — an unlinked account is an expected state for the Student
 * Portal's blocked view, not an error.
 */
export async function findStudentByUserId(
  organizationId: string,
  userId: string
): Promise<Student | null> {
  const db = await getDb();
  const row = await db.student.findFirst({
    where: { organizationId, userId, deletedAt: null },
    select: studentSelect,
  });
  return row ? mapToStudent(row) : null;
}

export async function createStudent(data: {
  organizationId: string;
  branchId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: Date | null;
  gender?: string | null;
  address?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  createdBy: string;
}): Promise<Student> {
  const db = await getDb();
  const row = await db.student.create({
    data: {
      organizationId: data.organizationId,
      branchId: data.branchId ?? null,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      dateOfBirth: data.dateOfBirth ?? null,
      gender: data.gender ?? null,
      address: data.address ?? null,
      idType: data.idType ?? null,
      idNumber: data.idNumber ?? null,
      notes: data.notes ?? null,
      status: "PENDING",
      createdBy: data.createdBy,
      updatedBy: data.createdBy,
    },
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function updateStudent(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    dateOfBirth?: Date | null;
    gender?: string | null;
    address?: string | null;
    idType?: string | null;
    idNumber?: string | null;
    branchId?: string | null;
    notes?: string | null;
    status?: string;
    updatedBy: string;
  }
): Promise<Student> {
  const db = await getDb();
  const row = await db.student.update({
    where: { id },
    data,
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function suspendStudent(id: string, updatedBy: string): Promise<Student> {
  const db = await getDb();
  const row = await db.student.update({
    where: { id },
    data: { status: "SUSPENDED", updatedBy },
    select: studentSelect,
  });
  return mapToStudent(row);
}

export async function softDeleteStudent(id: string, updatedBy: string): Promise<void> {
  const db = await getDb();
  await db.student.update({
    where: { id },
    data: { deletedAt: new Date(), updatedBy },
  });
}

export async function countByStatus(
  organizationId: string
): Promise<Record<string, number>> {
  const db = await getDb();
  const results = await db.student.groupBy({
    by: ["status"],
    where: { organizationId, deletedAt: null },
    _count: { status: true },
  });
  return Object.fromEntries(results.map((r) => [r.status, r._count.status]));
}

export async function findStudentByIdNumber(
  organizationId: string,
  idNumber: string,
  excludeId?: string
): Promise<Student | null> {
  const db = await getDb();
  const row = await db.student.findFirst({
    where: {
      organizationId,
      idNumber,
      deletedAt: null,
      ...(excludeId && { NOT: { id: excludeId } }),
    },
    select: studentSelect,
  });
  return row ? mapToStudent(row) : null;
}

export async function findExistingIdNumbers(
  organizationId: string,
  idNumbers: string[]
): Promise<Set<string>> {
  if (idNumbers.length === 0) return new Set();
  const db = await getDb();
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null, idNumber: { in: idNumbers } },
    select: { idNumber: true },
  });
  return new Set(rows.map((r) => r.idNumber).filter((v): v is string => v !== null));
}

/** `emails` must already be trimmed+lowercased — the returned Set is always lowercased too, so callers never need to normalize case themselves. */
export async function findExistingEmails(
  organizationId: string,
  emails: string[]
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const db = await getDb();
  const rows = await db.student.findMany({
    where: { organizationId, deletedAt: null, email: { in: emails } },
    select: { email: true },
  });
  return new Set(
    rows
      .map((r) => r.email)
      .filter((v): v is string => v !== null)
      .map((e) => e.trim().toLowerCase())
  );
}

export async function listActiveBranches(organizationId: string): Promise<StudentBranch[]> {
  const db = await getDb();
  return db.branch.findMany({
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

// =============================================================================
// DASHBOARD QUERIES
// =============================================================================

export async function countNewStudentsThisMonth(organizationId: string): Promise<number> {
  const db = await getDb();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return db.student.count({
    where: { organizationId, deletedAt: null, createdAt: { gte: startOfMonth } },
  });
}

export async function countStudentsWithPendingInvoices(organizationId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.invoice.findMany({
    where: {
      organizationId,
      status: { in: ["PENDING", "OVERDUE", "PARTIALLY_PAID"] },
      studentId: { not: null },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.length;
}

export async function countStudentsAtAcademicRisk(organizationId: string): Promise<number> {
  // M11.3: canonical academic-dimension at-risk count from the projection once backfilled
  // (same classification as Student 360); legacy FAILED-subject count as the fallback.
  if ((await getStudentRiskProjectionCoverage({ organizationId })).ready) {
    const dims = await getStudentRiskDimensionAtRiskCounts(organizationId, { financeAuthorized: true });
    return dims.academic;
  }
  const db = await getDb();
  const rows = await db.studentSubjectProgress.findMany({
    where: { organizationId, status: "FAILED" },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.length;
}

export async function countStudentsWithLowAttendance(
  organizationId: string,
  threshold = 75
): Promise<number> {
  // M11.3: canonical attendance-dimension at-risk count from the projection once backfilled
  // (per-subject minimum, not a flat threshold); the `threshold` arg applies only to the
  // legacy fallback below.
  if ((await getStudentRiskProjectionCoverage({ organizationId })).ready) {
    const dims = await getStudentRiskDimensionAtRiskCounts(organizationId, { financeAuthorized: true });
    return dims.attendance;
  }
  const db = await getDb();
  const rows = await db.studentSubjectProgress.findMany({
    where: {
      organizationId,
      attendancePercentage: { lt: threshold, not: null },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.length;
}

export async function findTopCoursesByEnrollment(
  organizationId: string,
  limit = 5
): Promise<TopCourseEnrollment[]> {
  const db = await getDb();
  const rows = await db.enrollment.groupBy({
    by: ["courseId"],
    where: { organizationId, status: "ACTIVE", deletedAt: null },
    _count: { _all: true },
  });
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => b._count._all - a._count._all).slice(0, limit);
  const courseIds = sorted.map((r) => r.courseId);
  const courses = await db.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(courses.map((c) => [c.id, c.name]));
  return sorted.map((r) => ({
    courseId: r.courseId,
    courseName: nameMap[r.courseId] ?? r.courseId,
    activeCount: r._count._all,
  }));
}

export async function findTopClassGroupsByOccupancy(
  organizationId: string,
  limit = 5
): Promise<TopClassGroup[]> {
  const db = await getDb();
  const rows = await db.classGroup.findMany({
    where: { organizationId, status: { in: ["FORMING", "ACTIVE"] }, deletedAt: null },
    select: {
      id: true,
      name: true,
      capacity: true,
      currentCount: true,
      course: { select: { name: true } },
    },
  });
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      currentCount: r.currentCount,
      occupancyPct: r.capacity > 0 ? Math.round((r.currentCount / r.capacity) * 100) : 0,
      courseName: r.course.name,
    }))
    .sort((a, b) => b.occupancyPct - a.occupancyPct)
    .slice(0, limit);
}

export async function findRiskWatchlistStudents(
  organizationId: string,
  limit = 10
): Promise<RiskStudent[]> {
  const db = await getDb();

  const [suspended, failedProgress] = await Promise.all([
    db.student.findMany({
      where: { organizationId, status: "SUSPENDED", deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        enrollments: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            course: { select: { name: true } },
            courseLevel: { select: { name: true } },
          },
        },
      },
      take: Math.ceil(limit / 2),
    }),
    db.studentSubjectProgress.findMany({
      where: { organizationId, status: "FAILED" },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
          },
        },
        enrollment: {
          select: {
            course: { select: { name: true } },
            courseLevel: { select: { name: true } },
          },
        },
      },
      distinct: ["studentId"],
      take: Math.ceil(limit / 2),
    }),
  ]);

  const results: RiskStudent[] = [];
  const seenIds = new Set<string>();

  for (const s of suspended) {
    seenIds.add(s.id);
    results.push({
      id: s.id,
      fullName: `${s.firstName} ${s.lastName}`,
      email: s.email,
      phone: s.phone,
      courseName: s.enrollments[0]?.course?.name ?? null,
      courseLevelName: s.enrollments[0]?.courseLevel?.name ?? null,
      issue: "Suspenso",
      severity: "high",
      studentStatus: s.status,
    });
  }

  for (const r of failedProgress) {
    if (!seenIds.has(r.student.id)) {
      seenIds.add(r.student.id);
      results.push({
        id: r.student.id,
        fullName: `${r.student.firstName} ${r.student.lastName}`,
        email: r.student.email,
        phone: r.student.phone,
        courseName: r.enrollment.course?.name ?? null,
        courseLevelName: r.enrollment.courseLevel?.name ?? null,
        issue: "Risco Académico",
        severity: "medium",
        studentStatus: r.student.status,
      });
    }
  }

  return results.slice(0, limit);
}
