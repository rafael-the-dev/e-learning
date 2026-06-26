import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTeacherSubjectCount = vi.fn();
const mockTeacherSubjectFindMany = vi.fn();
const mockClassGroupCount = vi.fn();
const mockClassGroupFindMany = vi.fn();
const mockAssessmentFindMany = vi.fn();
const mockAssessmentGroupBy = vi.fn();
const mockAssessmentCount = vi.fn();
const mockAssessmentResultCount = vi.fn();
const mockAssessmentPublicationCount = vi.fn();
const mockAssessmentPublicationFindMany = vi.fn();
const mockStudentSubjectProgressGroupBy = vi.fn();
const mockStudentSubjectProgressAggregate = vi.fn();
const mockEnrollmentFindMany = vi.fn();
const mockClassGroupScheduleFindMany = vi.fn();
const mockLevelSubjectFindMany = vi.fn();
const mockTeacherFindFirst = vi.fn();
const mockAttendanceSessionFindMany = vi.fn();
const mockAttendanceSessionCount = vi.fn();
const mockAttendanceRecordGroupBy = vi.fn();
const mockTeacherDocumentFindMany = vi.fn();
const mockTeacherDocumentCount = vi.fn();

vi.mock("@/server/db", () => ({
  getDb: async () => ({
    teacherSubject: {
      count: mockTeacherSubjectCount,
      findMany: mockTeacherSubjectFindMany,
    },
    classGroup: {
      count: mockClassGroupCount,
      findMany: mockClassGroupFindMany,
    },
    assessment: {
      findMany: mockAssessmentFindMany,
      groupBy: mockAssessmentGroupBy,
      count: mockAssessmentCount,
    },
    assessmentResult: { count: mockAssessmentResultCount },
    assessmentPublication: {
      count: mockAssessmentPublicationCount,
      findMany: mockAssessmentPublicationFindMany,
    },
    studentSubjectProgress: {
      groupBy: mockStudentSubjectProgressGroupBy,
      aggregate: mockStudentSubjectProgressAggregate,
    },
    enrollment: { findMany: mockEnrollmentFindMany },
    classGroupSchedule: { findMany: mockClassGroupScheduleFindMany },
    levelSubject: { findMany: mockLevelSubjectFindMany },
    teacher: { findFirst: mockTeacherFindFirst },
    attendanceSession: {
      findMany: mockAttendanceSessionFindMany,
      count: mockAttendanceSessionCount,
    },
    attendanceRecord: { groupBy: mockAttendanceRecordGroupBy },
    teacherDocument: {
      findMany: mockTeacherDocumentFindMany,
      count: mockTeacherDocumentCount,
    },
  }),
}));

const { mockGetAttendanceSessionsByOrganization } = vi.hoisted(() => ({
  mockGetAttendanceSessionsByOrganization: vi.fn(),
}));
vi.mock("@/modules/attendance/services/attendance.service", () => ({
  getAttendanceSessionsByOrganization: mockGetAttendanceSessionsByOrganization,
}));

import {
  findTeacherCoreCounts,
  findTaughtLevelSubjectIds,
  findTeacherQualityRaw,
  findTeacherWorkloadMetrics,
  findTeacherAssessmentMetrics,
  findTeacherScheduleRows,
  findTeacherSubjectsTabRows,
  findTeacherTimelineFeed,
  findTeacherAttendanceSessionRows,
} from "../repositories/teacher-360.repository";

const ORG = "org-1";
const TEACHER = "teacher-1";

beforeEach(() => vi.clearAllMocks());

