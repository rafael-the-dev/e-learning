import { describe, it, expect } from "vitest";
import { buildHealthScoreInput, buildAlertsInput, buildSummaryCards } from "../services/teacher-360.service";
import type { Teacher360Core } from "../services/teacher-360.service";
import type { TeacherWithSubjects } from "@/modules/teachers/types";

function makeTeacher(overrides: Partial<TeacherWithSubjects> = {}): TeacherWithSubjects {
  return {
    id: "teacher-1",
    code: "T-001",
    userId: null,
    firstName: "Ana",
    lastName: "Silva",
    fullName: "Ana Silva",
    email: "ana@example.com",
    phone: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    idType: null,
    idNumber: null,
    licenseNumber: null,
    specialization: null,
    hireDate: null,
    status: "ACTIVE",
    notes: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    branch: null,
    teacherSubjects: [],
    ...overrides,
  };
}

function makeCore(overrides: Partial<Teacher360Core> = {}): Teacher360Core {
  return {
    teacher: makeTeacher(),
    counts: { subjectCount: 2, totalClassGroupCount: 3, activeClassGroupCount: 2 },
    assessmentMetrics: {
      openCount: 1,
      gradedCount: 4,
      publishedCount: 3,
      overdueOpenCount: 0,
      maxDaysOverdue: 0,
      pendingGradingOpenCount: 0,
      pendingGradingResultsCount: 0,
      readyNotPublishedCount: 0,
      upcomingCount: 0,
    },
    attendanceExecution: { completedSessionsLast30d: 10, completedSessionsWithRecordsLast30d: 10 },
    qualityRaw: { passedCount: 8, failedCount: 2, avgAttendance: 92.5, avgFinalGrade: 14 },
    workload: {
      activeClassGroupIds: ["cg-1", "cg-2"],
      distinctActiveStudentCount: 40,
      weeklyHours: 12,
      avgOccupancyPercent: 65,
    },
    levelSubjectIds: ["ls-1"],
    documentCount: 1,
    recentTimeline: [],
    ...overrides,
  };
}

describe("buildHealthScoreInput", () => {
  it("maps core aggregates into the pure health-score input shape", () => {
    const core = makeCore();
    expect(buildHealthScoreInput(core)).toEqual({
      completedSessionsLast30d: 10,
      completedSessionsWithRecordsLast30d: 10,
      overdueOpenAssessmentCount: 0,
      pendingGradingOpenAssessmentCount: 0,
      readyNotPublishedCount: 0,
      activeClassGroupCount: 2,
      passRate: 80, // 8 / (8+2) * 100
      avgStudentAttendance: 92.5,
    });
  });

  it("returns a null passRate when there is no passed/failed data yet", () => {
    const core = makeCore({ qualityRaw: { passedCount: 0, failedCount: 0, avgAttendance: null, avgFinalGrade: null } });
    expect(buildHealthScoreInput(core).passRate).toBeNull();
  });
});

describe("buildAlertsInput", () => {
  it("maps core aggregates into the pure alerts input shape", () => {
    const core = makeCore({
      assessmentMetrics: {
        openCount: 1,
        gradedCount: 4,
        publishedCount: 3,
        overdueOpenCount: 2,
        maxDaysOverdue: 20,
        pendingGradingOpenCount: 1,
        pendingGradingResultsCount: 25,
        readyNotPublishedCount: 1,
        upcomingCount: 3,
      },
    });

    expect(buildAlertsInput(core)).toEqual({
      maxDaysOverdue: 20,
      overdueOpenAssessmentCount: 2,
      completedSessionsLast30d: 10,
      activeClassGroupCount: 2,
      pendingGradingResultsCount: 25,
      subjectCount: 2,
      readyNotPublishedCount: 1,
      upcomingAssessmentCount: 3,
      isActiveTeacher: true,
    });
  });

  it("derives isActiveTeacher from the teacher's status", () => {
    const suspended = makeCore({ teacher: makeTeacher({ status: "SUSPENDED" }) });
    expect(buildAlertsInput(suspended).isActiveTeacher).toBe(false);
  });
});

describe("buildSummaryCards", () => {
  it("maps core aggregates into the 8 summary card values", () => {
    const core = makeCore();
    expect(buildSummaryCards(core)).toEqual({
      activeClassGroupCount: 2,
      subjectCount: 2,
      studentCount: 40,
      weeklyHours: 12,
      pendingAssessmentCount: 1,
      completedAssessmentCount: 4,
      passRate: 80,
      avgStudentAttendance: 92.5,
    });
  });

  it("returns a null passRate when there is no graded data yet", () => {
    const core = makeCore({ qualityRaw: { passedCount: 0, failedCount: 0, avgAttendance: null, avgFinalGrade: null } });
    expect(buildSummaryCards(core).passRate).toBeNull();
  });
});
