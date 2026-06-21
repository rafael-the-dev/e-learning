import { describe, it, expect } from "vitest";
import { computeStudentAlerts } from "../services/student-alerts.service";
import type { StudentAlertsInput } from "../types";

function baseInput(overrides: Partial<StudentAlertsInput> = {}): StudentAlertsInput {
  return {
    blockedLevelCount: 0,
    recoveryRequiredCount: 0,
    failedSubjectCount: 0,
    outstandingBalance: 0,
    overdueInvoiceCount: 0,
    belowRequiredAttendanceSubjects: [],
    pendingRefundCount: 0,
    pendingJustificationCount: 0,
    documentCount: 1,
    incompleteAssessmentCount: 0,
    hasActiveEnrollment: true,
    hasAnyEnrollment: true,
    ...overrides,
  };
}

describe("computeStudentAlerts", () => {
  it("returns no alerts for a healthy student", () => {
    expect(computeStudentAlerts(baseInput())).toHaveLength(0);
  });

  it("raises a CRITICAL alert for blocked level progression", () => {
    const alerts = computeStudentAlerts(baseInput({ blockedLevelCount: 1 }));
    expect(alerts).toEqual([
      expect.objectContaining({ id: "blocked-progress", severity: "CRITICAL" }),
    ]);
  });

  it("raises a CRITICAL alert for overdue invoices", () => {
    const alerts = computeStudentAlerts(baseInput({ overdueInvoiceCount: 2 }));
    expect(alerts[0]).toMatchObject({ id: "overdue-balance", severity: "CRITICAL" });
    expect(alerts[0].message).toContain("2");
  });

  it("raises a CRITICAL alert for below-required attendance", () => {
    const alerts = computeStudentAlerts(
      baseInput({ belowRequiredAttendanceSubjects: [{ subjectName: "Matemática", attendancePercentage: 40 }] })
    );
    expect(alerts[0]).toMatchObject({ id: "below-attendance", severity: "CRITICAL" });
  });

  it("raises a CRITICAL alert for failed required subjects", () => {
    const alerts = computeStudentAlerts(baseInput({ failedSubjectCount: 1 }));
    expect(alerts[0]).toMatchObject({ id: "failed-subject", severity: "CRITICAL" });
  });

  it("raises a HIGH alert for recovery required", () => {
    const alerts = computeStudentAlerts(baseInput({ recoveryRequiredCount: 1 }));
    expect(alerts[0]).toMatchObject({ id: "recovery-required", severity: "HIGH" });
  });

  it("raises a HIGH alert for pending refunds", () => {
    const alerts = computeStudentAlerts(baseInput({ pendingRefundCount: 1 }));
    expect(alerts[0]).toMatchObject({ id: "pending-refund", severity: "HIGH" });
  });

  it("raises a HIGH alert for pending attendance justifications", () => {
    const alerts = computeStudentAlerts(baseInput({ pendingJustificationCount: 3 }));
    expect(alerts[0]).toMatchObject({ id: "pending-justification", severity: "HIGH" });
  });

  it("raises a HIGH alert when there are no documents on file", () => {
    const alerts = computeStudentAlerts(baseInput({ documentCount: 0 }));
    expect(alerts[0]).toMatchObject({ id: "missing-documents", severity: "HIGH" });
  });

  it("does not raise the missing-documents alert when at least one document exists", () => {
    const alerts = computeStudentAlerts(baseInput({ documentCount: 1 }));
    expect(alerts.find((a) => a.id === "missing-documents")).toBeUndefined();
  });

  it("raises a MEDIUM alert for incomplete assessments", () => {
    const alerts = computeStudentAlerts(baseInput({ incompleteAssessmentCount: 2 }));
    expect(alerts[0]).toMatchObject({ id: "incomplete-assessments", severity: "MEDIUM" });
  });

  it("raises a MEDIUM alert for an inactive enrollment, but only if the student has an enrollment at all", () => {
    const withEnrollment = computeStudentAlerts(
      baseInput({ hasActiveEnrollment: false, hasAnyEnrollment: true })
    );
    expect(withEnrollment[0]).toMatchObject({ id: "inactive-enrollment", severity: "MEDIUM" });

    const withoutAnyEnrollment = computeStudentAlerts(
      baseInput({ hasActiveEnrollment: false, hasAnyEnrollment: false })
    );
    expect(withoutAnyEnrollment.find((a) => a.id === "inactive-enrollment")).toBeUndefined();
  });

  it("returns multiple alerts together, each with a recommended action and PT-PT text", () => {
    const alerts = computeStudentAlerts(
      baseInput({ blockedLevelCount: 1, overdueInvoiceCount: 1, documentCount: 0 })
    );
    expect(alerts).toHaveLength(3);
    for (const alert of alerts) {
      expect(alert.recommendedAction.length).toBeGreaterThan(0);
      expect(alert.message.length).toBeGreaterThan(0);
    }
  });
});
