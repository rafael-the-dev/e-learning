// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentOperationalCards } from "../student-operational-cards";
import type { StudentAcademicSummary } from "@/modules/students/services/student-academic-summary.service";
import type { StudentRiskSummary, RiskDimension } from "@/modules/students/services/student-risk.service";
import type { StudentAttendanceSummary } from "@/modules/attendance/types";
import type { Student360FinanceSection } from "@/modules/students/student-360/services/student-360.service";

function academic(over: Partial<StudentAcademicSummary> = {}): StudentAcademicSummary {
  return {
    subjectAverage: 74.2,
    courseFinalGrade: 73,
    scale: 100,
    gradedSubjects: 5,
    passedSubjects: 4,
    failedSubjects: 1,
    inProgressSubjects: 0,
    incompleteSubjects: 0,
    currentLevel: { id: "l1", name: "Nível 1" },
    progressionStatus: "Regular",
    ...over,
  };
}

function attendance(over: Partial<StudentAttendanceSummary> = {}): StudentAttendanceSummary {
  return {
    totalSessions: 10, presentCount: 9, absentCount: 1, lateCount: 0, excusedCount: 0, remoteCount: 0,
    attendancePercentage: 88, attendedSessions: 9,
    ...over,
  };
}

const dim = (reasons: number): RiskDimension => ({
  level: reasons > 0 ? "CRITICAL" : "NONE",
  reasons: Array.from({ length: reasons }, (_, i) => ({
    id: `r${i}`, dimension: "academic", level: "CRITICAL", message: "x", recommendedAction: "y",
  })),
});

function risk(over: Partial<StudentRiskSummary> = {}): StudentRiskSummary {
  return {
    level: "NONE", isAtRisk: false, reasons: [],
    academic: dim(0), attendance: dim(0), financial: dim(0), progression: dim(0), documents: dim(0),
    recommendedAction: null, evaluatedAt: new Date("2026-07-20"),
    ...over,
  };
}

const billingFinance = {
  billing: { invoices: [], payments: [], receipts: [], totalInvoiced: 0, totalPaid: 0, outstandingBalance: 1500 },
  wallet: null,
} as unknown as Student360FinanceSection;

describe("StudentOperationalCards", () => {
  it("shows the Financeiro card with the debt when billing is authorized", () => {
    render(
      <StudentOperationalCards
        academicSummary={academic()}
        attendanceSummary={attendance()}
        riskSummary={risk()}
        finance={billingFinance}
      />
    );
    expect(screen.getByText("Financeiro")).toBeTruthy();
    expect(screen.getByText(/Dívida/)).toBeTruthy();
  });

  it("omits the Financeiro card ENTIRELY when finance is not authorized (finance null)", () => {
    render(
      <StudentOperationalCards
        academicSummary={academic()}
        attendanceSummary={attendance()}
        riskSummary={risk()}
        finance={null}
      />
    );
    expect(screen.queryByText("Financeiro")).toBeNull();
    expect(screen.queryByText(/Dívida/)).toBeNull();
    // academic + attendance still shown
    expect(screen.getByText("Académico")).toBeTruthy();
    expect(screen.getByText("Assiduidade")).toBeTruthy();
  });

  it("renders clear empty states when there are no grades / no attendance data", () => {
    render(
      <StudentOperationalCards
        academicSummary={academic({ subjectAverage: null })}
        attendanceSummary={attendance({ attendancePercentage: null })}
        riskSummary={risk()}
        finance={null}
      />
    );
    expect(screen.getByText("Sem notas")).toBeTruthy();
    expect(screen.getByText("Sem dados")).toBeTruthy();
  });

  it("surfaces the main problem count per dimension", () => {
    render(
      <StudentOperationalCards
        academicSummary={academic()}
        attendanceSummary={attendance()}
        riskSummary={risk({ academic: dim(2) })}
        finance={null}
      />
    );
    expect(screen.getByText(/2 itens exigem atenção/)).toBeTruthy();
    // a dimension with no reasons reads as no problems
    expect(screen.getAllByText("Sem problemas registados").length).toBeGreaterThan(0);
  });
});