describe("findTeacherCoreCounts", () => {
  it("scopes every count by both teacherId and organizationId", async () => {
    mockTeacherSubjectCount.mockResolvedValue(2);
    mockClassGroupCount.mockResolvedValue(3);

    await findTeacherCoreCounts(TEACHER, ORG);

    expect(mockTeacherSubjectCount.mock.calls[0][0].where).toEqual({ teacherId: TEACHER });
    for (const call of mockClassGroupCount.mock.calls) {
      expect(call[0].where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
    }
  });

  it("returns the resolved counts", async () => {
    mockTeacherSubjectCount.mockResolvedValue(4);
    mockClassGroupCount.mockResolvedValueOnce(10).mockResolvedValueOnce(6);

    const result = await findTeacherCoreCounts(TEACHER, ORG);

    expect(result).toEqual({ subjectCount: 4, totalClassGroupCount: 10, activeClassGroupCount: 6 });
  });
});

describe("findTaughtLevelSubjectIds", () => {
  it("scopes the query by teacherId and organizationId, never trusting teacherId alone", async () => {
    mockAssessmentFindMany.mockResolvedValue([]);
    await findTaughtLevelSubjectIds(TEACHER, ORG);
    expect(mockAssessmentFindMany.mock.calls[0][0].where).toMatchObject({
      teacherId: TEACHER,
      organizationId: ORG,
      deletedAt: null,
    });
  });

  it("returns distinct levelSubjectIds", async () => {
    mockAssessmentFindMany.mockResolvedValue([{ levelSubjectId: "ls-1" }, { levelSubjectId: "ls-2" }]);
    const result = await findTaughtLevelSubjectIds(TEACHER, ORG);
    expect(result).toEqual(["ls-1", "ls-2"]);
  });
});

describe("findTeacherQualityRaw", () => {
  it("short-circuits without querying when there are no taught level subjects", async () => {
    const result = await findTeacherQualityRaw([], ORG);
    expect(result).toEqual({ passedCount: 0, failedCount: 0, avgAttendance: null, avgFinalGrade: null });
    expect(mockStudentSubjectProgressGroupBy).not.toHaveBeenCalled();
  });

  it("maps PASSED/FAILED counts and averages from the aggregate query", async () => {
    mockStudentSubjectProgressGroupBy.mockResolvedValue([
      { status: "PASSED", _count: { _all: 8 } },
      { status: "FAILED", _count: { _all: 2 } },
    ]);
    mockStudentSubjectProgressAggregate.mockResolvedValue({
      _avg: { attendancePercentage: 87.5, finalGrade: 14.2 },
    });

    const result = await findTeacherQualityRaw(["ls-1"], ORG);

    expect(result).toEqual({ passedCount: 8, failedCount: 2, avgAttendance: 87.5, avgFinalGrade: 14.2 });
  });

  it("scopes both queries by the taught levelSubjectIds and organizationId", async () => {
    mockStudentSubjectProgressGroupBy.mockResolvedValue([]);
    mockStudentSubjectProgressAggregate.mockResolvedValue({ _avg: { attendancePercentage: null, finalGrade: null } });

    await findTeacherQualityRaw(["ls-1", "ls-2"], ORG);

    expect(mockStudentSubjectProgressGroupBy.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      levelSubjectId: { in: ["ls-1", "ls-2"] },
    });
    expect(mockStudentSubjectProgressAggregate.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      levelSubjectId: { in: ["ls-1", "ls-2"] },
    });
  });
});

