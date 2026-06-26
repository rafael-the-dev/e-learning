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

beforeEach(() => vi.clearAllMocks());

describe("getTeacherStudentRiskList", () => {
  it("counts each at-risk student once even with multiple risk rows", async () => {
    mockFindTeacherRiskRows.mockResolvedValue([
      row("s1", { riskType: "FAILED_SUBJECT" }),
      row("s1", { riskType: "LOW_ATTENDANCE" }),
      row("s2", { riskType: "BLOCKED" }),
    ]);

    const result = await getTeacherStudentRiskList("teacher-1", "org-1", ["cg1"]);
    expect(result.distinctStudentCount).toBe(2);
    expect(result.rows).toHaveLength(3);
  });

  it("caps the display rows at the top-N limit without affecting the distinct student count", async () => {
    const many = Array.from({ length: 30 }, (_, i) => row(`s${i}`));
    mockFindTeacherRiskRows.mockResolvedValue(many);

    const result = await getTeacherStudentRiskList("teacher-1", "org-1", ["cg1"]);
    expect(result.rows.length).toBeLessThanOrEqual(20);
    expect(result.distinctStudentCount).toBe(30);
  });

  it("returns an empty list and zero count when there is no risk data", async () => {
    mockFindTeacherRiskRows.mockResolvedValue([]);
    const result = await getTeacherStudentRiskList("teacher-1", "org-1", []);
    expect(result).toEqual({ rows: [], distinctStudentCount: 0 });
  });
});
