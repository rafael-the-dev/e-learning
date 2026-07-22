// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

// next/link → forwarding anchor (see accessible-pagination.test.tsx rationale).
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

import { StudentGradesTab } from "../student-grades-tab";
import { StudentAttendanceTab } from "../student-attendance-tab";
import type { PaginatedResult } from "@/shared/types/common";

afterEach(cleanup);

function page<T>(data: T[], over: Partial<PaginatedResult<T>> = {}): PaginatedResult<T> {
  return {
    data,
    total: 25,
    page: 2,
    pageSize: 10,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
    ...over,
  };
}

const academicSummary = {
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
} as unknown as React.ComponentProps<typeof StudentGradesTab>["academicSummary"];

const assessmentRow = {
  id: "a1",
  subjectName: "Código da Estrada",
  componentName: "Teste 1",
  componentType: "TEST",
  grade: 15,
  maxGrade: 20,
  normalizedGrade: 75,
  status: "GRADED",
  gradedAt: new Date("2026-05-01"),
} as unknown as React.ComponentProps<typeof StudentGradesTab>["assessments"]["data"][number];

const attendanceRow = {
  id: "r1",
  sessionDate: new Date("2026-05-01"),
  subjectName: "Código da Estrada",
  classGroupName: "Turma A",
  teacherName: "Prof. X",
  status: "PRESENT",
  notes: null,
} as unknown as React.ComponentProps<typeof StudentAttendanceTab>["records"]["data"][number];

const attendanceSummary = {
  totalSessions: 10, presentCount: 9, absentCount: 1, lateCount: 0, excusedCount: 0, remoteCount: 0,
  attendancePercentage: 88, attendedSessions: 9,
} as unknown as React.ComponentProps<typeof StudentAttendanceTab>["summary"];

describe("StudentGradesTab pagination (F-M7)", () => {
  it("renders the notas pager with the correct section name and query params", () => {
    render(
      <StudentGradesTab
        assessments={page([assessmentRow])}
        subjectProgress={[]}
        academicSummary={academicSummary}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Paginação das notas" });
    expect(within(nav).getByRole("link", { name: /anterior das notas/ }).getAttribute("href")).toBe(
      "?tab=grades&page=1"
    );
    expect(within(nav).getByRole("link", { name: /seguinte das notas/ }).getAttribute("href")).toBe(
      "?tab=grades&page=3"
    );
    expect(screen.getByText("Página 2 de 3 das notas")).toBeTruthy();
  });
});

describe("StudentAttendanceTab pagination (F-M7)", () => {
  it("renders the assiduidade pager with the correct section name and query params", () => {
    render(
      <StudentAttendanceTab
        subjects={[]}
        summary={attendanceSummary}
        records={page([attendanceRow])}
        justifications={page([], { total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false })}
        pendingJustificationCount={0}
      />
    );
    const nav = screen.getByRole("navigation", { name: "Paginação da assiduidade" });
    expect(within(nav).getByRole("link", { name: /anterior da assiduidade/ }).getAttribute("href")).toBe(
      "?tab=attendance&page=1"
    );
    expect(within(nav).getByRole("link", { name: /seguinte da assiduidade/ }).getAttribute("href")).toBe(
      "?tab=attendance&page=3"
    );
    expect(screen.getByText("Página 2 de 3 da assiduidade")).toBeTruthy();
  });
});
