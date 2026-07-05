import type { AttendanceStatRow } from "@/modules/student-portal/repositories/student-portal.repository";
import type { StudentAttendanceKpis, StudentAttendanceMonthlyPoint } from "@/modules/student-portal/types";

// Statuses that count as "attended" for the headline percentage.
const ATTENDED_STATUSES = new Set(["PRESENT", "LATE", "REMOTE"]);

function pct(attended: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((attended / total) * 1000) / 10; // 1 decimal place
}

/** Aggregate counts for the attendance KPI cards. Pure — testable without a DB. */
export function buildStudentAttendanceKpis(rows: AttendanceStatRow[]): StudentAttendanceKpis {
  let present = 0;
  let absent = 0;
  let justified = 0;
  let unjustifiedAbsent = 0;
  let attended = 0;

  for (const r of rows) {
    // Since Fix H2 an approved justification no longer rewrites the record to
    // EXCUSED — the record keeps its real status. "Justified" is therefore any
    // record carrying an approved justification, plus legacy EXCUSED rows.
    const isJustified = r.status === "EXCUSED" || r.hasApprovedJustification;
    if (r.status === "PRESENT") present++;
    if (r.status === "ABSENT") {
      absent++;
      if (!r.hasApprovedJustification) unjustifiedAbsent++;
    }
    if (isJustified) justified++;
    if (ATTENDED_STATUSES.has(r.status)) attended++;
  }

  return {
    attendancePercentage: rows.length > 0 ? pct(attended, rows.length) : null,
    presentCount: present,
    absentCount: absent,
    justifiedCount: justified,
    // Absences without an approved justification (justified absences excluded).
    unjustifiedCount: unjustifiedAbsent,
  };
}

/** Monthly attendance %, oldest → newest. Pure — testable without a DB. */
export function buildStudentAttendanceTrend(rows: AttendanceStatRow[]): StudentAttendanceMonthlyPoint[] {
  const byMonth = new Map<string, { attended: number; total: number }>();

  for (const r of rows) {
    const d = r.sessionDate;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = byMonth.get(month) ?? { attended: 0, total: 0 };
    bucket.total++;
    if (ATTENDED_STATUSES.has(r.status)) bucket.attended++;
    byMonth.set(month, bucket);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { attended, total }]) => ({ month, attendancePercentage: pct(attended, total) }));
}
