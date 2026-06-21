import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db";

// =============================================================================
// DASHBOARD TREND REPOSITORY
// Trailing-12-month monthly aggregates for the Enrollments, Attendance, and
// Assessments tabs of the "Evolução Organizacional" card. Revenue uses the
// Finance Reports module's own getRevenueTrendReport() directly (see
// dashboard-trend.service.ts) — not duplicated here.
// =============================================================================

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function trailingMonths(count = 12): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

function windowStart(count = 12): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
}

export interface EnrollmentMonthlyPoint {
  month: string;
  count: number;
}

export async function getEnrollmentMonthlyTrend(organizationId: string): Promise<EnrollmentMonthlyPoint[]> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ monthKey: string; cnt: number | bigint }>>(Prisma.sql`
    SELECT FORMAT(enrollmentDate, 'yyyy-MM') AS monthKey, COUNT(*) AS cnt
    FROM enrollments
    WHERE organizationId = ${organizationId} AND deletedAt IS NULL AND enrollmentDate >= ${windowStart()}
    GROUP BY FORMAT(enrollmentDate, 'yyyy-MM')
  `);
  const byMonth = new Map(rows.map((r) => [r.monthKey, Number(r.cnt)]));
  return trailingMonths().map((month) => ({ month, count: byMonth.get(month) ?? 0 }));
}

export interface AttendanceMonthlyPoint {
  month: string;
  attendancePct: number;
}

export async function getAttendanceMonthlyTrend(organizationId: string): Promise<AttendanceMonthlyPoint[]> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ monthKey: string; attendancePct: number | null }>>(Prisma.sql`
    SELECT
      FORMAT(ats.sessionDate, 'yyyy-MM') AS monthKey,
      SUM(CASE WHEN ar.status IN ('PRESENT', 'REMOTE', 'LATE') THEN 1.0 ELSE 0 END) * 100.0 / COUNT(*) AS attendancePct
    FROM attendance_records ar
    JOIN attendance_sessions ats ON ats.id = ar.attendanceSessionId
    WHERE ar.organizationId = ${organizationId}
      AND ats.status = 'COMPLETED'
      AND ats.sessionDate >= ${windowStart()}
    GROUP BY FORMAT(ats.sessionDate, 'yyyy-MM')
  `);
  const byMonth = new Map(rows.map((r) => [r.monthKey, r.attendancePct ?? 0]));
  return trailingMonths().map((month) => ({ month, attendancePct: byMonth.get(month) ?? 0 }));
}

export interface AssessmentMonthlyPoint {
  month: string;
  graded: number;
}

export async function getAssessmentMonthlyTrend(organizationId: string): Promise<AssessmentMonthlyPoint[]> {
  const db = await getDb();
  const rows = await db.$queryRaw<Array<{ monthKey: string; cnt: number | bigint }>>(Prisma.sql`
    SELECT FORMAT(ar.gradedAt, 'yyyy-MM') AS monthKey, COUNT(*) AS cnt
    FROM assessment_results ar
    WHERE ar.organizationId = ${organizationId}
      AND ar.status = 'GRADED'
      AND ar.deletedAt IS NULL
      AND ar.gradedAt >= ${windowStart()}
    GROUP BY FORMAT(ar.gradedAt, 'yyyy-MM')
  `);
  const byMonth = new Map(rows.map((r) => [r.monthKey, Number(r.cnt)]));
  return trailingMonths().map((month) => ({ month, graded: byMonth.get(month) ?? 0 }));
}
