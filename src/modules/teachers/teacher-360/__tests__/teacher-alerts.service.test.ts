import { describe, it, expect } from "vitest";
import { computeTeacherAlerts } from "../services/teacher-alerts.service";
import type { TeacherAlertsInput } from "../types";

function baseInput(overrides: Partial<TeacherAlertsInput> = {}): TeacherAlertsInput {
  return {
    maxDaysOverdue: 0,
    overdueOpenAssessmentCount: 0,
    completedSessionsLast30d: 5,
    activeClassGroupCount: 2,
    pendingGradingResultsCount: 0,
    subjectCount: 2,
    readyNotPublishedCount: 0,
    upcomingAssessmentCount: 0,
    isActiveTeacher: true,
    ...overrides,
  };
}

describe("computeTeacherAlerts", () => {
  it("returns no alerts for a healthy active teacher", () => {
    expect(computeTeacherAlerts(baseInput())).toHaveLength(0);
  });

  it("raises CRITICAL when an assessment is overdue by more than 14 days", () => {
    const alerts = computeTeacherAlerts(baseInput({ maxDaysOverdue: 15, overdueOpenAssessmentCount: 1 }));
    expect(alerts.find((a) => a.id === "overdue-critical")?.severity).toBe("CRITICAL");
  });

  it("raises CRITICAL when there are active class groups but 0 sessions registered in 30 days", () => {
    const alerts = computeTeacherAlerts(baseInput({ completedSessionsLast30d: 0 }));
    expect(alerts.find((a) => a.id === "no-sessions")?.severity).toBe("CRITICAL");
  });

  it("does not raise the no-sessions alert when the teacher has no active class groups", () => {
    const alerts = computeTeacherAlerts(baseInput({ completedSessionsLast30d: 0, activeClassGroupCount: 0 }));
    expect(alerts.find((a) => a.id === "no-sessions")).toBeUndefined();
  });

  it("raises CRITICAL for critical workload (>=9 active class groups)", () => {
    const alerts = computeTeacherAlerts(baseInput({ activeClassGroupCount: 9 }));
    expect(alerts.find((a) => a.id === "critical-workload")?.severity).toBe("CRITICAL");
  });

  it("raises HIGH when more than 20 results are pending grading", () => {
    const alerts = computeTeacherAlerts(baseInput({ pendingGradingResultsCount: 21 }));
    expect(alerts.find((a) => a.id === "high-pending-grading")?.severity).toBe("HIGH");
  });

  it("raises HIGH (not CRITICAL) for an overdue assessment within 14 days", () => {
    const alerts = computeTeacherAlerts(baseInput({ maxDaysOverdue: 5, overdueOpenAssessmentCount: 1 }));
    expect(alerts.find((a) => a.id === "overdue-high")?.severity).toBe("HIGH");
    expect(alerts.find((a) => a.id === "overdue-critical")).toBeUndefined();
  });

  it("raises HIGH for 7-8 active class groups, not critical", () => {
    const alerts = computeTeacherAlerts(baseInput({ activeClassGroupCount: 7 }));
    expect(alerts.find((a) => a.id === "high-workload")?.severity).toBe("HIGH");
    expect(alerts.find((a) => a.id === "critical-workload")).toBeUndefined();
  });

  it("raises MEDIUM when an active teacher has no subjects assigned", () => {
    const alerts = computeTeacherAlerts(baseInput({ subjectCount: 0 }));
    expect(alerts.find((a) => a.id === "no-subjects")?.severity).toBe("MEDIUM");
  });

  it("raises MEDIUM when an active teacher has subjects but no active class groups", () => {
    const alerts = computeTeacherAlerts(baseInput({ activeClassGroupCount: 0, completedSessionsLast30d: 0 }));
    expect(alerts.find((a) => a.id === "no-active-groups")?.severity).toBe("MEDIUM");
  });

  it("does not raise subject/class-group alerts for an inactive teacher", () => {
    const alerts = computeTeacherAlerts(baseInput({ subjectCount: 0, isActiveTeacher: false }));
    expect(alerts.find((a) => a.id === "no-subjects")).toBeUndefined();
  });

  it("raises MEDIUM when results are ready but not published", () => {
    const alerts = computeTeacherAlerts(baseInput({ readyNotPublishedCount: 1 }));
    expect(alerts.find((a) => a.id === "ready-not-published")?.severity).toBe("MEDIUM");
  });

  it("raises LOW for assessments scheduled within the next 7 days", () => {
    const alerts = computeTeacherAlerts(baseInput({ upcomingAssessmentCount: 2 }));
    expect(alerts.find((a) => a.id === "upcoming-assessments")?.severity).toBe("LOW");
  });
});
