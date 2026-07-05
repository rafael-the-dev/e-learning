import { describe, it, expect } from "vitest";
import {
  buildStudentAttendanceKpis,
  buildStudentAttendanceTrend,
} from "../services/student-portal-attendance.service";
import type { AttendanceStatRow } from "../repositories/student-portal.repository";

function row(status: string, iso: string, hasApprovedJustification = false): AttendanceStatRow {
  return { status, sessionDate: new Date(iso), hasApprovedJustification };
}

describe("buildStudentAttendanceKpis", () => {
  it("counts present/absent/justified and treats PRESENT+LATE+REMOTE as attended", () => {
    const rows = [
      row("PRESENT", "2026-05-01"),
      row("LATE", "2026-05-02"),
      row("REMOTE", "2026-05-03"),
      row("ABSENT", "2026-05-04"),
      row("EXCUSED", "2026-05-05"), // legacy excused primary status
    ];
    const kpis = buildStudentAttendanceKpis(rows);
    expect(kpis.presentCount).toBe(1);
    expect(kpis.absentCount).toBe(1);
    expect(kpis.justifiedCount).toBe(1); // legacy EXCUSED
    expect(kpis.unjustifiedCount).toBe(1); // ABSENT without a justification
    // attended = PRESENT+LATE+REMOTE = 3 of 5 = 60%
    expect(kpis.attendancePercentage).toBe(60);
  });

  it("counts an ABSENT with an approved justification as justified, not unjustified (Fix H2)", () => {
    const rows = [
      row("PRESENT", "2026-05-01"),
      row("ABSENT", "2026-05-02", true), // justified absence — record stays ABSENT
      row("ABSENT", "2026-05-03", false), // unjustified absence
    ];
    const kpis = buildStudentAttendanceKpis(rows);
    expect(kpis.absentCount).toBe(2); // both are absences
    expect(kpis.justifiedCount).toBe(1); // the one with an approved justification
    expect(kpis.unjustifiedCount).toBe(1); // only the unjustified absence
  });

  it("counts a justified LATE as justified while remaining attended", () => {
    const rows = [
      row("LATE", "2026-05-02", true), // justified lateness — still attended
    ];
    const kpis = buildStudentAttendanceKpis(rows);
    expect(kpis.justifiedCount).toBe(1);
    expect(kpis.unjustifiedCount).toBe(0);
    expect(kpis.attendancePercentage).toBe(100); // LATE is attended
  });

  it("returns null percentage when there are no records", () => {
    expect(buildStudentAttendanceKpis([]).attendancePercentage).toBeNull();
  });
});

describe("buildStudentAttendanceTrend", () => {
  it("aggregates attendance % per calendar month, oldest first", () => {
    const rows = [
      row("PRESENT", "2026-04-10"),
      row("ABSENT", "2026-04-20"),
      row("PRESENT", "2026-05-01"),
      row("PRESENT", "2026-05-02"),
    ];
    const trend = buildStudentAttendanceTrend(rows);
    expect(trend).toEqual([
      { month: "2026-04", attendancePercentage: 50 },
      { month: "2026-05", attendancePercentage: 100 },
    ]);
  });

  it("returns an empty trend for no records", () => {
    expect(buildStudentAttendanceTrend([])).toEqual([]);
  });
});
