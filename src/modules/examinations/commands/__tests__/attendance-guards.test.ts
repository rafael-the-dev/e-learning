import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAM ATTENDANCE COMMANDS — ARCHITECTURE GUARDS (Phase 6; static)
// -----------------------------------------------------------------------------
// Static guards over the Phase-6 attendance command source (comments stripped, so
// the doc-comments that name excluded engines / phases don't false-positive). They
// prove exam attendance is recorded IN ISOLATION: it never imports the class
// Attendance Engine (E-10) or any Grade / Progression / Transcript / Certificate
// engine, never touches a result / publication / appeal, never mutates the
// ExamCandidate status, has no event bus / Outbox, and imports no React/Next/UI. A
// second block confirms the Phase-6 repository additions stay thin persistence
// (no rule / authorization / throw).
// =============================================================================

const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const REPO_DIR = join(process.cwd(), "src", "modules", "examinations", "repositories");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

const SRC = read(CMD_DIR, "attendance.commands.ts");

describe("attendance commands — isolation from the class Attendance Engine", () => {
  it("1. imports no class Attendance Engine module", () => {
    expect(SRC).not.toMatch(/modules\/attendance/);
  });
});

describe("attendance commands — no cross-engine reach", () => {
  it("2. imports no Grade / Progression / Transcript / Certificate engine", () => {
    expect(SRC).not.toMatch(/modules\/(transcripts|certificates|grades)/);
    expect(SRC).not.toMatch(/progression\/commands/);
    expect(SRC).not.toMatch(/AcademicTranscript|Certificate/);
  });

  it("3. runs no eligibility source / engine", () => {
    expect(SRC).not.toMatch(/evaluateExaminationEligibility/);
    expect(SRC).not.toMatch(/loadExaminationEligibilityFacts/);
    expect(SRC).not.toMatch(/EligibilityEngine/);
  });

  it("4. touches no result / publication / appeal concern", () => {
    expect(SRC).not.toMatch(/ExamResult|ExamPublication|ExamAppeal/);
  });

  it("5. never mutates the ExamCandidate status (attendance is not a candidate transition)", () => {
    expect(SRC).not.toMatch(/markExamCandidateWithdrawn/);
    expect(SRC).not.toMatch(/markExamCandidateDisqualified/);
    expect(SRC).not.toMatch(/updateExamCandidateMetadata/);
    expect(SRC).not.toMatch(/softDeleteExamCandidate/);
  });

  it("6. has no domain-event bus / Outbox dependency (ExamEvent + audit only)", () => {
    expect(SRC).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
  });

  it("7. imports no React / Next / UI", () => {
    expect(SRC).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
  });
});

describe("attendance repositories — thin persistence (no decision)", () => {
  const REPOS = ["exam-attendance.repository.ts", "exam-candidate.repository.ts"];

  it("8. contain no business-rule / authorization / throw logic", () => {
    for (const file of REPOS) {
      const code = read(REPO_DIR, file);
      expect(code, `${file} must not decide business rules`).not.toMatch(
        /BusinessRuleError|ValidationError/
      );
      expect(code, `${file} must not authorize`).not.toMatch(
        /createAbility|getUserPermissions|PERMISSIONS/
      );
      expect(code, `${file} must not throw`).not.toMatch(/throw new/);
    }
  });
});
