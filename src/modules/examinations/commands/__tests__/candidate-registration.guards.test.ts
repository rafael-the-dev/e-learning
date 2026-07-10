import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ExaminationEligibilityBlocker } from "@/modules/examinations/constants";

// =============================================================================
// EXAMINATION CANDIDATE-REGISTRATION COMMANDS — ARCHITECTURE GUARDS (Phase 5)
// -----------------------------------------------------------------------------
// Static guards over the Phase-5 registration sources (comments stripped, so the
// doc-comments that name later phases don't false-positive). They prove the
// registration path WIRES the eligibility source + pure engine (it never
// re-implements a rule), that the operational blockers SESSION_FULL /
// ALREADY_REGISTERED are command strings — NOT engine/constants blockers — and
// that the commands reach into no other engine, no results/publication/appeals/
// attendance, no event bus / Outbox, and no React/Next/UI.
// =============================================================================

const CMD_DIR = join(process.cwd(), "src", "modules", "examinations", "commands");
const SVC_DIR = join(process.cwd(), "src", "modules", "examinations", "services");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const read = (dir: string, f: string) => stripComments(readFileSync(join(dir, f), "utf8"));

const REG_FILES = [
  "registration-shared.ts",
  "candidate-registration.commands.ts",
  "candidate-status.commands.ts",
];
const SRCS = REG_FILES.map((f) => ({ file: f, code: read(CMD_DIR, f) }));
const each = (fn: (code: string, file: string) => void) => SRCS.forEach(({ code, file }) => fn(code, file));
const combined = SRCS.map((s) => s.code).join("\n");

describe("registration commands — wire the source + engine (no re-implemented rule)", () => {
  it("1. the register/override path imports the eligibility SOURCE and the pure ENGINE", () => {
    const core = read(CMD_DIR, "registration-shared.ts");
    expect(core).toMatch(/loadExaminationEligibilityFacts/);
    expect(core).toMatch(/evaluateExaminationEligibility/);
  });

  it("2. contains no eligibility-RULE identifiers (rules live only in the engine)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/attendancePercentage/);
      expect(code, file).not.toMatch(/minimumPassingGrade/);
      expect(code, file).not.toMatch(/minimumAttendancePercentage/);
      expect(code, file).not.toMatch(/prerequisite/i);
      expect(code, file).not.toMatch(/financialClearance/);
      expect(code, file).not.toMatch(/disciplinary/i);
    });
  });
});

describe("registration commands — operational blockers are command-level (E-3a)", () => {
  it("3. SESSION_FULL / ALREADY_REGISTERED are command strings, NOT engine blockers", () => {
    expect(combined).toMatch(/SESSION_FULL/);
    expect(combined).toMatch(/ALREADY_REGISTERED/);
    expect(combined).toMatch(/SEAT_UNAVAILABLE/);
    // Absent from the engine's academic/administrative blocker vocabulary.
    const blockers = Object.values(ExaminationEligibilityBlocker) as string[];
    expect(blockers).not.toContain("SESSION_FULL");
    expect(blockers).not.toContain("ALREADY_REGISTERED");
    expect(blockers).not.toContain("SEAT_UNAVAILABLE");
    // And absent from the engine source itself.
    const engine = read(SVC_DIR, "examination-eligibility.engine.ts");
    expect(engine).not.toMatch(/SESSION_FULL|ALREADY_REGISTERED|SEAT_UNAVAILABLE/);
  });
});

describe("registration commands — no cross-engine / later-phase reach", () => {
  it("4. imports no other domain engine", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/modules\/(transcripts|certificates|grades|attendance)/);
      expect(code, file).not.toMatch(/progression\/commands/);
      expect(code, file).not.toMatch(/AcademicTranscript|Certificate/);
    });
  });

  it("5. touches no results / publication / appeals / exam-attendance concern", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/ExamResult|ExamPublication|ExamAppeal|ExamAttendance/);
    });
  });

  it("6. has no domain-event bus / Outbox dependency (ExamEvent + audit only)", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/eventPublisher|EventPublisher|Outbox|outbox/);
    });
  });

  it("7. imports no React / Next / UI", () => {
    each((code, file) => {
      expect(code, file).not.toMatch(/from ["']react["']|from ["']next\/|@\/components\/|\.tsx["']/);
    });
  });
});
