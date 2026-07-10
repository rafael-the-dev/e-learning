import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// PHASE 11B EXAM→GRADE-COMPONENT BINDING — ARCHITECTURE GUARDS (ADR-014; static)
// -----------------------------------------------------------------------------
// Static guards over the Phase-11B binding sources (comments stripped so the
// doc-comments that name excluded engines don't false-positive). They prove:
//   • the resolver + binding command NEVER import the Grade / Progression /
//     Transcript / Certificate engines and NEVER write their tables — grade WRITES
//     stay confined to the sanctioned seam (`integrations/production-ports.ts`);
//   • the resolver may READ the Assessment component/policy repos (that is how
//     compatibility is checked) but makes NO name / weight / order / componentType
//     heuristic decision;
//   • the production seam MAY import Grade / Assessment but STILL never touches
//     Transcript / Certificate.
// =============================================================================

const MOD_DIR = join(process.cwd(), "src", "modules", "examinations");
const CMD_DIR = join(MOD_DIR, "commands");
const SVC_DIR = join(MOD_DIR, "services");
const REPO_DIR = join(MOD_DIR, "repositories");
const INT_DIR = join(MOD_DIR, "integrations");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

const RESOLVER = {
  file: "services/exam-grade-component-resolver.service.ts",
  code: read(SVC_DIR, "exam-grade-component-resolver.service.ts"),
};
const BINDING_CMD = {
  file: "commands/binding.commands.ts",
  code: read(CMD_DIR, "binding.commands.ts"),
};
const BINDING_REPO = {
  file: "repositories/exam-grade-component-binding.repository.ts",
  code: read(REPO_DIR, "exam-grade-component-binding.repository.ts"),
};

const NO_GRADE_WRITE_SOURCES = [RESOLVER, BINDING_CMD, BINDING_REPO];
const each = (fn: (code: string, file: string) => void) =>
  NO_GRADE_WRITE_SOURCES.forEach(({ code, file }) => fn(code, file));

describe("binding sources — no grade WRITE / cross-engine reach", () => {
  it("1. import no Grade / Prerequisites / Transcript / Certificate engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/modules\/(grades|prerequisites|transcripts|certificates)/);
      expect(code, file).not.toMatch(/AcademicTranscript|Certificate/);
    });
  });

  it("2. never write the Grade / Progression tables directly", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(
        /\.(studentAssessmentResult|studentSubjectProgress|studentLevelProgress|studentCourseProgress)\./
      );
      expect(code, file).not.toMatch(
        /db\.(studentAssessmentResult|studentSubjectProgress|studentLevelProgress|studentCourseProgress)/
      );
    });
  });

  it("3. never call the Grade mutation / calculation services", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/gradeMutationService|handleGradeMutation|upsertStudentAssessmentResult/);
    });
  });

  it("4. import no React / Next / UI and no domain-event bus / Outbox", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });
});

describe("resolver — explicit only, NO heuristic", () => {
  it("5. makes no name / weight / order / componentType decision", () => {
    // The resolver may hold config field names in READ selects, but its DECISION must
    // never branch on component name / weight / order / componentType.
    expect(RESOLVER.code).not.toMatch(/\bweight\b/);
    expect(RESOLVER.code).not.toMatch(/componentType/);
    expect(RESOLVER.code).not.toMatch(/\.name\b/);
    expect(RESOLVER.code).not.toMatch(/\border\b/);
  });

  it("6. reads the Assessment component/policy repos (compatibility source), NOT the Grade engine", () => {
    expect(RESOLVER.code).toMatch(/assessment-component\.repository/);
    expect(RESOLVER.code).toMatch(/assessment-policy\.repository/);
    expect(RESOLVER.code).not.toMatch(/modules\/grades/);
  });
});

describe("production adapter seam — the ONLY grade-WRITE site", () => {
  const prod = read(INT_DIR, "production-ports.ts");

  it("7. is the sole binding-side importer of the Grade mutation / upsert path", () => {
    expect(prod).toMatch(/gradeMutationService|handleGradeMutation/);
    expect(prod).toMatch(/upsertStudentAssessmentResult/);
  });

  it("8. never reaches the Transcript / Certificate engines", () => {
    expect(prod).not.toMatch(/modules\/(transcripts|certificates)/);
    expect(prod).not.toMatch(/AcademicTranscript|Certificate/);
  });
});