describe("findTeacherWorkloadMetrics", () => {
  it("returns zeros without further queries when the teacher has no active class groups", async () => {
    mockClassGroupFindMany.mockResolvedValue([]);
    const result = await findTeacherWorkloadMetrics(TEACHER, ORG);
    expect(result).toEqual({
      activeClassGroupIds: [],
      distinctActiveStudentCount: 0,
      weeklyHours: 0,
      avgOccupancyPercent: 0,
    });
    expect(mockEnrollmentFindMany).not.toHaveBeenCalled();
  });

  it("sums weekly schedule slot durations into hours", async () => {
    mockClassGroupFindMany.mockResolvedValue([{ id: "cg-1", capacity: 30, currentCount: 10 }]);
    mockEnrollmentFindMany.mockResolvedValue([{ studentId: "s-1" }, { studentId: "s-2" }]);
    mockClassGroupScheduleFindMany.mockResolvedValue([
      { scheduleSlot: { startTime: "08:00", endTime: "10:00" } }, // 2h
      { scheduleSlot: { startTime: "14:00", endTime: "15:30" } }, // 1.5h
    ]);

    const result = await findTeacherWorkloadMetrics(TEACHER, ORG);

    expect(result.distinctActiveStudentCount).toBe(2);
    expect(result.weeklyHours).toBe(3.5);
  });

  it("computes occupancy as SUM(currentCount)/SUM(capacity) across ALL active groups, not an average of per-group ratios", async () => {
    // A naive average-of-ratios would give (100% + 10%) / 2 = 55%. The
    // SUM/SUM aggregate gives a different, correct figure — proves the right
    // formula is used, and proves it doesn't depend on how many groups a
    // paginated UI happens to display at once.
    mockClassGroupFindMany.mockResolvedValue([
      { id: "cg-1", capacity: 10, currentCount: 10 }, // 100%
      { id: "cg-2", capacity: 90, currentCount: 9 }, // 10%
    ]);
    mockEnrollmentFindMany.mockResolvedValue([]);
    mockClassGroupScheduleFindMany.mockResolvedValue([]);

    const result = await findTeacherWorkloadMetrics(TEACHER, ORG);

    // SUM(currentCount)=19, SUM(capacity)=100 -> 19%
    expect(result.avgOccupancyPercent).toBe(19);
  });

  it("includes ALL active groups in the occupancy aggregate regardless of how many there are — never page-limited", async () => {
    const groups = Array.from({ length: 15 }, (_, i) => ({
      id: `cg-${i}`,
      capacity: 10,
      currentCount: 5,
    }));
    mockClassGroupFindMany.mockResolvedValue(groups);
    mockEnrollmentFindMany.mockResolvedValue([]);
    mockClassGroupScheduleFindMany.mockResolvedValue([]);

    const result = await findTeacherWorkloadMetrics(TEACHER, ORG);

    // SUM(currentCount)=75, SUM(capacity)=150 -> 50%, reflecting all 15 groups
    // (findTeacherWorkloadMetrics takes no page/pageSize parameter at all).
    expect(result.avgOccupancyPercent).toBe(50);
    expect(result.activeClassGroupIds).toHaveLength(15);
  });

  it("scopes the Enrollment and ClassGroupSchedule lookups by organizationId, not just the upstream classGroupId list", async () => {
    mockClassGroupFindMany.mockResolvedValue([{ id: "cg-1", capacity: 10, currentCount: 5 }]);
    mockEnrollmentFindMany.mockResolvedValue([]);
    mockClassGroupScheduleFindMany.mockResolvedValue([]);

    await findTeacherWorkloadMetrics(TEACHER, ORG);

    expect(mockEnrollmentFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    expect(mockClassGroupScheduleFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
  });
});

describe("findTeacherAssessmentMetrics", () => {
  it("computes maxDaysOverdue as the largest gap between now and any OPEN overdue assessment", async () => {
    const now = new Date("2026-06-25T00:00:00Z");
    mockAssessmentGroupBy.mockResolvedValue([]);
    mockAssessmentFindMany.mockResolvedValue([
      { assessmentDate: new Date("2026-06-10T00:00:00Z") }, // 15 days late
      { assessmentDate: new Date("2026-06-20T00:00:00Z") }, // 5 days late
    ]);
    mockAssessmentCount.mockResolvedValue(0);
    mockAssessmentResultCount.mockResolvedValue(0);
    mockAssessmentPublicationCount.mockResolvedValue(0);

    const result = await findTeacherAssessmentMetrics(TEACHER, ORG, now);

    expect(result.overdueOpenCount).toBe(2);
    expect(result.maxDaysOverdue).toBe(15);
  });

  it("scopes the overdue lookup by teacherId, organizationId, OPEN status and past date", async () => {
    const now = new Date("2026-06-25T00:00:00Z");
    mockAssessmentGroupBy.mockResolvedValue([]);
    mockAssessmentFindMany.mockResolvedValue([]);
    mockAssessmentCount.mockResolvedValue(0);
    mockAssessmentResultCount.mockResolvedValue(0);
    mockAssessmentPublicationCount.mockResolvedValue(0);

    await findTeacherAssessmentMetrics(TEACHER, ORG, now);

    expect(mockAssessmentFindMany.mock.calls[0][0].where).toMatchObject({
      teacherId: TEACHER,
      organizationId: ORG,
      status: "OPEN",
      assessmentDate: { lt: now },
    });
  });
});

describe("findTeacherScheduleRows", () => {
  it("returns an empty list when there are no active class groups", async () => {
    mockClassGroupFindMany.mockResolvedValue([]);
    mockTeacherSubjectFindMany.mockResolvedValue([]);
    const result = await findTeacherScheduleRows(TEACHER, ORG);
    expect(result).toEqual([]);
  });

  it("resolves subjectNames via LevelSubject by matching the class group's course+level", async () => {
    mockClassGroupFindMany.mockResolvedValue([
      {
        id: "cg-1",
        name: "Turma A",
        courseId: "course-1",
        courseLevelId: "level-1",
        course: { name: "Curso A" },
        courseLevel: { name: "Nível 1" },
      },
    ]);
    mockTeacherSubjectFindMany.mockResolvedValue([{ subjectId: "subj-1" }]);
    mockLevelSubjectFindMany.mockResolvedValue([
      { courseId: "course-1", courseLevelId: "level-1", subject: { name: "Inglês" } },
    ]);
    mockClassGroupScheduleFindMany.mockResolvedValue([
      { id: "sched-1", classGroupId: "cg-1", scheduleSlot: { dayOfWeek: "MONDAY", startTime: "08:00", endTime: "10:00" } },
    ]);

    const result = await findTeacherScheduleRows(TEACHER, ORG);

    expect(result).toEqual([
      {
        id: "sched-1",
        dayOfWeek: "MONDAY",
        startTime: "08:00",
        endTime: "10:00",
        classGroupId: "cg-1",
        classGroupName: "Turma A",
        courseName: "Curso A",
        courseLevelName: "Nível 1",
        subjectNames: ["Inglês"],
      },
    ]);
  });

  it("does not resolve any subjectNames when the LevelSubject's course+level doesn't match the class group's", async () => {
    mockClassGroupFindMany.mockResolvedValue([
      {
        id: "cg-1",
        name: "Turma A",
        courseId: "course-1",
        courseLevelId: "level-1",
        course: { name: "Curso A" },
        courseLevel: { name: "Nível 1" },
      },
    ]);
    mockTeacherSubjectFindMany.mockResolvedValue([{ subjectId: "subj-1" }]);
    // Subject is taught in a different course/level than this class group's.
    mockLevelSubjectFindMany.mockResolvedValue([
      { courseId: "course-2", courseLevelId: "level-9", subject: { name: "Matemática" } },
    ]);
    mockClassGroupScheduleFindMany.mockResolvedValue([
      { id: "sched-1", classGroupId: "cg-1", scheduleSlot: { dayOfWeek: "MONDAY", startTime: "08:00", endTime: "10:00" } },
    ]);

    const result = await findTeacherScheduleRows(TEACHER, ORG);

    expect(result[0].subjectNames).toEqual([]);
  });

  it("scopes the LevelSubject and ClassGroupSchedule lookups by organizationId", async () => {
    mockClassGroupFindMany.mockResolvedValue([
      { id: "cg-1", name: "Turma A", courseId: "course-1", courseLevelId: "level-1", course: { name: "Curso A" }, courseLevel: { name: "Nível 1" } },
    ]);
    mockTeacherSubjectFindMany.mockResolvedValue([{ subjectId: "subj-1" }]);
    mockLevelSubjectFindMany.mockResolvedValue([]);
    mockClassGroupScheduleFindMany.mockResolvedValue([]);

    await findTeacherScheduleRows(TEACHER, ORG);

    expect(mockLevelSubjectFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    expect(mockClassGroupScheduleFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
  });
});

describe("findTeacherSubjectsTabRows", () => {
  it("returns zeroed rows for every subject when there are no active class groups", async () => {
    mockClassGroupFindMany.mockResolvedValue([]);
    const result = await findTeacherSubjectsTabRows(TEACHER, ORG, ["subj-1", "subj-2"]);
    expect(result).toEqual([
      { subjectId: "subj-1", classGroupCount: 0, studentCount: 0, workloadHours: null },
      { subjectId: "subj-2", classGroupCount: 0, studentCount: 0, workloadHours: null },
    ]);
  });

  it("resolves classGroupCount/studentCount/workloadHours via LevelSubject by course+level match", async () => {
    mockClassGroupFindMany.mockResolvedValue([
      { id: "cg-1", courseId: "course-1", courseLevelId: "level-1", currentCount: 12 },
      { id: "cg-2", courseId: "course-2", courseLevelId: "level-2", currentCount: 7 },
    ]);
    mockLevelSubjectFindMany.mockResolvedValue([
      { subjectId: "subj-1", courseId: "course-1", courseLevelId: "level-1", workloadHours: 40 },
    ]);

    const result = await findTeacherSubjectsTabRows(TEACHER, ORG, ["subj-1"]);

    expect(result).toEqual([{ subjectId: "subj-1", classGroupCount: 1, studentCount: 12, workloadHours: 40 }]);
  });

  it("scopes the LevelSubject lookup by organizationId", async () => {
    mockClassGroupFindMany.mockResolvedValue([{ id: "cg-1", courseId: "course-1", courseLevelId: "level-1", currentCount: 1 }]);
    mockLevelSubjectFindMany.mockResolvedValue([]);

    await findTeacherSubjectsTabRows(TEACHER, ORG, ["subj-1"]);

    expect(mockLevelSubjectFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
  });
});

describe("findTeacherAttendanceSessionRows", () => {
  function emptyAttendanceMocks() {
    mockGetAttendanceSessionsByOrganization.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  }

  it("delegates session retrieval to the existing attendance service instead of querying attendanceSession directly", async () => {
    emptyAttendanceMocks();

    await findTeacherAttendanceSessionRows(TEACHER, ORG, 1, 10);

    expect(mockGetAttendanceSessionsByOrganization).toHaveBeenCalledWith(ORG, {
      teacherId: TEACHER,
      status: "COMPLETED",
      page: 1,
      pageSize: 10,
    });
    expect(mockAttendanceSessionFindMany).not.toHaveBeenCalled();
  });

  it("enriches each session with present/absent counts scoped by organizationId", async () => {
    mockGetAttendanceSessionsByOrganization.mockResolvedValue({
      data: [
        {
          id: "session-1",
          sessionDate: new Date("2026-06-01"),
          classGroup: { id: "cg-1", name: "Turma A" },
          subject: { id: "subj-1", name: "Inglês" },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    mockAttendanceRecordGroupBy.mockResolvedValue([
      { attendanceSessionId: "session-1", status: "PRESENT", _count: { _all: 8 } },
      { attendanceSessionId: "session-1", status: "ABSENT", _count: { _all: 2 } },
    ]);

    const result = await findTeacherAttendanceSessionRows(TEACHER, ORG, 1, 10);

    expect(mockAttendanceRecordGroupBy.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
    expect(result.data).toEqual([
      {
        id: "session-1",
        sessionDate: new Date("2026-06-01"),
        classGroupName: "Turma A",
        subjectName: "Inglês",
        status: "COMPLETED",
        presentCount: 8,
        absentCount: 2,
        attendanceRate: 80,
      },
    ]);
  });
});

describe("findTeacherTimelineFeed", () => {
  function mockAllSourcesEmpty() {
    mockTeacherFindFirst.mockResolvedValue({ createdAt: new Date("2026-01-01") });
    mockTeacherSubjectFindMany.mockResolvedValue([]);
    mockClassGroupFindMany.mockResolvedValue([]);
    mockAssessmentFindMany.mockResolvedValue([]);
    mockAssessmentPublicationFindMany.mockResolvedValue([]);
    mockAttendanceSessionFindMany.mockResolvedValue([]);
    mockTeacherDocumentFindMany.mockResolvedValue([]);
    mockTeacherSubjectCount.mockResolvedValue(0);
    mockClassGroupCount.mockResolvedValue(0);
    mockAssessmentCount.mockResolvedValue(0);
    mockAssessmentPublicationCount.mockResolvedValue(0);
    mockAttendanceSessionCount.mockResolvedValue(0);
    mockTeacherDocumentCount.mockResolvedValue(0);
  }

  it("merges all sources and sorts the combined feed by occurredAt descending", async () => {
    mockAllSourcesEmpty();
    mockTeacherFindFirst.mockResolvedValue({ createdAt: new Date("2026-01-01") });
    mockTeacherSubjectFindMany.mockResolvedValue([
      { id: "ts-1", assignedAt: new Date("2026-06-10"), subject: { name: "Inglês" } },
    ]);
    mockClassGroupFindMany.mockResolvedValue([{ id: "cg-1", name: "Turma A", createdAt: new Date("2026-06-20") }]);
    mockAssessmentFindMany.mockResolvedValue([
      { id: "a-1", title: "Teste 1", createdAt: new Date("2026-06-15") },
    ]);
    mockTeacherSubjectCount.mockResolvedValue(1);
    mockClassGroupCount.mockResolvedValue(1);
    mockAssessmentCount.mockResolvedValue(1);

    const { items } = await findTeacherTimelineFeed(TEACHER, ORG, 1, 20);

    // Expected order (desc): classGroup (06-20) > assessment (06-15) > subject (06-10) > teacher created (01-01)
    expect(items.map((i) => i.eventType)).toEqual([
      "CLASS_GROUP_ASSIGNED",
      "ASSESSMENT_CREATED",
      "SUBJECT_ASSIGNED",
      "TEACHER_CREATED",
    ]);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].occurredAt.getTime()).toBeGreaterThanOrEqual(items[i].occurredAt.getTime());
    }
  });

  it("computes total as 1 (teacher created) plus every source's true count, independent of the per-source fetch limit", async () => {
    mockAllSourcesEmpty();
    mockTeacherSubjectCount.mockResolvedValue(5);
    mockClassGroupCount.mockResolvedValue(3);
    mockAssessmentCount.mockResolvedValue(2);
    mockAssessmentPublicationCount.mockResolvedValue(1);
    mockAttendanceSessionCount.mockResolvedValue(4);
    mockTeacherDocumentCount.mockResolvedValue(2);

    const { total } = await findTeacherTimelineFeed(TEACHER, ORG, 1, 20);

    expect(total).toBe(1 + 5 + 3 + 2 + 1 + 4 + 2);
  });

  it("paginates the merged feed — page 2 returns the next slice, not a re-fetch of page 1", async () => {
    mockAllSourcesEmpty();
    mockTeacherFindFirst.mockResolvedValue(null); // exclude the synthetic "teacher created" entry for a clean count
    mockAssessmentFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `a-${i}`,
        title: `Teste ${i}`,
        createdAt: new Date(2026, 5, i + 1),
      }))
    );
    mockAssessmentCount.mockResolvedValue(5);

    const page1 = await findTeacherTimelineFeed(TEACHER, ORG, 1, 2);
    const page2 = await findTeacherTimelineFeed(TEACHER, ORG, 2, 2);

    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    expect(page1.items.map((i) => i.id)).not.toEqual(page2.items.map((i) => i.id));
    // Both pages report the same true total, regardless of which slice was requested.
    expect(page1.total).toBe(page2.total);
  });

  it("scopes every per-teacher source query by both teacherId and organizationId", async () => {
    mockAllSourcesEmpty();

    await findTeacherTimelineFeed(TEACHER, ORG, 1, 20);

    expect(mockTeacherFindFirst.mock.calls[0][0].where).toEqual({ id: TEACHER, organizationId: ORG });
    expect(mockClassGroupFindMany.mock.calls[0][0].where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
    expect(mockAssessmentFindMany.mock.calls[0][0].where).toMatchObject({ teacherId: TEACHER, organizationId: ORG });
    expect(mockAttendanceSessionFindMany.mock.calls[0][0].where).toMatchObject({
      teacherId: TEACHER,
      organizationId: ORG,
    });
    expect(mockTeacherDocumentFindMany.mock.calls[0][0].where).toMatchObject({
      teacherId: TEACHER,
      organizationId: ORG,
    });
  });
});
