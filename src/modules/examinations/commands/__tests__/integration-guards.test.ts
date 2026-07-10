import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAM GRADE/PROGRESSION INTEGRATION — ARCHITECTURE GUARDS (Phase 11; static)
// -----------------------------------------------------------------------------
// Static guards over the Phase-11 integration sources (comments stripped, so the
// doc-comments that name excluded engines don't false-positive). They prove the
// Examination Engine's integration boundary NEVER writes the Grade / Progression
// tables directly and NEVER reaches the Transcript / Certificate engines: the pure +
// command + source layers depend only on INJECTED PORTS. The production adapter
// (`integrations/production-ports.ts`) is the SANCTIONED seam — since Phase 11B it
// IS live: it routes the real canonical Grade write through `gradeMutationService`
// (and reads back the cascaded progression), but must STILL never touch the
// Transcript / Certificate engines.
// =============================================================================

const MOD_DIR = join(process.cwd(), "src", "modules", "examinations");
const CMD_DIR = join(MOD_DIR, "commands");
const SVC_DIR = join(MOD_DIR, "services");
const INT_DIR = join(MOD_DIR, "integrations");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

// The core anti-corruption sources — NOT production-ports.ts (the sanctioned adapter).
const GUARDED = [
  { file: "commands/integration.commands.ts", code: read(CMD_DIR, "integration.commands.ts") },
  { file: "commands/integration-shared.ts", code: read(CMD_DIR, "integration-shared.ts") },
  {
    file: "services/examination-grade-integration.source.ts",
    code: read(SVC_DIR, "examination-grade-integration.source.ts"),
  },
];
const each = (fn: (code: string, file: string) => void) => GUARDED.forEach(({ code, file }) => fn(code, file));

describe("integration sources — no cross-engine reach", () => {
  it("1. import no Grade / Progression / Assessment / Transcript / Certificate engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/modules\/(grades|prerequisites|assessments|transcripts|certificates)/);
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

  it("3. have no domain-event bus / Outbox dependency (ExamEvent + audit only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });

  it("4. import no React / Next / UI", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
    });
  });

  it("5. carry no final-grade / pass-fail / weighting logic", () => {
    each((code, file) => {
      // No weighting and no grade recomputation — the resolved normalized percentage
      // is used as-is (a SCORED score maps 1:1; no pass/fail determination).
      expect(code, file).not.toMatch(/weight|weighting|passingGrade|isPass|passFail/i);
      expect(code, file).not.toMatch(/\*\s*100|\/\s*maxScore|normalizeExamScore/);
    });
  });
});

describe("production adapter seam", () => {
  const prod = read(INT_DIR, "production-ports.ts");

  it("6. never reaches the Transcript / Certificate engines", () => {
    expect(prod).not.toMatch(/modules\/(transcripts|certificates)/);
    expect(prod).not.toMatch(/AcademicTranscript|Certificate/);
  });

  it("7. has no domain-event bus / Outbox dependency", () => {
    expect(prod).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
  });
});
