import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAttendanceSessionFindMany = vi.fn();
const mockAttendanceSessionCount = vi.fn();
const mockAssessmentFindMany = vi.fn();
const mockAssessmentResultGroupBy = vi.fn();
const mockAssessmentResultFindMany = vi.fn();
const mockAssessmentResultCount = vi.fn();
const mockSubjectFindMany = vi.fn();
const mockClassGroupFindMany = vi.fn();
const mockQueryRaw = vi.fn();
const mockStudentLevelProgressFindMany = vi.fn();
const mockStudentCourseProgressFindMany = vi.fn();
const mockStudentSubjectProgressFindMany = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    attendanceSession: {
      findMany: mockAttendanceSessionFindMany,
      count: mockAttendanceSessionCount,
    },
    assessment: { findMany: mockAssessmentFindMany },
    assessmentResult: {
      groupBy: mockAssessmentResultGroupBy,
      findMany: mockAssessmentResultFindMany,
      count: mockAssessmentResultCount,
    },
    subject: { findMany: mockSubjectFindMany },
    classGroup: { findMany: mockClassGroupFindMany },
    studentLevelProgress: { findMany: mockStudentLevelProgressFindMany },
    studentCourseProgress: { findMany: mockStudentCourseProgressFindMany },
    studentSubjectProgress: { findMany: mockStudentSubjectProgressFindMany },
    $queryRaw: mockQueryRaw,
  }),
}));

const { mockFindUpcomingEventsByOrganization } = vi.hoisted(() => ({
  mockFindUpcomingEventsByOrganization: vi.fn(),
}));
vi.mock("@/modules/academic-calendar/repositories/academic-event.repository", () => ({
  findUpcomingEventsByOrganization: mockFindUpcomingEventsByOrganization,
}));

import {
  findTeacherTodaySessions,
  countTeacherAttendancePending,
  countTeacherPendingGradingResults,
  findTeacherAttendancePendingRows,
  findTeacherAssessmentsToGradeRows,
  findTeacherResultsToPublishRows,
  findTeacherClassGroupAttendanceRates,
  findTeacherRiskRows,
  findTeacherUpcomingDeadlines,
} from "../repositories/teacher-portal.repository";

const ORG = "org-1";
const TEACHER = "teacher-1";

beforeEach(() => vi.clearAllMocks());

describe("findTeacherTodaySessions", () => {
  it("scopes the query by teacherId + organizationId and orders by startTime", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    await findTeacherTodaySessions(TEACHER, ORG, new Date("2026-06-25T10:00:00"));

    const call = mockAttendanceSessionFindMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
    expect(call.orderBy).toEqual({ startTime: "asc" });
  });

  it("bounds the query to the given calendar day", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    await findTeacherTodaySessions(TEACHER, ORG, new Date("2026-06-25T10:00:00"));

    const where = mockAttendanceSessionFindMany.mock.calls[0][0].where;
    expect(where.sessionDate.gte.toDateString()).toBe(new Date("2026-06-25T00:00:00").toDateString());
    expect(where.sessionDate.lte.toDateString()).toBe(new Date("2026-06-25T23:59:59").toDateString());
  });

  it("maps a session with no classroom to classroomName: null", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([
      {
        id: "s1",
        startTime: "09:00",
        endTime: "10:00",
        status: "OPEN",
        classGroup: { id: "cg1", name: "Turma A" },
        subject: { name: "Código da Estrada" },
        classroom: null,
      },
    ]);

    const result = await findTeacherTodaySessions(TEACHER, ORG);
    expect(result[0]).toMatchObject({ classGroupId: "cg1", classGroupName: "Turma A", classroomName: null });
  });
});

describe("countTeacherAttendancePending / findTeacherAttendancePendingRows", () => {
  it("scopes by teacherId, restricts to OPEN/COMPLETED sessions with zero active records", async () => {
    mockAttendanceSessionCount.mockResolvedValue(3);
    await countTeacherAttendancePending(TEACHER, ORG);

    const where = mockAttendanceSessionCount.mock.calls[0][0].where;
    expect(where).toMatchObject({
      teacherId: TEACHER,
      organizationId: ORG,
      status: { in: ["OPEN", "COMPLETED"] },
    });
    expect(where.records).toEqual({ none: { deletedAt: null } });
  });

  it("applies a top-N limit on the display rows", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    await findTeacherAttendancePendingRows(TEACHER, ORG, 5);
    expect(mockAttendanceSessionFindMany.mock.calls[0][0].take).toBe(5);
  });

  it("derives missingCount from the class group's currentCount (zero records recorded so far)", async () => {
    mockAttendanceSessionFindMany.mockResolvedValue([
      {
        id: "s1",
        sessionDate: new Date("2026-06-20"),
        startTime: "09:00",
        classGroup: { id: "cg1", name: "Turma A", currentCount: 12 },
        subject: { name: "Código da Estrada" },
      },
    ]);

    const rows = await findTeacherAttendancePendingRows(TEACHER, ORG);
    expect(rows[0].missingCount).toBe(12);
  });
});

