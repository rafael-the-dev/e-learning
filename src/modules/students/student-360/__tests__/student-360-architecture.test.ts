import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// M1 — architecture guard: the Student 360 aggregator must CONSUME canonical
// contracts, not know about the academic (prerequisites/progression) domain's
// internals. These read the source and assert the separation stays in place.
// =============================================================================

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const SERVICE = "src/modules/students/student-360/services/student-360.service.ts";
const REPO = "src/modules/students/student-360/repositories/student-360.repository.ts";
const OVERVIEW = "src/modules/students/student-360/components/student-overview-tab.tsx";

describe("Student 360 architecture (M1)", () => {
  it("the repository does NOT query the prerequisites module's progression tables", () => {
    const src = read(REPO);
    expect(src).not.toContain("studentLevelProgress");
    expect(src).not.toContain("studentCourseProgress");
  });

  it("the aggregator reads progression from the prerequisites module, not its own repo", () => {
    const src = read(SERVICE);
    expect(src).toContain("@/modules/prerequisites/repositories/student-level-progress.repository");
    expect(src).toContain("@/modules/prerequisites/repositories/student-course-progress.repository");
  });

  it("current-level resolution comes from the academic contract, not the aggregator", () => {
    const src = read(SERVICE);
    // The resolver is imported from the academic summary (the contract), not defined here.
    expect(src).toContain("resolveCurrentEnrollmentLevel");
    expect(src).toContain("@/modules/students/services/student-academic-summary.service");
    // It must not re-declare the progression-aware resolver locally.
    expect(src).not.toMatch(/function resolveCurrentEnrollmentLevel/);
  });

  it("no academic status/progression is DERIVED in the aggregator (comes from the summaries)", () => {
    const src = read(SERVICE);
    expect(src).not.toMatch(/deriveAcademicStatusLabel|deriveProgression/);
  });

  it("the overview reads the SQL-aggregated finance summary, never the full statement (H3)", () => {
    const src = read(SERVICE);
    expect(src).toContain("getStudentFinanceSummary");
    // The eager full-statement load must be gone from the aggregator.
    expect(src).not.toContain("getStudentFinancialStatement");
  });

  it("the overview tab renders the current level from the summary, not by re-resolving it", () => {
    const src = read(OVERVIEW);
    expect(src).not.toContain("resolveCurrentEnrollmentLevel");
    expect(src).toContain("academicSummary.currentLevel");
  });
});
