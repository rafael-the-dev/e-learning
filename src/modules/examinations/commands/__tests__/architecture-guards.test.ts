import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// =============================================================================
// EXAMINATION SCHEDULING COMMANDS — ARCHITECTURE GUARDS (Phase 4; static)
// -----------------------------------------------------------------------------
// Phase 4 is scheduling only. These static guards read the command sources with
// COMMENTS STRIPPED (the doc-comment blocks deliberately name the excluded
// phases, so scanning raw text would false-positive) and assert the code does
// NOT reach into any other engine, the eligibility engine, or any later-phase
// concern (candidate registration / results / publication / appeals / attendance),
// and imports no React/Next/UI. A second block confirms the new Phase-4 repository
// primitives are thin persistence writes/reads with no business decision.
// =============================================================================

const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const REPO_DIR = join(process.cwd(), "src", "modules", "examinations", "repositories");

/** Strip block and line comments so only executable code is scanned. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// Scoped to the Phase-4 SCHEDULING sources only: the Phase-5 registration commands
// (added later, in the same dir) legitimately run the eligibility engine and touch
// ExamCandidate, so scanning the whole dir would false-positive. Their own guards
// live in `candidate-registration.guards.test.ts`.
const PHASE4_CMD_FILES = [
  "exam-period.commands.ts",
  "exam-room.commands.ts",
  "exam-session.commands.ts",
  "assign-exam-invigilator.command.ts",
];
const CMD_FILES = readdirSync(CMD_DIR).filter((f) => PHASE4_CMD_FILES.includes(f));
const CMD_SRCS = CMD_FILES.map((f) => ({ file: f, code: stripComments(readFileSync(join(CMD_DIR, f), "utf8")) }));

const each = (fn: (code: string, file: string) => void) => CMD_SRCS.forEach(({ code, file }) => fn(code, file));

describe("scheduling commands — discovery", () => {
  it("finds the four Phase-4 command source files", () => {
    expect(CMD_FILES).toEqual(
      expect.arrayContaining([
        "exam-period.commands.ts",
        "exam-room.commands.ts",
        "exam-session.commands.ts",
        "assign-exam-invigilator.command.ts",
      ])
    );
  });
});

describe("scheduling commands — no cross-engine reach", () => {
  it("1. imports no other domain engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/modules\/(transcripts|certificates|grades|attendance)/);
      expect(code, file).not.toMatch(/progression\/commands/);
      expect(code, file).not.toMatch(/AcademicTranscript/);
    });
  });

  it("2. does not run the eligibility engine/source", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/EligibilityEngine/);
      expect(code, file).not.toMatch(/evaluateExaminationEligibility/);
      expect(code, file).not.toMatch(/loadExaminationEligibilityFacts/);
    });
  });

  it("3. touches no later-phase concern (candidates / results / publication / appeals / attendance)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/RegisterExamCandidate|register-candidate|ExamCandidate/);
      expect(code, file).not.toMatch(/ExamResult|ExamPublication|ExamAppeal|ExamAttendance/);
    });
  });

  it("4. imports no React / Next / UI", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
    });
  });

  it("5. has no domain-event bus / Outbox dependency (Phase 4 = ExamEvent + audit only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });
});

// ─── Repository primitives are thin (no business decision) ────────────────────

describe("Phase-4 repository primitives are thin persistence", () => {
  const PRIMITIVE_REPOS = [
    "exam-period.repository.ts",
    "exam-session.repository.ts",
    "exam-room.repository.ts",
    "exam-invigilator-assignment.repository.ts",
  ];

  it("contain no business-rule/authorization/decision logic — only updateMany/findMany/findFirst/create", () => {
    for (const file of PRIMITIVE_REPOS) {
      const code = stripComments(readFileSync(join(REPO_DIR, file), "utf8"));
      expect(code, `${file} must not decide business rules`).not.toMatch(/BusinessRuleError|ValidationError/);
      expect(code, `${file} must not authorize`).not.toMatch(/createAbility|getUserPermissions|PERMISSIONS/);
      expect(code, `${file} must not throw`).not.toMatch(/throw new/);
    }
  });
});
