import { describe, it, expect } from "vitest";
import {
  buildTeacherPortalKpis,
  computeUrgentAlertCount,
  buildTeacherTodayOverview,
  countActiveSessionsToday,
} from "../services/teacher-portal-kpis.service";
import type { StudentRiskRow, TeacherTodaySession } from "../types";

function session(overrides: Partial<TeacherTodaySession>): TeacherTodaySession {
  return {
    id: "s1",
    startTime: "09:00",
    endTime: "10:00",
    classGroupId: "cg1",
    classGroupName: "Turma A",
    subjectName: "Código da Estrada",
    classroomName: null,
    status: "OPEN",
    ...overrides,
  };
}

describe("countActiveSessionsToday", () => {
  it("counts every non-cancelled session", () => {
    const rows = [session({ id: "s1", status: "OPEN" }), session({ id: "s2", status: "COMPLETED" })];
    expect(countActiveSessionsToday(rows)).toBe(2);
  });

  it("excludes CANCELLED sessions from the count", () => {
    const rows = [session({ id: "s1", status: "OPEN" }), session({ id: "s2", status: "CANCELLED" })];
    expect(countActiveSessionsToday(rows)).toBe(1);
  });

  it("is zero when every session today is cancelled", () => {
    expect(countActiveSessionsToday([session({ status: "CANCELLED" })])).toBe(0);
  });

  it("is zero for an empty schedule", () => {
    expect(countActiveSessionsToday([])).toBe(0);
  });
});

const BASE_INPUT = {
  classesTodayCount: 3,
  activeClassGroupCount: 4,
  distinctActiveStudentCount: 50,
  attendancePendingCount: 2,
  pendingGradingResultsCount: 6,
  overdueOpenAssessmentCount: 1,
  unreadNotificationCount: 5,
  studentsAtRiskCount: 7,
};

describe("buildTeacherPortalKpis", () => {
  it("maps every raw input straight to the corresponding KPI field", () => {
    const kpis = buildTeacherPortalKpis(BASE_INPUT);
    expect(kpis).toEqual({
      classesToday: 3,
      activeClassGroupCount: 4,
      studentCount: 50,
      attendancePendingCount: 2,
      assessmentsToGradeCount: 6,
      overdueAssessmentCount: 1,
      unreadNotificationCount: 5,
      studentsAtRiskCount: 7,
    });
  });
});

describe("computeUrgentAlertCount", () => {
  const rows: StudentRiskRow[] = [
    { studentId: "s1", studentName: "Ana", classGroupName: "A", riskType: "BLOCKED", severity: "CRITICAL", detail: "" },
    { studentId: "s2", studentName: "Bruno", classGroupName: "A", riskType: "BLOCKED", severity: "CRITICAL", detail: "" },
    { studentId: "s3", studentName: "Carla", classGroupName: "A", riskType: "FAILED_SUBJECT", severity: "HIGH", detail: "" },
  ];

  it("counts CRITICAL risk rows plus overdue open assessments", () => {
    expect(computeUrgentAlertCount(rows, 2)).toBe(4);
  });

  it("ignores HIGH/MEDIUM risk rows", () => {
    expect(computeUrgentAlertCount(rows, 0)).toBe(2);
  });

  it("is zero when there are no critical risks and nothing overdue", () => {
    expect(computeUrgentAlertCount([], 0)).toBe(0);
  });
});

describe("buildTeacherTodayOverview", () => {
  const nextSession = session({ id: "s1", classroomName: "Sala 1" });
  const kpis = buildTeacherPortalKpis(BASE_INPUT); // classesToday: 3

  it("carries through classesTodayCount from the kpis object (not re-derived), pending counts, and the resolved next session", () => {
    const now = new Date("2026-06-25T08:00:00");
    const overview = buildTeacherTodayOverview(nextSession, kpis, 1, now);

    expect(overview).toMatchObject({
      today: now,
      classesTodayCount: kpis.classesToday,
      nextSession,
      attendancePendingCount: kpis.attendancePendingCount,
      assessmentsToGradeCount: kpis.assessmentsToGradeCount,
      urgentAlertCount: 1,
    });
  });

  it("has a null nextSession when there are no classes today", () => {
    const overview = buildTeacherTodayOverview(null, kpis, 0);
    expect(overview.nextSession).toBeNull();
  });

  it("never drifts from the KPI card's classesToday value, by construction", () => {
    const zeroKpis = buildTeacherPortalKpis({ ...BASE_INPUT, classesTodayCount: 0 });
    const overview = buildTeacherTodayOverview(null, zeroKpis, 0);
    expect(overview.classesTodayCount).toBe(0);
  });
});