describe("countTeacherPendingGradingResults", () => {
  it("matches the Pending Work tab's definition: PENDING/SUBMITTED results on OPEN assessments only", async () => {
    mockAssessmentResultCount.mockResolvedValue(7);
    await countTeacherPendingGradingResults(TEACHER, ORG);

    const where = mockAssessmentResultCount.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, status: { in: ["PENDING", "SUBMITTED"] } });
    expect(where.assessment).toEqual({ teacherId: TEACHER, status: "OPEN", deletedAt: null });
  });
});

describe("findTeacherAssessmentsToGradeRows", () => {
  it("scopes by teacherId, status OPEN, and only assessments with PENDING/SUBMITTED results", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findTeacherAssessmentsToGradeRows(TEACHER, ORG);

    const where = mockAssessmentFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ teacherId: TEACHER, organizationId: ORG, status: "OPEN" });
    expect(where.results.some.status.in).toEqual(["PENDING", "SUBMITTED"]);
  });

  it("applies a top-N limit", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findTeacherAssessmentsToGradeRows(TEACHER, ORG, 7);
    expect(mockAssessmentFindMany.mock.calls[0][0].take).toBe(7);
  });

  it("resolves subject names via a separate lookup (Assessment has no Subject relation) and computes per-status counts", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      {
        id: "a1",
        title: "Teste 1",
        assessmentDate: new Date("2026-07-01"),
        subjectId: "subj-1",
        classGroup: { name: "Turma A" },
      },
    ]);
    mockAssessmentResultGroupBy.mockResolvedValue([
      { assessmentId: "a1", status: "SUBMITTED", _count: { _all: 3 } },
      { assessmentId: "a1", status: "PENDING", _count: { _all: 2 } },
    ]);
    mockSubjectFindMany.mockResolvedValue([{ id: "subj-1", name: "Código da Estrada" }]);

    const rows = await findTeacherAssessmentsToGradeRows(TEACHER, ORG);

    expect(rows[0]).toMatchObject({
      assessmentId: "a1",
      subjectName: "Código da Estrada",
      submittedCount: 3,
      pendingCount: 2,
    });
  });

  it("scopes the subject-name lookup by organizationId (tenant-bound on its own, not only via caller-derived ids)", async () => {
    mockAssessmentFindMany.mockResolvedValue([
      { id: "a1", title: "Teste 1", assessmentDate: new Date("2026-07-01"), subjectId: "subj-1", classGroup: { name: "Turma A" } },
    ]);
    mockAssessmentResultGroupBy.mockResolvedValue([]);
    mockSubjectFindMany.mockResolvedValue([{ id: "subj-1", name: "Código da Estrada" }]);

    await findTeacherAssessmentsToGradeRows(TEACHER, ORG);

    expect(mockSubjectFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
  });

  it("short-circuits without querying results/subjects when there are no matching assessments", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findTeacherAssessmentsToGradeRows(TEACHER, ORG);
    expect(mockAssessmentResultGroupBy).not.toHaveBeenCalled();
    expect(mockSubjectFindMany).not.toHaveBeenCalled();
  });
});

describe("findTeacherResultsToPublishRows", () => {
  it("scopes by teacherId, status GRADED, and publication READY", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockSubjectFindMany.mockResolvedValue([]);
    await findTeacherResultsToPublishRows(TEACHER, ORG);

    const where = mockAssessmentFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ teacherId: TEACHER, organizationId: ORG, status: "GRADED" });
    expect(where.publication).toEqual({ publicationStatus: "READY" });
  });
});

