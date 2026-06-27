import { describe, it, expect } from "vitest";
import {
  buildStudentAttendanceKpis,
  buildStudentAttendanceTrend,
} from "../services/student-portal-attendance.service";
import type { AttendanceStatRow } from "../repositories/student-portal.repository";

function row(status: string, iso: string): AttendanceStatRow {
  return { status, sessionDate: new Date(iso) };
}

describe("buildStudentAttendanceKpis", () => {
  it("counts present/absent/justified and treats PRESENT+LATE+REMOTE as attended", () => {
    const rows = [
      row("PRESENT", "2026-05-01"),
      row("LATE", "2026-05-02"),
      row("REMOTE", "2026-05-03"),
      row("ABSENT", "2026-05-04"),
      row("EXCUSED", "2026-05-05"),
    ];
    const kpis = buildStudentAttendanceKpis(rows);
    expect(kpis.presentCount).toBe(1);
    expect(kpis.absentCount).toBe(1);
    expect(kpis.justifiedCount).toBe(1); // EXCUSED
    expect(kpis.unjustifiedCount).toBe(1); // ABSENT
    // attended = PRESENT+LATE+REMOTE = 3 of 5 = 60%
    expect(kpis.attendancePercentage).toBe(60);
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
