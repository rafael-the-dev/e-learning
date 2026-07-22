import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindTeacherRiskRows } = vi.hoisted(() => ({ mockFindTeacherRiskRows: vi.fn() }));
vi.mock("@/modules/teacher-portal/repositories/teacher-portal.repository", () => ({
  findTeacherRiskRows: mockFindTeacherRiskRows,
}));

import { getTeacherStudentRiskList } from "../services/teacher-portal-risk.service";
import type { StudentRiskRow } from "../types";

function row(studentId: string, overrides: Partial<StudentRiskRow> = {}): StudentRiskRow {
  return {
    studentId,
    studentName: `Student ${studentId}`,
    classGroupName: "Turma A",
    riskType: "FAILED_SUBJECT",
    severity: "HIGH",
    detail: "",
    ...overrides,
  };
}

// F-M8: findTeacherRiskRows now returns { rows, attendanceRisk }.
const availableAttendance = { status: "AVAILABLE" as const, data: 0, evaluatedAt: new Date("2026-07-22") };
function riskRowsResult(rows: StudentRiskRow[]) {
  return { rows, attendanceRisk: availableAttendance };
}

beforeEach(() => vi.clearAllMocks());

describe("getTeacherStudentRiskList", () => {
  it("counts each at-risk student once even with multiple risk rows", async () => {
    mockFindTeacherRiskRows.mockResolvedValue(
      riskRowsResult([
        row("s1", { riskType: "FAILED_SUBJECT" }),
        row("s1", { riskType: "LOW_ATTENDANCE" }),
        row("s2", { riskType: "BLOCKED" }),
      ])
    );

    const result = await getTeacherStudentRiskList("teacher-1", "org-1", ["cg1"]);
    expect(result.distinctStudentCount).toBe(2);
    expect(result.rows).toHaveLength(3);
  });

  it("caps the display rows at the top-N limit without affecting the distinct student count", async () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`s${i}`));
    mockFindTeacherRiskRows.mockResolvedValue(riskRowsResult(many));

    const result = await getTeacherStudentRiskList("teacher-1", "org-1", ["cg1"]);
    expect(result.rows.length).toBeLessThanOrEqual(20);
    expect(result.distinctStudentCount).toBe(30);
  });

  it("returns an empty list and zero count when there is no risk data", async () => {
    mockFindTeacherRiskRows.mockResolvedValue(riskRowsResult([]));
    const result = await getTeacherStudentRiskList("teacher-1", "org-1", []);
    expect(result.rows).toEqual([]);
    expect(result.distinctStudentCount).toBe(0);
    expect(result.attendanceRisk.status).toBe("AVAILABLE");
  });
});