describe("findTeacherClassGroupAttendanceRates", () => {
  it("scopes the raw aggregate query to this teacher's class groups", async () => {
    mockQueryRaw.mockResolvedValue([{ classGroupId: "cg1", avgPct: 87.45 }]);
    const result = await findTeacherClassGroupAttendanceRates(TEACHER, ORG);
    expect(result.get("cg1")).toBe(87.5);
  });

  it("excludes class groups with no attendance data yet", async () => {
    mockQueryRaw.mockResolvedValue([{ classGroupId: "cg1", avgPct: null }]);
    const result = await findTeacherClassGroupAttendanceRates(TEACHER, ORG);
    expect(result.has("cg1")).toBe(false);
  });

  it("passes organizationId and teacherId as the raw SQL's interpolated parameters (tenant + teacher scoping)", async () => {
    mockQueryRaw.mockResolvedValue([]);
    await findTeacherClassGroupAttendanceRates(TEACHER, ORG);

    // Prisma.sql tagged templates expose interpolated values via `.values`,
    // in source order — WHERE ssp.organizationId = ${organizationId} AND
    // cg.teacherId = ${teacherId} — so a regression that drops either
    // binding (e.g. hardcoding/forgetting a WHERE clause) fails this test.
    const sqlArg = mockQueryRaw.mock.calls[0][0];
    expect(sqlArg.values).toEqual([ORG, TEACHER]);
  });
});

describe("findTeacherRiskRows", () => {
  it("returns an empty list without querying the database when the teacher has no active class groups", async () => {
    const result = await findTeacherRiskRows(TEACHER, ORG, []);
    expect(result).toEqual([]);
    expect(mockStudentLevelProgressFindMany).not.toHaveBeenCalled();
  });

  it("scopes every academic-risk query to the teacher's active class groups via enrollment.classGroupId", async () => {
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);

    await findTeacherRiskRows(TEACHER, ORG, ["cg1", "cg2"]);

    for (const call of mockStudentLevelProgressFindMany.mock.calls) {
      expect(call[0].where.enrollment).toEqual({ classGroupId: { in: ["cg1", "cg2"] } });
    }
    for (const call of mockStudentSubjectProgressFindMany.mock.calls) {
      expect(call[0].where.enrollment).toEqual({ classGroupId: { in: ["cg1", "cg2"] } });
    }
  });

  it("caps every risk source query with a DB-level `take` — never loads an unbounded result set", async () => {
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);

    await findTeacherRiskRows(TEACHER, ORG, ["cg1"]);

    expect(mockStudentLevelProgressFindMany).toHaveBeenCalledTimes(2);
    for (const call of mockStudentLevelProgressFindMany.mock.calls) {
      expect(call[0].take).toBe(200);
    }
    expect(mockStudentCourseProgressFindMany.mock.calls[0][0].take).toBe(200);
    for (const call of mockStudentSubjectProgressFindMany.mock.calls) {
      expect(call[0].take).toBe(200);
    }
    expect(mockAssessmentResultFindMany.mock.calls[0][0].take).toBe(200);
  });

  it("never touches finance models (invoice/payment/wallet) — none are present on the mocked db", async () => {
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);

    await expect(findTeacherRiskRows(TEACHER, ORG, ["cg1"])).resolves.not.toThrow();
  });

  it("maps BLOCKED progress to CRITICAL severity", async () => {
    mockStudentLevelProgressFindMany
      .mockResolvedValueOnce([
        {
          studentId: "s1",
          progressReason: "Reprovado 2x",
          student: { firstName: "Ana", lastName: "Silva" },
          enrollment: { classGroup: { name: "Turma A" } },
        },
      ])
      .mockResolvedValueOnce([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);

    const rows = await findTeacherRiskRows(TEACHER, ORG, ["cg1"]);
    expect(rows).toEqual([
      expect.objectContaining({ studentId: "s1", riskType: "BLOCKED", severity: "CRITICAL" }),
    ]);
  });

  it("splits low attendance into HIGH (below required) vs MEDIUM (declining trend)", async () => {
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    // First call is the FAILED-subject query, second is the low-attendance query — see
    // findTeacherRiskRows' Promise.all order.
    mockStudentSubjectProgressFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        studentId: "s1",
        attendancePercentage: 70,
        student: { firstName: "Ana", lastName: "Silva" },
        enrollment: { classGroup: { name: "Turma A" } },
      },
      {
        studentId: "s2",
        attendancePercentage: 80,
        student: { firstName: "Bruno", lastName: "Costa" },
        enrollment: { classGroup: { name: "Turma A" } },
      },
    ]);
    mockAssessmentResultFindMany.mockResolvedValue([]);

    const rows = await findTeacherRiskRows(TEACHER, ORG, ["cg1"]);
    expect(rows.find((r) => r.studentId === "s1")).toMatchObject({ riskType: "LOW_ATTENDANCE", severity: "HIGH" });
    expect(rows.find((r) => r.studentId === "s2")).toMatchObject({ riskType: "ATTENDANCE_TREND", severity: "MEDIUM" });
  });

  it("scopes missing-assessment risk via assessment.teacherId, not the active class group list", async () => {
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([
      {
        studentId: "s3",
        student: { firstName: "Carla", lastName: "Mendes" },
        assessment: { classGroup: { name: "Turma B" } },
      },
    ]);

    const rows = await findTeacherRiskRows(TEACHER, ORG, ["cg1"]);
    expect(mockAssessmentResultFindMany.mock.calls[0][0].where.assessment).toEqual({ teacherId: TEACHER, deletedAt: null });
    expect(rows).toEqual([
      expect.objectContaining({ studentId: "s3", riskType: "MISSING_ASSESSMENTS", severity: "MEDIUM" }),
    ]);
  });

  it("sorts rows by severity, CRITICAL first", async () => {
    mockStudentLevelProgressFindMany
      .mockResolvedValueOnce([
        {
          studentId: "s1",
          progressReason: null,
          student: { firstName: "Ana", lastName: "Silva" },
          enrollment: { classGroup: { name: "Turma A" } },
        },
      ])
      .mockResolvedValueOnce([
        {
          studentId: "s2",
          student: { firstName: "Bruno", lastName: "Costa" },
          enrollment: { classGroup: { name: "Turma A" } },
        },
      ]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([
      {
        studentId: "s3",
        student: { firstName: "Carla", lastName: "Mendes" },
        assessment: { classGroup: { name: "Turma B" } },
      },
    ]);

    const rows = await findTeacherRiskRows(TEACHER, ORG, ["cg1"]);
    expect(rows[0].severity).toBe("CRITICAL");
    expect(rows[rows.length - 1].severity).toBe("MEDIUM");
  });
});

