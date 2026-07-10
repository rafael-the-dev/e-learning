import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAM RESULT-ENTRY COMMANDS — ARCHITECTURE GUARDS (Phase 7; static)
// -----------------------------------------------------------------------------
// Static guards over the Phase-7 result-entry sources (comments stripped, so the
// doc-comments that name excluded engines / later phases don't false-positive).
// They prove the Examination Engine records official exam FACTS up to
// DRAFT/SUBMITTED ONLY: it never imports a Grade / Progression / Transcript /
// Certificate engine or the class Attendance Engine, never runs the eligibility
// source / engine, references no review / approval / publication / appeal /
// ExamResultRevision concern, never mutates the candidate / session status, writes
// no StudentSubject/Level/Course progress row, has no event bus / Outbox, and
// imports no React/Next/UI. A final block confirms the Phase-7 repository additions
// stay thin persistence (no normalization / rule / authorization / throw).
// =============================================================================

const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const REPO_DIR = join(process.cwd(), "src", "modules", "examinations", "repositories");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

const CMD_FILES = ["result-entry.commands.ts", "result-entry-shared.ts"];
const SRCS = CMD_FILES.map((f) => ({ file: f, code: read(CMD_DIR, f) }));
const each = (fn: (code: string, file: string) => void) => SRCS.forEach(({ code, file }) => fn(code, file));

describe("result-entry commands — no cross-engine reach", () => {
  it("1. imports no Grade / Progression / Transcript / Certificate / class-Attendance engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/modules\/(transcripts|certificates|grades|attendance)/);
      expect(code, file).not.toMatch(/progression\/commands/);
      expect(code, file).not.toMatch(/AcademicTranscript|Certificate/);
    });
  });

  it("2. runs no eligibility source / engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/evaluateExaminationEligibility/);
      expect(code, file).not.toMatch(/loadExaminationEligibilityFacts/);
      expect(code, file).not.toMatch(/EligibilityEngine/);
    });
  });

  it("3. references no review / approval / publication / appeal / revision concern", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/ExamResultRevision|ExamPublication|ExamAppeal/);
      expect(code, file).not.toMatch(/reviewedById|approvedById|publishedAt|invalidatedAt/);
      expect(code, file).not.toMatch(/REVIEWED|APPROVED|PUBLISHED|INVALIDATED/);
    });
  });

  it("4. never mutates the candidate / session status (records a fact only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/markExamCandidateWithdrawn|markExamCandidateDisqualified/);
      expect(code, file).not.toMatch(/updateExamCandidateMetadata|softDeleteExamCandidate/);
      expect(code, file).not.toMatch(/markSession|updateExamSessionMetadata|softDeleteExamSession/);
    });
  });

  it("5. writes no StudentSubject/Level/Course progress row", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(
        /StudentSubjectProgress|StudentLevelProgress|StudentCourseProgress/
      );
    });
  });

  it("6. has no domain-event bus / Outbox dependency (ExamEvent + audit only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });

  it("7. does not import the Certificate bulk runner (self-contained sequential runner)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/bulk-certificate|BulkCertificate/i);
    });
  });

  it("8. imports no React / Next / UI", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
    });
  });
});

describe("result-entry repository additions — thin persistence (no decision)", () => {
  const code = read(REPO_DIR, "exam-result.repository.ts");

  it("9. contains no business-rule / authorization / throw logic", () => {
    expect(code, "repo must not decide business rules").not.toMatch(/BusinessRuleError|ValidationError/);
    expect(code, "repo must not authorize").not.toMatch(/createAbility|getUserPermissions|PERMISSIONS/);
    expect(code, "repo must not throw").not.toMatch(/throw new/);
  });

  it("10. performs no score normalization (that lives in the command layer)", () => {
    expect(code, "repo must not normalize").not.toMatch(/\* 100|\/ maxScore|normalizeExamScore/);
  });
});
