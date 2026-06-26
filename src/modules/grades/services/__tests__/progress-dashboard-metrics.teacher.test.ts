import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// PROGRESS DASHBOARD METRICS — TEACHER SUBJECT-LEVEL SCOPE
//
// The course-progress table (listProgressForDashboard) shows students in the
// teacher's class groups. The subject-level KPIs (passed / failed / low
// attendance / not assessed) count ONLY the teacher's own subjects via
// levelSubject.subjectId — so a co-teacher's subject progress in a shared class
// group never inflates them. Falls back to class-group scope when the teacher
// has no subject signal.
// =============================================================================

const h = vi.hoisted(() => ({
  scpGroupBy: vi.fn(),
  scpCount: vi.fn(),
  scpFindMany: vi.fn(),
  sspGroupBy: vi.fn(),
  sspFindMany: vi.fn(),
  slpFindMany: vi.fn(),
  studentFindMany: vi.fn(),
  courseFindMany: vi.fn(),
  enrollmentFindMany: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({
    studentCourseProgress: { groupBy: h.scpGroupBy, count: h.scpCount, findMany: h.scpFindMany },
    studentSubjectProgress: { groupBy: h.sspGroupBy, findMany: h.sspFindMany },
    studentLevelProgress: { findMany: h.slpFindMany },
    student: { findMany: h.studentFindMany },
    course: { findMany: h.courseFindMany },
    enrollment: { findMany: h.enrollmentFindMany },
  }),
}));

import { listProgressForDashboard, getTeacherProgressKPIs } from "../progress-dashboard-metrics.service";

const ORG = "org-1";
const A = "teacher-A";
const SUBJ_A = "subject-A";

beforeEach(() => {
  vi.clearAllMocks();
  h.scpGroupBy.mockResolvedValue([]);
  h.scpCount.mockResolvedValue(0);
  h.scpFindMany.mockResolvedValue([]);
  h.sspGroupBy.mockResolvedValue([]);
  h.sspFindMany.mockResolvedValue([]);
  h.slpFindMany.mockResolvedValue([]);
  h.studentFindMany.mockResolvedValue([]);
  h.courseFindMany.mockResolvedValue([]);
  h.enrollmentFindMany.mockResolvedValue([]);
});

describe("listProgressForDashboard — student/class-group scope", () => {
  it("restricts the student table to enrollments in the teacher's class groups", async () => {
    await listProgressForDashboard(ORG, { teacherId: A });
    const where = h.scpCount.mock.calls[0][0].where;
    expect(where.enrollment).toEqual({ classGroup: { teacherId: A } });
  });

  it("keeps the teacher scope even when a courseId param is supplied", async () => {
    await listProgressForDashboard(ORG, { teacherId: A, courseId: "course-B" });
    const where = h.scpCount.mock.calls[0][0].where;
    expect(where.courseId).toBe("course-B");
    expect(where.enrollment).toEqual({ classGroup: { teacherId: A } });
  });

  it("applies no teacher filter on the org-wide (ORG_ADMIN) path", async () => {
    await listProgressForDashboard(ORG, {});
    expect(h.scpCount.mock.calls[0][0].where.enrollment).toBeUndefined();
  });
});

describe("getTeacherProgressKPIs — subject-ownership scope", () => {
  it("counts subject progress for MY students AND MY subjects (class group + levelSubject)", async () => {
    await getTeacherProgressKPIs(ORG, A, [SUBJ_A]);

    // Subject-level groupBy requires BOTH class group AND subject ownership.
    expect(h.sspGroupBy.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      enrollment: { classGroup: { teacherId: A } },
      levelSubject: { subjectId: { in: [SUBJ_A] } },
    });
    // FAILED + low-attendance + not-assessed queries all carry that same scope.
    expect(h.sspFindMany.mock.calls[0][0].where).toMatchObject({
      enrollment: { classGroup: { teacherId: A } },
      levelSubject: { subjectId: { in: [SUBJ_A] } },
      status: "FAILED",
    });
    expect(h.sspFindMany.mock.calls[1][0].where.attendancePercentage).toEqual({ not: null, lt: 75 });
    expect(h.sspFindMany.mock.calls[2][0].where).toMatchObject({
      levelSubject: { subjectId: { in: [SUBJ_A] } },
      status: "NOT_STARTED",
    });
    // Student/course-level signals stay class-group scoped.
    expect(h.slpFindMany.mock.calls[0][0].where).toMatchObject({
      status: "BLOCKED",
      enrollment: { classGroup: { teacherId: A } },
    });
  });

  it("FAIL CLOSED: no owned subjects → subject KPIs are 0 and run NO subject query", async () => {
    h.scpGroupBy.mockResolvedValue([{ status: "IN_PROGRESS", _count: { _all: 4 } }]);
    h.slpFindMany.mockResolvedValue([{ studentId: "s1" }]);

    const kpis = await getTeacherProgressKPIs(ORG, A, []);

    expect(h.sspGroupBy).not.toHaveBeenCalled();
    expect(h.sspFindMany).not.toHaveBeenCalled();
    expect(kpis.subjectPassedCount).toBe(0);
    expect(kpis.subjectFailedCount).toBe(0);
    expect(kpis.lowAttendanceCount).toBe(0);
    expect(kpis.noAssessmentCount).toBe(0);
    // Student/course-level KPIs still report (they don't need subject ownership).
    expect(kpis.inProgressCount).toBe(4);
    expect(kpis.blockedCount).toBe(1);
  });

  it("derives counts and a distinct-student intervention union from scoped data", async () => {
    h.scpGroupBy.mockResolvedValue([
      { status: "IN_PROGRESS", _count: { _all: 7 } },
      { status: "RECOVERY_REQUIRED", _count: { _all: 2 } },
    ]);
    h.sspGroupBy.mockResolvedValue([
      { status: "PASSED", _count: { _all: 20 } },
      { status: "FAILED", _count: { _all: 4 } },
    ]);
    h.slpFindMany.mockResolvedValue([{ studentId: "s1" }]); // blocked
    h.sspFindMany
      .mockResolvedValueOnce([{ studentId: "s1" }, { studentId: "s2" }]) // failed
      .mockResolvedValueOnce([{ studentId: "s2" }, { studentId: "s3" }]) // low attendance
      .mockResolvedValueOnce([{ studentId: "s4" }]); // not assessed

    const kpis = await getTeacherProgressKPIs(ORG, A, [SUBJ_A]);

    expect(kpis.inProgressCount).toBe(7);
    expect(kpis.subjectPassedCount).toBe(20);
    expect(kpis.subjectFailedCount).toBe(4);
    expect(kpis.recoveryCount).toBe(2);
    expect(kpis.blockedCount).toBe(1);
    expect(kpis.lowAttendanceCount).toBe(2);
    expect(kpis.noAssessmentCount).toBe(1);
    // union {s1} ∪ {s1,s2} ∪ {s2,s3} = {s1,s2,s3}
    expect(kpis.interventionCount).toBe(3);
  });
});