describe("findTeacherUpcomingDeadlines", () => {
  it("scopes assessment and class-group-end deadlines to this teacher", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockClassGroupFindMany.mockResolvedValue([]);
    mockFindUpcomingEventsByOrganization.mockResolvedValue([]);

    await findTeacherUpcomingDeadlines(TEACHER, ORG);

    expect(mockAssessmentFindMany.mock.calls[0][0].where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
    expect(mockClassGroupFindMany.mock.calls[0][0].where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
  });

  it("excludes an academic event that already started, even if it hasn't ended yet", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockClassGroupFindMany.mockResolvedValue([]);
    mockFindUpcomingEventsByOrganization.mockResolvedValue([
      // findUpcomingEventsByOrganization only enforces endDate >= now, so an
      // in-progress multi-day event (started yesterday) can be returned —
      // it must not show up as an "upcoming" deadline here.
      { id: "in-progress", title: "Evento em curso", startDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    ]);

    const deadlines = await findTeacherUpcomingDeadlines(TEACHER, ORG);
    expect(deadlines).toEqual([]);
  });

  it("requests a larger candidate batch than the per-type display limit, so in-progress events don't crowd a real future event out of the underlying take()", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockClassGroupFindMany.mockResolvedValue([]);
    await findTeacherUpcomingDeadlines(TEACHER, ORG);
    // findUpcomingEventsByOrganization sorts by startDate ASC and only filters
    // endDate >= now — if we only ever requested 10, 10 in-progress events
    // (earlier startDate than any future one) would fill the whole window and
    // a genuinely future event 11th-in-line would never even be fetched.
    expect(mockFindUpcomingEventsByOrganization.mock.calls[0][1]).toBeGreaterThan(10);
  });

  it("still surfaces a genuinely future event even when many in-progress events sort ahead of it in the upstream result", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    mockClassGroupFindMany.mockResolvedValue([]);
    const inProgressEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `in-progress-${i}`,
      title: "Evento em curso",
      startDate: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
    }));
    const futureEvent = { id: "future-1", title: "Reunião de Pais", startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) };
    // Mirrors the real upstream ordering: startDate ASC, so all 10
    // already-started events sort before the one genuinely future event.
    mockFindUpcomingEventsByOrganization.mockResolvedValue([...inProgressEvents, futureEvent]);

    const deadlines = await findTeacherUpcomingDeadlines(TEACHER, ORG);
    expect(deadlines.map((d) => d.id)).toEqual(["future-1"]);
  });

  it("returns deadlines sorted by date ascending across all three sources", async () => {
    // Dates are relative to `now` (not absolute) so the test doesn't rot: the
    // repository only surfaces UPCOMING (future) deadlines, so hard-coded calendar
    // dates would silently be filtered out once the wall clock passes them.
    const DAY = 24 * 60 * 60 * 1000;
    mockAssessmentFindMany.mockResolvedValue([
      { id: "a1", title: "Teste Final", assessmentDate: new Date(Date.now() + 5 * DAY) },
    ]);
    mockClassGroupFindMany.mockResolvedValue([
      { id: "cg1", name: "Turma A", endDate: new Date(Date.now() + 2 * DAY) },
    ]);
    mockFindUpcomingEventsByOrganization.mockResolvedValue([
      { id: "e1", title: "Reunião", startDate: new Date(Date.now() + 1 * DAY) },
    ]);

    const deadlines = await findTeacherUpcomingDeadlines(TEACHER, ORG);
    expect(deadlines.map((d) => d.id)).toEqual(["e1", "cg1", "a1"]);
  });
});

