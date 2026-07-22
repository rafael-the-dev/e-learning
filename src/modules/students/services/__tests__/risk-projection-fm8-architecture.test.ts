import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// =============================================================================
// F-M8 — architecture guard. Every migrated dashboard/watchlist consumer must go
// through the SINGLE canonical readiness gate (resolveRiskProjectionReadiness) and
// must NOT consult the raw coverage service directly (which would let each consumer
// re-interpret readiness differently) or keep a legacy risk re-derivation fallback.
// =============================================================================

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

// The consumers migrated by F-M8.
const MIGRATED_CONSUMERS = [
  "src/modules/dashboard/repositories/dashboard-academic.repository.ts",
  "src/modules/grades/services/academic-risk.service.ts",
  "src/modules/teacher-portal/repositories/teacher-portal.repository.ts",
  "src/modules/students/repositories/student.repository.ts",
];

describe("F-M8 architecture — migrated consumers use the canonical gate only", () => {
  it.each(MIGRATED_CONSUMERS)("%s uses resolveRiskProjectionReadiness, not the raw coverage service", (file) => {
    const src = read(file);
    expect(src).toContain("resolveRiskProjectionReadiness");
    // The raw fail-closed gate must be consulted ONLY through the readiness wrapper.
    expect(src).not.toContain("student-risk-projection-coverage.service");
    expect(src).not.toContain("getStudentRiskProjectionCoverage");
  });

  it("dashboard-academic no longer keeps a legacy at-risk / low-attendance fallback", () => {
    const src = read("src/modules/dashboard/repositories/dashboard-academic.repository.ts");
    expect(src).not.toContain("legacyAtRisk");
    expect(src).not.toContain("legacyLowAttendance");
  });

  it("teacher-portal no longer keeps the flat 75/85 attendance-threshold fallback", () => {
    const src = read("src/modules/teacher-portal/repositories/teacher-portal.repository.ts");
    expect(src).not.toContain("ATTENDANCE_TREND_THRESHOLD");
    expect(src).not.toContain("legacyLowAttendance");
  });

  it("the readiness service is the single wrapper over the raw coverage gate", () => {
    const src = read("src/modules/students/services/risk-projection-readiness.service.ts");
    expect(src).toContain("getStudentRiskProjectionCoverage");
  });
});
