import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAM RESULT PUBLICATION COMMANDS — ARCHITECTURE GUARDS (Phase 9; static)
// -----------------------------------------------------------------------------
// Static guards over the Phase-9 result-publication sources (comments stripped, so
// the doc-comments that name excluded engines / later phases don't false-positive).
// They prove the Examination Engine PUBLISHES / RETRACTS an official exam result at
// the session level ONLY: it never imports a Grade / Progression / Transcript /
// Certificate engine or the class Attendance Engine, never runs the eligibility
// source / engine, references no appeal / revision concern, has no event bus /
// Outbox, does not import the Certificate bulk runner, and imports no React/Next/UI.
// A final block re-confirms the ExamSession / ExamPublication / ExamResult
// repositories stay thin persistence (no rule / authorization / readiness mapping).
// =============================================================================

const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const REPO_DIR = join(process.cwd(), "src", "modules", "examinations", "repositories");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

const CMD_FILES = ["publication.commands.ts", "publication-shared.ts"];
const SRCS = CMD_FILES.map((f) => ({ file: f, code: read(CMD_DIR, f) }));
const each = (fn: (code: string, file: string) => void) =>
  SRCS.forEach(({ code, file }) => fn(code, file));

describe("publication commands — no cross-engine reach", () => {
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

  it("3. references no appeal / revision concern", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/ExamResultRevision|ExamAppeal/);
    });
  });

  it("4. has no domain-event bus / Outbox dependency (ExamEvent + audit only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });

  it("5. does not import the Certificate bulk runner", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/bulk-certificate|BulkCertificate/i);
    });
  });

  it("6. imports no React / Next / UI", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
    });
  });
});

describe("publication repository additions — thin persistence (no decision)", () => {
  const REPO_FILES = [
    "exam-session.repository.ts",
    "exam-publication.repository.ts",
    "exam-result.repository.ts",
  ];
  const repoSrcs = REPO_FILES.map((f) => ({ file: f, code: read(REPO_DIR, f) }));
  const eachRepo = (fn: (code: string, file: string) => void) =>
    repoSrcs.forEach(({ code, file }) => fn(code, file));

  it("7. contains no business-rule / authorization logic", () => {
    eachRepo((code, file) => {
      expect(code, file).not.toMatch(/BusinessRuleError|ValidationError/);
      expect(code, file).not.toMatch(/createAbility|getUserPermissions|PERMISSIONS/);
    });
  });

  it("8. performs no readiness / attendance mapping (that lives in the command layer)", () => {
    eachRepo((code, file) => {
      expect(code, file).not.toMatch(/resultCodeForAttendance|evaluatePublicationReadiness/);
    });
  });
});