// ── Cross-teacher isolation — Teacher A must never see Teacher B's data ───────
// Every Portal query is bound to the resolved teacherId (directly, via
// assessment.teacherId, or via the teacher's own activeClassGroupIds). These
// tests assert that binding is Teacher A's id — a row belonging to Teacher B
// (teacherId=B / a class group not in A's list) can never satisfy the WHERE.
describe("cross-teacher isolation (teacher A cannot see teacher B's data)", () => {
  const A = "teacher-A";
  const B = "teacher-B";

  beforeEach(() => {
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    mockAttendanceSessionCount.mockResolvedValue(0);
    mockAssessmentFindMany.mockResolvedValue([]);
    mockAssessmentResultCount.mockResolvedValue(0);
    mockStudentLevelProgressFindMany.mockResolvedValue([]);
    mockStudentCourseProgressFindMany.mockResolvedValue([]);
    mockStudentSubjectProgressFindMany.mockResolvedValue([]);
    mockAssessmentResultFindMany.mockResolvedValue([]);
  });

  it("A's today schedule / attendance sessions are bound to teacherId=A, never B", async () => {
    await findTeacherTodaySessions(A, ORG);
    const where = mockAttendanceSessionFindMany.mock.calls[0][0].where;
    expect(where.teacherId).toBe(A);
    expect(where.teacherId).not.toBe(B);
    expect(where.organizationId).toBe(ORG);
  });

  it("A's pending attendance is bound to teacherId=A", async () => {
    await countTeacherAttendancePending(A, ORG);
    expect(mockAttendanceSessionCount.mock.calls[0][0].where.teacherId).toBe(A);
  });

  it("A's pending assessments are bound to teacherId=A", async () => {
    await findTeacherAssessmentsToGradeRows(A, ORG);
    expect(mockAssessmentFindMany.mock.calls[0][0].where.teacherId).toBe(A);
  });

  it("A's pending-grading KPI count is bound to assessment.teacherId=A", async () => {
    await countTeacherPendingGradingResults(A, ORG);
    expect(mockAssessmentResultCount.mock.calls[0][0].where.assessment.teacherId).toBe(A);
  });

  it("A's risk students are scoped to A's own active class groups (B's group id is never queried)", async () => {
    const aGroups = ["cg-A1", "cg-A2"];
    await findTeacherRiskRows(A, ORG, aGroups);
    for (const call of [
      ...mockStudentLevelProgressFindMany.mock.calls,
      ...mockStudentCourseProgressFindMany.mock.calls,
      ...mockStudentSubjectProgressFindMany.mock.calls,
    ]) {
      expect(call[0].where.enrollment.classGroupId.in).toEqual(aGroups);
      expect(call[0].where.enrollment.classGroupId.in).not.toContain("cg-B1");
    }
    // missing-assessment risk is bound via assessment.teacherId instead
    expect(mockAssessmentResultFindMany.mock.calls[0][0].where.assessment.teacherId).toBe(A);
  });

  it("A's class-group-end deadlines are bound to teacherId=A", async () => {
    mockClassGroupFindMany.mockResolvedValue([]);
    mockFindUpcomingEventsByOrganization.mockResolvedValue([]);
    await findTeacherUpcomingDeadlines(A, ORG);
    expect(mockClassGroupFindMany.mock.calls[0][0].where.teacherId).toBe(A);
  });
});
