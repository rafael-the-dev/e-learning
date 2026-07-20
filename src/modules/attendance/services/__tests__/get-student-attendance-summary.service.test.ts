import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ findPeriodAttendanceSummariesByStudent: vi.fn() }));

vi.mock("@/modules/attendance/repositories/student-period-attendance-summary.repository", () => ({
  findPeriodAttendanceSummariesByStudent: h.findPeriodAttendanceSummariesByStudent,
}));

import { getStudentAttendanceSummary } from "../attendance-read-model.service";
import type { StudentPeriodAttendanceSummary } from "@/modules/attendance/types";

const ORG = "org-1";
const STUDENT = "stu-1";

function rollup(over: Partial<StudentPeriodAttendanceSummary> = {}): StudentPeriodAttendanceSummary {
  return {
    id: "p-1",
    organizationId: ORG,
    academicYearId: "y-1",
    academicTermId: null, // year rollup by default
    enrollmentId: "enr-1",
    studentId: STUDENT,
    courseId: "c-1",
    courseLevelId: "l-1",
    classGroupId: "cg-1",
    totalSessions: 0,
    presentCount: 0,
    absentCount: 0,
    lateCount: 0,
    excusedCount: 0,
    remoteCount: 0,
    totalScheduledMinutes: 0,
    totalPresentMinutes: 0,
    attendancePercentage: null,
    status: "GOOD",
    calculatedAt: null,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getStudentAttendanceSummary (canonical, H5)", () => {
  it("derives the overall % as the POOLED minute ratio, not a mean of per-row percentages", async () => {
    // Row A: 540/600 = 90%. Row B: 60/400 = 15%. Mean-of-% would be 52.5; pooled is
    // 600/1000 = 60%. The canonical value must be the pooled 60.
    h.findPeriodAttendanceSummariesByStudent.mockResolvedValue([
      rollup({ totalScheduledMinutes: 600, totalPresentMinutes: 540, attendancePercentage: 90, totalSessions: 10, presentCount: 9, absentCount: 1 }),
      rollup({ id: "p-2", enrollmentId: "enr-2", totalScheduledMinutes: 400, totalPresentMinutes: 60, attendancePercentage: 15, totalSessions: 8, presentCount: 1, absentCount: 7 }),
    ]);

    const s = await getStudentAttendanceSummary(STUDENT, ORG);
    expect(s.attendancePercentage).toBe(60);
    expect(s.totalSessions).toBe(18);
    expect(s.presentCount).toBe(10);
    expect(s.absentCount).toBe(8);
    expect(s.attendedSessions).toBe(10); // present + late + remote
  });

  it("counts late and remote as attended sessions", async () => {
    h.findPeriodAttendanceSummariesByStudent.mockResolvedValue([
      rollup({ totalScheduledMinutes: 100, totalPresentMinutes: 80, presentCount: 6, lateCount: 2, remoteCount: 1, absentCount: 1, totalSessions: 10 }),
    ]);
    const s = await getStudentAttendanceSummary(STUDENT, ORG);
    expect(s.attendedSessions).toBe(9); // 6 + 2 + 1
  });

  it("ignores term rollups (academicTermId != null); only year rollups are summed", async () => {
    h.findPeriodAttendanceSummariesByStudent.mockResolvedValue([
      rollup({ academicTermId: null, totalScheduledMinutes: 200, totalPresentMinutes: 180, totalSessions: 4 }),
      rollup({ id: "p-term", academicTermId: "term-1", totalScheduledMinutes: 999, totalPresentMinutes: 0, totalSessions: 99 }),
    ]);
    const s = await getStudentAttendanceSummary(STUDENT, ORG);
    expect(s.attendancePercentage).toBe(90); // 180/200, term row ignored
    expect(s.totalSessions).toBe(4);
  });

  it("returns null (never 0) when there are no scheduled minutes", async () => {
    h.findPeriodAttendanceSummariesByStudent.mockResolvedValue([
      rollup({ totalScheduledMinutes: 0, totalPresentMinutes: 0, totalSessions: 0 }),
    ]);
    const s = await getStudentAttendanceSummary(STUDENT, ORG);
    expect(s.attendancePercentage).toBeNull();
  });

  it("empty case: no rollups → percentage null, counts zero", async () => {
    h.findPeriodAttendanceSummariesByStudent.mockResolvedValue([]);
    const s = await getStudentAttendanceSummary(STUDENT, ORG);
    expect(s.attendancePercentage).toBeNull();
    expect(s.totalSessions).toBe(0);
    expect(s.attendedSessions).toBe(0);
  });
});
